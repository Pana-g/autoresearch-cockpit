"""Abstract base for all notification channel providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ChannelTypeInfo:
    """Metadata about a channel type for the frontend."""

    name: str
    label: str
    config_fields: list[dict] = field(default_factory=list)
    supports_commands: bool = False


class BaseChannel(ABC):
    """All channel providers implement this interface."""

    name: str  # e.g. "discord", "telegram"
    label: str  # e.g. "Discord", "Telegram"
    supports_commands: bool = False

    @abstractmethod
    def get_config_fields(self) -> list[dict]:
        """Return config field descriptors for the frontend form.

        Each dict: {"key": str, "label": str, "type": "text"|"url"|"password", "required": bool, "placeholder": str}
        """
        ...

    @abstractmethod
    async def validate_config(self, config: dict) -> bool:
        """Check if the config is valid (e.g. webhook URL is reachable)."""
        ...

    @abstractmethod
    async def send_notification(self, event_type: str, payload: dict, config: dict) -> None:
        """Send a notification message to this channel."""
        ...

    def type_info(self) -> ChannelTypeInfo:
        return ChannelTypeInfo(
            name=self.name,
            label=self.label,
            config_fields=self.get_config_fields(),
            supports_commands=self.supports_commands,
        )
