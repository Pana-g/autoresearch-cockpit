"""Startup recovery — reset stuck runs that were interrupted by backend restart."""

import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_factory
from app.models import Run, RunState

logger = logging.getLogger(__name__)

# States that indicate an operation was in-flight when the backend died
STUCK_STATES = {
    RunState.AGENT_RUNNING.value,
    RunState.TRAINING_RUNNING.value,
    RunState.PREPARING.value,
    RunState.PATCH_APPROVED.value,
}


async def recover_stuck_runs() -> None:
    """Reset any runs stuck in in-flight states to FAILED.

    Called once on backend startup.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(Run).where(Run.state.in_(STUCK_STATES))
        )
        stuck_runs = result.scalars().all()

        if not stuck_runs:
            logger.info("Startup recovery: no stuck runs found")
            return

        for run in stuck_runs:
            logger.warning(
                "Startup recovery: resetting run %s from state %s to failed",
                run.id,
                run.state,
            )
            run.state = RunState.FAILED.value
            session.add(run)

        await session.commit()
        logger.info("Startup recovery: reset %d stuck run(s)", len(stuck_runs))
