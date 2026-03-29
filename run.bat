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

set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=all"

:: Parse command
if /i "%CMD%"=="backend" ( shift & goto :parse_opts )
if /i "%CMD%"=="frontend" ( shift & goto :parse_opts )
if /i "%CMD%"=="all" ( shift & goto :parse_opts )
if /i "%CMD%"=="help" goto :help
if /i "%CMD%"=="--help" goto :help
if /i "%CMD%"=="-h" goto :help

:: Check if first arg is a flag (no command given)
echo %CMD% | findstr /b "--" >nul 2>&1
if %errorlevel% equ 0 (
    set "CMD=all"
    goto :parse_opts
)

echo Error: unknown command '%CMD%'
echo.
goto :help

:parse_opts
if "%~1"=="" goto :dispatch
if /i "%~1"=="--backend-port" (
    if "%~2"=="" (
        echo Error: --backend-port requires a value
        echo.
        goto :help
    )
    echo %~2 | findstr /r "^[0-9][0-9]*$" >nul 2>&1
    if errorlevel 1 (
        echo Error: --backend-port must be numeric
        echo.
        goto :help
    )
    set "BACKEND_PORT=%~2"
    shift & shift
    goto :parse_opts
)
if /i "%~1"=="--frontend-port" (
    if "%~2"=="" (
        echo Error: --frontend-port requires a value
        echo.
        goto :help
    )
    echo %~2 | findstr /r "^[0-9][0-9]*$" >nul 2>&1
    if errorlevel 1 (
        echo Error: --frontend-port must be numeric
        echo.
        goto :help
    )
    set "FRONTEND_PORT=%~2"
    shift & shift
    goto :parse_opts
)
echo Error: unknown option '%~1'
echo.
goto :help

:dispatch
call :check_prereqs
if errorlevel 1 exit /b 1

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
echo Starting backend on :%BACKEND_PORT%...
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port %BACKEND_PORT%
goto :eof

:: ── Frontend ────────────────────────────────────────────
:frontend
echo ==================================================
echo   AutoResearch Cockpit - Frontend
echo ==================================================
cd /d "%ROOT%frontend"
echo Starting frontend on :%FRONTEND_PORT%...
call bun run dev --port %FRONTEND_PORT%
goto :eof

:: ── All ─────────────────────────────────────────────────
:all
echo ==================================================
echo   AutoResearch Cockpit - Starting
echo ==================================================
call :ensure_db

echo Starting backend on :%BACKEND_PORT%...
cd /d "%ROOT%backend"
start "AR-Backend" cmd /c "uv run uvicorn app.main:app --reload --host 0.0.0.0 --port %BACKEND_PORT%"

echo Starting frontend on :%FRONTEND_PORT%...
cd /d "%ROOT%frontend"
start "AR-Frontend" cmd /c "bun run dev --port %FRONTEND_PORT%"

timeout /t 3 /nobreak >nul
echo.
echo ==================================================
echo   [OK] All services running!
echo.
echo   Backend:   http://localhost:%BACKEND_PORT%
echo   API docs:  http://localhost:%BACKEND_PORT%/docs
echo   Frontend:  http://localhost:%FRONTEND_PORT%
echo.
echo   Close the terminal windows to stop services.
echo ==================================================
pause
goto :eof

:: ── Help ────────────────────────────────────────────────
:help
echo Usage: %~nx0 [command] [options]
echo.
echo Commands:
echo   all        Start both backend and frontend (default)
echo   backend    Start only the backend
echo   frontend   Start only the frontend
echo   help       Show this help message
echo.
echo Options:
echo   --backend-port PORT   Backend port (default: 8000)
echo   --frontend-port PORT  Frontend port (default: 5173)
goto :eof

:: ── Prerequisite checks ────────────────────────────────
:check_prereqs
set MISSING=0
set NEED_UV=0
set NEED_BUN=0

if /i "%CMD%"=="backend" set NEED_UV=1
if /i "%CMD%"=="frontend" set NEED_BUN=1
if /i "%CMD%"=="all" (
    set NEED_UV=1
    set NEED_BUN=1
)

if %NEED_UV% equ 1 (
    where uv >nul 2>&1
    if errorlevel 1 (
        echo [X] Missing dependency: uv
        echo     Install: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 ^| iex"
        set MISSING=1
    )
)

if %NEED_BUN% equ 1 (
    where bun >nul 2>&1
    if errorlevel 1 (
        echo [X] Missing dependency: bun
        echo     Install: powershell -c "irm bun.sh/install.ps1 ^| iex"
        set MISSING=1
    )
)

if %MISSING% equ 1 (
    echo.
    echo Run setup.bat to install dependencies automatically, then try again.
    exit /b 1
)

exit /b 0

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
