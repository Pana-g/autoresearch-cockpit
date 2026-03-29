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
#   dist/autoresearch-cockpit-<platform>   — the standalone binary (e.g. autoresearch-cockpit-darwin-arm64)
#   dist/.env.example                      — template environment file

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
echo "==> Packaging release..."
mkdir -p "$DIST"
BINARY="$BACKEND/dist/autoresearch-cockpit"
OUT_BINARY="$DIST/autoresearch-cockpit-${PLATFORM}"

cp "$BINARY" "$OUT_BINARY"
chmod +x "$OUT_BINARY"
cp "$ROOT/.env.example" "$DIST/.env.example" 2>/dev/null || true

echo ""
echo "✓ Build complete!"
echo "  Binary: $OUT_BINARY"
echo ""
echo "To test locally:"
echo "  1. Run the binary:    $OUT_BINARY"
echo "  2. Open browser:      http://localhost:8000"
