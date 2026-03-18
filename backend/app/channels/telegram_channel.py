"""Telegram channel — sends notifications via Bot API, supports bot commands via polling."""

import logging

import httpx

from app.channels.base import BaseChannel

logger = logging.getLogger(__name__)

_API = "https://api.telegram.org"


def _format_message(event_type: str, payload: dict) -> str:
    """Build a Telegram Markdown message."""
    run_id = payload.get("run_id", "?")[:8]
    project = payload.get("project_name", "")
    iteration = payload.get("iteration", "?")

    icons = {
        "new_best": "🏆", "run_completed": "✅", "run_failed": "❌",
        "training_failed": "⚠️", "run_canceled": "🛑",
        "patch_ready": "📋", "iteration_started": "🔄",
    }
    icon = icons.get(event_type, "ℹ️")
    title = event_type.replace("_", " ").title()

    lines = [f"{icon} *{title}*", ""]
    if project:
        lines.append(f"*Project:* {project}")
    lines.append(f"*Run:* `{run_id}`  |  *Iteration:* {iteration}")

    if event_type == "new_best":
        val = payload.get("val_bpb")
        prev = payload.get("prev_best")
        if val is not None:
            lines.append(f"*Val BPB:* `{val:.4f}`")
        if prev is not None:
            lines.append(f"*Previous Best:* `{prev:.4f}`")
    elif event_type in ("run_failed", "training_failed"):
        error = payload.get("error", payload.get("reason", ""))
        if error:
            lines.append(f"*Error:* {str(error)[:200]}")
    elif event_type == "run_completed":
        best = payload.get("best_val_bpb")
        if best is not None:
            lines.append(f"*Best Val BPB:* `{best:.4f}`")

    return "\n".join(lines)


class TelegramChannel(BaseChannel):
    name = "telegram"
    label = "Telegram"
    supports_commands = True

    def get_config_fields(self) -> list[dict]:
        return [
            {
                "key": "bot_token",
                "label": "Bot Token",
                "type": "password",
                "required": True,
                "placeholder": "123456:ABC-DEF...",
            },
            {
                "key": "chat_id",
                "label": "Chat ID",
                "type": "text",
                "required": True,
                "placeholder": "-1001234567890 or @channel_name",
            },
        ]

    async def validate_config(self, config: dict) -> bool:
        token = config.get("bot_token", "")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{_API}/bot{token}/getMe")
            return resp.status_code == 200 and resp.json().get("ok", False)

    async def send_notification(self, event_type: str, payload: dict, config: dict) -> None:
        token = config.get("bot_token", "")
        chat_id = config.get("chat_id", "")
        text = _format_message(event_type, payload)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_API}/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
            if resp.status_code != 200:
                logger.warning("Telegram API returned %s: %s", resp.status_code, resp.text[:200])
