"""Google Gemini provider (API key, google-genai SDK)."""

import logging
from typing import AsyncIterator

from google import genai
from google.genai import types

from app.providers.base import BaseProvider, ProviderResponse, TokenUsageInfo, estimate_cost

logger = logging.getLogger(__name__)


class GoogleProvider(BaseProvider):
    name = "google"

    def _build_client(self, credentials: dict) -> genai.Client:
        return genai.Client(api_key=credentials["api_key"])

    async def validate_credentials(self, credentials: dict) -> bool:
        client = self._build_client(credentials)
        try:
            # List models to verify key
            list(client.models.list())
            return True
        except Exception:
            return False

    async def list_models(self, credentials: dict) -> list[str]:
        client = self._build_client(credentials)
        try:
            return sorted(
                [m.name.removeprefix("models/") for m in client.models.list() if "gemini" in m.name]
            )
        except Exception:
            return ["gemini-2.5-pro", "gemini-2.5-flash"]

    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        client = self._build_client(credentials)
        # Convert OpenAI-style messages to Gemini format
        system_instruction = None
        contents = []
        for m in messages:
            if m["role"] == "system":
                system_instruction = m["content"]
            elif m["role"] == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=m["content"])]))
            elif m["role"] == "assistant":
                contents.append(types.Content(role="model", parts=[types.Part(text=m["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
        )
        resp = client.models.generate_content(
            model=model, contents=contents, config=config
        )
        prompt_tokens = resp.usage_metadata.prompt_token_count if resp.usage_metadata else 0
        completion_tokens = resp.usage_metadata.candidates_token_count if resp.usage_metadata else 0
        return ProviderResponse(
            content=resp.text or "",
            usage=TokenUsageInfo(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                estimated_cost=estimate_cost(self.name, model, prompt_tokens, completion_tokens),
                usage_source="provider_reported" if resp.usage_metadata else "estimated",
            ),
            model=model,
            finish_reason="stop",
        )

    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        client = self._build_client(credentials)
        system_instruction = None
        contents = []
        for m in messages:
            if m["role"] == "system":
                system_instruction = m["content"]
            elif m["role"] == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=m["content"])]))
            elif m["role"] == "assistant":
                contents.append(types.Content(role="model", parts=[types.Part(text=m["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
        )
        for chunk in client.models.generate_content_stream(
            model=model, contents=contents, config=config
        ):
            if chunk.text:
                yield chunk.text
