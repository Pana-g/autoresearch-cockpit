@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo   AutoResearch Cockpit - Setup (Windows)
echo ==================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

:: ── 1. Check prerequisites ──────────────────────────────
set MISSING=0

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] python not found.
    echo     Install Python 3.12+: https://www.python.org/downloads/
    set MISSING=1
) else (
    echo [OK] python found
)

where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] bun not found.
    echo     Install bun: powershell -c "irm bun.sh/install.ps1 | iex"
    set MISSING=1
) else (
    echo [OK] bun found
)

:: uv
where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing uv...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    :: Refresh PATH
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    where uv >nul 2>&1
    if %errorlevel% neq 0 (
        echo [X] uv installation failed. Please install manually: https://docs.astral.sh/uv/
        set MISSING=1
    ) else (
        echo [OK] uv installed
    )
) else (
    echo [OK] uv found
)

if %MISSING% equ 1 (
    echo.
    echo Install the missing tools above, then re-run this script.
    exit /b 1
)

:: ── 2. Backend setup ─────────────────────────────────────
echo.
echo Setting up backend...
cd /d "%ROOT%backend"
uv sync
echo [OK] Backend dependencies installed
echo [OK] Database will be auto-created on first run (SQLite)
echo [OK] Encryption key will be auto-generated on first run

:: ── 3. Frontend setup ────────────────────────────────────
echo.
echo Setting up frontend...
cd /d "%ROOT%frontend"
call bun install
echo [OK] Frontend dependencies installed

:: ── Done ──────────────────────────────────────────────────
echo.
echo ==================================================
echo   [OK] Setup complete!
echo.
echo   Run the app:  run.bat
echo ==================================================
