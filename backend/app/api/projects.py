"""Project endpoints."""

import asyncio
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Project, Run, TrainingStep
from app.models.project import Workspace
from app.schemas import ProjectCreate, ProjectResponse, ProjectSettingsUpdate, SetProjectBestRequest, TrainingStepResponse
from app.services.git_service import GitService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/browse-dirs")
async def browse_directories(path: str = Query("~")):
    """List directories under the given path for autocomplete."""
    resolved = Path(os.path.expanduser(path)).resolve()
    if not resolved.is_dir():
        # Try the parent if the path is a partial name
        parent = resolved.parent
        prefix = resolved.name.lower()
        if not parent.is_dir():
            return {"dirs": [], "base": str(resolved)}
        try:
            dirs = sorted(
                str(parent / e.name)
                for e in os.scandir(str(parent))
                if e.is_dir() and e.name.lower().startswith(prefix)
            )
        except PermissionError:
            dirs = []
        return {"dirs": dirs[:50], "base": str(parent)}

    try:
        dirs = sorted(
            str(resolved / e.name)
            for e in os.scandir(str(resolved))
            if e.is_dir()
        )
    except PermissionError:
        dirs = []
    return {"dirs": dirs[:50], "base": str(resolved)}


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    source = Path(body.source_path)
    if not source.exists():
        raise HTTPException(400, f"Source path does not exist: {body.source_path}")
    if not (source / "train.py").exists():
        raise HTTPException(400, "Source path must contain train.py")

    project = Project(
        name=body.name,
        description=body.description,
        source_path=str(source.resolve()),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()


@router.patch("/{project_id}/settings", response_model=ProjectResponse)
async def update_project_settings(project_id: str, body: ProjectSettingsUpdate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    for field in ("default_auto_approve", "default_auto_continue", "default_max_iterations", "default_include_machine_info", "default_auto_compact", "default_compact_threshold_pct", "default_context_limit"):
        val = getattr(body, field)
        if val is not None:
            setattr(project, field, val)
    # Float fields need explicit handling since None is a valid value (clear)
    if "default_overfit_floor" in body.model_fields_set:
        project.default_overfit_floor = body.default_overfit_floor
    if "default_overfit_margin" in body.model_fields_set:
        project.default_overfit_margin = body.default_overfit_margin
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.put("/{project_id}/best", response_model=ProjectResponse)
async def set_project_best(project_id: str, body: SetProjectBestRequest, db: AsyncSession = Depends(get_db)):
    """Manually set a training step as the project-level best."""
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    step = await db.get(TrainingStep, body.training_step_id)
    if step is None:
        raise HTTPException(404, "Training step not found")

    # Verify the training step belongs to a run under this project
    if step.run.project_id != project_id:
        raise HTTPException(400, "Training step does not belong to this project")

    if step.commit_sha is None:
        raise HTTPException(400, "Training step has no commit (incomplete or failed)")

    if step.val_bpb is None:
        raise HTTPException(400, "Training step has no val_bpb score")

    # Read train.py at that commit
    ws_result = await db.execute(select(Workspace).where(Workspace.run_id == step.run_id))
    workspace = ws_result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(400, "Workspace not found for this run")

    git = GitService(workspace.workspace_path)
    git.open()
    best_code = git.read_file_at("train.py", step.commit_sha)

    project.best_val_bpb = step.val_bpb
    project.best_train_py = best_code
    project.best_run_id = step.run_id
    project.best_iteration = step.iteration
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}/training-steps", response_model=list[TrainingStepResponse])
async def list_project_training_steps(project_id: str, db: AsyncSession = Depends(get_db)):
    """List all completed training steps with val_bpb across all runs for a project, for best-selection."""
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    result = await db.execute(
        select(TrainingStep)
        .join(Run, TrainingStep.run_id == Run.id)
        .where(
            Run.project_id == project_id,
            TrainingStep.val_bpb.isnot(None),
            TrainingStep.commit_sha.isnot(None),
        )
        .order_by(TrainingStep.val_bpb.asc())
    )
    return result.scalars().all()
