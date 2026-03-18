"""Notification channel model — Discord, Telegram, Slack, generic webhook."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, new_uuid


class NotificationChannel(Base, TimestampMixin):
    __tablename__ = "notification_channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    channel_type: Mapped[str] = mapped_column(String(50))  # discord, telegram, slack, webhook
    encrypted_config: Mapped[str] = mapped_column(Text)  # Fernet-encrypted JSON
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # JSON list of enabled notification event types, e.g. '["new_best","run_failed"]'
    notification_events: Mapped[str] = mapped_column(Text, default='["new_best","training_failed","run_completed","run_failed"]')
    commands_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # If set, only notify for this run; null = all runs
    linked_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, default=None
    )
