"""Runtime settings API — read and update configuration without restart."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(tags=["settings"])


class RuntimeSettings(BaseModel):
    default_training_timeout_seconds: int
    default_agent_inactivity_timeout: int
    cors_origins: list[str]
    encryption_key_set: bool  # read-only indicator


class RuntimeSettingsUpdate(BaseModel):
    default_training_timeout_seconds: int | None = None
    default_agent_inactivity_timeout: int | None = None
    encryption_key: str | None = None


@router.get("/settings", response_model=RuntimeSettings)
async def get_settings():
    return RuntimeSettings(
        default_training_timeout_seconds=settings.default_training_timeout_seconds,
        default_agent_inactivity_timeout=settings.default_agent_inactivity_timeout,
        cors_origins=settings.cors_origins,
        encryption_key_set=bool(settings.encryption_key),
    )


@router.patch("/settings", response_model=RuntimeSettings)
async def update_settings(body: RuntimeSettingsUpdate):
    if body.default_training_timeout_seconds is not None:
        settings.default_training_timeout_seconds = body.default_training_timeout_seconds
    if body.default_agent_inactivity_timeout is not None:
        settings.default_agent_inactivity_timeout = body.default_agent_inactivity_timeout
    if body.encryption_key is not None:
        settings.encryption_key = body.encryption_key

    return RuntimeSettings(
        default_training_timeout_seconds=settings.default_training_timeout_seconds,
        default_agent_inactivity_timeout=settings.default_agent_inactivity_timeout,
        cors_origins=settings.cors_origins,
        encryption_key_set=bool(settings.encryption_key),
    )
