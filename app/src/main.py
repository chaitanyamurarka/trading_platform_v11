# app/main.py - FIXED VERSION
import logging
import sys
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# --- Middleware Imports ---
from src.api.middleware.security_headers import SecurityHeadersMiddleware
from src.api.middleware.rate_limiting import RateLimitMiddleware 

# --- FIXED: Import the live regression router ---
from src.api.routers import market_data_router, regression_router, live_regression_router

# --- Connection Manager Lifecycle ---
from src.api.websockets.connection_manager import startup_connection_manager, shutdown_connection_manager

# --- Logging Configuration ---
from src.utils.logging.config import setup_logging
setup_logging()

# --- FastAPI Application Initialization ---
app = FastAPI(
    title="Trading Platform API",
    description="Backend API for historical data, live data feeds, and strategy execution.",
    version="2.0.0", # Version bump
    docs_url="/docs",
    redoc_url="/redoc"
)

# --- Static File Serving ---
script_dir = os.path.dirname(__file__)
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Joins the project root path with the 'frontend' directory name
frontend_dir = os.path.join(project_root, "frontend")
app.mount("/src", StaticFiles(directory=os.path.join(frontend_dir, "src")), name="src")
app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir,"public", "static")), name="static")
app.mount("/dist", StaticFiles(directory=os.path.join(frontend_dir, "dist")), name="dist")

# --- Middleware Configuration ---
from src.utils.logging.service import log_request, log_response

@app.middleware("http")
async def logging_middleware(request, call_next):
    log_request(request)
    response = await call_next(request)
    log_response(response)
    return response

app.add_middleware(SecurityHeadersMiddleware)
# app.add_middleware(RateLimitMiddleware, calls=100, period=60)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# FIXED: Add more permissive CORS for WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:8080", "http://localhost:3000"], # Add more origins if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # IMPORTANT: Add WebSocket support
    allow_origin_regex=r"^https?://localhost(:\d+)?$"
)

# --- Application Lifecycle Events ---
@app.on_event("startup")
async def startup_event():
    logging.info("Application starting up...")
    await startup_connection_manager()
    # NEW: Load symbols from Redis
    from src.domain.symbols.services.symbol_service import symbol_service
    await symbol_service.load_symbols_from_redis()
    await symbol_service.subscribe_to_symbol_updates()
    logging.info("WebSocket connection manager started. Application startup complete.")

@app.on_event("shutdown")
async def shutdown_event():
    logging.info("Application shutting down...")
    await shutdown_connection_manager()
    from src.domain.symbols.services.symbol_service import symbol_service
    await symbol_service._stop_subscription()
    from src.infrastructure.cache.cache_service import redis_client
    await redis_client.close()
    # FIXED: Clean up live regression service
    from src.domain.analysis.services.live_regression_service import live_regression_service
    await live_regression_service.close()
    logging.info("WebSocket connection manager stopped. Application shutdown complete.")

# --- FIXED: Include ALL routers ---
app.include_router(market_data_router.router)
app.include_router(regression_router.router)
app.include_router(live_regression_router.router)  # ADDED THIS LINE

# --- Root Endpoint ---
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root():
    """Serves the main index.html file."""
    index_path = os.path.join(frontend_dir, "public","index.html")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            return HTMLResponse(content=f.read())
    raise HTTPException(status_code=404, detail="index.html not found")

# --- Health Check Endpoint ---
@app.get("/health/websocket", tags=["Health"])
async def websocket_health():
    """Provides metrics for the WebSocket connection manager."""
    from src.api.websockets.connection_manager import connection_manager
    return {"status": "healthy", "metrics": connection_manager.get_metrics()}

# FIXED: Add live regression health check
@app.get("/health/live-regression", tags=["Health"])
async def live_regression_health():
    """Provides metrics for the live regression service."""
    from src.domain.analysis.services.live_regression_service import live_regression_service
    active_subscriptions = len(live_regression_service.subscriptions)
    active_contexts = len(live_regression_service.calculation_contexts)
    active_redis_subs = len(live_regression_service.redis_subscriptions)
    
    return {
        "status": "healthy",
        "active_subscriptions": active_subscriptions,
        "active_calculation_contexts": active_contexts,
        "active_redis_subscriptions": active_redis_subs,
        "contexts": list(live_regression_service.calculation_contexts.keys())
    }