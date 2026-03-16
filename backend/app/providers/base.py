"""Abstract base for all LLM providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class TokenUsageInfo:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost: float = 0.0
    usage_source: str = "estimated"  # "provider_reported" or "estimated"


@dataclass
class ProviderResponse:
    content: str = ""
    usage: TokenUsageInfo = field(default_factory=TokenUsageInfo)
    model: str = ""
    finish_reason: str = ""


class BaseProvider(ABC):
    """All providers implement this interface."""

    name: str  # e.g. "openai", "anthropic", "google", "ollama", "github-copilot"

    @abstractmethod
    async def validate_credentials(self, credentials: dict) -> bool:
        """Check if credentials are valid. Returns True on success."""
        ...

    @abstractmethod
    async def list_models(self, credentials: dict) -> list[str]:
        """Return available model names."""
        ...

    @abstractmethod
    async def create_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> ProviderResponse:
        """Non-streaming completion."""
        ...

    @abstractmethod
    async def stream_response(
        self, model: str, messages: list[dict], credentials: dict, **kwargs
    ) -> AsyncIterator[str]:
        """Yield text chunks as they arrive."""
        ...

    def estimate_tokens(self, text: str) -> int:
        """Rough token estimate (4 chars ≈ 1 token)."""
        return len(text) // 4


# Cost tables (USD per million tokens) — update as pricing changes
COST_PER_M_TOKENS: dict[str, dict[str, tuple[float, float]]] = {
    # provider/model → (input_cost_per_M, output_cost_per_M)
    "openai/gpt-4.1": (2.0, 8.0),
    "openai/gpt-4.1-mini": (0.4, 1.6),
    "openai/gpt-4.1-nano": (0.1, 0.4),
    "openai/o3-mini": (1.1, 4.4),
    "anthropic/claude-sonnet-4-20250514": (3.0, 15.0),
    "anthropic/claude-3-5-haiku-20241022": (0.8, 4.0),
    "google/gemini-2.5-pro": (1.25, 10.0),
    "google/gemini-2.5-flash": (0.15, 0.6),
}


def estimate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    key = f"{provider}/{model}"
    if key in COST_PER_M_TOKENS:
        inp, out = COST_PER_M_TOKENS[key]
        return (prompt_tokens * inp + completion_tokens * out) / 1_000_000
    # Copilot and Ollama: no cost
    if provider in ("github-copilot", "ollama"):
        return 0.0
    return 0.0
