#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

OS="$(uname -s)"

echo "══════════════════════════════════════════════"
echo "  AutoResearch Cockpit — Setup"
echo "══════════════════════════════════════════════"

# ── 1. Check prerequisites ───────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌  $1 not found."
    return 1
  fi
  echo "✓  $1 found"
  return 0
}

missing=0

# Python
if ! check_cmd python3; then
  case "$OS" in
    Darwin) echo "   Install Python 3.12+: brew install python@3.12" ;;
    *)      echo "   Install Python 3.12+: sudo apt install python3 python3-venv  (or your distro's package manager)" ;;
  esac
  missing=1
fi

# Bun
if ! check_cmd bun; then
  echo "   Install bun: curl -fsSL https://bun.sh/install | bash"
  missing=1
fi

# Docker
if ! check_cmd docker; then
  case "$OS" in
    Darwin) echo "   Install Docker: brew install docker docker-compose" ;;
    *)      echo "   Install Docker: https://docs.docker.com/engine/install/" ;;
  esac
  missing=1
fi

# uv
if ! command -v uv &>/dev/null; then
  if [[ -f "$HOME/.local/bin/env" ]]; then
    source "$HOME/.local/bin/env"
  fi
fi
if ! command -v uv &>/dev/null; then
  echo "⟳  Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  source "$HOME/.local/bin/env"
fi
check_cmd uv

if [[ $missing -eq 1 ]]; then
  echo ""
  echo "Install the missing tools above, then re-run this script."
  exit 1
fi

# ── 2. Docker Compose plugin ─────────────────────────────
if ! docker compose version &>/dev/null; then
  echo "⟳  docker compose plugin not found, installing..."
  case "$OS" in
    Darwin)
      brew install docker-compose
      # Register plugin path for Homebrew
      python3 -c "
import json, os
path = os.path.expanduser('~/.docker/config.json')
try:
    with open(path) as f: cfg = json.load(f)
except (FileNotFoundError, json.JSONDecodeError): cfg = {}
cfg.setdefault('cliPluginsExtraDirs', [])
plug = '/opt/homebrew/lib/docker/cli-plugins'
if plug not in cfg['cliPluginsExtraDirs']:
    cfg['cliPluginsExtraDirs'].append(plug)
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
"
      ;;
    *)
      echo "   Install docker-compose-plugin from your package manager:"
      echo "     sudo apt install docker-compose-plugin   (Debian/Ubuntu)"
      echo "     sudo dnf install docker-compose-plugin   (Fedora)"
      echo "   Or: https://docs.docker.com/compose/install/linux/"
      exit 1
      ;;
  esac
  echo "✓  docker compose plugin installed"
fi

# ── 3. Docker runtime ────────────────────────────────────
if ! docker info &>/dev/null 2>&1; then
  case "$OS" in
    Darwin)
      if command -v colima &>/dev/null; then
        echo "⟳  Starting Colima..."
        colima start
      else
        echo "⟳  No Docker runtime detected. Installing Colima..."
        brew install colima
        colima start
      fi
      ;;
    *)
      echo "❌  Docker daemon not running."
      echo "   Start it with: sudo systemctl start docker"
      echo "   To enable on boot: sudo systemctl enable docker"
      exit 1
      ;;
  esac
fi
echo "✓  Docker daemon running"

# ── 4. Start Postgres ────────────────────────────────────
echo ""
echo "⟳  Starting PostgreSQL..."
docker compose up db -d
echo "✓  PostgreSQL running on port 5432"

# Wait for Postgres to be ready
echo "⟳  Waiting for Postgres to be healthy..."
for i in {1..30}; do
  if docker compose exec db pg_isready -U postgres &>/dev/null; then
    break
  fi
  sleep 1
done
echo "✓  PostgreSQL is healthy"

# ── 5. Backend setup ─────────────────────────────────────
echo ""
echo "⟳  Setting up backend..."
cd "$ROOT/backend"
uv sync --all-extras
echo "✓  Backend dependencies installed"

# Generate encryption key if not set
ENV_FILE="$ROOT/backend/.env"
if [[ ! -f "$ENV_FILE" ]] || ! grep -q "AR_ENCRYPTION_KEY" "$ENV_FILE" 2>/dev/null; then
  KEY=$(uv run python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  echo "AR_ENCRYPTION_KEY=$KEY" >> "$ENV_FILE"
  echo "✓  Generated encryption key → backend/.env"
fi

# Run migrations
echo "⟳  Running database migrations..."
uv run alembic upgrade head
echo "✓  Database schema up to date"

# ── 6. Frontend setup ────────────────────────────────────
echo ""
echo "⟳  Setting up frontend..."
cd "$ROOT/frontend"
bun install
echo "✓  Frontend dependencies installed"

# ── Done ──────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "  ✓ Setup complete!"
echo ""
echo "  Run the app:  ./run.sh"
echo "══════════════════════════════════════════════"
