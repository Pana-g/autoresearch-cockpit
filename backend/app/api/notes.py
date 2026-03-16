"""Run notes (context system) endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import RunNote
from app.schemas import NoteCreate, NoteResponse

router = APIRouter(prefix="/runs/{run_id}/notes", tags=["notes"])


@router.get("", response_model=list[NoteResponse])
async def list_notes(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RunNote).where(RunNote.run_id == run_id).order_by(RunNote.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(run_id: str, body: NoteCreate, db: AsyncSession = Depends(get_db)):
    note = RunNote(run_id=run_id, content=body.content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    run_id: str, note_id: str, active: bool | None = None, content: str | None = None, db: AsyncSession = Depends(get_db)
):
    note = await db.get(RunNote, note_id)
    if note is None or note.run_id != run_id:
        raise HTTPException(404, "Note not found")
    if active is not None:
        note.active = active
    if content is not None:
        note.content = content
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(run_id: str, note_id: str, db: AsyncSession = Depends(get_db)):
    note = await db.get(RunNote, note_id)
    if note is None or note.run_id != run_id:
        raise HTTPException(404, "Note not found")
    await db.delete(note)
    await db.commit()
