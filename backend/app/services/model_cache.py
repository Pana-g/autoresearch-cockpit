"""In-memory model list cache with 24-hour TTL per provider+credential."""

import logging
import time
from typing import Optional

from app.providers.registry import get_provider

logger = logging.getLogger(__name__)

# TTL in seconds (24 hours)
CACHE_TTL = 86400

# (provider, credential_id_or_empty) → (models, fetched_at)
_cache: dict[tuple[str, str], tuple[list[str], float]] = {}


def _key(provider: str, credential_id: Optional[str]) -> tuple[str, str]:
    return (provider, credential_id or "")


async def get_models(
    provider_name: str,
    credentials: dict,
    credential_id: Optional[str] = None,
    force_refresh: bool = False,
) -> list[str]:
    """Return model list, using cache unless stale or force_refresh is True."""
    key = _key(provider_name, credential_id)

    if not force_refresh and key in _cache:
        models, fetched_at = _cache[key]
        if time.time() - fetched_at < CACHE_TTL:
            return models

    provider = get_provider(provider_name)
    try:
        models = await provider.list_models(credentials)
    except Exception as e:
        logger.warning("Failed to fetch models for %s: %s", provider_name, e)
        # Return stale cache if available
        if key in _cache:
            return _cache[key][0]
        raise

    _cache[key] = (models, time.time())
    return models


def get_cache_age(provider_name: str, credential_id: Optional[str] = None) -> Optional[float]:
    """Return seconds since last fetch, or None if not cached."""
    key = _key(provider_name, credential_id)
    if key in _cache:
        return time.time() - _cache[key][1]
    return None


def invalidate(provider_name: Optional[str] = None, credential_id: Optional[str] = None) -> None:
    """Clear cache for a specific provider+credential, or all if provider is None."""
    if provider_name is None:
        _cache.clear()
        return
    key = _key(provider_name, credential_id)
    _cache.pop(key, None)
