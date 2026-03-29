# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for AutoResearch Cockpit.

Before running this spec, the frontend must be built and copied:
  cd frontend && bun install && bun run build
  cp -r frontend/dist backend/frontend_dist   (macOS/Linux)
  xcopy frontend\dist backend\frontend_dist /E /I  (Windows)

Then build with:
  cd backend
  pyinstaller autoresearch-cockpit.spec
"""

from pathlib import Path

HERE = Path(SPECPATH)  # noqa: F821  (SPECPATH is injected by PyInstaller)

a = Analysis(
    [str(HERE / "server.py")],
    pathex=[str(HERE)],
    binaries=[],
    datas=[
        # Bundled frontend (built Vite output)
        (str(HERE / "frontend_dist"), "frontend_dist"),
        # Alembic migrations
        (str(HERE / "alembic"), "alembic"),
        (str(HERE / "alembic.ini"), "."),
    ],
    hiddenimports=[
        # App modules (dynamic imports)
        "app",
        "app.main",
        "app.config",
        "app.db",
        "app.schemas",
        "app.api",
        "app.api.projects",
        "app.api.runs",
        "app.api.providers",
        "app.api.notes",
        "app.api.sse",
        "app.api.channels",
        "app.models",
        "app.models.base",
        "app.models.project",
        "app.models.run",
        "app.models.provider",
        "app.models.state_machine",
        "app.services",
        "app.services.run_engine",
        "app.services.git_service",
        "app.services.prompt_builder",
        "app.services.patch_validator",
        "app.services.encryption",
        "app.services.event_bus",
        "app.services.recovery",
        "app.services.compaction",
        "app.services.model_cache",
        "app.providers",
        "app.providers.base",
        "app.providers.registry",
        "app.providers.anthropic_provider",
        "app.providers.openai_provider",
        "app.providers.google_provider",
        "app.providers.ollama_provider",
        "app.providers.openrouter_provider",
        "app.providers.copilot_provider",
        # uvicorn internals (not auto-detected)
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.off",
        "uvicorn.lifespan.on",
        # SQLAlchemy dialects
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.sqlite.aiosqlite",
        # Async support
        "aiosqlite",
        # Alembic
        "alembic",
        "alembic.config",
        "alembic.command",
        "alembic.runtime.migration",
        "alembic.operations",
        # Other
        "cryptography",
        "cryptography.fernet",
        "multiprocessing.util",
        "email.mime.text",
        "email.mime.multipart",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "PIL",
        "scipy",
        "numpy",
        "pandas",
        "jupyter",
        "IPython",
    ],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="autoresearch-cockpit",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
