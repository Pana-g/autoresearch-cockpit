"""
Standalone server entry point.

Used by PyInstaller to create a self-contained executable that:
  1. Creates or migrates the database (SQLite auto-created, PostgreSQL runs Alembic)
  2. Starts the backend API server and a separate frontend static file server

Usage:
  ./autoresearch-cockpit                          # backend on :8000, frontend on :5173
  ./autoresearch-cockpit --backend-port 9000      # custom backend port
  ./autoresearch-cockpit backend --port 9000      # backend only
  ./autoresearch-cockpit frontend --port 3000     # frontend only
"""

from __future__ import annotations

import argparse
import logging
import multiprocessing
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _base_dir() -> Path:
    """Return the directory that contains bundled data (or the source root)."""
    if getattr(sys, "frozen", False):
        # Running inside a PyInstaller bundle
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    # Running from source — one level up from this file (backend/)
    return Path(__file__).resolve().parent


def _init_database() -> None:
    """Create or migrate the database.

    For SQLite: if the DB file doesn't exist, create all tables directly
    (faster and avoids Alembic SQLite quirks). If it exists, run Alembic.

    For PostgreSQL: always run Alembic migrations.
    """
    from app.config import settings

    if settings.is_sqlite:
        # Resolve the DB file path from the URL: sqlite+aiosqlite:///path/to/db
        db_path_str = settings.database_url.split("///", 1)[-1]
        db_path = Path(db_path_str)

        if not db_path.exists():
            # First run — create everything from ORM models
            db_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info("Creating new SQLite database at %s", db_path)

            from sqlalchemy import create_engine

            from app.models.base import Base
            import app.models  # noqa: F401 — register all models

            sync_url = settings.database_url_sync
            engine = create_engine(sync_url)
            Base.metadata.create_all(engine)
            engine.dispose()

            # Stamp Alembic version so future migrations work
            try:
                _stamp_alembic_head(_base_dir(), sync_url)
            except Exception as exc:
                logger.warning("Could not stamp Alembic version: %s", exc)

            logger.info("Database created successfully")
            return

    # Existing DB (SQLite or PostgreSQL) — run Alembic migrations
    _run_alembic_upgrade(_base_dir())


def _stamp_alembic_head(base: Path, sync_url: str) -> None:
    """Stamp the Alembic version table to 'head' without running migrations."""
    from alembic import command
    from alembic.config import Config

    ini_path = base / "alembic.ini"
    if not ini_path.exists():
        return
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(base / "alembic"))
    cfg.set_main_option("sqlalchemy.url", sync_url)
    command.stamp(cfg, "head")


def _run_alembic_upgrade(base: Path) -> None:
    """Apply any pending Alembic migrations."""
    try:
        from alembic import command
        from alembic.config import Config

        ini_path = base / "alembic.ini"
        if not ini_path.exists():
            logger.warning("alembic.ini not found at %s — skipping migrations", ini_path)
            return

        cfg = Config(str(ini_path))
        cfg.set_main_option("script_location", str(base / "alembic"))
        command.upgrade(cfg, "head")
        logger.info("Database migrations applied successfully")
    except Exception as exc:
        logger.error("Migration failed: %s", exc)
        logger.error("If using PostgreSQL, make sure AR_DATABASE_URL is set correctly in your .env file")
        sys.exit(1)


# Default ports
_DEFAULT_BACKEND_PORT = 8000
_DEFAULT_FRONTEND_PORT = 5173


def _find_frontend_dist() -> Path | None:
    """Find frontend static assets across source and packaged layouts."""
    if getattr(sys, "frozen", False):
        candidates = [
            Path(sys._MEIPASS) / "frontend_dist",  # type: ignore[attr-defined]
            Path(sys.executable).resolve().parent / "frontend_dist",
        ]
    else:
        repo_root = Path(__file__).resolve().parent.parent
        candidates = [
            Path(__file__).resolve().parent / "frontend_dist",
            repo_root / "frontend" / "dist",
        ]

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def main() -> None:
    multiprocessing.freeze_support()  # Required for frozen multiprocessing on Windows

    parser = argparse.ArgumentParser(
        description="AutoResearch Cockpit server",
        usage="%(prog)s [command] [options]",
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["all", "backend", "frontend"],
        help="What to start: all (default), backend, or frontend",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="Bind port (default: 8000 for backend, 5173 for frontend)")
    parser.add_argument("--backend-port", type=int, default=None, help="Backend API port (default: 8000, used with 'all')")
    parser.add_argument("--frontend-port", type=int, default=None, help="Frontend port (default: 5173, used with 'all')")
    parser.add_argument(
        "--no-migrate",
        action="store_true",
        help="Skip automatic database migrations on startup",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

    base = _base_dir()

    # Load .env from the executable's directory (not _MEIPASS) so users can place it next to the binary
    exe_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    env_file = exe_dir / ".env"
    if env_file.exists():
        _load_dotenv(env_file)
        logger.info("Loaded environment from %s", env_file)

    # Tell the FastAPI app which components to serve
    os.environ["AR_SERVE_MODE"] = args.command if args.command != "all" else "backend"

    if args.command == "frontend":
        # Frontend-only: serve the bundled static files without backend API
        port = args.port if args.port is not None else _DEFAULT_FRONTEND_PORT
        _run_frontend(args.host, port)
    elif args.command == "all":
        # Both: backend API + frontend on separate ports
        backend_port = args.backend_port or args.port or _DEFAULT_BACKEND_PORT
        frontend_port = args.frontend_port or _DEFAULT_FRONTEND_PORT

        if not args.no_migrate:
            _init_database()

        _run_all(args.host, backend_port, frontend_port)
    else:
        # Backend only
        port = args.port if args.port is not None else _DEFAULT_BACKEND_PORT
        if not args.no_migrate:
            _init_database()

        import uvicorn

        logger.info("Starting AutoResearch Cockpit (backend API) on http://%s:%d", args.host, port)
        uvicorn.run("app.main:app", host=args.host, port=port, log_level="info")


def _run_frontend(host: str, port: int) -> None:
    """Serve only the bundled frontend static files."""
    import uvicorn

    dist_dir = _find_frontend_dist()
    if dist_dir is None:
        logger.error("No bundled frontend found in expected locations")
        sys.exit(1)

    from starlette.applications import Starlette
    from starlette.routing import Mount
    from starlette.staticfiles import StaticFiles

    frontend_app = Starlette(
        routes=[Mount("/", app=StaticFiles(directory=str(dist_dir), html=True))],
    )

    logger.info("Serving frontend on http://%s:%d", host, port)
    uvicorn.run(frontend_app, host=host, port=port, log_level="info")


def _run_all(host: str, backend_port: int, frontend_port: int) -> None:
    """Start backend API and frontend on separate ports."""
    dist_dir = _find_frontend_dist()
    if dist_dir is None:
        logger.error("No bundled frontend found — starting backend only")
        import uvicorn

        logger.info("Starting AutoResearch Cockpit (backend API) on http://%s:%d", host, backend_port)
        uvicorn.run("app.main:app", host=host, port=backend_port, log_level="info")
        return

    # Start frontend in a child process
    frontend_proc = multiprocessing.Process(
        target=_run_frontend, args=(host, frontend_port), daemon=True
    )
    frontend_proc.start()

    import uvicorn

    logger.info("")
    logger.info("══════════════════════════════════════════════")
    logger.info("  AutoResearch Cockpit — Running")
    logger.info("")
    logger.info("  Backend API: http://%s:%d", host, backend_port)
    logger.info("  Frontend:    http://%s:%d", host, frontend_port)
    logger.info("")
    logger.info("  Press Ctrl+C to stop")
    logger.info("══════════════════════════════════════════════")
    logger.info("")

    try:
        uvicorn.run("app.main:app", host=host, port=backend_port, log_level="info")
    finally:
        frontend_proc.terminate()
        frontend_proc.join(timeout=5)


def _load_dotenv(path: Path) -> None:
    """Minimal dotenv loader — avoids depending on python-dotenv."""
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


if __name__ == "__main__":
    main()
