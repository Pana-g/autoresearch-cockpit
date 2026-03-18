@echo off
REM scripts\build.bat — Build a self-contained AutoResearch Cockpit executable for Windows
REM
REM Usage:
REM   scripts\build.bat             (builds for Windows x64)
REM   scripts\build.bat --clean     (removes dist\ and build\ dirs first)
REM
REM Prerequisites:
REM   - Python 3.12+  https://www.python.org/downloads/
REM   - uv            https://docs.astral.sh/uv/
REM   - Bun           https://bun.sh/
REM
REM Output:
REM   backend\dist\autoresearch-cockpit.exe
REM   dist\autoresearch-cockpit-windows-x64.zip

setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "FRONTEND=%ROOT%\frontend"
set "BACKEND=%ROOT%\backend"
set "DIST=%ROOT%\dist"
set "PLATFORM=windows-x64"

echo =^> AutoResearch Cockpit build script (Windows)
echo    Root:    %ROOT%
echo    Backend: %BACKEND%
echo.

REM ── Optional clean ──────────────────────────────────────
if "%1"=="--clean" (
  echo =^> Cleaning previous build artifacts...
  if exist "%BACKEND%\build"        rmdir /s /q "%BACKEND%\build"
  if exist "%BACKEND%\dist"         rmdir /s /q "%BACKEND%\dist"
  if exist "%BACKEND%\frontend_dist" rmdir /s /q "%BACKEND%\frontend_dist"
  if exist "%DIST%"                 rmdir /s /q "%DIST%"
)

REM ── Step 1: Build frontend ───────────────────────────────
echo =^> Step 1/4: Building frontend...
cd /d "%FRONTEND%"
call bun install --frozen-lockfile
if errorlevel 1 ( echo ERROR: bun install failed & exit /b 1 )
call bun run build
if errorlevel 1 ( echo ERROR: bun run build failed & exit /b 1 )
echo    Frontend built -^> frontend\dist

REM ── Step 2: Stage frontend ───────────────────────────────
echo =^> Step 2/4: Staging frontend for bundling...
if exist "%BACKEND%\frontend_dist" rmdir /s /q "%BACKEND%\frontend_dist"
xcopy "%FRONTEND%\dist" "%BACKEND%\frontend_dist\" /E /I /Q
if errorlevel 1 ( echo ERROR: xcopy failed & exit /b 1 )
echo    Staged -^> backend\frontend_dist

REM ── Step 3: Install deps ─────────────────────────────────
echo =^> Step 3/4: Installing backend dependencies...
cd /d "%BACKEND%"
call uv sync --all-extras
if errorlevel 1 ( echo ERROR: uv sync failed & exit /b 1 )
call uv pip install pyinstaller --quiet
if errorlevel 1 ( echo ERROR: pyinstaller install failed & exit /b 1 )
echo    Dependencies ready

REM ── Step 4: Build binary ─────────────────────────────────
echo =^> Step 4/4: Running PyInstaller...
cd /d "%BACKEND%"
call uv run pyinstaller autoresearch-cockpit.spec --noconfirm --clean
if errorlevel 1 ( echo ERROR: PyInstaller failed & exit /b 1 )
echo    Binary built -^> backend\dist\autoresearch-cockpit.exe

REM ── Package ──────────────────────────────────────────────
echo =^> Packaging release archive...
if not exist "%DIST%" mkdir "%DIST%"
if exist "%ROOT%\.env.example" copy "%ROOT%\.env.example" "%BACKEND%\dist\.env.example"

powershell -NoProfile -Command ^
  "Compress-Archive -Path '%BACKEND%\dist\autoresearch-cockpit.exe','%BACKEND%\dist\.env.example' -DestinationPath '%DIST%\autoresearch-cockpit-%PLATFORM%.zip' -Force"

echo.
echo *** Build complete! ***
echo   Binary:  %BACKEND%\dist\autoresearch-cockpit.exe
echo   Archive: %DIST%\autoresearch-cockpit-%PLATFORM%.zip
echo.
echo To test locally:
echo   1. Start PostgreSQL:  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name arc-db postgres:16
echo   2. Create .env:       copy .env.example .env  ^(fill in AR_ENCRYPTION_KEY^)
echo   3. Run the binary:    %BACKEND%\dist\autoresearch-cockpit.exe
echo   4. Open browser:      http://localhost:8000
