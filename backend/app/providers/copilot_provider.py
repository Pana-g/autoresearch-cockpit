"""GitHub Copilot provider — three modes: Direct (device OAuth), VS Code Proxy, or OpenRouter."""

import logging
import time
from typing import AsyncIterator

import httpx
from openai import AsyncOpenAI

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo

logger = logging.getLogger(__name__)

GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"
COPILOT_API_BASE = "https://api.githubcopilot.com"
COPILOT_CHAT_ENDPOINT = f"{COPILOT_API_BASE}/chat/completions"

# VS Code's public OAuth client ID for Copilot
COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"

# For VS Code proxy mode
DEFAULT_PROXY_BASE_URL = "http://localhost:3000/api/v1"

# Headers required by the Copilot internal API
COPILOT_HEADERS = {
    "Editor-Version": "vscode/1.96.0",
    "Editor-Plugin-Version": "copilot-chat/0.24.2",
    "User-Agent": "GitHubCopilotChat/0.24.2",
    "Accept": "application/json",
}


async def start_device_flow() -> dict:
    """Initiate GitHub device OAuth flow. Returns device_code, user_code, verification_uri."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GITHUB_DEVICE_CODE_URL,
            json={"client_id": COPILOT_CLIENT_ID, "scope": "read:user"},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "device_code": data["device_code"],
            "user_code": data["user_code"],
            "verification_uri": data["verification_uri"],
            "expires_in": data.get("expires_in", 900),
            "interval": data.get("interval", 5),
        }


async def poll_device_flow(device_code: str) -> dict:
    """Poll GitHub for device flow completion. Returns access_token on success, or status."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GITHUB_ACCESS_TOKEN_URL,
            data={
                "client_id": COPILOT_CLIENT_ID,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" in data:
            return {"status": "complete", "access_token": data["access_token"]}
        error = data.get("error", "unknown")
        if error == "authorization_pending":
            return {"status": "pending"}
        if error == "slow_down":
            return {"status": "slow_down"}
        if error == "expired_token":
            return {"status": "expired"}
        return {"status": "error", "error": error}


class CopilotTokenManager:
    """Manages the GitHub device OAuth → Copilot token flow."""

    def __init__(self, github_token: str):
        self._github_token = github_token
        self._copilot_token: str | None = None
        self._expires_at: float = 0

    async def get_copilot_token(self) -> str:
        if self._copilot_token and time.time() < self._expires_at - 60:
            return self._copilot_token
        await self._refresh()
        assert self._copilot_token is not None
        return self._copilot_token

    async def _refresh(self) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                COPILOT_TOKEN_URL,
                headers={
                    **COPILOT_HEADERS,
                    "Authorization": f"token {self._github_token}",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            self._copilot_token = data["token"]
            self._expires_at = data.get("expires_at", time.time() + 1800)


class GitHubCopilotProvider(BaseProvider):
    name = "github-copilot"
    _token_managers: dict[str, CopilotTokenManager] = {}

    def _get_mode(self, credentials: dict) -> str:
        return credentials.get("mode", "proxy")  # "direct" or "proxy"

    def _get_proxy_client(self, credentials: dict) -> AsyncOpenAI:
        base_url = credentials.get("proxy_base_url", DEFAULT_PROXY_BASE_URL)
        api_key = credentials.get("api_key", credentials.get("github_token", "copilot-proxy"))
        return AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=httpx.Timeout(None),
            max_retries=0,
        )

    def _get_token_manager(self, credentials: dict) -> CopilotTokenManager:
        github_token = credentials["github_token"]
        if github_token not in self._token_managers:
            self._token_managers[github_token] = CopilotTokenManager(github_token)
        return self._token_managers[github_token]

    async def validate_credentials(self, credentials: dict) -> bool:
        mode = self._get_mode(credentials)
        try:
            if mode == "proxy":
                client = self._get_proxy_client(credentials)
                # Try models.list first, fall back to a simple completions call
                try:
                    await client.models.list()
                except Exception:
                    # Some proxies don't support /models — try a minimal completion
                    resp = await client.chat.completions.create(
                        model="gpt-4.1",
                        messages=[{"role": "user", "content": "hi"}],
                        max_tokens=1,
                    )
                    if not resp.choices:
                        return False
            else:
                mgr = self._get_token_manager(credentials)
                await mgr.get_copilot_token()
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        mode = self._get_mode(credentials)
        if mode == "proxy":
            client = self._get_proxy_client(credentials)
            try:
                models = await client.models.list()
                return sorted([m.id for m in models.data])
            except Exception:
                pass
        else:
            try:
                mgr = self._get_token_manager(credentials)
                token = await mgr.get_copilot_token()
                client = AsyncOpenAI(
                    base_url=COPILOT_API_BASE,
                    api_key=token,
                    timeout=httpx.Timeout(None),
                    default_headers={k: v for k, v in COPILOT_HEADERS.items() if k != "Accept"},
                )
                models = await client.models.list()
                return sorted([m.id for m in models.data])
            except Exception:
                pass
        # Fallback — known Copilot models
        return [
            "claude-sonnet-4", "claude-sonnet-4.5", "claude-opus-4.5",
            "gpt-4.1", "gpt-5-mini", "gpt-5.1",
            "gemini-2.5-pro", "gemini-2.5-flash",
        ]

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        mode = self._get_mode(credentials)
        if mode == "proxy":
            client = self._get_proxy_client(credentials)
            resp = await client.chat.completions.create(model=model, messages=messages, **kwargs)
        else:
            mgr = self._get_token_manager(credentials)
            token = await mgr.get_copilot_token()
            client = AsyncOpenAI(
                base_url=COPILOT_API_BASE,
                api_key=token,
                timeout=httpx.Timeout(None),
                default_headers={k: v for k, v in COPILOT_HEADERS.items() if k != "Accept"},
            )
            resp = await client.chat.completions.create(model=model, messages=messages, **kwargs)

        choice = resp.choices[0]
        usage = resp.usage
        return ProviderResponse(
            content=choice.message.content or "",
            usage=TokenUsageInfo(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                estimated_cost=0.0,  # seat-based, no per-token cost
                usage_source="provider_reported" if usage else "estimated",
            ),
            model=resp.model,
            finish_reason=choice.finish_reason or "",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        mode = self._get_mode(credentials)
        if mode == "proxy":
            client = self._get_proxy_client(credentials)
        else:
            mgr = self._get_token_manager(credentials)
            token = await mgr.get_copilot_token()
            client = AsyncOpenAI(
                base_url=COPILOT_API_BASE,
                api_key=token,
                timeout=httpx.Timeout(None),
                default_headers={k: v for k, v in COPILOT_HEADERS.items() if k != "Accept"},
            )

        stream = await client.chat.completions.create(
            model=model, messages=messages, stream=True, **kwargs
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
