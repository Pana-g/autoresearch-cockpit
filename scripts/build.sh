#!/usr/bin/env bash
# scripts/build.sh — Build a self-contained AutoResearch Cockpit binary for macOS or Linux
#
# Usage:
#   ./scripts/build.sh             # builds for the current platform
#   ./scripts/build.sh --clean     # removes dist/ and build/ dirs first
#
# Prerequisites:
#   - Python 3.12+ with uv  (https://docs.astral.sh/uv/)
#   - Bun                   (https://bun.sh/)
#
# Output:
#   dist/autoresearch-cockpit      — the standalone binary
#   dist/autoresearch-cockpit.tar.gz — ready-to-ship archive

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
DIST="$ROOT/dist"

CLEAN=false
for arg in "$@"; do
  [[ "$arg" == "--clean" ]] && CLEAN=true
done

echo "==> AutoResearch Cockpit build script"
echo "    Root:    $ROOT"
echo "    Backend: $BACKEND"
echo ""

# ── Detect platform ──────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
[[ "$ARCH" == "x86_64" ]] && ARCH="x64"
[[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] && ARCH="arm64"
PLATFORM="${OS}-${ARCH}"
echo "==> Platform: $PLATFORM"

# ── Optional clean ───────────────────────────────────────
if $CLEAN; then
  echo "==> Cleaning previous build artifacts..."
  rm -rf "$BACKEND/build" "$BACKEND/dist" "$BACKEND/frontend_dist" "$DIST"
fi

# ── Step 1: Build frontend ───────────────────────────────
echo ""
echo "==> Step 1/4: Building frontend..."
cd "$FRONTEND"
bun install --frozen-lockfile
bun run build
echo "    Frontend built → frontend/dist"

# ── Step 2: Copy frontend dist into backend ──────────────
echo ""
echo "==> Step 2/4: Staging frontend for bundling..."
rm -rf "$BACKEND/frontend_dist"
cp -r "$FRONTEND/dist" "$BACKEND/frontend_dist"
echo "    Staged → backend/frontend_dist"

# ── Step 3: Install backend deps + PyInstaller ───────────
echo ""
echo "==> Step 3/4: Installing backend dependencies..."
cd "$BACKEND"
uv sync --all-extras
uv pip install pyinstaller --quiet
echo "    Dependencies ready"

# ── Step 4: Build binary ─────────────────────────────────
echo ""
echo "==> Step 4/4: Running PyInstaller..."
cd "$BACKEND"
uv run pyinstaller autoresearch-cockpit.spec \
  --noconfirm \
  --clean
echo "    Binary built → backend/dist/autoresearch-cockpit"

# ── Package ──────────────────────────────────────────────
echo ""
echo "==> Packaging release archive..."
mkdir -p "$DIST"
BINARY="$BACKEND/dist/autoresearch-cockpit"
ARCHIVE="$DIST/autoresearch-cockpit-${PLATFORM}.tar.gz"

cp "$ROOT/.env.example" "$BACKEND/dist/.env.example" 2>/dev/null || true

tar -czf "$ARCHIVE" -C "$BACKEND/dist" autoresearch-cockpit .env.example 2>/dev/null || \
  tar -czf "$ARCHIVE" -C "$BACKEND/dist" autoresearch-cockpit

echo ""
echo "✓ Build complete!"
echo "  Binary:  $BINARY"
echo "  Archive: $ARCHIVE"
echo ""
echo "To test locally:"
echo "  1. Start PostgreSQL:  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name arc-db postgres:16"
echo "  2. Create .env:       cp $BACKEND/dist/.env.example /tmp/arc-test/.env  (fill in AR_ENCRYPTION_KEY)"
echo "  3. Run the binary:    $BINARY"
echo "  4. Open browser:      http://localhost:8000"
