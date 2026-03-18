# AutoResearch Cockpit

<p align="center">
  <img src="screenshots/hero.svg" alt="AutoResearch Cockpit" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"/></a>
  <a href="https://github.com/Pana-g/autoresearch-cockpit/releases"><img src="https://img.shields.io/badge/version-0.3.0-informational" alt="Version"/></a>
  <a href="https://github.com/Pana-g/autoresearch-cockpit/issues"><img src="https://img.shields.io/github/issues/Pana-g/autoresearch-cockpit" alt="Open Issues"/></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions Welcome"/></a>
  <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/code%20of%20conduct-contributor%20covenant-ff69b4" alt="Code of Conduct"/></a>
</p>

Control plane for [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — a web dashboard that wraps the autoresearch training loop with visibility, control, and tooling that the CLI alone doesn't provide.

## What the Cockpit Adds

Autoresearch runs iterative AI-driven training experiments from the command line. The Cockpit gives you a full web UI on top of that:

- **Live dashboard** — watch every iteration in real time: agent reasoning, training logs, progress, and token costs stream via SSE into a single view
- **Patch review gate** — inspect AI-generated code patches in a side-by-side syntax-highlighted diff and approve or reject them before training starts
- **Iteration diff compare** — compare the agent's patches between any two iterations to see how its approach evolved
- **Training loss chart** — interactive `val_bpb` chart with zoom/brush, colour-coded dots (green = improvement, red = regression), and an expandable panel
- **Multi-provider LLM support** — swap between OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, and GitHub Copilot from the UI with dynamic model listing
- **Notification channels** — get alerts on Discord, Telegram, Slack, or a custom webhook with per-event toggles
- **Model chat** — talk to the configured LLM directly from the run cockpit without leaving the dashboard
- **Multi-project & multi-server** — manage several autoresearch projects and connect to multiple backend instances from one frontend
- **Runtime settings** — change timeouts, CORS, and other parameters from the web UI — no file edits or restarts
- **Standalone binary** — single executable for Linux, macOS, and Windows with the React frontend embedded; no Python or Node.js required to run

## Screenshots

<p align="center">
  <img src="screenshots/Screenshot_20260318_213154.png" alt="Screenshot 1" width="49%" />
  <img src="screenshots/Screenshot_20260316_195148.png" alt="Screenshot 2" width="49%" />
</p>
<p align="center">
  <img src="screenshots/Screenshot_20260316_195328.png" alt="Screenshot 3" width="49%" />
  <img src="screenshots/Screenshot_20260316_195350.png" alt="Screenshot 4" width="49%" />
</p>

---

## Table of Contents

- [What the Cockpit Adds](#what-the-cockpit-adds)
- [Quick Start](#quick-start)
- [Setup](#setup)
  - [macOS / Linux](#macos--linux)
  - [Windows](#windows)
- [Running](#running)
  - [macOS / Linux](#running-macos--linux)
  - [Windows](#running-windows)
- [Docker (Full Stack)](#docker-full-stack)
- [Manual Setup (No Scripts)](#manual-setup-no-scripts)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [Security](#security)
- [License](#license)

---

## Quick Start

### Download a Release (no build required)

Grab the latest pre-built binary for your platform from the [Releases page](https://github.com/Pana-g/autoresearch-cockpit/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `autoresearch-cockpit-macos-arm64` |
| Linux (x64)           | `autoresearch-cockpit-linux-x64`   |
| Windows (x64)         | `autoresearch-cockpit-windows-x64.exe` |

Each release includes the standalone executable and an `.env.example` file. Download them, create a `.env` (see below), and run the binary — no Python or Node required.

> PostgreSQL is still required. The quickest way: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name arc-db postgres:16`

### Build from Source

```sh
git clone https://github.com/Pana-g/autoresearch-cockpit.git
cd autoresearch-cockpit
./setup.sh   # First time — install everything
./run.sh     # Start all services
```

---

## Setup

### macOS / Linux

**Prerequisites** — the setup script will check for these and guide you:

| Tool | macOS | Linux (Debian/Ubuntu) |
|------|-------|-----------------------|
| Python 3.12+ | `brew install python@3.12` | `sudo apt install python3 python3-venv` |
| [Bun](https://bun.sh/) | `curl -fsSL https://bun.sh/install \| bash` | same |
| Docker | `brew install docker` | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) |
| [uv](https://docs.astral.sh/uv/) | auto-installed by `setup.sh` | same |

Then run:

```sh
chmod +x setup.sh run.sh
./setup.sh
```

`setup.sh` will:
1. Verify all prerequisites are installed
2. Install `uv` if missing
3. Set up Docker Compose plugin (macOS: via Homebrew, Linux: prompts for package manager)
4. Start the Docker daemon (macOS: via Colima if needed, Linux: prompts to start systemd service)
5. Start PostgreSQL via Docker Compose
6. Install backend Python dependencies (`uv sync`)
7. Generate an encryption key and save to `backend/.env`
8. Run Alembic database migrations
9. Install frontend dependencies (`bun install`)

### Windows

**Prerequisites:**

| Tool | Install |
|------|---------|
| Python 3.12+ | [python.org/downloads](https://www.python.org/downloads/) |
| [Bun](https://bun.sh/) | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) | Docker Desktop for Windows |
| [uv](https://docs.astral.sh/uv/) | auto-installed by `setup.bat` |

Then run:

```cmd
setup.bat
```

`setup.bat` performs the same steps as `setup.sh` adapted for Windows.

---

## Running

### Running (macOS / Linux)

```sh
# Start everything (backend + frontend)
./run.sh

# Or start services individually in separate terminals:
./run.sh backend
./run.sh frontend
```

Press `Ctrl+C` to stop all services.

### Running (Windows)

```cmd
:: Start everything (opens separate windows for backend and frontend)
run.bat

:: Or start services individually:
run.bat backend
run.bat frontend
```

### Services

| Service   | URL                        | Notes            |
|-----------|----------------------------|------------------|
| Frontend  | http://localhost:5173       | Vite dev server  |
| Backend   | http://localhost:8000       | FastAPI          |
| API Docs  | http://localhost:8000/docs  | Swagger UI       |
| Postgres  | localhost:5432              | postgres/postgres|

---

## Docker (Full Stack)

Run the entire stack in Docker without installing Python, Bun, or uv locally. You only need **Docker** and **Docker Compose**.

### 1. Create `backend/.env`

```sh
# Generate an encryption key (requires Python, or use any Fernet key generator)
python3 -c "from cryptography.fernet import Fernet; print('AR_ENCRYPTION_KEY=' + Fernet.generate_key().decode())" > backend/.env
```

Or create `backend/.env` manually:

```env
AR_ENCRYPTION_KEY=<your-fernet-key>
```

### 2. Build and start

```sh
docker compose --profile full up --build -d
```

This starts PostgreSQL, runs the backend (with migrations), and serves the frontend — all in containers.

### 3. Access

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

### 4. Stop

```sh
docker compose --profile full down
```

To also remove the database volume:

```sh
docker compose --profile full down -v
```

> **Note**: When running fully in Docker, the backend container needs access to autoresearch workspace directories. The `workspaces` volume is mounted at `/root/.autoresearch/workspaces` inside the container.

---

## Connecting to a Backend

The frontend can connect to any running AutoResearch Cockpit backend — local or remote.

When you open the frontend for the first time, a **Welcome Setup** wizard asks for the backend URL (e.g. `http://localhost:8000`). Click **Test** to verify the connection, then **Connect**.

You can manage server connections at any time from **Settings → Servers** or the sidebar server switcher.

---

## Manual Setup (No Scripts)

If you prefer to set things up yourself without the setup/run scripts.

### 1. Start PostgreSQL

Using Docker:

```sh
docker compose up db -d
```

Or use any PostgreSQL 14+ instance and update the connection URLs in `backend/.env`.

### 2. Backend

```sh
cd backend

# Install dependencies
uv sync --all-extras

# Create .env with required secrets
cat > .env << 'EOF'
AR_ENCRYPTION_KEY=<generate-a-fernet-key>
EOF

# Generate a Fernet key:
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Run database migrations
uv run alembic upgrade head

# Start the server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```sh
cd frontend
bun install
bun run dev
```

---

## Environment Variables

Set in `backend/.env` (auto-generated by the setup scripts):

| Variable | Default | Description |
|----------|---------|-------------|
| `AR_ENCRYPTION_KEY` | — (required) | Fernet key for encrypting API credentials |
| `AR_DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/autoresearch` | Async DB connection string |
| `AR_DATABASE_URL_SYNC` | `postgresql://postgres:postgres@localhost:5432/autoresearch` | Sync DB connection (used by Alembic) |
| `AR_DEFAULT_TRAINING_TIMEOUT_SECONDS` | `720` | Training subprocess timeout (seconds) |
| `AR_DEFAULT_AGENT_TIMEOUT_SECONDS` | `300` | Agent LLM call timeout (seconds) |
| `AR_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

All timeout and CORS settings can also be changed at runtime via the **Settings** page in the web UI.

---

## Project Structure

```
├── setup.sh / setup.bat       # One-time setup (macOS+Linux / Windows)
├── run.sh / run.bat           # Start all services
├── docker-compose.yml         # Postgres (default) + full stack (--profile full)
├── .env.example               # Template environment file
├── scripts/
│   ├── build.sh               # Local build script (macOS/Linux)
│   └── build.bat              # Local build script (Windows)
├── .github/
│   └── workflows/
│       └── release.yml        # Cross-platform release CI
├── backend/
│   ├── .env                   # Secrets (auto-generated, git-ignored)
│   ├── Dockerfile             # Backend container image
│   ├── server.py              # Standalone entry point (PyInstaller)
│   ├── autoresearch-cockpit.spec  # PyInstaller spec
│   ├── app/
│   │   ├── main.py            # FastAPI entry point
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── db.py              # Async session factory
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── models/            # SQLAlchemy ORM + state machine
│   │   ├── providers/         # LLM provider abstraction
│   │   ├── services/          # Git, patches, prompt builder, run engine
│   │   └── api/               # REST endpoints + SSE
│   ├── alembic/               # Database migrations
│   └── tests/                 # pytest suite
└── frontend/
    ├── Dockerfile             # Frontend container image
    └── src/
        ├── components/
        │   ├── welcome-setup.tsx     # First-launch server connection wizard
        │   ├── server-switcher.tsx   # Sidebar server dropdown
        │   ├── iteration-chart.tsx   # val_bpb training loss chart
        │   ├── diff-compare-modal.tsx # Iteration diff compare viewer
        │   ├── live-log-console.tsx  # Real-time training log viewer
        │   ├── patch-review.tsx      # Diff review with accept/reject
        │   └── model-chat.tsx        # Inline LLM chat panel
        └── pages/
            ├── settings.tsx          # Runtime settings configuration
            ├── servers.tsx           # Settings → Servers management
            └── channels.tsx          # Notification channel settings
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
