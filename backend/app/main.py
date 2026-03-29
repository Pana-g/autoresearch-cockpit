"""FastAPI application entry point."""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import channels, notes, projects, providers, runs, settings as settings_api, sse
from app.config import settings
from app.services.recovery import recover_stuck_runs

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure SQLite database directory exists
    if settings.is_sqlite:
        db_path = settings.database_url.split("///", 1)[-1]
        db_dir = Path(db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)

    # Run Alembic migrations (or create fresh SQLite DB)
    from app.models.base import Base
    from app.db import engine

    if settings.is_sqlite and not Path(settings.database_url.split("///", 1)[-1]).exists():
        # Fresh SQLite: create all tables and stamp Alembic head
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _stamp_alembic_head()
        logger.info("Created fresh SQLite database")
    else:
        # Existing DB (SQLite or PostgreSQL): run Alembic migrations
        _run_alembic_upgrade()
        logger.info("Database migrations applied")

    # Startup
    await recover_stuck_runs()

    # Start notification service
    from app.services import notification_service
    await notification_service.start()

    yield

    # Shutdown
    await notification_service.stop()


def _stamp_alembic_head() -> None:
    from alembic.config import Config
    from alembic import command

    alembic_cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
    command.stamp(alembic_cfg, "head")


def _run_alembic_upgrade() -> None:
    from alembic.config import Config
    from alembic import command

    alembic_cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
    command.upgrade(alembic_cfg, "head")


app = FastAPI(
    title="AutoResearch Cockpit",
    version="0.5.0",
    description="Control plane for karpathy/autoresearch",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS headers are still included."""
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# Mount routers
app.include_router(projects.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(providers.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(sse.router, prefix="/api")
app.include_router(channels.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Serve bundled / built frontend (must be mounted last) ─
# When running as a PyInstaller bundle the frontend is in frontend_dist/ inside _MEIPASS.
# During development it is the Vite build output at frontend/dist/ (if it exists).
def _find_frontend_dist() -> Path | None:
    if getattr(sys, "frozen", False):
        candidate = Path(sys._MEIPASS) / "frontend_dist"  # type: ignore[attr-defined]
    else:
        candidate = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    return candidate if candidate.exists() else None


_frontend_dist = _find_frontend_dist()
if _frontend_dist is not None:
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
    logger.info("Serving frontend from %s", _frontend_dist)
else:
    logger.debug("No frontend/dist found — skipping static file mount (dev mode or not yet built)")
