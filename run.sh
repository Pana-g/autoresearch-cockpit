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

# ── Commands ─────────────────────────────────────────────
CMD="${1:-all}"

case "$CMD" in
  backend)
    echo "══════════════════════════════════════════════"
    echo "  AutoResearch Cockpit — Backend"
    echo "══════════════════════════════════════════════"
    ensure_db
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
