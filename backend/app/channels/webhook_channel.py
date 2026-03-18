"""Generic webhook channel — POST JSON to any URL."""

import logging

import httpx

from app.channels.base import BaseChannel

logger = logging.getLogger(__name__)


class WebhookChannel(BaseChannel):
    name = "webhook"
    label = "Webhook"
    supports_commands = False

    def get_config_fields(self) -> list[dict]:
        return [
            {
                "key": "url",
                "label": "URL",
                "type": "url",
                "required": True,
                "placeholder": "https://example.com/webhook",
            },
            {
                "key": "secret",
                "label": "Secret (optional)",
                "type": "password",
                "required": False,
                "placeholder": "Shared secret for HMAC signature",
            },
        ]

    async def validate_config(self, config: dict) -> bool:
        url = config.get("url", "")
        if not url.startswith(("https://", "http://")):
            return False
        # Try a HEAD request to verify reachability
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.head(url)
                return resp.status_code < 500
            except httpx.RequestError:
                return False

    async def send_notification(self, event_type: str, payload: dict, config: dict) -> None:
        url = config.get("url", "")
        body = {"event": event_type, **payload}
        headers: dict[str, str] = {"Content-Type": "application/json"}
        secret = config.get("secret")
        if secret:
            import hashlib
            import hmac
            import json

            raw = json.dumps(body, sort_keys=True).encode()
            sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
            headers["X-Signature-256"] = f"sha256={sig}"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=body, headers=headers)
            if resp.status_code >= 400:
                logger.warning("Webhook %s returned %s: %s", url, resp.status_code, resp.text[:200])
