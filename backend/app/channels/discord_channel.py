"""Discord channel — sends notifications via webhook, optionally supports bot commands."""

import logging

import httpx

from app.channels.base import BaseChannel

logger = logging.getLogger(__name__)


def _embed_color(event_type: str) -> int:
    """Discord embed sidebar colour."""
    return {
        "new_best": 0x22C55E,       # green
        "run_completed": 0x3B82F6,  # blue
        "run_failed": 0xEF4444,     # red
        "training_failed": 0xF97316,  # orange
        "run_canceled": 0x6B7280,   # gray
        "patch_ready": 0xA855F7,    # purple
        "iteration_started": 0x06B6D4,  # cyan
    }.get(event_type, 0x6366F1)     # indigo default


def _format_embed(event_type: str, payload: dict) -> dict:
    """Build a Discord embed object."""
    run_id = payload.get("run_id", "?")[:8]
    project = payload.get("project_name", "")
    iteration = payload.get("iteration", "?")

    titles = {
        "new_best": "New Best Score!",
        "run_completed": "Run Completed",
        "run_failed": "Run Failed",
        "training_failed": "Training Failed",
        "run_canceled": "Run Canceled",
        "patch_ready": "Patch Ready for Review",
        "iteration_started": "Iteration Started",
    }
    title = titles.get(event_type, event_type.replace("_", " ").title())

    fields = []
    if project:
        fields.append({"name": "Project", "value": project, "inline": True})
    fields.append({"name": "Run", "value": f"`{run_id}`", "inline": True})
    fields.append({"name": "Iteration", "value": str(iteration), "inline": True})

    if event_type == "new_best":
        val = payload.get("val_bpb")
        prev = payload.get("prev_best")
        if val is not None:
            fields.append({"name": "Val BPB", "value": f"**{val:.4f}**", "inline": True})
        if prev is not None:
            fields.append({"name": "Previous Best", "value": f"{prev:.4f}", "inline": True})
    elif event_type in ("run_failed", "training_failed"):
        error = payload.get("error", payload.get("reason", ""))
        if error:
            fields.append({"name": "Error", "value": str(error)[:200], "inline": False})
    elif event_type == "run_completed":
        best = payload.get("best_val_bpb")
        if best is not None:
            fields.append({"name": "Best Val BPB", "value": f"**{best:.4f}**", "inline": True})

    return {
        "embeds": [{
            "title": f"🔬 {title}",
            "color": _embed_color(event_type),
            "fields": fields,
            "footer": {"text": "AutoResearch Cockpit"},
        }]
    }


class DiscordChannel(BaseChannel):
    name = "discord"
    label = "Discord"

    def get_config_fields(self) -> list[dict]:
        return [
            {
                "key": "webhook_url",
                "label": "Webhook URL",
                "type": "url",
                "required": True,
                "placeholder": "https://discord.com/api/webhooks/...",
            },
        ]

    async def validate_config(self, config: dict) -> bool:
        url = config.get("webhook_url", "")
        if not url.startswith("https://discord.com/api/webhooks/"):
            return False
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            return resp.status_code == 200

    async def send_notification(self, event_type: str, payload: dict, config: dict) -> None:
        url = config.get("webhook_url", "")
        body = _format_embed(event_type, payload)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=body)
            if resp.status_code not in (200, 204):
                logger.warning("Discord webhook returned %s: %s", resp.status_code, resp.text[:200])
