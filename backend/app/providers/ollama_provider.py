"""Ollama provider — local, OpenAI-compatible REST, no auth."""

import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo

logger = logging.getLogger(__name__)

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"


class OllamaProvider(BaseProvider):
    name = "ollama"

    def _build_client(self, credentials: dict) -> AsyncOpenAI:
        base_url = credentials.get("base_url", DEFAULT_OLLAMA_BASE_URL)
        return AsyncOpenAI(base_url=base_url, api_key="ollama")

    async def validate_credentials(self, credentials: dict) -> bool:
        client = self._build_client(credentials)
        try:
            await client.models.list()
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        client = self._build_client(credentials)
        models = await client.models.list()
        return sorted([m.id for m in models.data])

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        client = self._build_client(credentials)
        resp = await client.chat.completions.create(model=model, messages=messages, **kwargs)
        choice = resp.choices[0]
        usage = resp.usage
        return ProviderResponse(
            content=choice.message.content or "",
            usage=TokenUsageInfo(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                estimated_cost=0.0,  # Ollama is free
                usage_source="provider_reported" if usage else "estimated",
            ),
            model=resp.model,
            finish_reason=choice.finish_reason or "",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        client = self._build_client(credentials)
        stream = await client.chat.completions.create(
            model=model, messages=messages, stream=True, **kwargs
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
