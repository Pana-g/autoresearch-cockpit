"""Slack channel — sends notifications via incoming webhook."""

import logging

import httpx

from app.channels.base import BaseChannel

logger = logging.getLogger(__name__)


def _format_blocks(event_type: str, payload: dict) -> dict:
    """Build a Slack Block Kit message."""
    run_id = payload.get("run_id", "?")[:8]
    project = payload.get("project_name", "")
    iteration = payload.get("iteration", "?")

    icons = {
        "new_best": ":trophy:", "run_completed": ":white_check_mark:", "run_failed": ":x:",
        "training_failed": ":warning:", "run_canceled": ":octagonal_sign:",
        "patch_ready": ":clipboard:", "iteration_started": ":arrows_counterclockwise:",
    }
    icon = icons.get(event_type, ":information_source:")
    title = event_type.replace("_", " ").title()

    header_text = f"{icon} *{title}*"
    meta_parts = []
    if project:
        meta_parts.append(f"*Project:* {project}")
    meta_parts.append(f"*Run:* `{run_id}`")
    meta_parts.append(f"*Iteration:* {iteration}")

    detail = ""
    if event_type == "new_best":
        val = payload.get("val_bpb")
        prev = payload.get("prev_best")
        if val is not None:
            detail = f"*Val BPB:* `{val:.4f}`"
        if prev is not None:
            detail += f"  |  *Previous:* `{prev:.4f}`"
    elif event_type in ("run_failed", "training_failed"):
        error = payload.get("error", payload.get("reason", ""))
        if error:
            detail = f"*Error:* {str(error)[:200]}"
    elif event_type == "run_completed":
        best = payload.get("best_val_bpb")
        if best is not None:
            detail = f"*Best Val BPB:* `{best:.4f}`"

    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": header_text}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "  |  ".join(meta_parts)}},
    ]
    if detail:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": detail}})

    return {"blocks": blocks}


class SlackChannel(BaseChannel):
    name = "slack"
    label = "Slack"
    supports_commands = False

    def get_config_fields(self) -> list[dict]:
        return [
            {
                "key": "webhook_url",
                "label": "Webhook URL",
                "type": "url",
                "required": True,
                "placeholder": "https://hooks.slack.com/services/T.../B.../...",
            },
        ]

    async def validate_config(self, config: dict) -> bool:
        url = config.get("webhook_url", "")
        # Slack webhooks reject GET — best we can do is a POST with a test
        if not url.startswith("https://hooks.slack.com/"):
            return False
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"text": "AutoResearch Cockpit connection test"})
            return resp.status_code == 200

    async def send_notification(self, event_type: str, payload: dict, config: dict) -> None:
        url = config.get("webhook_url", "")
        body = _format_blocks(event_type, payload)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=body)
            if resp.status_code != 200:
                logger.warning("Slack webhook returned %s: %s", resp.status_code, resp.text[:200])
