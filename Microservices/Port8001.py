# Port 8001 - Symbol Service
import logging
import sys
import os
import json
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import redis.asyncio as aioredis

load_dotenv()

# Configuration
class Settings(BaseSettings):
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

settings = Settings()

from logging_config import setup_logging, correlation_id
setup_logging("symbol_service")
logger = logging.getLogger(__name__)

# Schemas
class Symbol(BaseModel):
    symbol: str
    exchange: str

# Redis Keys
REDIS_SYMBOLS_KEY = "dtn:ingestion:symbols"
REDIS_SYMBOL_UPDATES_CHANNEL = "dtn:ingestion:symbol_updates"

class SymbolService:
    def __init__(self):
        self.available_symbols: List[Dict[str, str]] = []
        self.redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self.pubsub: Optional[Any] = None
        self.listen_task: Optional[asyncio.Task] = None

    async def load_symbols_from_redis(self):
        """Load the list of symbols from Redis into memory."""
        try:
            symbols_data = await self.redis_client.get(REDIS_SYMBOLS_KEY)
            # DEBUG: Log raw Redis message and cache operation
            logger.debug(f"Redis GET command for symbols: {REDIS_SYMBOLS_KEY}")
            if symbols_data:
                self.available_symbols = json.loads(symbols_data)
                logger.info(f"Successfully loaded {len(self.available_symbols)} symbols from Redis.")
            else:
                logger.warning(f"Redis key '{REDIS_SYMBOLS_KEY}' not found or empty. No symbols loaded.")
        except Exception as e:
            logger.error(f"Error loading symbols from Redis: {e}", exc_info=True)
            self.available_symbols = []

    async def subscribe_to_symbol_updates(self):
        """Subscribe to the Redis channel for symbol updates."""
        try:
            self.pubsub = self.redis_client.pubsub()
            await self.pubsub.subscribe(REDIS_SYMBOL_UPDATES_CHANNEL)
            self.listen_task = asyncio.create_task(self._handle_symbol_messages())
            logger.info(f"Subscribed to Redis channel: {REDIS_SYMBOL_UPDATES_CHANNEL}")
        except Exception as e:
            logger.error(f"Error subscribing to symbol updates channel: {e}", exc_info=True)

    async def _handle_symbol_messages(self):
        """Listen for messages on the symbol updates channel and process them."""
        if not self.pubsub:
            return

        logger.info(f"Starting Redis message listener for channel: {REDIS_SYMBOL_UPDATES_CHANNEL}")
        try:
            while True:
                message = await self.pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message['type'] == 'message':
                    message_data = message['data']
                    # DEBUG: Log raw Redis message
                    logger.debug(f"Received raw Redis message: {message_data}")
                    if message_data == "symbols_updated":
                        logger.info(f"Received 'symbols_updated' message. Reloading all symbols.")
                        await self.load_symbols_from_redis()
                    else:
                        try:
                            new_symbols = json.loads(message_data)
                            # DEBUG: Log data transformation step
                            logger.debug(f"Decoded new symbols from Redis message: {new_symbols}")
                            if isinstance(new_symbols, list):
                                for new_symbol in new_symbols:
                                    if new_symbol not in self.available_symbols:
                                        self.available_symbols.append(new_symbol)
                                        logger.info(f"Added new symbol: {new_symbol}")
                                logger.info(f"Updated available symbols. Total: {len(self.available_symbols)}")
                            else:
                                logger.warning(f"Received non-list message: {new_symbols}")
                        except json.JSONDecodeError:
                            logger.warning(f"Could not decode JSON from Redis message: {message_data}")
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            logger.info(f"Redis message listener was cancelled.")
        except Exception as e:
            logger.error(f"Redis message listener failed: {e}", exc_info=True)
        finally:
            logger.info(f"Stopped Redis message listener for channel: {REDIS_SYMBOL_UPDATES_CHANNEL}")

    async def stop_subscription(self):
        """Stop the Redis pub/sub subscription and clean up."""
        if self.listen_task:
            self.listen_task.cancel()
            try:
                await self.listen_task
            except asyncio.CancelledError:
                pass
        if self.pubsub:
            await self.pubsub.unsubscribe(REDIS_SYMBOL_UPDATES_CHANNEL)
            await self.pubsub.close()
            logger.info(f"Unsubscribed from Redis channel: {REDIS_SYMBOL_UPDATES_CHANNEL}")
        await self.redis_client.close()

    def get_available_symbols(self) -> List[Dict[str, str]]:
        """Return the currently loaded list of available symbols."""
        return self.available_symbols

# FastAPI App
app = FastAPI(
    title="Symbol Service",
    description="Service for managing trading symbols",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global symbol service instance
symbol_service = SymbolService()

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("Symbol Service starting up...")
    await symbol_service.load_symbols_from_redis()
    await symbol_service.subscribe_to_symbol_updates()
    logger.info("Symbol Service startup complete.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Symbol Service shutting down...")
    await symbol_service.stop_subscription()
    logger.info("Symbol Service shutdown complete.")

# Routes
@app.get("/symbols", response_model=List[Symbol], tags=["Symbols"])
async def get_available_symbols():
    """Return a list of available trading symbols from Redis cache."""
    symbols = symbol_service.get_available_symbols()
    logger.info(f"Returning {len(symbols)} symbols")
    return [Symbol(**symbol) for symbol in symbols]

@app.get("/symbols/count", tags=["Symbols"])
async def get_symbols_count():
    """Return the count of available symbols."""
    count = len(symbol_service.get_available_symbols())
    return {"count": count}

@app.get("/symbols/refresh", tags=["Symbols"])
async def refresh_symbols():
    """Manually refresh symbols from Redis."""
    try:
        await symbol_service.load_symbols_from_redis()
        count = len(symbol_service.get_available_symbols())
        logger.info(f"Manually refreshed symbols. Count: {count}")
        return {"status": "success", "count": count, "message": "Symbols refreshed from Redis"}
    except Exception as e:
        logger.error(f"Error refreshing symbols: {e}")
        raise HTTPException(status_code=500, detail=f"Error refreshing symbols: {str(e)}")

@app.get("/symbols/search", response_model=List[Symbol], tags=["Symbols"])
async def search_symbols(query: str):
    """Search for symbols matching the query."""
    symbols = symbol_service.get_available_symbols()
    matching_symbols = [
        symbol for symbol in symbols 
        if query.lower() in symbol.get('symbol', '').lower() or 
           query.lower() in symbol.get('exchange', '').lower()
    ]
    logger.info(f"Found {len(matching_symbols)} symbols matching query: {query}")
    return [Symbol(**symbol) for symbol in matching_symbols]

@app.get("/health", tags=["Health"])
async def health_check():
    """Symbol Service health check."""
    symbol_count = len(symbol_service.get_available_symbols())
    redis_connected = True
    try:
        await symbol_service.redis_client.ping()
        logger.debug("Redis ping successful.")
    except Exception:
        redis_connected = False
        logger.error("Redis connection failed during health check.")
    
    status = "healthy" if redis_connected else "unhealthy"
    logger.info(f"Health check result: {status}. Symbol count: {symbol_count}, Redis connected: {redis_connected}")
    
    return {
        "status": status,
        "symbol_count": symbol_count,
        "redis_connected": redis_connected,
        "subscription_active": symbol_service.listen_task is not None and not symbol_service.listen_task.done(),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8001, 
        log_level="warning",  # Suppress info/debug
        access_log=False,     # No access logs in terminal
    )