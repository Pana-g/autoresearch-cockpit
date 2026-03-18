"""Command handler — parses text commands from external channels and executes run actions."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_factory
from app.models.run import Run, RunNote
from app.models.project import Project
from app.models.state_machine import RunState
from app.services import run_engine

logger = logging.getLogger(__name__)

# Non-terminal states that indicate a run is "active"
_ACTIVE_STATES = {
    RunState.PREPARING.value, RunState.AWAITING_AGENT.value, RunState.AGENT_RUNNING.value,
    RunState.AWAITING_PATCH_REVIEW.value, RunState.PATCH_APPROVED.value,
    RunState.TRAINING_RUNNING.value, RunState.TRAINING_FINISHED.value,
    RunState.AWAITING_NEXT_ACTION.value, RunState.PAUSED.value,
}


async def _find_active_runs(session: AsyncSession) -> list[Run]:
    result = await session.execute(
        select(Run).where(Run.state.in_(_ACTIVE_STATES)).order_by(Run.updated_at.desc())
    )
    return list(result.scalars().all())


async def _resolve_run(session: AsyncSession, run_id_hint: str | None) -> Run | None:
    """Resolve a run from an optional ID hint. Auto-selects if only one active."""
    if run_id_hint:
        # Try exact match first, then prefix match
        run = await session.get(Run, run_id_hint)
        if run:
            return run
        # Prefix match
        result = await session.execute(
            select(Run).where(Run.id.startswith(run_id_hint)).limit(2)
        )
        matches = list(result.scalars().all())
        if len(matches) == 1:
            return matches[0]
        return None

    # No hint — auto-select if exactly one active run
    active = await _find_active_runs(session)
    if len(active) == 1:
        return active[0]
    return None


async def handle_command(text: str) -> str:
    """Parse and execute a command string. Returns a response message."""
    text = text.strip()
    if not text.startswith("/"):
        return "Commands must start with /. Try /help"

    parts = text.split(maxsplit=2)
    cmd = parts[0].lower()

    try:
        if cmd == "/help":
            return _help_text()
        elif cmd == "/status":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_status(run_hint)
        elif cmd == "/runs":
            return await _cmd_runs()
        elif cmd == "/instruct":
            if len(parts) < 2:
                return "Usage: /instruct <message> [run_id]"
            # Last part could be run_id or part of message
            return await _cmd_instruct(parts[1] if len(parts) > 1 else "", parts[2] if len(parts) > 2 else None)
        elif cmd == "/continue":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_continue(run_hint)
        elif cmd == "/cancel":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_cancel(run_hint)
        elif cmd == "/approve":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_approve(run_hint)
        elif cmd == "/reject":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_reject(run_hint)
        elif cmd == "/pause":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_pause(run_hint)
        elif cmd == "/resume":
            run_hint = parts[1] if len(parts) > 1 else None
            return await _cmd_resume(run_hint)
        else:
            return f"Unknown command: {cmd}. Try /help"
    except Exception as e:
        logger.exception("Command handler error for: %s", text)
        return f"Error: {e}"


def _help_text() -> str:
    return (
        "Available commands:\n"
        "/status [run_id] — Current run status\n"
        "/runs — List active runs\n"
        "/instruct <message> [run_id] — Send instruction to the agent\n"
        "/continue [run_id] — Continue to next iteration\n"
        "/cancel [run_id] — Cancel the run\n"
        "/approve [run_id] — Approve current patch\n"
        "/reject [run_id] — Reject current patch\n"
        "/pause [run_id] — Pause the run\n"
        "/resume [run_id] — Resume a paused run\n"
        "/help — Show this help\n\n"
        "If run_id is omitted and only one run is active, it is auto-selected."
    )


async def _cmd_status(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found. Specify a run ID or ensure exactly one run is active."
        project = await session.get(Project, run.project_id)
        project_name = project.name if project else "?"
        lines = [
            f"Run `{run.id[:8]}` — {project_name}",
            f"State: {run.state}",
            f"Iteration: {run.iteration}",
            f"Provider: {run.provider}/{run.model}",
        ]
        if run.best_val_bpb is not None:
            lines.append(f"Best Val BPB: {run.best_val_bpb:.4f}")
        if run.max_iterations > 0:
            lines.append(f"Max Iterations: {run.max_iterations}")
        lines.append(f"Auto-approve: {'on' if run.auto_approve else 'off'}")
        lines.append(f"Auto-continue: {'on' if run.auto_continue else 'off'}")
        return "\n".join(lines)


async def _cmd_runs() -> str:
    async with async_session_factory() as session:
        active = await _find_active_runs(session)
        if not active:
            return "No active runs."
        lines = ["Active runs:"]
        for r in active:
            project = await session.get(Project, r.project_id)
            pname = project.name if project else "?"
            best = f" | best={r.best_val_bpb:.4f}" if r.best_val_bpb else ""
            lines.append(f"  `{r.id[:8]}` {pname} — {r.state} iter={r.iteration}{best}")
        return "\n".join(lines)


async def _cmd_instruct(message: str, run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found. Specify a run ID or ensure exactly one run is active."
        note = RunNote(run_id=run.id, content=message, active=True)
        session.add(note)
        await session.commit()
        return f"Instruction added to run `{run.id[:8]}` — will be included in the next agent prompt."


async def _cmd_continue(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        if RunState(run.state) != RunState.AWAITING_NEXT_ACTION:
            return f"Cannot continue — run is in state `{run.state}`"
    await run_engine.continue_loop(run.id)
    return f"Continuing run `{run.id[:8]}` to next iteration."


async def _cmd_cancel(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        terminal = {RunState.DONE.value, RunState.FAILED.value, RunState.CANCELED.value}
        if run.state in terminal:
            return f"Cannot cancel — run is already `{run.state}`"
    await run_engine.cancel_run(run.id)
    return f"Canceling run `{run.id[:8]}`."


async def _cmd_approve(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        if RunState(run.state) != RunState.AWAITING_PATCH_REVIEW:
            return f"Cannot approve — run is in state `{run.state}`"
    await run_engine.approve_patch(run.id)
    return f"Patch approved for run `{run.id[:8]}`."


async def _cmd_reject(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        if RunState(run.state) != RunState.AWAITING_PATCH_REVIEW:
            return f"Cannot reject — run is in state `{run.state}`"
    await run_engine.reject_patch(run.id)
    return f"Patch rejected for run `{run.id[:8]}`."


async def _cmd_pause(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        pausable = {RunState.AWAITING_AGENT.value, RunState.AWAITING_PATCH_REVIEW.value, RunState.AWAITING_NEXT_ACTION.value}
        if run.state not in pausable:
            return f"Cannot pause — run is in state `{run.state}`"
    await run_engine.pause_run(run.id)
    return f"Pausing run `{run.id[:8]}`."


async def _cmd_resume(run_hint: str | None) -> str:
    async with async_session_factory() as session:
        run = await _resolve_run(session, run_hint)
        if not run:
            return "No run found."
        if RunState(run.state) != RunState.PAUSED:
            return f"Cannot resume — run is in state `{run.state}`"
    await run_engine.resume_run(run.id)
    return f"Resuming run `{run.id[:8]}`."
