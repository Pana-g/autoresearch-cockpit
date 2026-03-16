"""Tests for provider registry and base functionality."""

import pytest

from app.providers.base import BaseProvider, TokenUsageInfo, estimate_cost
from app.providers.registry import get_provider, list_providers


class TestProviderRegistry:
    def test_list_providers(self):
        providers = list_providers()
        assert "openai" in providers
        assert "anthropic" in providers
        assert "google" in providers
        assert "ollama" in providers
        assert "github-copilot" in providers

    def test_get_known_provider(self):
        provider = get_provider("openai")
        assert isinstance(provider, BaseProvider)
        assert provider.name == "openai"

    def test_get_unknown_provider_raises(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            get_provider("nonexistent")

    def test_all_providers_are_base_provider(self):
        for name in list_providers():
            provider = get_provider(name)
            assert isinstance(provider, BaseProvider)
            assert provider.name == name


class TestEstimateCost:
    def test_openai_cost(self):
        cost = estimate_cost("openai", "gpt-4.1", 1_000_000, 1_000_000)
        assert cost == pytest.approx(10.0)  # 2.0 + 8.0

    def test_anthropic_cost(self):
        cost = estimate_cost("anthropic", "claude-sonnet-4-20250514", 1_000_000, 1_000_000)
        assert cost == pytest.approx(18.0)  # 3.0 + 15.0

    def test_ollama_free(self):
        cost = estimate_cost("ollama", "llama3", 1_000_000, 1_000_000)
        assert cost == 0.0

    def test_copilot_free(self):
        cost = estimate_cost("github-copilot", "gpt-4.1", 1_000_000, 1_000_000)
        assert cost == 0.0

    def test_unknown_model_zero_cost(self):
        cost = estimate_cost("openai", "unknown-model-xyz", 1000, 1000)
        assert cost == 0.0


class TestTokenUsageInfo:
    def test_defaults(self):
        info = TokenUsageInfo()
        assert info.prompt_tokens == 0
        assert info.completion_tokens == 0
        assert info.estimated_cost == 0.0
        assert info.usage_source == "estimated"


class TestEstimateTokens:
    def test_estimate(self):
        provider = get_provider("openai")
        estimate = provider.estimate_tokens("hello world this is a test")
        assert estimate > 0
        assert isinstance(estimate, int)
