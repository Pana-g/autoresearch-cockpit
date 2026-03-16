from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, new_uuid


class ProviderCredential(Base, TimestampMixin):
    __tablename__ = "provider_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    provider: Mapped[str] = mapped_column(String(100))  # openai, anthropic, google, ollama, github-copilot
    auth_type: Mapped[str] = mapped_column(String(50))  # api_key, oauth, none
    encrypted_data: Mapped[str] = mapped_column(Text)  # Fernet-encrypted JSON blob
    is_active: Mapped[bool] = mapped_column(default=True)


class TokenUsage(Base, TimestampMixin):
    __tablename__ = "token_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    agent_step_id: Mapped[str] = mapped_column(ForeignKey("agent_steps.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0)
    usage_source: Mapped[str] = mapped_column(String(30), default="estimated")  # provider_reported | estimated

    agent_step: Mapped["AgentStep"] = relationship(back_populates="token_usage", lazy="selectin")  # noqa: F821


class Artifact(Base, TimestampMixin):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"))
    name: Mapped[str] = mapped_column(String(255))
    artifact_type: Mapped[str] = mapped_column(String(50))  # patch, log, snapshot, etc.
    content: Mapped[str] = mapped_column(Text, default="")
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
