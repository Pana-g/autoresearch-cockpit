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
set "DB_URL=%AR_DATABASE_URL%"
if not defined DB_URL set "DB_URL=sqlite"

echo %DB_URL% | findstr /i "postgresql" >nul 2>&1
if %errorlevel% equ 0 (
    echo Running Alembic migrations (PostgreSQL)...
    cd /d "%ROOT%backend"
    uv run alembic upgrade head
    echo [OK] Database up to date
    cd /d "%ROOT%"
) else (
    echo [OK] SQLite database will be auto-created on first run
)
goto :eof
