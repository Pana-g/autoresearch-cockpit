"""SSE streaming endpoint — one channel per run."""

import asyncio
import hmac

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.services.event_bus import subscribe, unsubscribe

router = APIRouter(tags=["sse"])


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, token: str | None = Query(default=None)):
    """SSE endpoint — streams all events for a given run.

    EventSource doesn't support custom headers, so accept the API key
    via ?token= query parameter when auth is enabled.
    """
    if settings.api_key:
        if not token or not hmac.compare_digest(token, settings.api_key):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

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
