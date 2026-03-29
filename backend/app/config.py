from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "AR_", "env_file": ".env", "extra": "ignore"}

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/autoresearch"
    database_url_sync: str = "postgresql://postgres:postgres@localhost:5432/autoresearch"

    encryption_key: str = ""  # Fernet key — generate via cryptography.fernet.Fernet.generate_key()

    default_training_timeout_seconds: int = 1800  # 30 min safety net (training ~5min + eval ~10min + startup)
    default_agent_inactivity_timeout: int = 300  # 5 min with no output = stall

    cors_origins: list[str] = ["*"]


settings = Settings()
