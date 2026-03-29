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
REM   dist\autoresearch-cockpit-windows-x64.exe
REM   dist\.env.example

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
echo =^> Packaging release...
if not exist "%DIST%" mkdir "%DIST%"
copy "%BACKEND%\dist\autoresearch-cockpit.exe" "%DIST%\autoresearch-cockpit-%PLATFORM%.exe"
if exist "%ROOT%\.env.example" copy "%ROOT%\.env.example" "%DIST%\.env.example"

echo.
echo *** Build complete! ***
echo   Binary:  %DIST%\autoresearch-cockpit-%PLATFORM%.exe
echo.
echo To test locally:
echo   1. Run the binary:    %DIST%\autoresearch-cockpit-%PLATFORM%.exe
echo   2. Open browser:      http://localhost:8000
