"""Discord command receiver — connects via a lightweight webhook-based approach.

For full bot support, discord.py would be needed. This receiver uses a simpler
approach: it's enabled when commands_enabled=True but actual Discord bot
functionality requires the discord.py library which is an optional dependency.
For now, Discord commands are handled via a REST polling approach on interactions.
"""

import logging

logger = logging.getLogger(__name__)


class DiscordReceiver:
    """Placeholder for Discord bot command receiver.

    Full implementation requires discord.py. For now, Discord channels
    support outbound notifications via webhooks. Inbound commands can
    be added by installing discord.py and configuring a bot token.
    """

    def __init__(self, bot_token: str | None = None, channel_id: str | None = None):
        self._bot_token = bot_token
        self._channel_id = channel_id

    async def start(self) -> None:
        if not self._bot_token:
            logger.info("Discord receiver: no bot_token configured, commands not available")
            return
        logger.info("Discord receiver: bot commands require discord.py (optional dependency)")

    async def stop(self) -> None:
        pass
