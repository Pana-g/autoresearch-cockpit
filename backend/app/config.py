from pathlib import Path

from pydantic_settings import BaseSettings

# Default SQLite location: <exe_dir>/data/autoresearch.db
_DEFAULT_DB_DIR = Path("data")
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "autoresearch.db"


def _default_database_url() -> str:
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


settings = Settings()
