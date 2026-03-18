"""SSE event bus — one channel per run, plus global subscribers for notifications."""

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# run_id → set of subscriber queues
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

# Global subscribers receive events for ALL runs (used by notification service)
_global_subscribers: set[asyncio.Queue] = set()

# run_id → current agent phase snapshot (only while agent is streaming)
_agent_snapshots: dict[str, dict[str, Any]] = {}

# run_id → training started snapshot (only while training is running)
_training_snapshots: dict[str, dict[str, Any]] = {}


def set_agent_snapshot(run_id: str, snapshot: dict[str, Any]) -> None:
    """Store the current agent phase so new subscribers can catch up."""
    _agent_snapshots[run_id] = snapshot


def get_agent_snapshot(run_id: str) -> dict[str, Any] | None:
    return _agent_snapshots.get(run_id)


def clear_agent_snapshot(run_id: str) -> None:
    _agent_snapshots.pop(run_id, None)


def set_training_snapshot(run_id: str, snapshot: dict[str, Any]) -> None:
    """Store the training started_at so new subscribers can catch up."""
    _training_snapshots[run_id] = snapshot


def get_training_snapshot(run_id: str) -> dict[str, Any] | None:
    return _training_snapshots.get(run_id)


def clear_training_snapshot(run_id: str) -> None:
    _training_snapshots.pop(run_id, None)


async def subscribe(run_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers[run_id].add(q)
    # Send snapshot of current agent phase (if active) so reconnecting
    # clients know what the agent is doing right now.
    snapshot = get_agent_snapshot(run_id)
    if snapshot:
        payload = json.dumps({"event": "agent_snapshot", "data": snapshot})
        q.put_nowait(payload)
    training_snap = get_training_snapshot(run_id)
    if training_snap:
        payload = json.dumps({"event": "training_started", "data": training_snap})
        q.put_nowait(payload)
    return q


def unsubscribe(run_id: str, q: asyncio.Queue) -> None:
    _subscribers[run_id].discard(q)
    if not _subscribers[run_id]:
        del _subscribers[run_id]


async def publish(run_id: str, event: str, data: Any = None) -> None:
    payload = json.dumps({"event": event, "data": data})
    for q in list(_subscribers.get(run_id, [])):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            logger.warning("Dropping SSE event for run %s — queue full", run_id)
    # Fan-out to global subscribers (notification service, etc.)
    global_payload = json.dumps({"event": event, "data": data, "run_id": run_id})
    for q in list(_global_subscribers):
        try:
            q.put_nowait(global_payload)
        except asyncio.QueueFull:
            logger.warning("Dropping global event %s — queue full", event)


async def subscribe_global() -> asyncio.Queue:
    """Subscribe to events for ALL runs. Used by the notification service."""
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _global_subscribers.add(q)
    return q


def unsubscribe_global(q: asyncio.Queue) -> None:
    _global_subscribers.discard(q)
