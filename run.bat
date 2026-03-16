@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

:: Load .env if it exists (lives in backend/)
if exist "%ROOT%backend\.env" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%ROOT%backend\.env") do (
        set "%%a=%%b"
    )
)

set "CMD=%~1"
if "%CMD%"=="" set "CMD=all"

if /i "%CMD%"=="backend" goto :backend
if /i "%CMD%"=="frontend" goto :frontend
goto :all

:: ── Backend ─────────────────────────────────────────────
:backend
echo ==================================================
echo   AutoResearch Cockpit - Backend
echo ==================================================
call :ensure_db
call :ensure_api_key
cd /d "%ROOT%backend"
echo Starting backend on :8000...
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
goto :eof

:: ── Frontend ────────────────────────────────────────────
:frontend
echo ==================================================
echo   AutoResearch Cockpit - Frontend
echo ==================================================
cd /d "%ROOT%frontend"
echo Starting frontend on :5173...
call bun run dev
goto :eof

:: ── All ─────────────────────────────────────────────────
:all
echo ==================================================
echo   AutoResearch Cockpit - Starting
echo ==================================================
call :ensure_db
call :ensure_api_key

echo Starting backend on :8000...
cd /d "%ROOT%backend"
start "AR-Backend" cmd /c "uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting frontend on :5173...
cd /d "%ROOT%frontend"
start "AR-Frontend" cmd /c "bun run dev"

timeout /t 3 /nobreak >nul
echo.
echo ==================================================
echo   [OK] All services running!
echo.
echo   Backend:   http://localhost:8000
echo   API docs:  http://localhost:8000/docs
echo   Frontend:  http://localhost:5173
echo.
echo   Close the terminal windows to stop services.
echo ==================================================
pause
goto :eof

:: ── Ensure DB ───────────────────────────────────────────
:ensure_db
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Docker daemon not running.
    echo     Start Docker Desktop and try again.
    exit /b 1
)

docker compose ps db --status running 2>nul | findstr /c:"db" >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting PostgreSQL...
    docker compose up db -d
    for /l %%i in (1,1,30) do (
        docker compose exec db pg_isready -U postgres >nul 2>&1 && goto :db_ready
        timeout /t 1 /nobreak >nul
    )
    :db_ready
)
echo [OK] PostgreSQL running

cd /d "%ROOT%backend"
uv run alembic upgrade head 2>nul
echo [OK] Database up to date
cd /d "%ROOT%"
goto :eof

:: ── Ensure API key ──────────────────────────────────────
:ensure_api_key
if defined AR_API_KEY goto :show_key

for /f "delims=" %%k in ('python -c "import secrets; print(secrets.token_urlsafe(32))"') do set "AR_API_KEY=%%k"
echo AR_API_KEY=!AR_API_KEY!>> "%ROOT%backend\.env"
echo Generated API key - saved to backend\.env

:show_key
echo.
echo   ================================================
echo     API Key (use in frontend Servers UI):
echo.
echo     %AR_API_KEY%
echo   ================================================
echo.
goto :eof
