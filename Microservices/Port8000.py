# Port 8000 - Main API Gateway Service
import logging
import sys
import os
import uuid
import time
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request, Query, Depends, WebSocket, WebSocketDisconnect # Modified
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.websockets import WebSocketState
import redis.asyncio as aioredis
import secrets
import httpx
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import websockets 
from urllib.parse import quote, urlencode

load_dotenv()

# Configuration
class Settings(BaseSettings):
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Microservice URLs
    SYMBOL_SERVICE_URL: str = "http://localhost:8001"
    HISTORICAL_REGULAR_URL: str = "http://localhost:8002"
    WEBSOCKET_REGULAR_URL: str = "http://localhost:8003"
    HISTORICAL_HEIKIN_ASHI_URL: str = "http://localhost:8004"
    WEBSOCKET_HEIKIN_ASHI_URL: str = "http://localhost:8005"
    REGRESSION_SERVICE_URL: str = "http://localhost:8006"
    LIVE_REGRESSION_URL: str = "http://localhost:8007"

settings = Settings()

from logging_config import setup_logging, correlation_id
setup_logging("gateway")
logger = logging.getLogger(__name__)

# Redis Client
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

# Schemas
class SessionInfo(BaseModel):
    session_token: str

class Symbol(BaseModel):
    symbol: str
    exchange: str

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.tailwindcss.com; "
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://cdnjs.cloudflare.com; "
            "img-src 'self' data: https://placehold.co; "
            "connect-src 'self' ws: wss:; "
            "object-src 'none'; "
            "frame-ancestors 'none';"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        return response

# Rate Limiting Middleware
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, calls: int = 100, period: int = 60):
        super().__init__(app)
        self.calls = calls
        self.period = period

    async def dispatch(self, request: Request, call_next):
        # Exclude static files and health checks from rate limiting
        if (request.url.path.startswith("/static/") or 
            request.url.path.startswith("/dist/") or 
            request.url.path == "/health/" or 
            request.url.path == "/"):
            return await call_next(request)

        client_ip = request.client.host
        current_time = time.time()
        key = f"rate_limit:{client_ip}"

        # Get existing data
        data = await redis_client.get(key)
        if data:
            requests = json.loads(data)
            # DEBUG: Log cache operation - data transformation
            logger.debug(f"Rate limit cache data retrieved for {client_ip}: {requests}")
            requests = [req_time for req_time in requests 
                       if current_time - req_time < self.period]
        else:
            requests = []
        
        # Check if limit exceeded
        if len(requests) >= self.calls:
            logger.warning(f"Rate limit triggered for IP: {client_ip}. {len(requests)} requests in {self.period} seconds.")
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

        # Add current request
        requests.append(current_time)
        # DEBUG: Log cache operation - setting data
        logger.debug(f"Rate limit cache data set for {client_ip}: {requests}")
        await redis_client.setex(key, self.period, json.dumps(requests))
        
        return await call_next(request)

# FastAPI App
app = FastAPI(
    title="Trading Platform API Gateway",
    description="Main gateway for the trading platform microservices",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


# Middleware
@app.middleware("http")
async def logging_middleware(request, call_next):
    logger.info(f"Received request: {request.method} {request.url}")
    logger.info(f"Client IP: {request.client.host}")
    response = await call_next(request)
    logger.info(f"Sent response with status code: {response.status_code}")
    return response

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, calls=100, period=60)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:8080", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"^https?://localhost(:\d+)?$"
)

# HTTP Client
http_client = httpx.AsyncClient(timeout=30.0)

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("API Gateway starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("API Gateway shutting down...")
    await redis_client.close()
    await http_client.aclose()

# Session Management
@app.get("/utils/session/initiate", response_model=SessionInfo, tags=["Session"])
async def initiate_session():
    """Generate a new unique session token for a client."""
    session_token = str(uuid.uuid4())
    # DEBUG: Log raw Redis message for session creation
    logger.debug(f"Redis SET command for session: session:{session_token} with expiry 60*45")
    await redis_client.set(f"session:{session_token}", int(time.time()), ex=60 * 45)
    logger.info(f"New session created: {session_token}")
    return SessionInfo(session_token=session_token)

@app.post("/utils/session/heartbeat", response_model=dict, tags=["Session"])
async def session_heartbeat(session: SessionInfo):
    """Refresh the TTL of an active session token."""
    token_key = f"session:{session.session_token}"
    if await redis_client.exists(token_key):
        # DEBUG: Log raw Redis message for session heartbeat
        logger.debug(f"Redis EXPIRE command for session: {token_key} with expiry 60*45")
        await redis_client.expire(token_key, 60 * 45)
        return {"status": "ok"}
    else:
        logger.warning(f"Session heartbeat failed: Session {session.session_token} not found or expired.")
        raise HTTPException(status_code=404, detail="Session not found or expired.")

# Symbol Service Proxy
@app.get("/symbols", response_model=List[Symbol], tags=["Symbols"])
async def get_available_symbols():
    """Proxy request to Symbol Service."""
    try:
        response = await http_client.get(f"{settings.SYMBOL_SERVICE_URL}/symbols")
        response.raise_for_status()
        logger.info(f"Successfully fetched symbols from Symbol Service. Count: {len(response.json())}")
        return response.json()
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Symbol Service: {e}")
        raise HTTPException(status_code=503, detail="Symbol Service unavailable")
    except httpx.HTTPStatusError as e:
        logger.error(f"Symbol Service returned error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail="Symbol Service error")

# Historical Data Proxy Routes
@app.get("/historical/", tags=["Historical Data"])
async def fetch_historical_data(request: Request): # MODIFIED
    """Proxy request to Historical Regular Data Service."""
    try:
        response = await http_client.get(
            f"{settings.HISTORICAL_REGULAR_URL}/historical/", 
            params=request.query_params # MODIFIED
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched historical regular data. Count: {len(data)}")
        return data
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Historical Regular Service: {e}")
        raise HTTPException(status_code=503, detail="Historical Regular Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Historical Regular Service error")

@app.get("/historical/chunk", tags=["Historical Data"])
async def fetch_historical_chunk(request: Request): # MODIFIED
    """Proxy request to Historical Regular Data Service."""
    try:
        response = await http_client.get(
            f"{settings.HISTORICAL_REGULAR_URL}/historical/chunk", 
            params=request.query_params # MODIFIED
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched historical regular data chunk. Count: {len(data)}")
        return data
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Historical Regular Service: {e}")
        raise HTTPException(status_code=503, detail="Historical Regular Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Historical Regular Service error")

@app.websocket("/ws/live/{symbol}/{interval}/{timezone:path}")
async def websocket_proxy_regular(
    client_ws: WebSocket,
    symbol: str,
    interval: str,
    timezone: str
):
    """
    Accepts a client WebSocket connection and proxies it to the
    Regular Data Service on Port 8003.
    """
    await client_ws.accept()

    # URL-encode path segments to handle special characters
    encoded_symbol = quote(symbol)
    encoded_interval = quote(interval)
    encoded_timezone = quote(timezone)

    # Construct the backend URI for the Regular Data Service (Port 8003)
    backend_uri = (
        f"{settings.WEBSOCKET_REGULAR_URL.replace('http', 'ws')}/ws/live/"
        f"{encoded_symbol}/{encoded_interval}/{encoded_timezone}"
    )
    
    try:
        # Connect to the backend WebSocket service
        async with websockets.connect(backend_uri) as backend_ws:
            
            # Task to forward messages from client to backend
            async def forward_client_to_backend():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        logger.debug(f"Forwarding client message to backend (regular): {data}")
                        await backend_ws.send(data)
                except WebSocketDisconnect:
                    logger.info(f"Client disconnected for regular data on {symbol}")
                except Exception as e:
                    logger.error(f"Error forwarding from client (regular): {e}")

            # Task to forward messages from backend to client
            async def forward_backend_to_client():
                try:
                    while True:
                        data = await backend_ws.recv()
                        logger.debug(f"Forwarding backend message to client (regular): {data}")
                        await client_ws.send_text(data)
                except Exception as e:
                    logger.error(f"Error forwarding from backend (regular): {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_client_to_backend(),
                forward_backend_to_client()
            )

    except Exception as e:
        logger.error(f"Could not connect to backend WebSocket at {backend_uri}: {e}")
    finally:
        # Ensure client connection is closed if it's still open
        if client_ws.client_state != WebSocketState.DISCONNECTED:
            await client_ws.close()
        
        logger.info(f"Closed proxy connection for regular data: {symbol}/{interval}/{timezone}")

# Heikin Ashi Data Proxy Routes
@app.get("/heikin-ashi/", tags=["Heikin Ashi Data"])
async def fetch_heikin_ashi_data(request: Request): # MODIFIED
    """Proxy request to Heikin Ashi Historical Data Service."""
    try:
        response = await http_client.get(
            f"{settings.HISTORICAL_HEIKIN_ASHI_URL}/heikin-ashi/", 
            params=request.query_params # MODIFIED
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched Heikin Ashi historical data. Count: {len(data)}")
        return data
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Heikin Ashi Historical Service: {e}")
        raise HTTPException(status_code=503, detail="Heikin Ashi Historical Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Heikin Ashi Historical Service error")

@app.get("/heikin-ashi/chunk", tags=["Heikin Ashi Data"])
async def fetch_heikin_ashi_chunk(request: Request): # MODIFIED
    """Proxy request to Heikin Ashi Historical Data Service."""
    try:
        response = await http_client.get(
            f"{settings.HISTORICAL_HEIKIN_ASHI_URL}/heikin-ashi/chunk", 
            params=request.query_params # MODIFIED
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Successfully fetched Heikin Ashi historical data chunk. Count: {len(data)}")
        return data
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Heikin Ashi Historical Service: {e}")
        raise HTTPException(status_code=503, detail="Heikin Ashi Historical Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Heikin Ashi Historical Service error")

@app.websocket("/ws-ha/live/{symbol}/{interval}/{timezone:path}")
async def websocket_proxy_heikin_ashi(
    client_ws: WebSocket,
    symbol: str,
    interval: str,
    timezone: str
):
    """
    Accepts a client WebSocket connection and proxies it to the
    Heikin Ashi service on Port 8005.
    """
    await client_ws.accept()

    # --- FIX: URL-encode path segments to handle special characters ---
    encoded_symbol = quote(symbol)
    encoded_interval = quote(interval)
    encoded_timezone = quote(timezone)

    backend_uri = (
        f"{settings.WEBSOCKET_HEIKIN_ASHI_URL.replace('http', 'ws')}/ws-ha/live/"
        f"{encoded_symbol}/{encoded_interval}/{encoded_timezone}"
    )
    
    try:
        # Connect to the backend WebSocket service
        async with websockets.connect(backend_uri) as backend_ws:
            
            # Task to forward messages from client to backend
            async def forward_client_to_backend():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        logger.debug(f"Forwarding client message to backend (Heikin Ashi): {data}")
                        await backend_ws.send(data)
                except WebSocketDisconnect:
                    logger.info(f"Client disconnected for {symbol}")
                except Exception as e:
                    logger.error(f"Error forwarding from client: {e}")

            # Task to forward messages from backend to client
            async def forward_backend_to_client():
                try:
                    while True:
                        data = await backend_ws.recv()
                        logger.debug(f"Forwarding backend message to client (Heikin Ashi): {data}")
                        await client_ws.send_text(data)
                except Exception as e:
                    logger.error(f"Error forwarding from backend: {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_client_to_backend(),
                forward_backend_to_client()
            )

    except Exception as e:
        logger.error(f"Could not connect to backend WebSocket at {backend_uri}: {e}")
    finally:
        # Ensure client connection is closed if it's still open
        if client_ws.client_state != WebSocketState.DISCONNECTED:
            await client_ws.close()
        
        # --- FIX: Corrected log message ---
        logger.info(f"Closed proxy connection for {symbol}/{interval}/{timezone}")

# Regression Proxy Routes
@app.post("/regression", tags=["Regression"])
async def calculate_regression(request_data: dict):
    """Proxy request to Regression Service."""
    try:
        response = await http_client.post(f"{settings.REGRESSION_SERVICE_URL}/regression", json=request_data)
        response.raise_for_status()
        logger.info(f"Successfully calculated regression. Response status: {response.status_code}")
        return response.json()
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Regression Service: {e}")
        raise HTTPException(status_code=503, detail="Regression Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Regression Service error")

@app.post("/regression/page", tags=["Regression"])
async def get_regression_page(request_data: dict):
    """Proxy request for a page of regression results."""
    try:
        response = await http_client.post(
            f"{settings.REGRESSION_SERVICE_URL}/regression/page", 
            json=request_data
        )
        response.raise_for_status()
        logger.info(f"Successfully fetched regression page. Response status: {response.status_code}")
        return response.json()
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Regression Service: {e}")
        raise HTTPException(status_code=503, detail="Regression Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Regression Service error")

# Live Regression Status
@app.get("/live-regression/status", tags=["Live Regression"])
async def get_live_regression_status():
    """Proxy request to Live Regression Service."""
    try:
        response = await http_client.get(f"{settings.LIVE_REGRESSION_URL}/live-regression/status")
        response.raise_for_status()
        logger.info(f"Successfully fetched live regression status. Response status: {response.status_code}")
        return response.json()
    except httpx.RequestError as e:
        logger.error(f"Error connecting to Live Regression Service: {e}")
        raise HTTPException(status_code=503, detail="Live Regression Service unavailable")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Live Regression Service error")

@app.websocket("/ws/live-regression/{symbol}/{exchange}")
async def websocket_proxy_live_regression(
    client_ws: WebSocket,
    symbol: str,
    exchange: str
):
    """
    Accepts a client WebSocket connection and proxies it to the
    Live Regression Service on Port 8007, including query parameters.
    """
    await client_ws.accept()

    # URL-encode path segments to handle special characters
    encoded_symbol = quote(symbol)
    encoded_exchange = quote(exchange)
    
    # --- FIX: Preserve and encode query parameters from the original request ---
    query_string = urlencode(client_ws.query_params)

    # Construct the backend URI for the Live Regression Service (Port 8007)
    backend_uri = (
        f"{settings.LIVE_REGRESSION_URL.replace('http', 'ws')}/ws/live-regression/"
        f"{encoded_symbol}/{encoded_exchange}?{query_string}"
    )
    
    logger.info(f"Proxying live regression to: {backend_uri}")

    try:
        # Connect to the backend WebSocket service
        async with websockets.connect(backend_uri) as backend_ws:
            
            # Task to forward messages from client to backend
            async def forward_client_to_backend():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        logger.debug(f"Forwarding client message to backend (live regression): {data}")
                        await backend_ws.send(data)
                except WebSocketDisconnect:
                    logger.info(f"Client disconnected for live regression on {symbol}")
                except Exception as e:
                    logger.error(f"Error forwarding from client (live regression): {e}")

            # Task to forward messages from backend to client
            async def forward_backend_to_client():
                try:
                    while True:
                        data = await backend_ws.recv()
                        logger.debug(f"Forwarding backend message to client (live regression): {data}")
                        await client_ws.send_text(data)
                except Exception as e:
                    logger.error(f"Error forwarding from backend (live regression): {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_client_to_backend(),
                forward_backend_to_client()
            )

    except Exception as e:
        logger.error(f"Could not connect to backend WebSocket at {backend_uri}: {e}")
    finally:
        # Ensure client connection is closed if it's still open
        if client_ws.client_state != WebSocketState.DISCONNECTED:
            await client_ws.close()
        
        logger.info(f"Closed proxy connection for live regression: {symbol}/{exchange}")

# Health Check
@app.get("/health", tags=["Health"])
async def health_check():
    """API Gateway health check."""
    services_status = {}
    
    # Check all microservices
    services = {
        "symbol_service": settings.SYMBOL_SERVICE_URL,
        "historical_regular": settings.HISTORICAL_REGULAR_URL,
        "websocket_regular": settings.WEBSOCKET_REGULAR_URL,
        "historical_heikin_ashi": settings.HISTORICAL_HEIKIN_ASHI_URL,
        "websocket_heikin_ashi": settings.WEBSOCKET_HEIKIN_ASHI_URL,
        "regression_service": settings.REGRESSION_SERVICE_URL,
        "live_regression": settings.LIVE_REGRESSION_URL,
    }
    
    for service_name, service_url in services.items():
        try:
            response = await http_client.get(f"{service_url}/health", timeout=5.0)
            services_status[service_name] = {
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "status_code": response.status_code
            }
        except Exception as e:
            services_status[service_name] = {
                "status": "unhealthy",
                "error": str(e)
            }
    
    all_healthy = all(s["status"] == "healthy" for s in services_status.values())
    
    if all_healthy:
        logger.info("Health check: All services are healthy.")
    else:
        logger.warning("Health check: Some services are unhealthy or degraded.")

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services_status,
        "timestamp": datetime.now().isoformat()
    }

# Static Files
script_dir = os.path.dirname(__file__)
frontend_dir = os.path.join(os.path.dirname(script_dir), "frontend_soa")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend_soa")
else:
    logger.error(f"Frontend directory not found at: {frontend_dir}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "Port8000:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        log_level="warning",  # Suppress info/debug
        access_log=False,     # No access logs in terminal
    )