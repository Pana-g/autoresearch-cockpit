# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-18

### Added

- **Welcome setup wizard** — guided first-launch dialog to connect the frontend to a backend: enter server URL and API key, test the connection, then save. No manual config editing required
- **Notification channels** — Discord, Telegram, Slack, and Webhook integrations with per-event enable/disable and bot command support
- **Iteration loss chart** — interactive `val_bpb` (bits per byte) training loss chart with zoom/brush, adaptive coloured dots (green = improvement, red = regression), and expandable panel
- **Live log console** — dedicated scrollable console for real-time training subprocess output with ANSI colour stripping and auto-scroll
- **Patch review improvements** — side-by-side diff view with syntax highlighting and inline accept/reject actions
- **Model chat** — interactive chat panel to converse with the configured LLM directly from the run cockpit
- **Multi-server management page** — full Settings → Servers page to add, edit, delete, and test multiple backend connections; switch active server from the sidebar dropdown
- **Standalone binary distribution** — single-file PyInstaller executables for Linux x64, macOS x64, macOS arm64, and Windows x64 with embedded frontend and auto-run migrations
- **GitHub Actions release pipeline** — automated cross-platform build and publish on version tags (`v*.*.*`)
- **Frontend static serving from backend** — the backend binary serves the React frontend directly; no separate web server needed
- **`.env.example`** — template environment file shipped in every release archive

## [0.1.0] - 2026-03-16

### Added

- **Project management** — create, configure, and track ML training projects
- **Run engine** — orchestrate iterative AI-driven training loops with full state machine control (init → generate → patch → train → eval → report)
- **Multi-provider LLM support** — OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, and GitHub Copilot
- **Live run cockpit** — real-time SSE streaming of agent thinking, training logs, and iteration progress
- **Patch review workflow** — inspect, approve, or reject AI-generated code patches before training
- **Git integration** — automatic workspace management, branching, and commit tracking per run
- **Context compaction** — configurable conversation compaction to manage token budgets across long runs
- **Iteration limits** — set max iterations, overfit floor/margin, and auto-approve/auto-continue per run
- **Token usage tracking** — per-run token consumption with cost visibility
- **Encrypted credential storage** — Fernet-based encryption for API keys at rest
- **Step timeline** — visual iteration progress with per-step status indicators
- **Workspace viewer** — browse and preview files in training workspaces
- **Model selector** — dynamic model listing from each configured provider
- **Multi-server support** — connect the frontend to multiple backend instances
- **Dark/light theme** — system-aware theme toggle with smooth transitions
- **Cross-platform setup** — `setup.sh` / `setup.bat` and `run.sh` / `run.bat` for macOS, Linux, and Windows
- **Full Docker deployment** — `docker compose --profile full` for containerized stack
- **Database migrations** — Alembic-managed schema with full migration history
- **Default project settings** — configurable defaults for run parameters and compaction settings

[Unreleased]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Pana-g/autoresearch-cockpit/releases/tag/v0.1.0
