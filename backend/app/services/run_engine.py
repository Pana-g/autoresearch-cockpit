"""Run engine — orchestrates the full agent → train → evaluate loop."""

import asyncio
import json
import logging
import math
import os
import re
import shutil
import signal
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_session_factory
from app.models import (
    AgentStep,
    Project,
    ProviderCredential,
    Run,
    RunMemory,
    RunNote,
    RunState,
    TokenUsage,
    TrainingStep,
    Workspace,
    validate_transition,
)
from app.providers.base import estimate_cost
from app.providers.registry import get_provider
from app.services.encryption import decrypt
from app.services.event_bus import publish, set_agent_snapshot, clear_agent_snapshot, set_training_snapshot, clear_training_snapshot
from app.services.git_service import GitService
from app.services.patch_validator import (
    PatchValidationError,
    extract_patch_from_response,
    validate_patch,
)
from app.services.prompt_builder import build_agent_prompt
from app.services.compaction import (
    build_compacted_summary,
    check_compaction_needed,
)

logger = logging.getLogger(__name__)

# Track active training subprocesses for clean cancellation
_active_processes: dict[str, asyncio.subprocess.Process] = {}

# Track canceled runs so background tasks can bail out early
_canceled_runs: set[str] = set()


class RunCanceledError(Exception):
    """Raised when a run has been canceled and should stop processing."""
    pass


async def _should_auto_continue(session: AsyncSession, run: Run) -> bool:
    """Check whether the run should auto-continue to the next iteration."""
    if not run.auto_continue:
        return False
    await session.refresh(run)
    if run.stop_requested:
        # Clear the flag and stop
        run.stop_requested = False
        session.add(run)
        await session.commit()
        await transition_state(session, run, RunState.DONE)
        await publish(run.id, "run_done", {"best_val_bpb": run.best_val_bpb, "reason": "stop_requested"})
        return False
    if run.max_iterations > 0 and run.iteration >= run.max_iterations:
        await transition_state(session, run, RunState.DONE)
        await publish(run.id, "run_done", {"best_val_bpb": run.best_val_bpb, "reason": "max_iterations_reached"})
        return False
    return True


async def transition_state(session: AsyncSession, run: Run, target: RunState) -> None:
    """Validate and persist state transition. Publishes SSE event."""
    # Refresh from DB to detect concurrent changes (e.g., cancellation)
    await session.refresh(run)
    current = RunState(run.state)
    if current == RunState.FAILED:
        raise RunCanceledError(f"Run already in terminal state: {current.value}")
    validate_transition(current, target)
    run.state = target.value
    session.add(run)
    await session.commit()
    await publish(run.id, "state_change", {"state": target.value, "iteration": run.iteration})


async def prepare_run(run_id: str, project_source_path: str) -> None:
    """Create workspace, init git, transition to awaiting_agent."""
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return

        await transition_state(session, run, RunState.PREPARING)

        try:
            workspace_path = str(
                Path.home() / ".autoresearch" / "workspaces" / run_id
            )
            branch_name = f"run/{run_id}"

            git = GitService(workspace_path)
            commit_sha = git.init_workspace(project_source_path, branch_name)

            # Seed with the project's best train.py if one exists
            project = await session.get(Project, run.project_id)
            if project and project.best_train_py:
                git.open()
                git.write_file("train.py", project.best_train_py)
                commit_sha = git.commit_patch("Seed with project-best train.py")
                logger.info("Seeded workspace with project-best train.py (val_bpb=%.4f)", project.best_val_bpb or 0)

            # Carry forward the project-level best score so improvements are relative
            if project and project.best_val_bpb is not None:
                run.best_val_bpb = project.best_val_bpb
                session.add(run)
                await session.commit()

            # Remove any stale/broken .venv so uv creates a fresh one
            venv_dir = Path(workspace_path) / ".venv"
            if venv_dir.exists():
                shutil.rmtree(venv_dir)

            # Bootstrap venv and install dependencies
            await publish(run_id, "workspace_ready", {"path": workspace_path, "status": "installing dependencies..."})
            # Strip backend's VIRTUAL_ENV so uv uses the workspace's own venv
            clean_env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}

            proc = await asyncio.create_subprocess_exec(
                "uv", "sync",
                cwd=workspace_path,
                env=clean_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"uv sync failed: {stderr.decode()}")
            logger.info("uv sync completed for workspace %s", workspace_path)

            # Prepare data/tokenizer if not cached yet
            await publish(run_id, "workspace_ready", {"path": workspace_path, "status": "preparing data..."})
            proc = await asyncio.create_subprocess_exec(
                "uv", "run", "prepare.py",
                cwd=workspace_path,
                env=clean_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"prepare.py failed: {stderr.decode()}")
            logger.info("prepare.py completed for workspace %s", workspace_path)

            ws = Workspace(
                run_id=run_id,
                workspace_path=workspace_path,
                git_branch=branch_name,
                current_commit=commit_sha,
            )
            session.add(ws)
            await session.commit()

            await transition_state(session, run, RunState.AWAITING_AGENT)
            await publish(run_id, "workspace_ready", {"path": workspace_path})

            # Auto-wake the agent for the first iteration
            asyncio.create_task(wake_agent(run_id))

        except Exception as e:
            logger.exception("Failed to prepare run %s", run_id)
            run.state = RunState.FAILED.value
            session.add(run)
            await session.commit()
            await publish(run_id, "error", {"message": str(e)})


async def _force_fail(run_id: str, error_message: str) -> None:
    """Force a run into FAILED state using a fresh session.

    Used in exception handlers where the original session may be broken.
    """
    try:
        async with async_session_factory() as fresh:
            run = await fresh.get(Run, run_id)
            if run is None:
                return
            if RunState(run.state) in (RunState.CANCELED, RunState.DONE, RunState.FAILED):
                return
            run.state = RunState.FAILED.value
            fresh.add(run)
            await fresh.commit()
            await publish(run_id, "state_change", {"state": RunState.FAILED.value, "iteration": run.iteration})
            await publish(run_id, "error", {"message": error_message})
    except Exception:
        logger.exception("Failed to force-fail run %s — run may be stuck", run_id)


async def force_fail_run(run_id: str) -> None:
    """Externally force a stuck run into FAILED state."""
    _canceled_runs.add(run_id)
    proc = _active_processes.pop(run_id, None)
    if proc:
        proc.send_signal(signal.SIGTERM)
        try:
            await asyncio.wait_for(proc.wait(), timeout=10)
        except asyncio.TimeoutError:
            proc.kill()
    clear_agent_snapshot(run_id)
    clear_training_snapshot(run_id)
    await _force_fail(run_id, "Manually reset by user")


async def wake_agent(run_id: str) -> None:
    """Wake the agent: assemble prompt, call provider, parse patch, await review."""
    if run_id in _canceled_runs:
        logger.warning("wake_agent: run %s is in _canceled_runs, skipping", run_id)
        return

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            logger.warning("wake_agent: run %s not found", run_id)
            return

        logger.info("wake_agent: run %s state=%s, transitioning to AGENT_RUNNING", run_id, run.state)

        try:
            await transition_state(session, run, RunState.AGENT_RUNNING)
        except Exception:
            logger.exception("wake_agent: failed to transition run %s to AGENT_RUNNING", run_id)
            await _force_fail(run_id, "Failed to start agent (state transition error)")
            return

        run.iteration += 1
        session.add(run)
        await session.commit()

        try:
            ws = await session.execute(select(Workspace).where(Workspace.run_id == run_id))
            workspace = ws.scalar_one()
            git = GitService(workspace.workspace_path)
            git.open()

            # Read workspace files
            train_py = git.read_file("train.py")
            program_md = ""
            program_path = Path(workspace.workspace_path) / "program.md"
            if program_path.exists():
                program_md = program_path.read_text()

            # Get ALL memory records so the agent never repeats past mistakes
            mem_result = await session.execute(
                select(RunMemory)
                .where(RunMemory.run_id == run_id)
                .order_by(RunMemory.iteration.desc())
            )
            memory_records = [
                {
                    "iteration": m.iteration,
                    "summary": m.summary,
                    "val_bpb": m.val_bpb,
                    "improved": m.improved,
                }
                for m in reversed(mem_result.scalars().all())
            ]

            # Get latest metrics from last training step
            latest_metrics: dict | None = None
            last_training = await session.execute(
                select(TrainingStep)
                .where(TrainingStep.run_id == run_id, TrainingStep.status == "completed")
                .order_by(TrainingStep.iteration.desc())
                .limit(1)
            )
            last_ts = last_training.scalar_one_or_none()
            if last_ts and last_ts.val_bpb is not None:
                latest_metrics = {"val_bpb": last_ts.val_bpb, "improved": last_ts.improved}

            # Get active notes
            notes_result = await session.execute(
                select(RunNote).where(RunNote.run_id == run_id, RunNote.active.is_(True))
            )
            active_notes = notes_result.scalars().all()
            human_notes = [n.content for n in active_notes]

            # Build prompt
            messages = build_agent_prompt(
                program_md=program_md,
                train_py=train_py,
                memory_records=memory_records,
                latest_metrics=latest_metrics,
                human_notes=human_notes,
                iteration=run.iteration,
                best_val_bpb=run.best_val_bpb,
                overfit_floor=run.overfit_floor,
                compacted_summary=run.compacted_summary,
                compacted_up_to=run.compacted_up_to,
            )

            # Check if context compaction is needed
            prompt_text_for_check = json.dumps(messages)
            needed, prompt_tokens, context_limit, threshold_tokens = check_compaction_needed(
                prompt_text_for_check,
                run.model,
                context_limit_override=run.context_limit,
                threshold_pct=run.compact_threshold_pct,
            )
            if needed and memory_records:
                await publish(run_id, "compaction_needed", {
                    "prompt_tokens": prompt_tokens,
                    "context_limit": context_limit,
                    "threshold_pct": run.compact_threshold_pct,
                    "threshold_tokens": threshold_tokens,
                    "memory_count": len(memory_records),
                })

                if run.auto_compact:
                    summary, up_to = build_compacted_summary(memory_records)
                    if summary and up_to:
                        run.compacted_summary = summary
                        run.compacted_up_to = up_to
                        session.add(run)
                        await session.commit()

                        # Rebuild prompt with compacted data
                        messages = build_agent_prompt(
                            program_md=program_md,
                            train_py=train_py,
                            memory_records=memory_records,
                            latest_metrics=latest_metrics,
                            human_notes=human_notes,
                            iteration=run.iteration,
                            best_val_bpb=run.best_val_bpb,
                            overfit_floor=run.overfit_floor,
                            compacted_summary=run.compacted_summary,
                            compacted_up_to=run.compacted_up_to,
                        )

                        await publish(run_id, "compaction_done", {
                            "compacted_up_to": up_to,
                            "memory_count": len(memory_records),
                        })

            # Mark notes as delivered and auto-deactivate
            now = datetime.now(timezone.utc)
            for note in active_notes:
                note.delivered_at = now
                note.active = False
                session.add(note)
            if active_notes:
                await session.commit()

            # Get credentials
            credentials = await _get_credentials(session, run)

            # Create agent step record
            agent_step = AgentStep(
                run_id=run_id,
                iteration=run.iteration,
                prompt=json.dumps(messages),
                provider=run.provider,
                model=run.model,
                status="pending",
                restarted_from_iteration=run.pending_restart_from,
            )
            session.add(agent_step)

            # Clear the pending restart marker now that it's been consumed
            if run.pending_restart_from is not None:
                run.pending_restart_from = None
                session.add(run)

            await session.commit()

            # Call provider (streaming for SSE)
            provider = get_provider(run.provider)
            full_response = ""
            agent_phase = "thinking"

            set_agent_snapshot(run_id, {"phase": "thinking", "iteration": run.iteration, "text": ""})
            await publish(run_id, "agent_streaming_start", {"iteration": run.iteration, "phase": "thinking"})

            async def _stream_agent():
                nonlocal full_response, agent_phase
                stream_iter = provider.stream_response(
                    model=run.model, messages=messages, credentials=credentials
                ).__aiter__()
                while True:
                    # Check cancellation during streaming
                    if run_id in _canceled_runs:
                        clear_agent_snapshot(run_id)
                        return
                    try:
                        chunk = await asyncio.wait_for(
                            stream_iter.__anext__(),
                            timeout=settings.default_agent_inactivity_timeout,
                        )
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError:
                        raise  # propagate so the outer handler catches it
                    full_response += chunk
                    # Detect phase transition: thinking → coding
                    if agent_phase == "thinking" and "```" in full_response:
                        agent_phase = "coding"
                        await publish(run_id, "agent_phase_change", {"phase": "coding"})
                    set_agent_snapshot(run_id, {"phase": agent_phase, "iteration": run.iteration, "text": full_response})
                    await publish(run_id, "agent_chunk", {"text": chunk})

            try:
                await _stream_agent()
            except asyncio.TimeoutError:
                logger.warning(
                    "Agent stream stalled (no output for %ds) for run %s iter %d — will retry",
                    settings.default_agent_inactivity_timeout, run_id, run.iteration,
                )
                clear_agent_snapshot(run_id)

                agent_step.status = "failed"
                agent_step.response = full_response
                session.add(agent_step)
                await session.commit()

                await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                await publish(run_id, "agent_timeout", {
                    "timeout_seconds": settings.default_agent_inactivity_timeout,
                    "iteration": run.iteration,
                })

                if await _should_auto_continue(session, run):
                    await publish(run_id, "auto_continue", {})
                    asyncio.create_task(continue_loop(run_id))
                return

            clear_agent_snapshot(run_id)
            await publish(run_id, "agent_streaming_end", {})

            # Check cancellation after streaming completes
            if run_id in _canceled_runs:
                return

            # Extract patch from response
            patch_content = extract_patch_from_response(full_response)

            # Extract rationale (text before the code block)
            rationale = _extract_rationale(full_response)

            # Estimate tokens for providers that don't report via streaming
            prompt_text = json.dumps(messages)
            estimated_prompt = provider.estimate_tokens(prompt_text)
            estimated_completion = provider.estimate_tokens(full_response)

            # Update agent step
            agent_step.response = full_response
            agent_step.patch = patch_content
            agent_step.rationale = rationale
            agent_step.status = "completed"
            session.add(agent_step)

            # Record token usage
            token_usage = TokenUsage(
                agent_step_id=agent_step.id,
                provider=run.provider,
                model=run.model,
                prompt_tokens=estimated_prompt,
                completion_tokens=estimated_completion,
                estimated_cost=estimate_cost(
                    run.provider, run.model, estimated_prompt, estimated_completion
                ),
                usage_source="estimated",
            )
            session.add(token_usage)
            await session.commit()

            if patch_content:
                # Validate the patch
                try:
                    validate_patch(patch_content, train_py)
                    await transition_state(session, run, RunState.AWAITING_PATCH_REVIEW)
                    await publish(
                        run_id,
                        "patch_ready",
                        {
                            "agent_step_id": agent_step.id,
                            "rationale": rationale,
                            "patch_preview": patch_content[:2000],
                        },
                    )

                    # Auto-approve if enabled
                    if run.auto_approve:
                        await publish(run_id, "auto_approve", {})
                        asyncio.create_task(approve_patch(run_id))

                except PatchValidationError as e:
                    logger.warning("Patch validation failed for run %s: %s", run_id, e)
                    agent_step.status = "failed"
                    session.add(agent_step)
                    await session.commit()
                    # Retry: go back to awaiting_agent and re-wake
                    await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                    await publish(run_id, "error", {"message": f"Patch validation failed: {e}. Retrying..."})
                    if await _should_auto_continue(session, run):
                        await publish(run_id, "auto_continue", {})
                        asyncio.create_task(continue_loop(run_id))
            else:
                logger.warning("Agent produced no patch for run %s", run_id)
                agent_step.status = "failed"
                session.add(agent_step)
                await session.commit()
                # Retry: go back to awaiting_agent and re-wake
                await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                await publish(run_id, "error", {"message": "Agent did not produce a valid patch. Retrying..."})
                if await _should_auto_continue(session, run):
                    await publish(run_id, "auto_continue", {})
                    asyncio.create_task(continue_loop(run_id))

        except RunCanceledError:
            logger.info("Run %s was canceled, stopping agent", run_id)
            return
        except Exception as e:
            logger.exception("Agent failed for run %s", run_id)
            clear_agent_snapshot(run_id)
            await _force_fail(run_id, str(e))


async def approve_patch(run_id: str) -> None:
    """Approve the pending patch and start training."""
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return

        await transition_state(session, run, RunState.PATCH_APPROVED)

        # Get latest agent step with a patch
        result = await session.execute(
            select(AgentStep)
            .where(AgentStep.run_id == run_id, AgentStep.patch.isnot(None))
            .order_by(AgentStep.iteration.desc())
            .limit(1)
        )
        agent_step = result.scalar_one()

        ws_result = await session.execute(select(Workspace).where(Workspace.run_id == run_id))
        workspace = ws_result.scalar_one()

        git = GitService(workspace.workspace_path)
        git.open()

        # Read current train.py and apply patch
        current_train = git.read_file("train.py")
        new_train = validate_patch(agent_step.patch, current_train)
        git.write_file("train.py", new_train)

        # Commit the patch
        commit_sha = git.commit_patch(
            f"Iteration {run.iteration}: {agent_step.rationale or 'agent patch'}"
        )
        workspace.current_commit = commit_sha
        session.add(workspace)
        await session.commit()

        await publish(run_id, "patch_applied", {"commit_sha": commit_sha})

        # Start training
        asyncio.create_task(_run_training(run_id, agent_step.id))


async def reject_patch(run_id: str) -> None:
    """Reject the pending patch and re-prompt the agent."""
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        await transition_state(session, run, RunState.AWAITING_AGENT)
        await publish(run_id, "patch_rejected", {})
        # Re-wake agent
        asyncio.create_task(wake_agent(run_id))


async def _run_training(run_id: str, agent_step_id: str) -> None:
    """Execute training subprocess, parse metrics, update state."""
    if run_id in _canceled_runs:
        return

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return

        await transition_state(session, run, RunState.TRAINING_RUNNING)
        training_data = {"iteration": run.iteration, "started_at": datetime.now(timezone.utc).isoformat()}
        set_training_snapshot(run_id, training_data)
        await publish(run_id, "training_started", training_data)

        ws_result = await session.execute(select(Workspace).where(Workspace.run_id == run_id))
        workspace = ws_result.scalar_one()

        training_step = TrainingStep(
            run_id=run_id,
            agent_step_id=agent_step_id,
            iteration=run.iteration,
            commit_sha=workspace.current_commit,
            status="running",
        )
        session.add(training_step)
        await session.commit()

        try:
            # Run training subprocess
            # Strip backend's VIRTUAL_ENV so uv uses the workspace's own venv
            clean_env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}

            proc = await asyncio.create_subprocess_exec(
                "uv", "run", "train.py",
                cwd=workspace.workspace_path,
                env=clean_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _active_processes[run_id] = proc

            stdout_lines = []
            stderr_lines = []

            # Watchdog: detect when training reaches 100% but process doesn't exit
            _completion_detected_at: dict[str, float | None] = {"t": None}
            _COMPLETION_GRACE_SECONDS = 30
            _completion_re = re.compile(r"\(100\.0%\).*remaining:\s*0s")

            async def stream_output(stream, lines_list, stream_name):
                # Read raw chunks instead of readline to avoid
                # LimitOverrunError when training scripts use \r
                # with end="" (no newline) for in-place progress updates.
                buf = ""
                while True:
                    chunk = await stream.read(8192)
                    if not chunk:
                        # Flush remaining buffer
                        if buf:
                            lines_list.append(buf)
                            await publish(run_id, f"training_{stream_name}", {"line": buf.rstrip()})
                        break
                    text = chunk.decode("utf-8", errors="replace")
                    buf += text
                    # Split on \n or \r to emit lines
                    while "\n" in buf or "\r" in buf:
                        # Find earliest line boundary
                        idx_n = buf.find("\n")
                        idx_r = buf.find("\r")
                        if idx_n == -1:
                            idx = idx_r
                        elif idx_r == -1:
                            idx = idx_n
                        else:
                            idx = min(idx_n, idx_r)
                        line = buf[: idx + 1]
                        buf = buf[idx + 1 :]
                        lines_list.append(line)
                        await publish(run_id, f"training_{stream_name}", {"line": line.rstrip()})
                        # Detect training completion (100%, remaining: 0s)
                        if stream_name == "stdout" and _completion_detected_at["t"] is None:
                            if _completion_re.search(line):
                                _completion_detected_at["t"] = time.monotonic()

            async def completion_watchdog():
                """Kill process if it keeps running past 100% completion."""
                while proc.returncode is None:
                    await asyncio.sleep(5)
                    t = _completion_detected_at["t"]
                    if t is not None and (time.monotonic() - t) > _COMPLETION_GRACE_SECONDS:
                        logger.warning(
                            "Training stuck past 100%% for >%ds in run %s — killing",
                            _COMPLETION_GRACE_SECONDS, run_id,
                        )
                        proc.kill()
                        return

            try:
                await asyncio.wait_for(
                    asyncio.gather(
                        stream_output(proc.stdout, stdout_lines, "stdout"),
                        stream_output(proc.stderr, stderr_lines, "stderr"),
                        completion_watchdog(),
                    ),
                    timeout=settings.default_training_timeout_seconds,
                )
                await proc.wait()
            except asyncio.TimeoutError:
                logger.warning(
                    "Training timed out after %ds for run %s — killing subprocess",
                    settings.default_training_timeout_seconds, run_id,
                )
                proc.kill()
                await proc.wait()

                training_step.status = "failed"
                training_step.stderr_log = f"Training timed out after {settings.default_training_timeout_seconds}s"
                training_step.stdout_log = "".join(stdout_lines)
                training_step.exit_code = proc.returncode
                session.add(training_step)
                await session.commit()

                # Revert the patch
                git = GitService(workspace.workspace_path)
                git.open()
                git.reset_to(workspace.current_commit + "~1")
                workspace.current_commit = git.get_current_sha()
                session.add(workspace)
                await session.commit()

                await transition_state(session, run, RunState.TRAINING_FINISHED)
                await _record_memory(session, run, training_step, improved=False)
                await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                clear_training_snapshot(run_id)
                await publish(run_id, "training_timeout", {"timeout_seconds": settings.default_training_timeout_seconds})

                if await _should_auto_continue(session, run):
                    await publish(run_id, "auto_continue", {})
                    asyncio.create_task(continue_loop(run_id))
                return
            finally:
                _active_processes.pop(run_id, None)

            exit_code = proc.returncode
            stdout_text = "".join(stdout_lines)
            stderr_text = "".join(stderr_lines)

            training_step.stdout_log = stdout_text
            training_step.stderr_log = stderr_text
            training_step.exit_code = exit_code

            if exit_code != 0:
                training_step.status = "failed"
                session.add(training_step)
                await session.commit()

                # Revert the patch
                git = GitService(workspace.workspace_path)
                git.open()
                git.reset_to(workspace.current_commit + "~1")
                workspace.current_commit = git.get_current_sha()
                session.add(workspace)
                await session.commit()

                await transition_state(session, run, RunState.TRAINING_FINISHED)
                await _record_memory(session, run, training_step, improved=False)
                await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                clear_training_snapshot(run_id)
                await publish(run_id, "training_failed", {"exit_code": exit_code})

                # Auto-continue if enabled (retry with a different approach)
                if await _should_auto_continue(session, run):
                    await publish(run_id, "auto_continue", {})
                    asyncio.create_task(continue_loop(run_id))
                return

            # Parse val_bpb from output
            val_bpb = _parse_val_bpb(stdout_text + stderr_text)

            # Treat nan/inf as a training failure
            if val_bpb is not None and math.isnan(val_bpb):
                logger.warning("val_bpb is NaN for run %s — treating as failure", run_id)
                training_step.val_bpb = None
                training_step.status = "failed"
                training_step.stderr_log = (stderr_text or "") + "\nval_bpb was NaN — treated as failure"
                training_step.stdout_log = stdout_text
                training_step.exit_code = exit_code
                session.add(training_step)
                await session.commit()

                git = GitService(workspace.workspace_path)
                git.open()
                git.reset_to(workspace.current_commit + "~1")
                workspace.current_commit = git.get_current_sha()
                session.add(workspace)
                await session.commit()

                await transition_state(session, run, RunState.TRAINING_FINISHED)
                await _record_memory(session, run, training_step, improved=False)
                await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)
                clear_training_snapshot(run_id)
                await publish(run_id, "training_failed", {"exit_code": exit_code, "reason": "val_bpb_nan"})

                if await _should_auto_continue(session, run):
                    await publish(run_id, "auto_continue", {})
                    asyncio.create_task(continue_loop(run_id))
                return

            training_step.val_bpb = val_bpb
            training_step.status = "completed"

            # Compare with best
            improved = False
            overfit_rejected = False
            if val_bpb is not None:
                # Check overfitting floor — suspiciously low val_bpb
                if run.overfit_floor is not None and val_bpb < run.overfit_floor:
                    logger.warning(
                        "val_bpb=%.4f below overfit floor %.4f for run %s — treating as overfitting",
                        val_bpb, run.overfit_floor, run_id,
                    )
                    improved = False
                    overfit_rejected = True
                elif run.best_val_bpb is None or val_bpb < run.best_val_bpb:
                    improved = True
                    run.best_val_bpb = val_bpb
                    session.add(run)

                    # Tag best commit
                    git = GitService(workspace.workspace_path)
                    git.open()
                    git.tag_best(workspace.current_commit, f"best-{run_id[:8]}")
                    workspace.best_commit = workspace.current_commit
                    session.add(workspace)

                    # Persist project-level best code and score
                    project = await session.get(Project, run.project_id)
                    if project:
                        best_code = git.read_file("train.py")
                        if project.best_val_bpb is None or val_bpb < project.best_val_bpb:
                            project.best_val_bpb = val_bpb
                            project.best_train_py = best_code
                            project.best_run_id = run.id
                            project.best_iteration = training_step.iteration
                            session.add(project)
                            logger.info("New project-best val_bpb=%.4f for project %s", val_bpb, project.id)

            training_step.improved = improved
            session.add(training_step)
            await session.commit()

            if not improved and val_bpb is not None:
                # Revert the patch
                git = GitService(workspace.workspace_path)
                git.open()
                git.reset_to(workspace.current_commit + "~1")
                workspace.current_commit = git.get_current_sha()
                session.add(workspace)
                await session.commit()

            await transition_state(session, run, RunState.TRAINING_FINISHED)
            await _record_memory(session, run, training_step, improved=improved, overfit_rejected=overfit_rejected)

            clear_training_snapshot(run_id)
            await publish(
                run_id,
                "training_completed",
                {"val_bpb": val_bpb, "improved": improved, "best_val_bpb": run.best_val_bpb, "overfit_rejected": overfit_rejected},
            )

            await transition_state(session, run, RunState.AWAITING_NEXT_ACTION)

            # Check if val_bpb is approaching the overfitting floor
            # (only when the result was NOT rejected as overfitting)
            if (
                not overfit_rejected
                and val_bpb is not None
                and run.overfit_floor is not None
                and run.overfit_margin is not None
                and val_bpb <= run.overfit_floor + run.overfit_margin
            ):
                logger.info(
                    "val_bpb=%.4f within margin %.4f of overfit floor %.4f for run %s — stopping",
                    val_bpb, run.overfit_margin, run.overfit_floor, run_id,
                )
                await transition_state(session, run, RunState.DONE)
                await publish(run_id, "run_done", {
                    "best_val_bpb": run.best_val_bpb,
                    "reason": "overfit_margin_reached",
                })
            # Auto-continue if enabled
            elif await _should_auto_continue(session, run):
                await publish(run_id, "auto_continue", {})
                asyncio.create_task(continue_loop(run_id))

        except RunCanceledError:
            logger.info("Run %s was canceled, stopping training", run_id)
            return
        except Exception as e:
            logger.exception("Training failed for run %s", run_id)
            training_step.status = "failed"
            training_step.stderr_log = str(e)
            session.add(training_step)
            # Check if the run was already canceled before overwriting state
            await session.refresh(run)
            if RunState(run.state) in (RunState.CANCELED, RunState.DONE, RunState.FAILED):
                await session.commit()
                return
            run.state = RunState.FAILED.value
            session.add(run)
            await session.commit()
            await publish(run_id, "error", {"message": str(e)})


async def continue_loop(run_id: str) -> None:
    """Continue to next iteration (loop back to agent)."""
    if run_id in _canceled_runs:
        return

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        await transition_state(session, run, RunState.AWAITING_AGENT)
        asyncio.create_task(wake_agent(run_id))


async def stop_run(run_id: str) -> None:
    """Mark run as done."""
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        await transition_state(session, run, RunState.DONE)
        await publish(run_id, "run_done", {"best_val_bpb": run.best_val_bpb})


async def pause_run(run_id: str) -> None:
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        await transition_state(session, run, RunState.PAUSED)
        await publish(run_id, "run_paused", {})


async def resume_run(run_id: str) -> None:
    # Allow a previously canceled run to be cleaned up
    _canceled_runs.discard(run_id)

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        await transition_state(session, run, RunState.AWAITING_AGENT)
        asyncio.create_task(wake_agent(run_id))


async def resume_from_terminal(run_id: str) -> None:
    """Resume a run from a terminal state (DONE or CANCELED)."""
    _canceled_runs.discard(run_id)

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        state = RunState(run.state)
        if state not in (RunState.DONE, RunState.CANCELED):
            raise ValueError(f"Cannot force-continue in state {state.value}")
        run.stop_requested = False
        await transition_state(session, run, RunState.AWAITING_AGENT)
        asyncio.create_task(wake_agent(run_id))


async def retry_last_step(run_id: str, project_source_path: str) -> None:
    """Retry the last failed step — re-prepare or re-wake the agent."""
    _canceled_runs.discard(run_id)

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return

        state = RunState(run.state)
        if state != RunState.FAILED:
            raise ValueError(f"Cannot retry in state {state.value}")

        # Check if a workspace exists — if not, the failure was during preparation
        ws_result = await session.execute(select(Workspace).where(Workspace.run_id == run_id))
        workspace = ws_result.scalar_one_or_none()

        if workspace is None:
            # Failed during preparation — re-run from scratch
            # Bypass transition_state (terminal-state guard) — set directly
            run.state = RunState.PREPARING.value
            await session.commit()
            await publish(run_id, "state_change", {"state": RunState.PREPARING.value})
            asyncio.create_task(prepare_run(run_id, project_source_path))
        else:
            # Workspace exists — resume from agent step
            run.state = RunState.AWAITING_AGENT.value
            await session.commit()
            await publish(run_id, "state_change", {"state": RunState.AWAITING_AGENT.value})
            asyncio.create_task(wake_agent(run_id))


async def cancel_run(run_id: str) -> None:
    """Cancel a run, killing any active subprocess."""

    # Signal all background tasks to stop
    _canceled_runs.add(run_id)

    proc = _active_processes.pop(run_id, None)
    if proc:
        proc.send_signal(signal.SIGTERM)
        try:
            await asyncio.wait_for(proc.wait(), timeout=10)
        except asyncio.TimeoutError:
            proc.kill()

    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        current = RunState(run.state)
        if current in (RunState.CANCELED, RunState.DONE, RunState.FAILED):
            return
        # Directly set state to avoid transition_state raising RunCanceledError
        run.state = RunState.CANCELED.value
        session.add(run)
        await session.commit()
        await publish(run_id, "state_change", {"state": RunState.CANCELED.value, "iteration": run.iteration})
        await publish(run_id, "run_canceled", {})


async def rollback_to_checkpoint(run_id: str, target_iteration: int, *, reset_train_py: bool = False) -> dict:
    """Roll back a run's workspace to a previous iteration checkpoint and auto-restart.

    Unlike the old behaviour, this preserves ALL history — no records are
    deleted.  The run's iteration counter stays where it is and the next
    agent step will be ``current_iteration + 1``.  The new agent step will
    carry ``restarted_from_iteration = target_iteration`` so the UI can
    show a restart marker on the timeline.

    If *reset_train_py* is True, ``train.py`` is additionally restored to
    the version from the best checkpoint **before** the target iteration.
    """
    async with async_session_factory() as session:
        run = await session.get(Run, run_id)
        if run is None:
            raise ValueError("Run not found")

        state = RunState(run.state)
        if state not in (
            RunState.AWAITING_NEXT_ACTION,
            RunState.PAUSED,
            RunState.FAILED,
            RunState.DONE,
            RunState.CANCELED,
        ):
            raise ValueError(f"Cannot rollback in state {state.value}")

        if target_iteration < 0 or target_iteration > run.iteration:
            raise ValueError(f"Invalid target iteration {target_iteration}")

        # Find the best commit at or before the target iteration
        best_at_target = await session.execute(
            select(TrainingStep)
            .where(
                TrainingStep.run_id == run_id,
                TrainingStep.iteration <= target_iteration,
                TrainingStep.improved.is_(True),
                TrainingStep.commit_sha.isnot(None),
            )
            .order_by(TrainingStep.iteration.desc())
            .limit(1)
        )
        best_step = best_at_target.scalar_one_or_none()

        ws_result = await session.execute(select(Workspace).where(Workspace.run_id == run_id))
        workspace = ws_result.scalar_one_or_none()
        if workspace is None:
            raise ValueError("Workspace not found")

        git = GitService(workspace.workspace_path)
        git.open()

        if best_step and best_step.commit_sha:
            git.reset_to(best_step.commit_sha)
            workspace.current_commit = best_step.commit_sha
            restored_val_bpb = best_step.val_bpb
        elif target_iteration == 0:
            log = git.get_log(max_count=999)
            initial_sha = log[-1]["sha"] if log else git.get_current_sha()
            git.reset_to(initial_sha)
            workspace.current_commit = initial_sha
            restored_val_bpb = None
        else:
            log = git.get_log(max_count=999)
            initial_sha = log[-1]["sha"] if log else git.get_current_sha()
            git.reset_to(initial_sha)
            workspace.current_commit = initial_sha
            restored_val_bpb = None

        session.add(workspace)

        if reset_train_py:
            # Find the best commit strictly before the target iteration
            prior_best = await session.execute(
                select(TrainingStep)
                .where(
                    TrainingStep.run_id == run_id,
                    TrainingStep.iteration < target_iteration,
                    TrainingStep.improved.is_(True),
                    TrainingStep.commit_sha.isnot(None),
                )
                .order_by(TrainingStep.iteration.desc())
                .limit(1)
            )
            prior_step = prior_best.scalar_one_or_none()

            if prior_step and prior_step.commit_sha:
                prior_train = git.repo.git.show(f"{prior_step.commit_sha}:train.py")
                git.write_file("train.py", prior_train)
            else:
                log = git.get_log(max_count=999)
                initial_sha = log[-1]["sha"] if log else git.get_current_sha()
                try:
                    initial_train = git.repo.git.show(f"{initial_sha}:train.py")
                    git.write_file("train.py", initial_train)
                except Exception:
                    pass

            workspace.current_commit = git.get_current_sha()
            session.add(workspace)

        # Recalculate best_val_bpb from the state we're restoring to
        if restored_val_bpb is not None:
            run.best_val_bpb = restored_val_bpb
        else:
            project = await session.get(Project, run.project_id)
            run.best_val_bpb = project.best_val_bpb if project else None

        # Do NOT reset iteration — preserve full history.
        # Store the restart origin so wake_agent can tag the next AgentStep.
        run.pending_restart_from = target_iteration
        run.stop_requested = False

        # Transition directly to AWAITING_AGENT so the loop auto-starts.
        # For terminal states, set directly (transition_state would reject).
        if state in (RunState.FAILED, RunState.DONE, RunState.CANCELED):
            run.state = RunState.AWAITING_AGENT.value
        else:
            run.state = RunState.AWAITING_AGENT.value
        session.add(run)
        await session.commit()

        _canceled_runs.discard(run_id)

        await publish(run_id, "state_change", {"state": RunState.AWAITING_AGENT.value, "iteration": run.iteration})
        await publish(run_id, "checkpoint_restored", {
            "iteration": target_iteration,
            "best_val_bpb": run.best_val_bpb,
            "commit_sha": workspace.current_commit,
        })

        # Auto-start agent immediately
        asyncio.create_task(wake_agent(run_id))

        return {
            "status": "restored",
            "iteration": run.iteration,
            "restarted_from": target_iteration,
            "best_val_bpb": run.best_val_bpb,
            "commit_sha": workspace.current_commit,
        }


# ── Helpers ───────────────────────────────────────────────

async def _get_credentials(session: AsyncSession, run: Run) -> dict:
    """Load and decrypt credentials for the run's provider."""
    if run.credential_id:
        cred = await session.get(ProviderCredential, run.credential_id)
        if cred:
            return json.loads(decrypt(cred.encrypted_data))

    # For providers that don't need credentials (ollama, proxy copilot)
    if run.provider == "ollama":
        return {"base_url": "http://localhost:11434/v1"}
    if run.provider == "github-copilot":
        return {"mode": "proxy"}

    raise ValueError(f"No credentials configured for provider {run.provider}")


async def _record_memory(
    session: AsyncSession, run: Run, training_step: TrainingStep, improved: bool, *, overfit_rejected: bool = False
) -> None:
    """Write a run memory record summarizing the iteration."""
    agent_step = await session.get(AgentStep, training_step.agent_step_id)
    rationale = agent_step.rationale if agent_step else "N/A"

    parts = []
    if training_step.exit_code and training_step.exit_code != 0:
        # Training crashed — include the error so the agent never repeats this
        error_lines = (training_step.stderr_log or "").strip().splitlines()
        # Keep last 5 lines of traceback (most informative)
        error_snippet = "\n".join(error_lines[-5:]) if error_lines else "unknown error"
        parts.append(f"FAILED (exit {training_step.exit_code}). Change: {rationale}")
        parts.append(f"Error: {error_snippet}")
    elif training_step.val_bpb is not None:
        if improved:
            parts.append(f"IMPROVED — val_bpb={training_step.val_bpb:.4f}. Change: {rationale}")
        elif overfit_rejected:
            parts.append(f"OVERFITTING — val_bpb={training_step.val_bpb:.4f} below floor {run.overfit_floor:.4f}, rejected. Change: {rationale}")
        else:
            parts.append(f"NO IMPROVEMENT — val_bpb={training_step.val_bpb:.4f} (not better than best). Change: {rationale}")
    else:
        parts.append(f"COMPLETED but no metric parsed. Change: {rationale}")

    summary = " ".join(parts)

    mem = RunMemory(
        run_id=run.id,
        iteration=run.iteration,
        summary=summary,
        val_bpb=training_step.val_bpb,
        improved=improved,
    )
    session.add(mem)
    await session.commit()


def _parse_val_bpb(output: str) -> float | None:
    """Extract val_bpb from training output. Looks for patterns like 'val_bpb: 1.234'.
    Returns math.nan for nan/inf values so callers can detect invalid results."""
    patterns = [
        r"val_bpb[:\s=]+([\w.+-]+)",
        r"val bpb[:\s=]+([\w.+-]+)",
        r"validation bpb[:\s=]+([\w.+-]+)",
    ]
    last_match = None
    for pattern in patterns:
        for match in re.finditer(pattern, output, re.IGNORECASE):
            raw = match.group(1).strip().lower()
            if raw in ("nan", "inf", "-inf", "+inf"):
                last_match = math.nan
            else:
                try:
                    last_match = float(raw)
                except ValueError:
                    continue
    return last_match


def _extract_rationale(response: str) -> str:
    """Extract rationale text before the first code block."""
    idx = response.find("```")
    if idx > 0:
        return response[:idx].strip()
    return response[:500].strip()
