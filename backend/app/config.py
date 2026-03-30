import shutil
from pathlib import Path

from pydantic_settings import BaseSettings

# Unified app data directory: ~/.autoresearch-cockpit
_DEFAULT_DATA_DIR = Path.home() / ".autoresearch-cockpit"
_DEFAULT_DB_PATH = _DEFAULT_DATA_DIR / "autoresearch.db"
_DEFAULT_WORKSPACES_DIR = _DEFAULT_DATA_DIR / "workspaces"


def _migrate_legacy_db_if_needed() -> None:
    """Move legacy SQLite DB into ~/.autoresearch-cockpit when possible."""
    if _DEFAULT_DB_PATH.exists():
        return

    legacy_candidates = [
        Path("data") / "autoresearch.db",
        Path.home() / ".autoresearch" / "autoresearch.db",
    ]

    for legacy in legacy_candidates:
        if not legacy.exists():
            continue

        _DEFAULT_DATA_DIR.mkdir(parents=True, exist_ok=True)
        try:
            legacy.replace(_DEFAULT_DB_PATH)
        except OSError:
            # Cross-device move fallback
            shutil.copy2(legacy, _DEFAULT_DB_PATH)
            legacy.unlink(missing_ok=True)
        break


def _migrate_legacy_workspaces_if_needed() -> None:
    """Move legacy workspaces into ~/.autoresearch-cockpit/workspaces when possible."""
    if _DEFAULT_WORKSPACES_DIR.exists():
        return

    legacy = Path.home() / ".autoresearch" / "workspaces"
    if not legacy.exists():
        return

    _DEFAULT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        legacy.replace(_DEFAULT_WORKSPACES_DIR)
    except OSError:
        shutil.copytree(legacy, _DEFAULT_WORKSPACES_DIR)
        shutil.rmtree(legacy, ignore_errors=True)


def _default_database_url() -> str:
    _migrate_legacy_db_if_needed()
    return f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"


def _derive_sync_url(url: str) -> str:
    """Derive a synchronous URL from the async one (for Alembic)."""
    if "aiosqlite" in url:
        return url.replace("sqlite+aiosqlite", "sqlite")
    if "asyncpg" in url:
        return url.replace("postgresql+asyncpg", "postgresql")
    return url


class Settings(BaseSettings):
    model_config = {"env_prefix": "AR_", "env_file": ".env", "extra": "ignore"}

    database_url: str = _default_database_url()

    encryption_key: str = ""  # Fernet key — generate via cryptography.fernet.Fernet.generate_key()

    default_training_timeout_seconds: int = 1800  # 30 min safety net (training ~5min + eval ~10min + startup)
    default_agent_inactivity_timeout: int = 300  # 5 min with no output = stall

    cors_origins: list[str] = ["*"]

    @property
    def database_url_sync(self) -> str:
        return _derive_sync_url(self.database_url)

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def app_data_dir(self) -> Path:
        return _DEFAULT_DATA_DIR

    @property
    def workspaces_dir(self) -> Path:
        _migrate_legacy_workspaces_if_needed()
        _DEFAULT_WORKSPACES_DIR.mkdir(parents=True, exist_ok=True)
        return _DEFAULT_WORKSPACES_DIR


settings = Settings()
