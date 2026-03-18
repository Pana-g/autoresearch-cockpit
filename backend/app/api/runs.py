"""Run endpoints — CRUD + control actions."""

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import AgentStep, Project, Run, RunMemory, RunState, TrainingStep, Workspace
from app.schemas import (
    AgentStepResponse,
    CheckpointRestartRequest,
    CompactionResponse,
    ContextUsageResponse,
    RunActionRequest,
    RunCreate,
    RunResponse,
    RunSettingsUpdate,
    TrainingStepChartPoint,
    TrainingStepResponse,
)
from app.services import run_engine
from app.services.git_service import GitService

router = APIRouter(prefix="/projects/{project_id}/runs", tags=["runs"])


@router.get("", response_model=list[RunResponse])
async def list_runs(
    project_id: str,
    limit: int = 25,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Run)
        .where(Run.project_id == project_id)
        .order_by(Run.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("", response_model=RunResponse, status_code=201)
async def create_run(project_id: str, body: RunCreate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    run = Run(
        project_id=project_id,
        provider=body.provider,
        model=body.model,
        credential_id=body.credential_id,
        auto_approve=body.auto_approve if body.auto_approve is not None else project.default_auto_approve,
        auto_continue=body.auto_continue if body.auto_continue is not None else project.default_auto_continue,
        max_iterations=body.max_iterations if body.max_iterations is not None else project.default_max_iterations,
        overfit_floor=body.overfit_floor if "overfit_floor" in body.model_fields_set else project.default_overfit_floor,
        overfit_margin=body.overfit_margin if "overfit_margin" in body.model_fields_set else project.default_overfit_margin,
        auto_compact=project.default_auto_compact,
        compact_threshold_pct=project.default_compact_threshold_pct,
        context_limit=project.default_context_limit,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(project_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")
    return run


@router.patch("/{run_id}/settings", response_model=RunResponse)
async def update_run_settings(
    project_id: str, run_id: str, body: RunSettingsUpdate, db: AsyncSession = Depends(get_db)
):
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")
    if body.auto_approve is not None:
        run.auto_approve = body.auto_approve
    if body.auto_continue is not None:
        run.auto_continue = body.auto_continue
    if body.max_iterations is not None:
        run.max_iterations = body.max_iterations
    if body.stop_requested is not None:
        run.stop_requested = body.stop_requested
    if body.overfit_floor is not None:
        run.overfit_floor = body.overfit_floor
    elif "overfit_floor" in body.model_fields_set:
        run.overfit_floor = None
    if body.overfit_margin is not None:
        run.overfit_margin = body.overfit_margin
    elif "overfit_margin" in body.model_fields_set:
        run.overfit_margin = None
    if body.provider is not None:
        run.provider = body.provider
    if body.model is not None:
        run.model = body.model
    if body.credential_id is not None:
        run.credential_id = body.credential_id
    if body.auto_compact is not None:
        run.auto_compact = body.auto_compact
    if body.compact_threshold_pct is not None:
        run.compact_threshold_pct = body.compact_threshold_pct
    if body.context_limit is not None:
        run.context_limit = body.context_limit
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # If auto_approve was just turned on and we're waiting for patch review, auto-approve now
    if run.auto_approve and RunState(run.state) == RunState.AWAITING_PATCH_REVIEW:
        asyncio.create_task(run_engine.approve_patch(run_id))

    # If auto_continue was just turned on and we're waiting for next action, auto-continue now
    if run.auto_continue and RunState(run.state) == RunState.AWAITING_NEXT_ACTION:
        asyncio.create_task(run_engine.continue_loop(run_id))

    return run


@router.post("/{run_id}/actions")
async def run_action(
    project_id: str, run_id: str, body: RunActionRequest, db: AsyncSession = Depends(get_db)
):
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    action = body.action
    state = RunState(run.state)

    if action == "start":
        if state != RunState.IDLE:
            raise HTTPException(400, f"Cannot start run in state {state.value}")
        asyncio.create_task(run_engine.prepare_run(run_id, project.source_path))
        return {"status": "preparing"}

    elif action == "approve_patch":
        if state != RunState.AWAITING_PATCH_REVIEW:
            raise HTTPException(400, f"Cannot approve patch in state {state.value}")
        asyncio.create_task(run_engine.approve_patch(run_id))
        return {"status": "patch_approved"}

    elif action == "reject_patch":
        if state != RunState.AWAITING_PATCH_REVIEW:
            raise HTTPException(400, f"Cannot reject patch in state {state.value}")
        asyncio.create_task(run_engine.reject_patch(run_id))
        return {"status": "patch_rejected"}

    elif action == "continue":
        if state != RunState.AWAITING_NEXT_ACTION:
            raise HTTPException(400, f"Cannot continue in state {state.value}")
        asyncio.create_task(run_engine.continue_loop(run_id))
        return {"status": "continuing"}

    elif action == "stop":
        if state != RunState.AWAITING_NEXT_ACTION:
            raise HTTPException(400, f"Cannot stop in state {state.value}")
        asyncio.create_task(run_engine.stop_run(run_id))
        return {"status": "stopping"}

    elif action == "pause":
        if state not in (
            RunState.AWAITING_AGENT,
            RunState.AWAITING_PATCH_REVIEW,
            RunState.AWAITING_NEXT_ACTION,
        ):
            raise HTTPException(400, f"Cannot pause in state {state.value}")
        asyncio.create_task(run_engine.pause_run(run_id))
        return {"status": "pausing"}

    elif action == "resume":
        if state != RunState.PAUSED:
            raise HTTPException(400, f"Cannot resume in state {state.value}")
        asyncio.create_task(run_engine.resume_run(run_id))
        return {"status": "resuming"}

    elif action == "cancel":
        terminal = {RunState.DONE, RunState.FAILED, RunState.CANCELED}
        if state in terminal:
            raise HTTPException(400, f"Cannot cancel in state {state.value}")
        asyncio.create_task(run_engine.cancel_run(run_id))
        return {"status": "canceling"}

    elif action == "retry":
        if state != RunState.FAILED:
            raise HTTPException(400, f"Cannot retry in state {state.value}")
        asyncio.create_task(run_engine.retry_last_step(run_id, project.source_path))
        return {"status": "retrying"}

    elif action == "force_continue":
        if state not in (RunState.DONE, RunState.CANCELED):
            raise HTTPException(400, f"Cannot force-continue in state {state.value}")
        asyncio.create_task(run_engine.resume_from_terminal(run_id))
        return {"status": "continuing"}

    elif action == "force_fail":
        # Allow forcing stuck in-flight states to failed
        stuck_states = {RunState.AGENT_RUNNING, RunState.TRAINING_RUNNING, RunState.PREPARING, RunState.PATCH_APPROVED}
        if state not in stuck_states:
            raise HTTPException(400, f"Cannot force-fail in state {state.value}")
        asyncio.create_task(run_engine.force_fail_run(run_id))
        return {"status": "failing"}

    else:
        raise HTTPException(400, f"Unknown action: {action}")


# ── Sub-resources ─────────────────────────────────────────

@router.get("/{run_id}/agent-steps", response_model=list[AgentStepResponse])
async def list_agent_steps(
    project_id: str,
    run_id: str,
    limit: int = 25,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentStep)
        .where(AgentStep.run_id == run_id)
        .order_by(AgentStep.iteration.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/{run_id}/training-steps", response_model=list[TrainingStepResponse])
async def list_training_steps(
    project_id: str,
    run_id: str,
    limit: int = 25,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TrainingStep)
        .where(TrainingStep.run_id == run_id)
        .order_by(TrainingStep.iteration.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/{run_id}/chart-data", response_model=list[TrainingStepChartPoint])
async def get_chart_data(
    project_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Lightweight endpoint returning only iteration/score/status for all training steps."""
    result = await db.execute(
        select(
            TrainingStep.iteration,
            TrainingStep.val_bpb,
            TrainingStep.improved,
            TrainingStep.status,
        )
        .where(TrainingStep.run_id == run_id)
        .order_by(TrainingStep.iteration.asc())
    )
    return [TrainingStepChartPoint(iteration=r.iteration, val_bpb=r.val_bpb, improved=r.improved, status=r.status) for r in result.all()]


@router.get("/{run_id}/git-log")
async def get_git_log(project_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found for this run")

    git = GitService(workspace.workspace_path)
    git.open()
    return git.get_log()


@router.post("/{run_id}/rollback")
async def rollback(
    project_id: str, run_id: str, commit_sha: str, db: AsyncSession = Depends(get_db)
):
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    state = RunState(run.state)
    if state not in (RunState.AWAITING_NEXT_ACTION, RunState.PAUSED, RunState.FAILED):
        raise HTTPException(400, f"Cannot rollback in state {state.value}")

    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")

    git = GitService(workspace.workspace_path)
    git.open()
    git.rollback(commit_sha)
    workspace.current_commit = commit_sha
    db.add(workspace)
    await db.commit()
    return {"status": "rolled_back", "commit_sha": commit_sha}


@router.post("/{run_id}/checkpoint-restart")
async def checkpoint_restart(
    project_id: str,
    run_id: str,
    body: CheckpointRestartRequest,
    db: AsyncSession = Depends(get_db),
):
    """Roll back to a previous iteration checkpoint, discard later work, and restart."""
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    try:
        result = await run_engine.rollback_to_checkpoint(
            run_id, body.iteration, reset_train_py=body.reset_train_py,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{run_id}/program")
async def get_program(project_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    program_path = Path(workspace.workspace_path) / "program.md"
    if not program_path.exists():
        return {"content": ""}
    return {"content": program_path.read_text()}


@router.get("/{run_id}/workspace-files")
async def get_workspace_files(
    project_id: str, run_id: str, db: AsyncSession = Depends(get_db)
):
    """Return key workspace files and context for the cockpit display."""
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found for this run")

    workspace_path = Path(workspace.workspace_path)

    files: dict[str, str | None] = {}

    # Read program.md
    program_path = workspace_path / "program.md"
    files["program.md"] = program_path.read_text() if program_path.exists() else None

    # Read train.py
    train_path = workspace_path / "train.py"
    files["train.py"] = train_path.read_text() if train_path.exists() else None

    # List other notable files at root
    notable_files: list[str] = []
    if workspace_path.exists():
        for f in sorted(workspace_path.iterdir()):
            if f.name.startswith("."):
                continue
            if f.is_file() and f.name not in ("program.md", "train.py"):
                notable_files.append(f.name)

    return {
        "files": files,
        "notable_files": notable_files,
        "workspace_path": str(workspace_path),
        "current_commit": workspace.current_commit,
        "best_commit": workspace.best_commit,
        "git_branch": workspace.git_branch,
    }


@router.put("/{run_id}/program")
async def update_program(
    project_id: str,
    run_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    content = body.get("content", "")
    program_path = Path(workspace.workspace_path) / "program.md"
    program_path.write_text(content)
    return {"status": "updated"}


@router.get("/{run_id}/train-py")
async def get_train_py(project_id: str, run_id: str, db: AsyncSession = Depends(get_db)):
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    train_path = Path(workspace.workspace_path) / "train.py"
    if not train_path.exists():
        return {"content": ""}
    return {"content": train_path.read_text()}


@router.put("/{run_id}/train-py")
async def update_train_py(
    project_id: str,
    run_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    content = body.get("content", "")
    train_path = Path(workspace.workspace_path) / "train.py"
    train_path.write_text(content)
    return {"status": "updated"}


# ── Compaction ────────────────────────────────────────────

from app.services.compaction import (
    build_compacted_summary,
    check_compaction_needed,
    estimate_tokens,
    get_context_limit,
)


@router.get("/{run_id}/compaction", response_model=CompactionResponse)
async def get_compaction(
    project_id: str, run_id: str, db: AsyncSession = Depends(get_db)
):
    """Get current compaction state and a preview of what compaction would produce."""
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    # Fetch all memory records
    mem_result = await db.execute(
        select(RunMemory)
        .where(RunMemory.run_id == run_id)
        .order_by(RunMemory.iteration.asc())
    )
    records = [
        {"iteration": m.iteration, "summary": m.summary, "val_bpb": m.val_bpb, "improved": m.improved}
        for m in mem_result.scalars().all()
    ]

    # Generate a preview of what compaction would produce
    preview_summary, preview_up_to = build_compacted_summary(records)

    return {
        "current_summary": run.compacted_summary,
        "current_up_to": run.compacted_up_to,
        "preview_summary": preview_summary or None,
        "preview_up_to": preview_up_to or None,
        "memory_count": len(records),
        "auto_compact": run.auto_compact,
        "compact_threshold_pct": run.compact_threshold_pct,
        "context_limit": run.context_limit,
    }


@router.get("/{run_id}/context-usage", response_model=ContextUsageResponse)
async def get_context_usage(
    project_id: str, run_id: str, db: AsyncSession = Depends(get_db)
):
    """Estimate current context window usage for this run."""
    import json as _json
    from app.services.prompt_builder import build_agent_prompt

    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    # Read workspace files
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == run_id))
    workspace = ws_result.scalar_one_or_none()

    program_md = ""
    train_py = ""
    if workspace:
        from pathlib import Path as _Path

        prog_path = _Path(workspace.workspace_path) / "program.md"
        train_path = _Path(workspace.workspace_path) / "train.py"
        if prog_path.exists():
            program_md = prog_path.read_text()
        if train_path.exists():
            train_py = train_path.read_text()

    # Get memory records
    mem_result = await db.execute(
        select(RunMemory).where(RunMemory.run_id == run_id).order_by(RunMemory.iteration.desc())
    )
    memory_records = [
        {"iteration": m.iteration, "summary": m.summary, "val_bpb": m.val_bpb, "improved": m.improved}
        for m in mem_result.scalars().all()
    ]

    # Build the prompt to measure its size
    messages = build_agent_prompt(
        program_md=program_md,
        train_py=train_py,
        memory_records=memory_records,
        latest_metrics=None,
        human_notes=[],
        iteration=run.iteration,
        best_val_bpb=run.best_val_bpb,
        overfit_floor=run.overfit_floor,
        compacted_summary=run.compacted_summary,
        compacted_up_to=run.compacted_up_to,
    )
    prompt_text = _json.dumps(messages)
    prompt_tokens = estimate_tokens(prompt_text)
    context_limit = get_context_limit(run.model, run.context_limit)
    usage_pct = round((prompt_tokens / context_limit) * 100, 1) if context_limit > 0 else 0.0
    threshold_tokens = int(context_limit * run.compact_threshold_pct / 100)

    return {
        "prompt_tokens": prompt_tokens,
        "context_limit": context_limit,
        "usage_pct": usage_pct,
        "threshold_pct": run.compact_threshold_pct,
        "threshold_tokens": threshold_tokens,
        "compacted": run.compacted_up_to is not None,
        "compacted_up_to": run.compacted_up_to,
        "memory_count": len(memory_records),
    }


@router.post("/{run_id}/compaction/apply")
async def apply_compaction(
    project_id: str, run_id: str, db: AsyncSession = Depends(get_db)
):
    """Apply compaction using the auto-generated summary."""
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    mem_result = await db.execute(
        select(RunMemory)
        .where(RunMemory.run_id == run_id)
        .order_by(RunMemory.iteration.asc())
    )
    records = [
        {"iteration": m.iteration, "summary": m.summary, "val_bpb": m.val_bpb, "improved": m.improved}
        for m in mem_result.scalars().all()
    ]

    summary, up_to = build_compacted_summary(records)
    if not summary:
        raise HTTPException(400, "Not enough records to compact")

    run.compacted_summary = summary
    run.compacted_up_to = up_to
    db.add(run)
    await db.commit()

    return {"status": "compacted", "compacted_up_to": up_to}


@router.put("/{run_id}/compaction")
async def update_compaction(
    project_id: str, run_id: str, body: dict, db: AsyncSession = Depends(get_db)
):
    """Update the compacted summary text (user-edited)."""
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    summary = body.get("summary")
    up_to = body.get("compacted_up_to")

    if summary is not None:
        run.compacted_summary = summary if summary else None
    if up_to is not None:
        run.compacted_up_to = up_to if up_to else None

    db.add(run)
    await db.commit()

    return {"status": "updated", "compacted_up_to": run.compacted_up_to}


@router.delete("/{run_id}/compaction")
async def clear_compaction(
    project_id: str, run_id: str, db: AsyncSession = Depends(get_db)
):
    """Clear the compacted summary, reverting to full memory records."""
    run = await db.get(Run, run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found")

    run.compacted_summary = None
    run.compacted_up_to = None
    db.add(run)
    await db.commit()

    return {"status": "cleared"}
