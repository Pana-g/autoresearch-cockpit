"""Provider registry — resolves provider name to implementation."""

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import BaseProvider
from app.providers.copilot_provider import GitHubCopilotProvider
from app.providers.google_provider import GoogleProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.openrouter_provider import OpenRouterProvider

_REGISTRY: dict[str, BaseProvider] = {
    "openai": OpenAIProvider(),
    "anthropic": AnthropicProvider(),
    "google": GoogleProvider(),
    "ollama": OllamaProvider(),
    "github-copilot": GitHubCopilotProvider(),
    "openrouter": OpenRouterProvider(),
}


def get_provider(name: str) -> BaseProvider:
    provider = _REGISTRY.get(name)
    if provider is None:
        raise ValueError(f"Unknown provider: {name}. Available: {list(_REGISTRY.keys())}")
    return provider


def list_providers() -> list[str]:
    return list(_REGISTRY.keys())
