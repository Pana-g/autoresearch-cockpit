"""SSE streaming endpoint — one channel per run."""

import asyncio

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.services.event_bus import subscribe, unsubscribe

router = APIRouter(tags=["sse"])


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str):
    """SSE endpoint — streams all events for a given run."""

    async def event_generator():
        q = await subscribe(run_id)
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=30)
                    yield {"data": payload}
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield {"comment": "keepalive"}
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(run_id, q)

    return EventSourceResponse(event_generator())
