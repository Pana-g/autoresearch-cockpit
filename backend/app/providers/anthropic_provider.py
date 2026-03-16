"""Anthropic provider (API key or OAuth setup-token)."""

import logging
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo, estimate_cost

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseProvider):
    name = "anthropic"

    def _build_client(self, credentials: dict) -> AsyncAnthropic:
        auth_type = credentials.get("auth_type", "api_key")
        if auth_type == "oauth":
            # OAuth token — skip cache headers
            return AsyncAnthropic(
                auth_token=credentials["oauth_token"],
            )
        return AsyncAnthropic(api_key=credentials["api_key"])

    async def validate_credentials(self, credentials: dict) -> bool:
        client = self._build_client(credentials)
        try:
            await client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        client = self._build_client(credentials)
        try:
            response = await client.models.list()
            return sorted([m.id for m in response.data])
        except Exception:
            # Fallback to known models
            return [
                "claude-sonnet-4-20250514",
                "claude-3-5-haiku-20241022",
            ]

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        client = self._build_client(credentials)
        # Anthropic uses system as a top-level param
        system_msg = ""
        filtered = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                filtered.append(m)

        extra_headers = {}
        if credentials.get("auth_type") != "oauth":
            extra_headers = {}  # can add cache headers for API key users

        resp = await client.messages.create(
            model=model,
            system=system_msg,
            messages=filtered,
            max_tokens=kwargs.pop("max_tokens", 16384),
            extra_headers=extra_headers if extra_headers else None,
            **kwargs,
        )
        usage = resp.usage
        prompt_tokens = usage.input_tokens
        completion_tokens = usage.output_tokens
        return ProviderResponse(
            content=resp.content[0].text if resp.content else "",
            usage=TokenUsageInfo(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                estimated_cost=estimate_cost(self.name, model, prompt_tokens, completion_tokens),
                usage_source="provider_reported",
            ),
            model=resp.model,
            finish_reason=resp.stop_reason or "",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        client = self._build_client(credentials)
        system_msg = ""
        filtered = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                filtered.append(m)

        async with client.messages.stream(
            model=model,
            system=system_msg,
            messages=filtered,
            max_tokens=kwargs.pop("max_tokens", 16384),
            **kwargs,
        ) as stream:
            async for text in stream.text_stream:
                yield text
