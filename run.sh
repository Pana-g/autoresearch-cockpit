#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Source uv if needed
if ! command -v uv &>/dev/null && [[ -f "$HOME/.local/bin/env" ]]; then
  source "$HOME/.local/bin/env"
fi

# Load .env if it exists (lives in backend/)
if [[ -f "$ROOT/backend/.env" ]]; then
  set -a
  source "$ROOT/backend/.env"
  set +a
fi

# ── Ensure database is ready ─────────────────────────────
ensure_db() {
  cd "$ROOT/backend"
  # For SQLite (default): the server auto-creates the DB on first run.
  # For PostgreSQL: ensure Alembic migrations are applied.
  if echo "${AR_DATABASE_URL:-}" | grep -q "^postgresql"; then
    echo "⟳  Running database migrations (PostgreSQL)..."
    uv run alembic upgrade head 2>&1 | grep -v "^$" | head -3
    echo "✓  Database up to date"
  else
    echo "✓  Using SQLite (auto-created on first run)"
  fi
  cd "$ROOT"
}

# ── Prerequisite checks ─────────────────────────────────
ensure_prerequisites() {
  local need_uv=0
  local need_bun=0
  local missing=0

  case "$CMD" in
    backend)
      need_uv=1
      ;;
    frontend)
      need_bun=1
      ;;
    all)
      need_uv=1
      need_bun=1
      ;;
  esac

  if [[ $need_uv -eq 1 ]]; then
    if ! command -v uv &>/dev/null && [[ -f "$HOME/.local/bin/env" ]]; then
      source "$HOME/.local/bin/env"
    fi
    if ! command -v uv &>/dev/null; then
      echo "❌  Missing dependency: uv"
      echo "    Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
      echo "    Then run: source \"$HOME/.local/bin/env\""
      missing=1
    fi
  fi

  if [[ $need_bun -eq 1 ]] && ! command -v bun &>/dev/null; then
    echo "❌  Missing dependency: bun"
    echo "    Install: curl -fsSL https://bun.sh/install | bash"
    missing=1
  fi

  if [[ $missing -eq 1 ]]; then
    echo ""
    echo "Run ./setup.sh to install dependencies automatically, then try again."
    exit 1
  fi
}


validate_port() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || (( value < 1 || value > 65535 )); then
    echo "Error: ${name} must be a number between 1 and 65535 (got '${value}')"
    exit 1
  fi
}

# ── Usage ────────────────────────────────────────────────
usage() {
  echo "Usage: $0 [command] [options]"
  echo ""
  echo "Commands:"
  echo "  all        Start both backend and frontend (default)"
  echo "  backend    Start only the backend"
  echo "  frontend   Start only the frontend"
  echo "  help       Show this help message"
  echo ""
  echo "Options:"
  echo "  --backend-port PORT   Backend port (default: 8000)"
  echo "  --frontend-port PORT  Frontend port (default: 5173)"
}

# ── Parse arguments ──────────────────────────────────────
CMD="${1:-all}"
# Shift the command off if it's a known command (not a flag)
case "$CMD" in
  all|backend|frontend|help|--help|-h) shift ;;
  --*) CMD="all" ;; # flag passed without command, default to all
esac

BACKEND_PORT="8000"
FRONTEND_PORT="5173"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-port)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Error: --backend-port requires a value"
        echo ""
        usage
        exit 1
      fi
      BACKEND_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Error: --frontend-port requires a value"
        echo ""
        usage
        exit 1
      fi
      FRONTEND_PORT="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown option '$1'"
      echo ""
      usage
      exit 1
      ;;
  esac
done

validate_port "backend port" "$BACKEND_PORT"
validate_port "frontend port" "$FRONTEND_PORT"
ensure_prerequisites

case "$CMD" in
  help|--help|-h)
    usage
    exit 0
    ;;

  backend)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Backend"
    echo "══════════════════════════════════════════════"
    ensure_db
    cd "$ROOT/backend"
    echo "⟳  Starting backend on :${BACKEND_PORT}..."
    exec uv run uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
    ;;

  frontend)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Frontend"
    echo "══════════════════════════════════════════════"
    cd "$ROOT/frontend"
    echo "⟳  Starting frontend on :${FRONTEND_PORT}..."
    exec bun run dev --port "$FRONTEND_PORT"
    ;;

  all)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Starting"
    echo "══════════════════════════════════════════════"

    cleanup() {
      echo ""
      echo "Shutting down..."
      kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
      wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
      echo "Done."
    }
    trap cleanup EXIT INT TERM

    ensure_db

    # Start backend
    cd "$ROOT/backend"
    echo "⟳  Starting backend on :${BACKEND_PORT}..."
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
    BACKEND_PID=$!

    # Start frontend
    cd "$ROOT/frontend"
    echo "⟳  Starting frontend on :${FRONTEND_PORT}..."
    bun run dev --port "$FRONTEND_PORT" &
    FRONTEND_PID=$!

    sleep 3
    echo ""
    echo "══════════════════════════════════════════════"
    echo "  ✓ All services running!"
    echo ""
    echo "  Backend:   http://localhost:${BACKEND_PORT}"
    echo "  API docs:  http://localhost:${BACKEND_PORT}/docs"
    echo "  Frontend:  http://localhost:${FRONTEND_PORT}"
    echo ""
    echo "  Press Ctrl+C to stop everything"
    echo "══════════════════════════════════════════════"

    wait
    ;;

  *)
    echo "Error: unknown command '$CMD'"
    echo ""
    usage
    exit 1
    ;;
esac
