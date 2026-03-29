"""Provider and credential management endpoints."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import ProviderCredential, TokenUsage
from app.providers.registry import get_provider, list_providers
from app.schemas import (
    CredentialCreate,
    CredentialResponse,
    CredentialUpdate,
    ModelListResponse,
    ProviderInfo,
    TokenUsageResponse,
    UsageSummary,
)
from app.services.encryption import decrypt, encrypt
from app.services.model_cache import get_models as cached_get_models, get_cache_age

logger = logging.getLogger(__name__)

router = APIRouter(tags=["providers"])


def _mask(value: str) -> str:
    """Return a masked version of a secret value."""
    if len(value) <= 8:
        return "***"
    return value[:3] + "***" + value[-4:]


def _credential_hints(cred) -> dict[str, str]:
    """Decrypt credentials and return masked hints."""
    try:
        data = json.loads(decrypt(cred.encrypted_data))
    except Exception:
        return {}
    hints: dict[str, str] = {}
    for key, val in data.items():
        if not isinstance(val, str) or not val:
            continue
        if "url" in key:
            hints[key] = val  # URLs are not secret
        elif key == "mode":
            continue  # skip internal flags
        else:
            hints[key] = _mask(val)
    return hints


def _to_response(cred) -> dict:
    """Convert an ORM credential to a response dict with hints."""
    return {
        "id": cred.id,
        "name": cred.name,
        "provider": cred.provider,
        "auth_type": cred.auth_type,
        "is_active": cred.is_active,
        "credential_hints": _credential_hints(cred),
        "created_at": cred.created_at,
    }


# ── Providers ─────────────────────────────────────────────

@router.get("/providers", response_model=list[ProviderInfo])
async def get_providers():
    return [ProviderInfo(name=p) for p in list_providers()]


@router.get("/providers/{provider_name}/models", response_model=ModelListResponse)
async def get_models(provider_name: str, credential_id: str | None = None, db: AsyncSession = Depends(get_db)):
    get_provider(provider_name)  # validate exists
    credentials = {}

    if credential_id:
        cred = await db.get(ProviderCredential, credential_id)
        if cred:
            credentials = json.loads(decrypt(cred.encrypted_data))

    try:
        models = await cached_get_models(provider_name, credentials, credential_id)
    except Exception as e:
        raise HTTPException(400, f"Failed to list models: {e}")

    cache_age = get_cache_age(provider_name, credential_id)
    return ModelListResponse(provider=provider_name, models=models, cached_at_age=cache_age)


@router.post("/providers/{provider_name}/models/refresh", response_model=ModelListResponse)
async def refresh_models(provider_name: str, credential_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """Force-refresh the model list cache for this provider."""
    get_provider(provider_name)  # validate exists
    credentials = {}

    if credential_id:
        cred = await db.get(ProviderCredential, credential_id)
        if cred:
            credentials = json.loads(decrypt(cred.encrypted_data))

    try:
        models = await cached_get_models(provider_name, credentials, credential_id, force_refresh=True)
    except Exception as e:
        raise HTTPException(400, f"Failed to refresh models: {e}")

    return ModelListResponse(provider=provider_name, models=models, cached_at_age=0)


# ── Credentials ───────────────────────────────────────────

@router.get("/credentials", response_model=list[CredentialResponse])
async def list_credentials(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProviderCredential).order_by(ProviderCredential.created_at.desc())
    )
    return [_to_response(c) for c in result.scalars().all()]


@router.post("/credentials", response_model=CredentialResponse, status_code=201)
async def create_credential(body: CredentialCreate, db: AsyncSession = Depends(get_db)):
    # Validate provider exists
    get_provider(body.provider)

    encrypted = encrypt(json.dumps(body.credentials))
    cred = ProviderCredential(
        name=body.name,
        provider=body.provider,
        auth_type=body.auth_type,
        encrypted_data=encrypted,
    )
    db.add(cred)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"A credential named '{body.name}' already exists")
    await db.refresh(cred)
    return _to_response(cred)


@router.patch("/credentials/{credential_id}", response_model=CredentialResponse)
async def update_credential(
    credential_id: str, body: CredentialUpdate, db: AsyncSession = Depends(get_db)
):
    cred = await db.get(ProviderCredential, credential_id)
    if cred is None:
        raise HTTPException(404, "Credential not found")

    if body.name is not None:
        cred.name = body.name
    if body.credentials is not None:
        # Merge with existing credentials so unset fields are preserved
        existing = json.loads(decrypt(cred.encrypted_data))
        existing.update(body.credentials)
        cred.encrypted_data = encrypt(json.dumps(existing))
    if body.is_active is not None:
        cred.is_active = body.is_active

    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return _to_response(cred)


@router.delete("/credentials/{credential_id}", status_code=204)
async def delete_credential(credential_id: str, db: AsyncSession = Depends(get_db)):
    cred = await db.get(ProviderCredential, credential_id)
    if cred is None:
        raise HTTPException(404, "Credential not found")
    # Detach runs that reference this credential so FK doesn't block deletion
    from app.models import Run
    result = await db.execute(
        select(Run).where(Run.credential_id == credential_id)
    )
    for run in result.scalars().all():
        run.credential_id = None
        db.add(run)
    await db.flush()  # ensure NULLs are written before the DELETE
    await db.delete(cred)
    await db.commit()


@router.post("/credentials/{credential_id}/validate")
async def validate_credential(credential_id: str, db: AsyncSession = Depends(get_db)):
    cred = await db.get(ProviderCredential, credential_id)
    if cred is None:
        raise HTTPException(404, "Credential not found")

    provider = get_provider(cred.provider)
    credentials = json.loads(decrypt(cred.encrypted_data))
    try:
        valid = await provider.validate_credentials(credentials)
        return {"valid": valid}
    except Exception as exc:
        logger.warning("Credential %s validation error: %s", credential_id, exc)
        return {"valid": False, "error": str(exc)}


# ── Token Usage ───────────────────────────────────────────

@router.get("/usage", response_model=list[TokenUsageResponse])
async def list_usage(
    run_id: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    query = select(TokenUsage).order_by(TokenUsage.created_at.desc()).limit(limit)
    if run_id:
        from app.models import AgentStep

        query = (
            select(TokenUsage)
            .join(AgentStep)
            .where(AgentStep.run_id == run_id)
            .order_by(TokenUsage.created_at.desc())
            .limit(limit)
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/usage/summary", response_model=UsageSummary)
async def usage_summary(run_id: str | None = None, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func

    from app.models import AgentStep

    query = select(
        func.coalesce(func.sum(TokenUsage.prompt_tokens), 0),
        func.coalesce(func.sum(TokenUsage.completion_tokens), 0),
        func.coalesce(func.sum(TokenUsage.estimated_cost), 0),
        func.count(TokenUsage.id),
    )
    if run_id:
        query = query.join(AgentStep).where(AgentStep.run_id == run_id)
    result = await db.execute(query)
    row = result.one()
    return UsageSummary(
        total_prompt_tokens=row[0],
        total_completion_tokens=row[1],
        total_estimated_cost=float(row[2]),
        step_count=row[3],
    )


# ── Chat / Model Validation ──────────────────────────────

class ChatRequest(BaseModel):
    provider: str
    model: str
    credential_id: str | None = None
    messages: list[dict]


@router.post("/providers/chat")
async def chat_with_model(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Stream a chat response for model validation. Returns SSE text/event-stream."""
    provider = get_provider(body.provider)
    credentials: dict = {}

    if body.credential_id:
        cred = await db.get(ProviderCredential, body.credential_id)
        if cred:
            credentials = json.loads(decrypt(cred.encrypted_data))
    elif body.provider == "ollama":
        credentials = {"base_url": "http://localhost:11434/v1"}
    elif body.provider == "github-copilot":
        credentials = {"mode": "proxy"}

    async def generate():
        try:
            async for chunk in provider.stream_response(
                model=body.model, messages=body.messages, credentials=credentials
            ):
                # SSE format
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── GitHub Copilot Device Auth ────────────────────────────

class DeviceCodePollRequest(BaseModel):
    device_code: str


@router.post("/copilot/device-auth/start")
async def copilot_device_auth_start():
    """Initiate GitHub device OAuth flow for Copilot."""
    from app.providers.copilot_provider import start_device_flow

    try:
        result = await start_device_flow()
        return result
    except Exception as e:
        raise HTTPException(400, f"Failed to start device flow: {e}")


@router.post("/copilot/device-auth/poll")
async def copilot_device_auth_poll(body: DeviceCodePollRequest):
    """Poll for device auth completion."""
    from app.providers.copilot_provider import poll_device_flow

    try:
        result = await poll_device_flow(body.device_code)
        return result
    except Exception as e:
        raise HTTPException(400, f"Failed to poll device flow: {e}")


@router.get("/copilot/detect-proxy")
async def detect_copilot_proxy():
    """Auto-detect copilot-proxy config from ~/.openclaw/openclaw.json."""
    import pathlib

    config_path = pathlib.Path.home() / ".openclaw" / "openclaw.json"
    if not config_path.exists():
        return {"found": False}

    try:
        data = json.loads(config_path.read_text())
        proxy_config = data.get("models", {}).get("providers", {}).get("copilot-proxy", {})
        if not proxy_config:
            return {"found": False}

        base_url = proxy_config.get("baseUrl", "")
        api_key = proxy_config.get("apiKey", "")
        models = [m["id"] for m in proxy_config.get("models", []) if "id" in m]

        if not base_url:
            return {"found": False}

        # Ensure URL ends with /v1 for OpenAI compatibility
        normalized_url = base_url.rstrip("/")
        if not normalized_url.endswith("/v1"):
            normalized_url += "/v1"

        return {
            "found": True,
            "base_url": normalized_url,
            "api_key": api_key,
            "models": models,
        }
    except Exception:
        return {"found": False}
