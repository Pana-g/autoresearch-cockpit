"""
Standalone server entry point.

Used by PyInstaller to create a self-contained executable that:
  1. Runs Alembic database migrations
  2. Starts the FastAPI/uvicorn server (which also serves the bundled frontend)

Usage:
  ./autoresearch-cockpit           # uses defaults (0.0.0.0:8000)
  ./autoresearch-cockpit --port 9000
  ./autoresearch-cockpit --host 127.0.0.1 --port 9000
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


def run_migrations(base: Path) -> None:
    """Apply any pending Alembic migrations before the server starts."""
    try:
        from alembic import command
        from alembic.config import Config

        ini_path = base / "alembic.ini"
        if not ini_path.exists():
            logger.warning("alembic.ini not found at %s — skipping migrations", ini_path)
            return

        cfg = Config(str(ini_path))
        # Override script_location to the absolute path so it works from any cwd
        cfg.set_main_option("script_location", str(base / "alembic"))
        command.upgrade(cfg, "head")
        logger.info("Database migrations applied successfully")
    except Exception as exc:
        logger.error("Migration failed: %s", exc)
        logger.error("Make sure AR_DATABASE_URL_SYNC is set correctly in your .env file")
        sys.exit(1)


def main() -> None:
    multiprocessing.freeze_support()  # Required for frozen multiprocessing on Windows

    parser = argparse.ArgumentParser(description="AutoResearch Cockpit server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
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
    else:
        logger.warning(
            ".env not found at %s — using defaults / environment variables. "
            "Copy .env.example to .env and fill in AR_ENCRYPTION_KEY.",
            env_file,
        )

    if not args.no_migrate:
        run_migrations(base)

    import uvicorn

    logger.info("Starting AutoResearch Cockpit on http://%s:%d", args.host, args.port)
    uvicorn.run("app.main:app", host=args.host, port=args.port, log_level="info")


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
