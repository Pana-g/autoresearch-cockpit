"""OpenRouter provider — OpenAI-compatible API at openrouter.ai."""

import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterProvider(BaseProvider):
    name = "openrouter"

    def _client(self, credentials: dict) -> AsyncOpenAI:
        return AsyncOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=credentials["api_key"],
            default_headers={
                "HTTP-Referer": "https://autoresearch-cockpit.local",
                "X-Title": "AutoResearch Cockpit",
            },
        )

    async def validate_credentials(self, credentials: dict) -> bool:
        client = self._client(credentials)
        try:
            await client.models.list()
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        client = self._client(credentials)
        try:
            models = await client.models.list()
            return sorted([m.id for m in models.data])
        except Exception:
            # Fallback popular models
            return [
                "anthropic/claude-sonnet-4",
                "google/gemini-2.5-pro",
                "openai/gpt-4.1",
                "meta-llama/llama-4-maverick",
            ]

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        client = self._client(credentials)
        resp = await client.chat.completions.create(model=model, messages=messages, **kwargs)
        choice = resp.choices[0]
        usage = resp.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        return ProviderResponse(
            content=choice.message.content or "",
            usage=TokenUsageInfo(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                estimated_cost=0.0,  # OpenRouter reports cost via headers
                usage_source="provider_reported" if usage else "estimated",
            ),
            model=resp.model,
            finish_reason=choice.finish_reason or "",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        client = self._client(credentials)
        stream = await client.chat.completions.create(
            model=model, messages=messages, stream=True, **kwargs
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
