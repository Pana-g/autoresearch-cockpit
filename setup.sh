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

# ── 2. Backend setup ─────────────────────────────────────
echo ""
echo "⟳  Setting up backend..."
cd "$ROOT/backend"
uv sync
echo "✓  Backend dependencies installed"

# Generate encryption key if not set
ENV_FILE="$ROOT/backend/.env"
if [[ ! -f "$ENV_FILE" ]] || ! grep -q "AR_ENCRYPTION_KEY" "$ENV_FILE" 2>/dev/null; then
  KEY=$(uv run python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  echo "AR_ENCRYPTION_KEY=$KEY" >> "$ENV_FILE"
  echo "✓  Generated encryption key → backend/.env"
fi

echo "✓  Database will be auto-created on first run (SQLite)"

# ── 3. Frontend setup ────────────────────────────────────
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
