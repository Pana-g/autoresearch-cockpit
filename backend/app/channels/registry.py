"""Channel registry — resolves channel type name to implementation."""

from app.channels.base import BaseChannel, ChannelTypeInfo
from app.channels.discord_channel import DiscordChannel
from app.channels.slack_channel import SlackChannel
from app.channels.telegram_channel import TelegramChannel
from app.channels.webhook_channel import WebhookChannel

_REGISTRY: dict[str, BaseChannel] = {
    "discord": DiscordChannel(),
    "telegram": TelegramChannel(),
    "slack": SlackChannel(),
    "webhook": WebhookChannel(),
}


def get_channel(name: str) -> BaseChannel:
    channel = _REGISTRY.get(name)
    if channel is None:
        raise ValueError(f"Unknown channel type: {name}. Available: {list(_REGISTRY.keys())}")
    return channel


def list_channel_types() -> list[ChannelTypeInfo]:
    return [ch.type_info() for ch in _REGISTRY.values()]
