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

# ── Ensure Docker / Postgres ─────────────────────────────
ensure_db() {
  if ! docker info &>/dev/null 2>&1; then
    if command -v colima &>/dev/null; then
      echo "⟳  Starting Colima..."
      colima start
    else
      echo "❌  Docker daemon not running. Run ./setup.sh first."
      exit 1
    fi
  fi

  if ! docker compose ps db --status running 2>/dev/null | grep -q db; then
    echo "⟳  Starting PostgreSQL..."
    docker compose up db -d
    for i in {1..30}; do
      docker compose exec db pg_isready -U postgres &>/dev/null && break
      sleep 1
    done
  fi
  echo "✓  PostgreSQL running"

  cd "$ROOT/backend"
  uv run alembic upgrade head 2>&1 | grep -v "^$" | head -3
  echo "✓  Database up to date"
  cd "$ROOT"
}

# ── API key handling ─────────────────────────────────────
ensure_api_key() {
  if [[ -z "${AR_API_KEY:-}" ]]; then
    AR_API_KEY="$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")"
    export AR_API_KEY
    # Persist to .env so it survives restarts
    echo "AR_API_KEY=$AR_API_KEY" >> "$ROOT/backend/.env"
    echo "⟳  No AR_API_KEY found — generated and saved to backend/.env"
  fi
  echo ""
  echo "  ┌──────────────────────────────────────────┐"
  echo "  │  🔑 API Key (use in frontend Servers UI) │"
  echo "  │                                          │"
  echo "  │  $AR_API_KEY"
  echo "  │                                          │"
  echo "  └──────────────────────────────────────────┘"
  echo ""
}

# ── Commands ─────────────────────────────────────────────
CMD="${1:-all}"

case "$CMD" in
  backend)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Backend"
    echo "══════════════════════════════════════════════"
    ensure_db
    ensure_api_key
    cd "$ROOT/backend"
    echo "⟳  Starting backend on :8000..."
    exec uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    ;;

  frontend)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Frontend"
    echo "══════════════════════════════════════════════"
    cd "$ROOT/frontend"
    echo "⟳  Starting frontend on :5173..."
    exec bun run dev
    ;;

  all|*)
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
    ensure_api_key

    # Start backend
    cd "$ROOT/backend"
    echo "⟳  Starting backend on :8000..."
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!

    # Start frontend
    cd "$ROOT/frontend"
    echo "⟳  Starting frontend on :5173..."
    bun run dev &
    FRONTEND_PID=$!

    sleep 3
    echo ""
    echo "══════════════════════════════════════════════"
    echo "  ✓ All services running!"
    echo ""
    echo "  Backend:   http://localhost:8000"
    echo "  API docs:  http://localhost:8000/docs"
    echo "  Frontend:  http://localhost:5173"
    echo ""
    echo "  Press Ctrl+C to stop everything"
    echo "══════════════════════════════════════════════"

    wait
    ;;
esac
