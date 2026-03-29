"""Notification service — listens to all run events and dispatches to configured channels."""

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.channels.registry import get_channel
from app.db import async_session_factory
from app.models.channel import NotificationChannel
from app.models.project import Project
from app.models.run import Run
from app.services.encryption import decrypt
from app.services.event_bus import subscribe_global, unsubscribe_global

logger = logging.getLogger(__name__)

# Maps internal event bus events → notification event types
_EVENT_MAP: dict[str, str | None] = {
    "training_completed": "_training_completed",  # special: check if new_best
    "training_failed": "training_failed",
    "run_done": "run_completed",
    "agent_streaming_start": "iteration_started",
    "patch_ready": "patch_ready",
}

# State change events we care about
_STATE_EVENTS = {
    "failed": "run_failed",
    "canceled": "run_canceled",
}

_task: asyncio.Task | None = None
_queue: asyncio.Queue | None = None


async def _get_active_channels(session: AsyncSession, run_id: str | None) -> list[tuple[NotificationChannel, dict]]:
    """Get all active channels whose linked_run_id matches (or is null = all runs)."""
    stmt = select(NotificationChannel).where(NotificationChannel.is_active.is_(True))
    result = await session.execute(stmt)
    channels = result.scalars().all()

    out = []
    for ch in channels:
        # Filter by linked run
        if ch.linked_run_id and ch.linked_run_id != run_id:
            continue
        config = json.loads(decrypt(ch.encrypted_config))
        out.append((ch, config))
    return out


async def _build_payload(session: AsyncSession, run_id: str, data: dict) -> dict:
    """Enrich the event data with project/run context."""
    payload = dict(data) if data else {}
    payload["run_id"] = run_id

    run = await session.get(Run, run_id)
    if run:
        payload.setdefault("iteration", run.iteration)
        payload.setdefault("best_val_bpb", run.best_val_bpb)
        payload.setdefault("state", run.state)
        project = await session.get(Project, run.project_id)
        if project:
            payload["project_name"] = project.name

    return payload


async def _dispatch(notification_type: str, payload: dict, channels: list[tuple[NotificationChannel, dict]]) -> None:
    """Send notification to all matching channels in parallel."""
    tasks = []
    for ch, config in channels:
        events = json.loads(ch.notification_events) if ch.notification_events else []
        if notification_type not in events:
            continue
        try:
            provider = get_channel(ch.channel_type)
            tasks.append(provider.send_notification(notification_type, payload, config))
        except Exception:
            logger.exception("Failed to create send task for channel %s (%s)", ch.name, ch.channel_type)

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Notification send failed: %s", result)


async def _process_event(raw: str) -> None:
    """Process a single event from the global bus."""
    msg = json.loads(raw)
    event = msg.get("event", "")
    data = msg.get("data") or {}
    run_id = msg.get("run_id", "")

    # Determine notification type
    notification_type: str | None = None

    if event == "state_change":
        new_state = data.get("state", "")
        notification_type = _STATE_EVENTS.get(new_state)
    elif event == "training_completed":
        # Distinguish new_best from regular completion
        if data.get("improved"):
            notification_type = "new_best"
            # Add prev_best info for the message
            data["prev_best"] = data.get("best_val_bpb")
    else:
        mapped = _EVENT_MAP.get(event)
        if mapped and not mapped.startswith("_"):
            notification_type = mapped

    if not notification_type:
        return

    try:
        async with async_session_factory() as session:
            channels = await _get_active_channels(session, run_id)
            if not channels:
                return
            payload = await _build_payload(session, run_id, data)
        await _dispatch(notification_type, payload, channels)
    except Exception:
        logger.exception("Error processing notification for event %s run %s", event, run_id)


async def _listener_loop(q: asyncio.Queue) -> None:
    """Main loop: read events from the global bus and dispatch notifications."""
    logger.info("Notification service started")
    while True:
        try:
            raw = await q.get()
            await _process_event(raw)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Notification listener error")
            await asyncio.sleep(1)


async def start() -> None:
    """Start the notification service background task."""
    global _task, _queue
    if _task is not None:
        return
    _queue = await subscribe_global()
    _task = asyncio.create_task(_listener_loop(_queue))
    logger.info("Notification service background task created")


async def stop() -> None:
    """Stop the notification service."""
    global _task, _queue
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
    if _queue is not None:
        unsubscribe_global(_queue)
        _queue = None
    logger.info("Notification service stopped")
