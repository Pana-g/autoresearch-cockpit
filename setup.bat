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

:: Generate encryption key if not set
if not exist ".env" (
    echo. > .env
)
findstr /c:"AR_ENCRYPTION_KEY" .env >nul 2>&1
if %errorlevel% neq 0 (
    for /f "delims=" %%k in ('uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set "FERNET_KEY=%%k"
    echo AR_ENCRYPTION_KEY=!FERNET_KEY!>> .env
    echo [OK] Generated encryption key - saved to backend\.env
)

echo [OK] Database will be auto-created on first run (SQLite)

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
