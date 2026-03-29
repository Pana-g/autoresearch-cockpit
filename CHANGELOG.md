# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-03-29

### Changed

- **Zero-config startup** — removed the `.env` file and `AR_ENCRYPTION_KEY` as requirements; the encryption key is now auto-generated and persisted to `~/.autoresearch/encryption.key` on first run. No manual key generation or `.env` creation needed.
- **Simplified setup scripts** — `setup.sh` / `setup.bat` no longer generate a `.env` file or encryption key; just install dependencies
- **Simplified binary startup** — `server.py` no longer warns about missing `.env`; the app is fully self-configuring
- **Updated `.env.example`** — all fields are now optional with clear documentation; the file is no longer required

### Removed

- **`AR_ENCRYPTION_KEY` as a required env var** — still supported as an override, but no longer needed
- **`.env` file generation from setup scripts** — the file is optional for advanced users only

## [0.5.0] - 2026-03-29

### Changed

- **SQLite by default** — switched the default database from PostgreSQL to SQLite; the app creates a local `data/autoresearch.db` on first run with zero configuration. PostgreSQL remains fully supported via `AR_DATABASE_URL`
- **Zero-dependency setup** — removed Docker and PostgreSQL as prerequisites; `setup.sh` / `setup.bat` now only require Python, uv, and bun
- **Simplified run/setup scripts** — removed Docker daemon checks, Colima startup, PostgreSQL health polling, and API key generation from all shell and batch scripts
- **Auto-derived sync URL** — removed the `AR_DATABASE_URL_SYNC` environment variable; the synchronous connection string is now derived automatically from `AR_DATABASE_URL`

### Fixed

- **SQLite boolean defaults** — model `server_default` values changed from `"true"`/`"false"` to `"1"`/`"0"` for cross-dialect compatibility
- **Alembic batch mode** — enabled `render_as_batch=True` for SQLite to handle `ALTER TABLE` limitations
- **Project settings bug** — `default_max_consecutive_failures` was not persisted when updated from project settings
- **State machine tests** — updated to match current transition rules (DONE/FAILED/CANCELED allow recovery transitions)
- **Unsafe error casts** — replaced `(error as Error).message` with safe `instanceof` checks across all error displays

### Removed

- **Docker prerequisite** — Docker/Docker Compose are no longer required for local development or the standalone binary
- **`AR_DATABASE_URL_SYNC`** — replaced by auto-derivation from the async URL
- **Unused `Artifact` model** — removed from exports (table kept for migration compatibility)
- **Unused API functions** — removed `runs.rollback()` and `runs.getTrainPy()` from frontend API client
- **Dead code** — removed unused imports (`time`, `update`, `asyncio`, `useMemo`) and unused `TimeAgo` component
- **`__import__()` hack** — replaced obfuscated dynamic import in notification service with normal import

### Changed (Code Quality)

- **Consolidated theme resolution** — exported `getEffectiveTheme()` from theme store; replaced 3 duplicated inline implementations
- **Simplified run settings update** — replaced 14 individual if-statements with a loop for simple fields
- **Moved inline imports to module level** — compaction and prompt builder imports in `runs.py` moved to top of file
- **FastAPI version string** — updated from `0.1.0` to `0.5.0`

## [0.4.0] - 2026-03-29

### Added

- **Hardware info toggle** — per-run `include_machine_info` switch to control whether machine specs are sent to the LLM; configurable default in project settings
- **Consecutive failure threshold** — configurable `max_consecutive_failures` limit (default 6) that auto-stops a run after too many back-to-back failures; available per-run and as a project default
- **Auto-compact toggle at run creation** — `auto_compact` is now configurable when creating a new run, alongside the existing cockpit and project-level controls

### Changed

- **SQLite by default** — the app now uses a local SQLite database out of the box; no PostgreSQL setup required. Just download and run. PostgreSQL remains supported via `AR_DATABASE_URL`
- **Training timeout** — replaced watchdog-based timeout logic with a simple 30-minute `asyncio.wait_for` to avoid killing long-running evaluation phases
- **Connection error handling** — LLM provider calls now retry with exponential backoff and roll back the iteration on persistent failures; runs fast-fail after 5 consecutive connection errors
- **Default compaction threshold** — changed from 50% to 75%
- **Channel actions UI** — replaced icon-only hover buttons with an always-visible vertical "More" dropdown menu with text labels

### Fixed

- **Channel edit overlap** — editing a channel no longer shows a duplicate card below the edit form

### Removed

- **`max_run_memory_records`** — removed unused compaction trigger from settings, schemas, and UI
- **Channel commands** — removed all command/receiver infrastructure (Discord bot receiver, Telegram receiver, command handler, channel manager) and `commands_enabled` field; channels are now notification-only

## [0.3.0] - 2026-03-19

### Added

- **Iteration diff compare** — side-by-side diff viewer to compare agent patches between any two iterations in a run, with outcome badges (Improved / No gain / Failed)
- **Runtime settings page** — configure timeouts, CORS, memory limits, and encryption directly from the web UI without editing `.env` or restarting
- **Settings API** — `GET /api/settings` and `PATCH /api/settings` endpoints for runtime configuration

### Changed

- **SSE performance** — batched query invalidations via `requestAnimationFrame` instead of individual calls per event
- **Reduced polling** — run status polls every 10 s (was 5 s), agent/training steps every 15 s (was 5 s)
- **UI theme overhaul** — migrated to shadcn/ui zinc neutral palette; removed all glass/blur/grain/glow effects for a cleaner, more performant look
- **Build output** — release binaries are now uploaded as raw executables instead of `.tar.gz` / `.zip` archives

### Removed

- **Authentication** — removed `AR_API_KEY` environment variable and all bearer-token middleware; the cockpit is designed for local/trusted-network use

## [0.2.0] - 2026-03-18

### Added

- **Welcome setup wizard** — guided first-launch dialog to connect the frontend to a backend: enter server URL and API key, test the connection, then save. No manual config editing required
- **Notification channels** — Discord, Telegram, Slack, and Webhook integrations with per-event enable/disable and bot command support
- **Iteration loss chart** — interactive `val_bpb` (bits per byte) training loss chart with zoom/brush, adaptive coloured dots (green = improvement, red = regression), and expandable panel
- **Live log console** — dedicated scrollable console for real-time training subprocess output with ANSI colour stripping and auto-scroll
- **Patch review improvements** — side-by-side diff view with syntax highlighting and inline accept/reject actions
- **Model chat** — interactive chat panel to converse with the configured LLM directly from the run cockpit
- **Multi-server management page** — full Settings → Servers page to add, edit, delete, and test multiple backend connections; switch active server from the sidebar dropdown
- **Standalone binary distribution** — single-file PyInstaller executables for Linux x64, macOS arm64, and Windows x64 with embedded frontend and auto-run migrations
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

[Unreleased]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Pana-g/autoresearch-cockpit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Pana-g/autoresearch-cockpit/releases/tag/v0.1.0
