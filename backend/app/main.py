"""FastAPI application entry point."""

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import notes, projects, providers, runs, sse
from app.config import settings
from app.services.recovery import recover_stuck_runs

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


# ── API Key Auth Middleware ───────────────────────────────

# Paths that never require auth (SSE uses query-param auth instead)
_PUBLIC_PATHS = {"/api/health", "/api/auth/check", "/docs", "/openapi.json", "/redoc"}


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Optional Bearer-token auth.  Disabled when AR_API_KEY is empty."""

    async def dispatch(self, request: Request, call_next):
        if not settings.api_key:
            return await call_next(request)

        path = request.url.path
        # Skip auth for public paths, SSE endpoints (use query param), and CORS preflight
        if path in _PUBLIC_PATHS or request.method == "OPTIONS":
            return await call_next(request)
        if path.endswith("/events") and "/runs/" in path:
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""

        if not token or not hmac.compare_digest(token, settings.api_key):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})

        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await recover_stuck_runs()
    if settings.api_key:
        logger.info("API key authentication is ENABLED")
    else:
        logger.info("API key authentication is DISABLED (no AR_API_KEY set)")
    yield
    # Shutdown — nothing to clean up


app = FastAPI(
    title="AutoResearch Cockpit",
    version="0.1.0",
    description="Control plane for karpathy/autoresearch",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Auth middleware runs AFTER CORS so preflight responses get headers
app.add_middleware(APIKeyMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions so CORS headers are still included."""
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# Mount routers
app.include_router(projects.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(providers.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(sse.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/auth/check")
async def auth_check(request: Request):
    """Check whether the server requires auth, and if the provided key is valid."""
    if not settings.api_key:
        return {"auth_required": False, "authenticated": True}

    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    valid = bool(token) and hmac.compare_digest(token, settings.api_key)
    return {"auth_required": True, "authenticated": valid}
