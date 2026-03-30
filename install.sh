#!/usr/bin/env bash
# install.sh — Download and install AutoResearch Cockpit binary
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --dir /custom/path
#   curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --uninstall
#   curl -fsSL https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.sh | bash -s -- --uninstall --keep-data
#
set -euo pipefail

REPO="Pana-g/autoresearch-cockpit"
BINARY_NAME="autoresearch-cockpit"
INSTALL_DIR="${HOME}/.local/bin"
ACTION="install"
WIPE_DATA=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Error: --dir requires a value"
        exit 1
      fi
      INSTALL_DIR="$2"
      shift 2
      ;;
    --version)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Error: --version requires a value"
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    --keep-data)
      WIPE_DATA=0
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: install.sh [--dir /path] [--version v0.5.4] [--uninstall] [--keep-data]"
      exit 1
      ;;
  esac
done

# ── Uninstall ────────────────────────────────────────────
if [[ "$ACTION" == "uninstall" ]]; then
  TARGET="${INSTALL_DIR}/${BINARY_NAME}"
  if [[ -f "$TARGET" ]]; then
    rm -f "$TARGET"
    echo "✓ Removed ${TARGET}"
  else
    echo "Nothing to uninstall — ${TARGET} not found"
  fi
  # Clean up data directory
  DATA_DIR="${HOME}/.autoresearch"
  if [[ -d "$DATA_DIR" ]]; then
    if [[ "$WIPE_DATA" -eq 1 ]]; then
      rm -rf "$DATA_DIR"
      echo "✓ Removed ${DATA_DIR}"
    else
      echo "Kept ${DATA_DIR} (--keep-data)"
    fi
  fi
  exit 0
fi

if ! command -v curl &>/dev/null; then
  echo "Error: curl is required to install AutoResearch Cockpit."
  case "$(uname -s)" in
    Darwin)
      echo "Install with: brew install curl"
      ;;
    Linux)
      echo "Install with your distro package manager, e.g.:"
      echo "  Debian/Ubuntu: sudo apt update && sudo apt install -y curl"
      echo "  Fedora: sudo dnf install curl"
      ;;
    *)
      echo "Please install curl and re-run this installer."
      ;;
  esac
  exit 1
fi

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)  PLATFORM_OS="macos" ;;
  Linux)   PLATFORM_OS="linux" ;;
  *)
    echo "Error: Unsupported OS '$OS'. Use the PowerShell installer for Windows:"
    echo "  irm https://raw.githubusercontent.com/Pana-g/autoresearch-cockpit/main/install.ps1 | iex"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)         PLATFORM_ARCH="x64" ;;
  aarch64|arm64)        PLATFORM_ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture '$ARCH'"
    exit 1
    ;;
esac

ASSET="${BINARY_NAME}-${PLATFORM_OS}-${PLATFORM_ARCH}"

# Resolve version (latest release if not specified)
if [[ -z "${VERSION:-}" ]]; then
  echo "Fetching latest release..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  if [[ -z "$VERSION" ]]; then
    echo "Error: Could not determine latest release version"
    exit 1
  fi
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"

echo "AutoResearch Cockpit installer"
echo "  Version:  ${VERSION}"
echo "  Platform: ${PLATFORM_OS}-${PLATFORM_ARCH}"
echo "  Install:  ${INSTALL_DIR}/${BINARY_NAME}"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download
echo "Downloading ${DOWNLOAD_URL}..."
if ! curl -fSL --progress-bar -o "${INSTALL_DIR}/${BINARY_NAME}" "$DOWNLOAD_URL"; then
  echo ""
  echo "Error: Download failed. Check that release ${VERSION} exists and has asset '${ASSET}'."
  echo "  Releases: https://github.com/${REPO}/releases"
  rm -f "${INSTALL_DIR}/${BINARY_NAME}"
  exit 1
fi

chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

# macOS: remove quarantine flag
if [[ "$OS" == "Darwin" ]]; then
  xattr -d com.apple.quarantine "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || true
fi

echo ""
echo "✓ Installed ${BINARY_NAME} ${VERSION} to ${INSTALL_DIR}/${BINARY_NAME}"

# Check if install dir is in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "⚠ ${INSTALL_DIR} is not in your PATH. Add it with:"
  SHELL_NAME="$(basename "$SHELL")"
  case "$SHELL_NAME" in
    zsh)  RC="~/.zshrc" ;;
    bash) RC="~/.bashrc" ;;
    fish) RC="~/.config/fish/config.fish" ;;
    *)    RC="your shell config" ;;
  esac
  echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ${RC}"
  echo ""
fi

echo ""
echo "Run it:"
echo "  ${BINARY_NAME}                  # start backend + frontend"
echo "  ${BINARY_NAME} backend          # backend API only"
echo "  ${BINARY_NAME} frontend         # frontend only"
echo "  ${BINARY_NAME} --help           # see all options"
echo ""
echo "Uninstall:"
echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --uninstall"
echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --uninstall --keep-data"
