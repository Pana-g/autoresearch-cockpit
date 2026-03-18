"""Telegram command receiver — long-polling the Bot API for incoming /commands."""

import asyncio
import logging

import httpx

from app.services.command_handler import handle_command

logger = logging.getLogger(__name__)

_API = "https://api.telegram.org"


class TelegramReceiver:
    """Polls Telegram Bot API for updates and routes /commands to the command handler."""

    def __init__(self, bot_token: str, chat_id: str):
        self._token = bot_token
        self._chat_id = str(chat_id)
        self._task: asyncio.Task | None = None
        self._offset = 0

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Telegram receiver started for chat %s", self._chat_id)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Telegram receiver stopped")

    async def _poll_loop(self) -> None:
        backoff = 1
        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                try:
                    resp = await client.get(
                        f"{_API}/bot{self._token}/getUpdates",
                        params={"offset": self._offset, "timeout": 30},
                    )
                    if resp.status_code != 200:
                        logger.warning("Telegram getUpdates returned %s", resp.status_code)
                        await asyncio.sleep(backoff)
                        backoff = min(backoff * 2, 30)
                        continue

                    backoff = 1
                    data = resp.json()
                    for update in data.get("result", []):
                        self._offset = update["update_id"] + 1
                        msg = update.get("message", {})
                        text = msg.get("text", "")
                        chat_id = str(msg.get("chat", {}).get("id", ""))

                        # Only process messages from the configured chat
                        if chat_id != self._chat_id:
                            continue
                        if not text.startswith("/"):
                            continue

                        response = await handle_command(text)
                        await client.post(
                            f"{_API}/bot{self._token}/sendMessage",
                            json={"chat_id": self._chat_id, "text": response, "parse_mode": "Markdown"},
                        )
                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Telegram poll error")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
