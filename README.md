# AutoResearch Cockpit

<p align="center">
  <img src="screenshots/hero.svg" alt="AutoResearch Cockpit" width="100%" />
</p>

<p align="center">
  <strong>A web dashboard for <a href="https://github.com/karpathy/autoresearch">karpathy/autoresearch</a> — see every iteration, review patches, track loss, and control runs from the browser.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"/></a>
  <a href="https://github.com/Pana-g/autoresearch-cockpit/releases"><img src="https://img.shields.io/badge/version-0.5.6-informational" alt="Version"/></a>
  <a href="https://github.com/Pana-g/autoresearch-cockpit/issues"><img src="https://img.shields.io/github/issues/Pana-g/autoresearch-cockpit" alt="Open Issues"/></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions Welcome"/></a>
  <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/code%20of%20conduct-contributor%20covenant-ff69b4" alt="Code of Conduct"/></a>
</p>

---

## Why?

Autoresearch runs iterative AI-driven training experiments from the command line. That works — but after a few hundred iterations you'll want to:

- **See what's happening** without tailing logs
- **Review the AI's patches** before they hit training
- **Compare iterations** to understand what the model is trying
- **Track loss visually** instead of grepping for `val_bpb`
- **Get notified** when something improves (or breaks)
- **Control the loop** — pause, stop, approve, reject — without killing processes

The Cockpit gives you all of this in a single browser tab.

---

## Screenshots

<p align="center">
  <img src="screenshots/Screenshot_20260316_195350.png" alt="Run cockpit — agent reasoning and patch code" width="49%" />
  <img src="screenshots/Screenshot_20260318_213154.png" alt="Training progress — live score chart and training output" width="49%" />
</p>
<p align="center">
  <img src="screenshots/Screenshot_20260316_195328.png" alt="Project overview — runs list with status and best scores" width="49%" />
  <img src="screenshots/Screenshot_20260316_195148.png" alt="Provider credentials — multi-provider LLM management" width="49%" />
</p>

---

## Key Features

| Feature | What it does |
|---------|-------------|
| **Live run cockpit** | Real-time SSE streaming of agent thinking, code patches, training logs, and iteration progress — all in one view |
| **Score progression chart** | Interactive `val_bpb` chart with zoom, brush selection, colour-coded dots (green = improvement, red = regression) |
| **Patch review gate** | Side-by-side syntax-highlighted diff — approve or reject AI-generated patches before training starts |
| **Iteration diff compare** | Compare patches between any two iterations to trace how the AI's strategy evolved |
| **Multi-provider LLM** | OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, GitHub Copilot — switch models from the UI with dynamic model listing |
| **Automation controls** | Auto-approve, auto-continue, max iterations, overfit floor/margin, consecutive failure limit — all configurable per run |
| **Context compaction** | Automatic conversation compaction to manage token budgets across hundreds of iterations |
| **Notifications** | Discord, Telegram, Slack, or webhook alerts with per-event toggles |
| **Model chat** | Talk to the configured LLM directly from the run cockpit |
| **Multi-project** | Manage multiple autoresearch projects and connect to multiple backend instances |
| **Runtime settings** | Change timeouts, CORS, and parameters from the web UI — no restarts needed |
| **Zero config** | SQLite database auto-created on first run; no Docker, no Postgres, no manual setup |

---

## Getting Started

There are three ways to run the Cockpit, from easiest to most flexible:

### Option A: One-Line Install (Recommended)

The fastest way. No Python, Node, or database setup required. Detects your platform automatically.

```sh
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1 | iex
```

Then run:
```sh
autoresearch-cockpit                  # start backend (8000) + frontend (5173)
autoresearch-cockpit backend          # backend API only (port 8000)
autoresearch-cockpit frontend         # bundled frontend only (port 5173)
autoresearch-cockpit --backend-port 9000 --frontend-port 9001  # custom ports
```

Open **http://localhost:5173** for the UI. The backend API runs on **http://localhost:8000**. A local SQLite database and encryption key are created automatically on first run.

<details>
<summary>Install options</summary>

```sh
# Install a specific version
curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --version v0.5.6

# Custom install directory
curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --dir /usr/local/bin

# Uninstall
curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --uninstall

# Uninstall but keep ~/.autoresearch-cockpit data
curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --uninstall --keep-data
```

```powershell
# Windows uninstall
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1))) -Uninstall

# Windows uninstall but keep ~/.autoresearch-cockpit data
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1))) -Uninstall -KeepData
```

Or download binaries manually from [Releases](https://github.com/Pana-g/autoresearch-cockpit/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `autoresearch-cockpit-macos-arm64` |
| Linux (x64)           | `autoresearch-cockpit-linux-x64`   |
| Windows (x64)         | `autoresearch-cockpit-windows-x64.exe` |

</details>

---

### Option B: Run from Source (Quick Scripts)

Best for development or if you want to modify the code.

**Prerequisites:**

| Tool | macOS | Linux (Debian/Ubuntu) |
|------|-------|-----------------------|
| Python 3.12+ | `brew install python@3.12` | `sudo apt install python3 python3-venv` |
| [Bun](https://bun.sh/) | `curl -fsSL https://bun.sh/install \| bash` | same |
| [uv](https://docs.astral.sh/uv/) | auto-installed by `setup.sh` | same |

```sh
git clone https://github.com/Pana-g/autoresearch-cockpit.git
cd autoresearch-cockpit

# First time — installs dependencies
./setup.sh

# Start backend + frontend
./run.sh
```

<details>
<summary><strong>Windows</strong></summary>

| Tool | Install |
|------|---------|
| Python 3.12+ | [python.org/downloads](https://www.python.org/downloads/) |
| [Bun](https://bun.sh/) | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| [uv](https://docs.astral.sh/uv/) | auto-installed by `setup.bat` |

```cmd
setup.bat
run.bat
```

</details>

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:5173       |
| Backend   | http://localhost:8000       |
| API Docs  | http://localhost:8000/docs  |

You can also start services individually or on custom ports:
```sh
./run.sh backend                         # backend only
./run.sh frontend                        # frontend only
./run.sh --backend-port 9000             # custom backend port
./run.sh --frontend-port 3000            # custom frontend port
./run.sh all --backend-port 9000 --frontend-port 3000  # both custom
```

The run scripts check required tools automatically and print install commands if anything is missing.

---

### Option C: Manual Setup

If you prefer full control without the setup/run scripts.

```sh
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
bun install
bun run dev
```

The encryption key and SQLite database are created automatically on first run. No `.env` file needed.

---

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Your machine                                                │
│                                                              │
│  autoresearch (CLI)        AutoResearch Cockpit              │
│  ┌─────────────────┐      ┌─────────────────────────────┐   │
│  │ train.py loop    │      │ FastAPI backend (port 8000)  │   │
│  │  - agent call    │◄────►│  - orchestrates the loop     │   │
│  │  - patch code    │      │  - streams events via SSE    │   │
│  │  - train model   │      │  - stores state in SQLite    │   │
│  │  - evaluate      │      │                              │   │
│  └─────────────────┘      └──────────┬──────────────────┘   │
│                                       │                      │
│                            ┌──────────▼──────────────────┐   │
│                            │ React frontend (port 5173)   │   │
│                            │  - live dashboard            │   │
│                            │  - patch review              │   │
│                            │  - loss charts               │   │
│                            │  - run controls              │   │
│                            └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

The Cockpit backend wraps the autoresearch training loop. It calls the same agent → patch → train → evaluate cycle, but adds:

1. **Visibility** — every step streams to the browser in real time via SSE
2. **Control** — approve/reject patches, stop/resume runs, set iteration limits
3. **History** — every iteration's score, patch, and agent reasoning is stored and queryable
4. **Intelligence** — automatic context compaction, overfit detection, and failure thresholds

---

## Docker (Full Stack)

For containerized deployments. Requires **Docker** and **Docker Compose**.

```sh

# Build and start everything
docker compose --profile full up --build -d
```

This starts PostgreSQL + backend + frontend in containers.

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

```sh
# Stop
docker compose --profile full down

# Stop + wipe database
docker compose --profile full down -v
```

> **Note**: The backend container needs access to autoresearch workspace directories. The `workspaces` volume is mounted at `/root/.autoresearch-cockpit/workspaces` inside the container.

---

## Connecting to a Backend

On first launch, a **Welcome Setup** wizard prompts for the backend URL (e.g. `http://localhost:8000`). Click **Test** → **Connect**.

Manage connections at any time from **Settings → Servers** or the sidebar server switcher. You can connect one frontend to multiple backend instances.

---

## Configuration

### Environment Variables

All configuration is optional. Set in `backend/.env` to override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `AR_ENCRYPTION_KEY` | auto-generated | Fernet key for encrypting API credentials at rest (auto-generated and persisted to `~/.autoresearch-cockpit/encryption.key` on first run) |
| `AR_DATABASE_URL` | `sqlite+aiosqlite:///$HOME/.autoresearch-cockpit/autoresearch.db` | Database connection string |
| `AR_DEFAULT_TRAINING_TIMEOUT_SECONDS` | `1800` | Training subprocess timeout (30 min) |
| `AR_DEFAULT_AGENT_INACTIVITY_TIMEOUT` | `300` | Agent inactivity timeout (5 min) |
| `AR_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

All timeout and CORS settings can also be changed at runtime from the **Settings** page in the web UI.

### PostgreSQL (optional)

The app uses SQLite by default. To use PostgreSQL instead:

```sh
# Install the extra dependency
cd backend && uv sync --extra postgres

# Set the connection string in backend/.env
AR_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
```

---

## Project Structure

```
├── setup.sh / setup.bat       # One-time setup
├── run.sh / run.bat           # Start all services
├── docker-compose.yml         # Full-stack Docker deployment
├── .env.example               # Template environment file
├── scripts/
│   └── build.sh / build.bat   # Build standalone binary
├── backend/
│   ├── server.py              # Standalone entry point (PyInstaller)
│   ├── app/
│   │   ├── main.py            # FastAPI entry point
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── models/            # SQLAlchemy ORM + state machine
│   │   ├── providers/         # LLM provider abstraction
│   │   ├── services/          # Git, patches, prompt builder, run engine
│   │   └── api/               # REST endpoints + SSE
│   ├── alembic/               # Database migrations
│   └── tests/                 # pytest suite
└── frontend/
    └── src/
        ├── components/        # React components (chart, diff, chat, etc.)
        ├── pages/             # Route pages (settings, servers, channels)
        ├── stores/            # Zustand state stores
        └── hooks/             # Custom React hooks
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up the dev environment, running tests, and submitting pull requests.

- **Bug reports:** [Open an issue](https://github.com/Pana-g/autoresearch-cockpit/issues/new?template=bug_report.yml)
- **Feature requests:** [Open an issue](https://github.com/Pana-g/autoresearch-cockpit/issues/new?template=feature_request.yml)
- **Questions:** [Start a discussion](https://github.com/Pana-g/autoresearch-cockpit/discussions)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a history of notable changes.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities and security best practices for deployment.

## License

[MIT](LICENSE) © 2026 AutoResearch Cockpit Contributors
