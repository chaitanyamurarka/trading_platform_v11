# Port 8003 - WebSocket Regular Data Service
import logging
import sys
import os
import asyncio
import json
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Dict, Set, Optional, Any, List
from dataclasses import dataclass, field
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import redis.asyncio as aioredis
from starlette.websockets import WebSocketState
from websockets.exceptions import ConnectionClosed
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, Field

load_dotenv()

# Configuration
class Settings(BaseSettings):
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

settings = Settings()

# Logging Setup
def setup_logging():
    log_formatter = logging.Formatter('%(asctime)s - WEBSOCKET_REGULAR - %(levelname)s - %(message)s')
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    return root_logger

setup_logging()
logger = logging.getLogger(__name__)

# Schemas
class Candle(BaseModel):
    open: float = Field(..., description="The opening price for the candle period.")
    high: float = Field(..., description="The highest price for the candle period.")
    low: float = Field(..., description="The lowest price for the candle period.")
    close: float = Field(..., description="The closing price for the candle period.")
    volume: Optional[float] = Field(None, description="The trading volume for the candle period.")
    unix_timestamp: float = Field(..., description="The timestamp represented as a UNIX epoch float.")
    timestamp: Optional[datetime] = Field(None, exclude=True)

    class Config:
        from_attributes = True

# Live Data Handler Classes
class TickBarResampler:
    """Aggregates raw ticks into bars of a specified tick-count."""
    def __init__(self, interval_str: str, timezone_str: str):
        try:
            self.ticks_per_bar = int(interval_str.replace('tick', ''))
        except ValueError:
            logger.error(f"Invalid tick interval format: {interval_str}. Defaulting to 1000.")
            self.ticks_per_bar = 1000
            
        self.current_bar: Optional[Candle] = None
        self.tick_count = 0
        try:
            self.tz = ZoneInfo(timezone_str)
        except ZoneInfoNotFoundError:
            logger.warning(f"Timezone '{timezone_str}' not found. Defaulting to UTC.")
            self.tz = dt_timezone.utc

        self.last_completed_bar_timestamp: Optional[float] = None

    def add_bar(self, tick_data: Dict) -> Optional[Candle]:
        """Process a single raw tick. If a bar is completed, it returns the completed bar."""
        if not all(k in tick_data for k in ['price', 'volume', 'timestamp']):
            logger.warning(f"Malformed tick data received: {tick_data}")
            return None

        price, volume, ts_float = float(tick_data['price']), int(tick_data['volume']), tick_data['timestamp']
        
        # Create a timezone-aware "fake UTC" timestamp for the frontend
        ts_utc = datetime.fromtimestamp(ts_float, tz=dt_timezone.utc)
        local_dt = ts_utc.astimezone(self.tz)
        fake_utc_dt = datetime(
            local_dt.year, local_dt.month, local_dt.day,
            local_dt.hour, local_dt.minute, local_dt.second,
            microsecond=local_dt.microsecond,
            tzinfo=dt_timezone.utc
        )
        fake_unix_timestamp = fake_utc_dt.timestamp()

        # Ensure timestamps are always unique and increasing
        if self.last_completed_bar_timestamp is not None and fake_unix_timestamp <= self.last_completed_bar_timestamp:
            fake_unix_timestamp = self.last_completed_bar_timestamp + 0.000001

        # If there's no bar, start a new one
        if self.current_bar is None:
            self.current_bar = Candle(open=price, high=price, low=price, close=price, volume=0, unix_timestamp=fake_unix_timestamp)
        
        # Add the current tick's data to the bar
        self.current_bar.high = max(self.current_bar.high, price)
        self.current_bar.low = min(self.current_bar.low, price)
        self.current_bar.close = price
        self.current_bar.volume += volume
        self.tick_count += 1
        
        # Check if the bar is now complete
        if self.tick_count >= self.ticks_per_bar:
            completed_bar = self.current_bar
            self.last_completed_bar_timestamp = completed_bar.unix_timestamp
            
            # Reset for the next bar
            self.current_bar = None
            self.tick_count = 0
            
            return completed_bar
        
        return None

class BarResampler:
    """Aggregates raw ticks into time-based OHLCV bars (e.g., 1-minute, 5-minute)."""
    def __init__(self, interval_str: str, timezone_str: str):
        self.interval_td = self._parse_interval(interval_str)
        self.current_bar: Optional[Candle] = None
        try:
            self.tz = ZoneInfo(timezone_str)
        except ZoneInfoNotFoundError:
            logger.warning(f"Timezone '{timezone_str}' not found. Defaulting to UTC.")
            self.tz = dt_timezone.utc

    def _parse_interval(self, s: str) -> timedelta:
        unit, value = s[-1], int(s[:-1])
        if unit == 's': return timedelta(seconds=value)
        if unit == 'm': return timedelta(minutes=value)
        if unit == 'h': return timedelta(hours=value)
        raise ValueError(f"Invalid time-based interval: {s}")

    def add_bar(self, tick_data: Dict) -> Optional[Candle]:
        """Process a single raw tick. If a new time interval begins, return the previously completed bar."""
        if not all(k in tick_data for k in ['price', 'volume', 'timestamp']):
            logger.warning(f"Malformed tick data received: {tick_data}")
            return None

        price, volume = float(tick_data['price']), int(tick_data['volume'])
        ts_utc = datetime.fromtimestamp(tick_data['timestamp'], tz=dt_timezone.utc)
        
        local_dt = ts_utc.astimezone(self.tz)
        
        interval_seconds = self.interval_td.total_seconds()
        local_ts = local_dt.timestamp()
        bar_start_local_ts_float = local_ts - (local_ts % interval_seconds)
        
        bar_start_local_dt = datetime.fromtimestamp(bar_start_local_ts_float, self.tz)

        fake_utc_dt = datetime(
            bar_start_local_dt.year, bar_start_local_dt.month, bar_start_local_dt.day,
            bar_start_local_dt.hour, bar_start_local_dt.minute, bar_start_local_dt.second,
            tzinfo=dt_timezone.utc
        )
        bar_start_unix = fake_utc_dt.timestamp()
        
        if not self.current_bar:
            self.current_bar = Candle(open=price, high=price, low=price, close=price, volume=volume, unix_timestamp=bar_start_unix)
        elif bar_start_unix > self.current_bar.unix_timestamp:
            completed_bar = self.current_bar
            self.current_bar = Candle(open=price, high=price, low=price, close=price, volume=volume, unix_timestamp=bar_start_unix)
            return completed_bar
        else:
            self.current_bar.high = max(self.current_bar.high, price)
            self.current_bar.low = min(self.current_bar.low, price)
            self.current_bar.close = price
            self.current_bar.volume += volume
            
        return None

async def resample_ticks_to_bars(
    ticks: List[Dict],
    target_interval_str: str,
    target_timezone_str: str,
    chunk_size: int = 25000
) -> List[Candle]:
    """Asynchronously resample a list of raw tick data into OHLC bars."""
    if not ticks:
        return []

    logger.info(f"Asynchronously resampling {len(ticks)} ticks into {target_interval_str} bars.")

    is_tick_based = 'tick' in target_interval_str
    resampler = TickBarResampler(target_interval_str, target_timezone_str) if is_tick_based else BarResampler(target_interval_str, target_timezone_str)
    
    completed_bars: List[Candle] = []
    for i in range(0, len(ticks), chunk_size):
        chunk = ticks[i:i + chunk_size]
        for tick in chunk:
            completed_bar = resampler.add_bar(tick)
            if completed_bar:
                completed_bars.append(completed_bar)
        
        await asyncio.sleep(0)
            
    # Add the final, in-progress bar
    if resampler.current_bar:
        completed_bars.append(resampler.current_bar)
        
    logger.info(f"Resampling complete. Produced {len(completed_bars)} bars.")
    return completed_bars

# Connection Management
@dataclass
class ConnectionInfo:
    """Data class for connection information."""
    websocket: WebSocket
    symbol: str
    interval: str
    timezone: str
    connected_at: datetime = field(default_factory=datetime.now)

@dataclass
class SubscriptionGroup:
    """Data class for a subscription group."""
    channel: str
    symbol: str
    connections: Set[WebSocket] = field(default_factory=set)
    resamplers: Dict[tuple[str, str], Any] = field(default_factory=dict)
    redis_subscription: Optional[Any] = None
    message_task: Optional[asyncio.Task] = None

class ConnectionManager:
    """Manages WebSocket connections and subscription groups."""
    def __init__(self):
        self.connections: Dict[WebSocket, ConnectionInfo] = {}
        self.subscription_groups: Dict[str, SubscriptionGroup] = {}
        self.redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, max_connections=50)
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start(self):
        if not self._cleanup_task:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("ConnectionManager started with cleanup loop.")

    async def stop(self):
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for group in self.subscription_groups.values():
            if group.message_task:
                group.message_task.cancel()
            if group.redis_subscription:
                await group.redis_subscription.unsubscribe()
        await self.redis_client.close()
        logger.info("ConnectionManager stopped.")

    def _get_channel_key(self, symbol: str) -> str:
        return f"live_ticks:{symbol}"

    async def _send_backfill_data(self, websocket: WebSocket, conn_info: ConnectionInfo) -> bool:
        """Send backfill data to a newly connected client."""
        logger.info(f"Attempting backfill for {conn_info.symbol}/{conn_info.interval}")
        try:
            if websocket.client_state != WebSocketState.CONNECTED:
                logger.warning(f"Client disconnected before backfill could start for {conn_info.symbol}. Aborting.")
                return False

            cache_key = f"intraday_ticks:{conn_info.symbol}"
            cached_ticks_str = await self.redis_client.lrange(cache_key, 0, -1)
            
            if not cached_ticks_str:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json([])
                return True

            ticks = [json.loads(t) for t in cached_ticks_str]
            if not ticks:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json([])
                return True

            resampled_bars = await resample_ticks_to_bars(ticks, conn_info.interval, conn_info.timezone)

            if websocket.client_state != WebSocketState.CONNECTED:
                logger.warning(f"Client disconnected during backfill processing for {conn_info.symbol}. Aborting send.")
                return False

            if resampled_bars:
                payload = [bar.model_dump() for bar in resampled_bars]
                logger.info(f"Sending {len(payload)} backfilled bars to client for {conn_info.symbol}/{conn_info.interval}")
                await websocket.send_json(payload)
                logger.info(f"Sent {len(payload)} backfilled bars to client for {conn_info.symbol}/{conn_info.interval}")
            else:
                await websocket.send_json([])

            return True

        except (WebSocketDisconnect, ConnectionClosed):
            logger.info(f"Could not send backfill to {conn_info.symbol}; client disconnected during the process.")
            return True
        except Exception as e:
            logger.error(f"An unexpected error occurred sending backfill data for {conn_info.symbol}: {e}", exc_info=True)
            return False

    async def add_connection(self, websocket: WebSocket, symbol: str, interval: str, timezone: str) -> bool:
        """Add a new WebSocket connection. Returns False if the connection is terminated during setup."""
        conn_info = ConnectionInfo(websocket, symbol, interval, timezone)
        self.connections[websocket] = conn_info
        
        channel_key = self._get_channel_key(symbol)
        
        if channel_key not in self.subscription_groups:
            group = SubscriptionGroup(channel=channel_key, symbol=symbol)
            self.subscription_groups[channel_key] = group
            await self._start_redis_subscription(group)
        
        group = self.subscription_groups[channel_key]
        resampler_key = (interval, timezone)
        
        if resampler_key not in group.resamplers:
            resampler_class = TickBarResampler if 'tick' in interval else BarResampler
            group.resamplers[resampler_key] = resampler_class(interval, timezone)
            logger.info(f"Created new {resampler_class.__name__} for group {symbol}, key: {resampler_key}")

        backfill_successful = await self._send_backfill_data(websocket, conn_info)

        if backfill_successful and websocket.client_state == WebSocketState.CONNECTED:
            group.connections.add(websocket)
            logger.info(f"Connection for {symbol}/{interval} is now live.")
            return True
        else:
            logger.warning(f"Did not add {symbol}/{interval} to live group; client disconnected during backfill.")
            return False

    async def remove_connection(self, websocket: WebSocket):
        if websocket not in self.connections:
            return
        conn_info = self.connections.pop(websocket)
        group = self.subscription_groups.get(self._get_channel_key(conn_info.symbol))
        if group:
            group.connections.discard(websocket)
            logger.info(f"Removed connection from group {group.symbol}")

    async def _start_redis_subscription(self, group: SubscriptionGroup):
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe(group.channel)
        group.redis_subscription = pubsub
        group.message_task = asyncio.create_task(self._handle_redis_messages(group, pubsub))
        logger.info(f"Redis subscription task created for channel: {group.channel}")

    async def _handle_redis_messages(self, group: SubscriptionGroup, pubsub: aioredis.client.PubSub):
        """Listen for raw ticks and dispatch them for processing."""
        logger.info(f"STARTING Redis message listener for channel: {group.channel}")
        try:
            async for message in pubsub.listen():
                logger.debug(f"Received raw message from Redis on channel {group.channel}: {message}")
                if message['type'] == 'message':
                    tick_data = json.loads(message['data'])
                    await self._process_tick_for_group(group, tick_data)
        except asyncio.CancelledError:
            logger.warning(f"Redis message listener for {group.channel} was cancelled.")
        except Exception as e:
            logger.error(f"FATAL: Redis message listener for {group.channel} failed: {e}", exc_info=True)
        finally:
            logger.warning(f"STOPPED Redis message listener for channel: {group.channel}")

    async def _process_tick_for_group(self, group: SubscriptionGroup, tick_data: dict):
        """Process a single raw tick, generate all required data types, and send them to the correct clients."""
        if not group.connections:
            return
        
        payloads: Dict[tuple, dict] = {}

        for resampler_key, resampler in group.resamplers.items():
            try:
                completed_bar = resampler.add_bar(tick_data)
                current_bar = resampler.current_bar
                
                payloads[resampler_key] = {
                    "completed_bar": completed_bar.model_dump() if completed_bar else None,
                    "current_bar": current_bar.model_dump() if current_bar else None
                }
            except Exception as e:
                logger.error(f"Error processing tick in resampler {resampler_key}: {e}", exc_info=True)
                continue

        tasks = []
        for websocket in list(group.connections):
            conn_info = self.connections.get(websocket)
            if not conn_info:
                continue
            
            payload_key = (conn_info.interval, conn_info.timezone)
            if payload_key in payloads:
                tasks.append(websocket.send_json(payloads[payload_key]))
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    if isinstance(result, (WebSocketDisconnect, ConnectionClosed)):
                        logger.warning(f"Failed to send update to a client, connection already closed.")
                    else:
                        logger.error(f"Error sending data to client: {result}", exc_info=False)

    async def _cleanup_loop(self):
        """Periodically clean up subscription groups with no active connections."""
        while True:
            await asyncio.sleep(60)
            to_remove = [key for key, group in self.subscription_groups.items() if not group.connections]
            for key in to_remove:
                group = self.subscription_groups.pop(key)
                if group.message_task:
                    group.message_task.cancel()
                if group.redis_subscription:
                    await group.redis_subscription.unsubscribe()
                logger.info(f"Cleaned up unused subscription: {key}")

# FastAPI App
app = FastAPI(
    title="WebSocket Regular Data Service",
    description="Service for live regular OHLC data via WebSocket",
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

# Global connection manager
connection_manager = ConnectionManager()

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("WebSocket Regular Data Service starting up...")
    await connection_manager.start()
    logger.info("WebSocket Regular Data Service startup complete.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("WebSocket Regular Data Service shutting down...")
    await connection_manager.stop()
    logger.info("WebSocket Regular Data Service shutdown complete.")

# WebSocket Handler
async def websocket_handler(websocket: WebSocket, symbol: str, interval: str, timezone: str):
    """Generic handler for live data websockets."""
    await websocket.accept()
    connection_successful = False
    try:
        connection_successful = await connection_manager.add_connection(websocket, symbol, interval, timezone)
        
        if connection_successful:
            while True:
                await websocket.receive_text()
                
    except WebSocketDisconnect:
        logger.info(f"Client disconnected gracefully: {symbol}/{interval}")
    except Exception as e:
        logger.error(f"Error in websocket handler for {symbol}: {e}", exc_info=True)
    finally:
        await connection_manager.remove_connection(websocket)
        logger.info(f"Cleaned up connection for: {symbol}/{interval}")

# WebSocket Routes
@app.websocket("/ws/live/{symbol}/{interval}/{timezone:path}")
async def get_live_data(
    websocket: WebSocket, 
    symbol: str = Path(...), 
    interval: str = Path(...), 
    timezone: str = Path(...)
):
    """WebSocket endpoint for live regular data."""
    await websocket_handler(websocket, symbol, interval, timezone)

# Health Check
@app.get("/health", tags=["Health"])
async def health_check():
    """WebSocket Regular Data Service health check."""
    redis_connected = True
    try:
        await connection_manager.redis_client.ping()
    except Exception:
        redis_connected = False
    
    active_connections = len(connection_manager.connections)
    active_groups = len(connection_manager.subscription_groups)
    
    return {
        "status": "healthy" if redis_connected else "unhealthy",
        "redis_connected": redis_connected,
        "active_connections": active_connections,
        "active_subscription_groups": active_groups,
        "service": "websocket_regular_data",
        "timestamp": datetime.now().isoformat()
    }

# Metrics endpoint
@app.get("/metrics", tags=["Metrics"])
async def get_metrics():
    """Get detailed metrics for the WebSocket service."""
    groups_info = {}
    for channel, group in connection_manager.subscription_groups.items():
        groups_info[channel] = {
            "symbol": group.symbol,
            "connection_count": len(group.connections),
            "resampler_count": len(group.resamplers),
            "has_redis_subscription": group.redis_subscription is not None,
            "message_task_running": group.message_task is not None and not group.message_task.done()
        }
    
    return {
        "total_connections": len(connection_manager.connections),
        "total_subscription_groups": len(connection_manager.subscription_groups),
        "subscription_groups": groups_info,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")