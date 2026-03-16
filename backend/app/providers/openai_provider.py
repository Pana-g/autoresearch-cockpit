"""OpenAI provider (API key auth)."""

import logging
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo, estimate_cost

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseProvider):
    name = "openai"

    async def validate_credentials(self, credentials: dict) -> bool:
        client = AsyncOpenAI(api_key=credentials["api_key"])
        try:
            await client.models.list()
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        client = AsyncOpenAI(api_key=credentials["api_key"])
        models = await client.models.list()
        return sorted([m.id for m in models.data if m.id.startswith("gpt") or m.id.startswith("o")])

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        client = AsyncOpenAI(api_key=credentials["api_key"])
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
                estimated_cost=estimate_cost(self.name, model, prompt_tokens, completion_tokens),
                usage_source="provider_reported" if usage else "estimated",
            ),
            model=resp.model,
            finish_reason=choice.finish_reason or "",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        client = AsyncOpenAI(api_key=credentials["api_key"])
        stream = await client.chat.completions.create(
            model=model, messages=messages, stream=True, stream_options={"include_usage": True}, **kwargs
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
