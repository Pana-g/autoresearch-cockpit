"""Channel manager — starts/stops command receivers for channels with commands_enabled."""

import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.channels.receivers.discord_receiver import DiscordReceiver
from app.channels.receivers.telegram_receiver import TelegramReceiver
from app.db import async_session_factory
from app.models.channel import NotificationChannel
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

# channel_id → receiver instance
_receivers: dict[str, TelegramReceiver | DiscordReceiver] = {}


async def start_all() -> None:
    """Start receivers for all active channels with commands_enabled."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(NotificationChannel).where(
                NotificationChannel.is_active.is_(True),
                NotificationChannel.commands_enabled.is_(True),
            )
        )
        channels = result.scalars().all()

    for ch in channels:
        await start_receiver(ch.id, ch.channel_type, ch.encrypted_config)


async def start_receiver(channel_id: str, channel_type: str, encrypted_config: str) -> None:
    """Start a command receiver for one channel."""
    if channel_id in _receivers:
        return

    config = json.loads(decrypt(encrypted_config))

    if channel_type == "telegram":
        bot_token = config.get("bot_token", "")
        chat_id = config.get("chat_id", "")
        if bot_token and chat_id:
            receiver = TelegramReceiver(bot_token, chat_id)
            await receiver.start()
            _receivers[channel_id] = receiver
    elif channel_type == "discord":
        receiver = DiscordReceiver(
            bot_token=config.get("bot_token"),
            channel_id=config.get("channel_id"),
        )
        await receiver.start()
        _receivers[channel_id] = receiver


async def stop_receiver(channel_id: str) -> None:
    """Stop a command receiver for one channel."""
    receiver = _receivers.pop(channel_id, None)
    if receiver:
        await receiver.stop()


async def restart_receiver(channel_id: str, channel_type: str, encrypted_config: str) -> None:
    """Restart a receiver (e.g. after config update)."""
    await stop_receiver(channel_id)
    await start_receiver(channel_id, channel_type, encrypted_config)


async def stop_all() -> None:
    """Stop all receivers."""
    for channel_id in list(_receivers.keys()):
        await stop_receiver(channel_id)
    logger.info("All channel receivers stopped")
