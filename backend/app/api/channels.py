"""Notification channel endpoints — CRUD + test + validate."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.channels.registry import get_channel, list_channel_types
from app.db import get_db
from app.models.channel import NotificationChannel
from app.schemas import (
    NOTIFICATION_EVENT_TYPES,
    ChannelCreate,
    ChannelResponse,
    ChannelTypeInfoResponse,
    ChannelUpdate,
)
from app.services.encryption import decrypt, encrypt

router = APIRouter(tags=["channels"])


def _to_response(ch: NotificationChannel) -> ChannelResponse:
    """Convert a NotificationChannel ORM object to a response, parsing JSON events."""
    events = json.loads(ch.notification_events) if ch.notification_events else []
    return ChannelResponse(
        id=ch.id,
        name=ch.name,
        channel_type=ch.channel_type,
        is_active=ch.is_active,
        notification_events=events,
        commands_enabled=ch.commands_enabled,
        linked_run_id=ch.linked_run_id,
        created_at=ch.created_at,
        updated_at=ch.updated_at,
    )


# ── Channel types ────────────────────────────────────────

@router.get("/channel-types", response_model=list[ChannelTypeInfoResponse])
async def get_channel_types():
    return [
        ChannelTypeInfoResponse(
            name=info.name,
            label=info.label,
            config_fields=info.config_fields,
            supports_commands=info.supports_commands,
        )
        for info in list_channel_types()
    ]


@router.get("/notification-event-types")
async def get_notification_event_types():
    return NOTIFICATION_EVENT_TYPES


# ── Channel CRUD ─────────────────────────────────────────

@router.get("/channels", response_model=list[ChannelResponse])
async def list_channels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NotificationChannel).order_by(NotificationChannel.created_at.desc())
    )
    return [_to_response(ch) for ch in result.scalars().all()]


@router.post("/channels", response_model=ChannelResponse, status_code=201)
async def create_channel(body: ChannelCreate, db: AsyncSession = Depends(get_db)):
    # Validate channel type exists
    try:
        get_channel(body.channel_type)
    except ValueError:
        raise HTTPException(400, f"Unknown channel type: {body.channel_type}")

    # Validate event types
    for evt in body.notification_events:
        if evt not in NOTIFICATION_EVENT_TYPES:
            raise HTTPException(400, f"Unknown notification event type: {evt}")

    encrypted = encrypt(json.dumps(body.config))
    ch = NotificationChannel(
        name=body.name,
        channel_type=body.channel_type,
        encrypted_config=encrypted,
        notification_events=json.dumps(body.notification_events),
        commands_enabled=body.commands_enabled,
        linked_run_id=body.linked_run_id,
    )
    db.add(ch)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Channel with name '{body.name}' already exists")
    await db.refresh(ch)

    # Start command receiver if enabled
    if ch.commands_enabled and ch.is_active:
        from app.services.channel_manager import start_receiver
        await start_receiver(ch.id, ch.channel_type, ch.encrypted_config)

    return _to_response(ch)


@router.patch("/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: str, body: ChannelUpdate, db: AsyncSession = Depends(get_db)
):
    ch = await db.get(NotificationChannel, channel_id)
    if ch is None:
        raise HTTPException(404, "Channel not found")

    if body.name is not None:
        ch.name = body.name
    if body.config is not None:
        ch.encrypted_config = encrypt(json.dumps(body.config))
    if body.notification_events is not None:
        for evt in body.notification_events:
            if evt not in NOTIFICATION_EVENT_TYPES:
                raise HTTPException(400, f"Unknown notification event type: {evt}")
        ch.notification_events = json.dumps(body.notification_events)
    if body.commands_enabled is not None:
        ch.commands_enabled = body.commands_enabled
    if body.is_active is not None:
        ch.is_active = body.is_active
    if "linked_run_id" in body.model_fields_set:
        ch.linked_run_id = body.linked_run_id

    db.add(ch)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Channel with name '{body.name}' already exists")
    await db.refresh(ch)

    # Restart receiver if commands or config changed
    from app.services.channel_manager import restart_receiver, stop_receiver
    if ch.commands_enabled and ch.is_active:
        await restart_receiver(ch.id, ch.channel_type, ch.encrypted_config)
    else:
        await stop_receiver(ch.id)

    return _to_response(ch)


@router.delete("/channels/{channel_id}", status_code=204)
async def delete_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    ch = await db.get(NotificationChannel, channel_id)
    if ch is None:
        raise HTTPException(404, "Channel not found")

    # Stop receiver first
    from app.services.channel_manager import stop_receiver
    await stop_receiver(ch.id)

    await db.delete(ch)
    await db.commit()


# ── Test & Validate ──────────────────────────────────────

@router.post("/channels/{channel_id}/test")
async def test_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Send a test notification to verify the channel is working."""
    ch = await db.get(NotificationChannel, channel_id)
    if ch is None:
        raise HTTPException(404, "Channel not found")

    config = json.loads(decrypt(ch.encrypted_config))
    provider = get_channel(ch.channel_type)

    test_payload = {
        "run_id": "test-0000-0000",
        "project_name": "Test Project",
        "iteration": 1,
        "val_bpb": 1.2345,
        "prev_best": 1.5000,
        "best_val_bpb": 1.2345,
    }

    try:
        await provider.send_notification("new_best", test_payload, config)
        return {"status": "sent"}
    except Exception as e:
        raise HTTPException(400, f"Test notification failed: {e}")


@router.post("/channels/{channel_id}/validate")
async def validate_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Validate that the channel configuration is correct and reachable."""
    ch = await db.get(NotificationChannel, channel_id)
    if ch is None:
        raise HTTPException(404, "Channel not found")

    config = json.loads(decrypt(ch.encrypted_config))
    provider = get_channel(ch.channel_type)

    try:
        valid = await provider.validate_config(config)
        return {"valid": valid}
    except Exception as e:
        return {"valid": False, "error": str(e)}
