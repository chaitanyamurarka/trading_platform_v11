# app/services/live_regression_service.py
import asyncio
import json
import logging
from typing import Dict, List, Optional, Set, Any
from datetime import datetime, timedelta, timezone as dt_timezone
from dataclasses import dataclass, field
import numpy as np
from scipy import stats
from zoneinfo import ZoneInfo
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from src.core import schemas
from src.core.config import settings
from src.api.websockets.handlers.live_data_handler import resample_ticks_to_bars
from src.domain.market_data.services.historical_data_service import get_historical_data
from src.infrastructure.cache.cache_service import redis_client
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

@dataclass
class LiveRegressionSubscription:
    """Data class for live regression subscription information."""
    websocket: WebSocket  # Changed from Any to WebSocket for type safety
    symbol: str
    exchange: str
    timeframes: List[str]
    timezone: str
    regression_length: int
    lookback_periods: List[int]
    connected_at: datetime = field(default_factory=datetime.now)

@dataclass
class RegressionCalculationContext:
    """Context for regression calculations including historical and live data."""
    symbol: str
    interval: str
    timezone: str
    regression_length: int
    lookback_periods: List[int]
    historical_candles: List[schemas.Candle] = field(default_factory=list)
    live_candles: List[schemas.Candle] = field(default_factory=list)
    last_calculation_time: Optional[datetime] = None

class LiveRegressionService:
    """Service for providing real-time linear regression calculations."""
    
    def __init__(self):
        self.subscriptions: Dict[WebSocket, LiveRegressionSubscription] = {}
        self.calculation_contexts: Dict[str, RegressionCalculationContext] = {}
        self.redis_subscriptions: Dict[str, Any] = {}
        self.calculation_tasks: Dict[str, asyncio.Task] = {}
        self.redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self._initializing_websockets: Set[WebSocket] = set()  # Track websockets being initialized
        
    def _is_websocket_connected(self, websocket: WebSocket) -> bool:
        """Check if a WebSocket is still connected."""
        try:
            # Check both client and application state
            return (
                hasattr(websocket, 'client_state') and 
                websocket.client_state == WebSocketState.CONNECTED and
                hasattr(websocket, 'application_state') and
                websocket.application_state == WebSocketState.CONNECTED
            )
        except Exception:
            return False
    
    async def _safe_send_json(self, websocket: WebSocket, data: dict) -> bool:
        """Safely send JSON data to a WebSocket, checking connection state first."""
        if not self._is_websocket_connected(websocket):
            logger.debug(f"WebSocket not connected, skipping send for: {data.get('type', 'unknown')}")
            return False
            
        try:
            await websocket.send_json(data)
            return True
        except RuntimeError as e:
            if "Cannot call" in str(e) or "WebSocket is not connected" in str(e):
                logger.debug(f"WebSocket closed when sending: {data.get('type', 'unknown')}")
                # Remove the subscription if the websocket is closed
                if websocket in self.subscriptions:
                    asyncio.create_task(self.remove_subscription(websocket))
                return False
            raise
        except Exception as e:
            logger.error(f"Error sending to WebSocket: {e}")
            return False
        
    async def add_subscription(self, websocket: WebSocket, subscription: LiveRegressionSubscription) -> bool:
        """Add a new live regression subscription supporting multiple timeframes."""
        try:
            # Mark websocket as initializing
            self._initializing_websockets.add(websocket)
            
            # Check if websocket is still connected before proceeding
            if not self._is_websocket_connected(websocket):
                logger.warning(f"WebSocket disconnected during subscription setup for {subscription.symbol}")
                return False
                
            self.subscriptions[websocket] = subscription
            
            # Send initialization status
            await self._safe_send_json(websocket, {
                "type": "initialization_progress",
                "message": "Loading historical data...",
                "symbol": subscription.symbol,
                "timestamp": datetime.now().isoformat()
            })
            
            # Create calculation contexts for each timeframe
            for i, timeframe in enumerate(subscription.timeframes):
                context_key = f"{subscription.symbol}:{timeframe}"
                
                if context_key not in self.calculation_contexts:
                    context = RegressionCalculationContext(
                        symbol=subscription.symbol,
                        interval=timeframe,
                        timezone=subscription.timezone,
                        regression_length=subscription.regression_length,
                        lookback_periods=subscription.lookback_periods
                    )
                    self.calculation_contexts[context_key] = context
                    
                    # Check connection before each heavy operation
                    if not self._is_websocket_connected(websocket):
                        logger.warning(f"WebSocket disconnected during setup for {context_key}")
                        await self.remove_subscription(websocket)
                        return False
                    
                    # Load historical data for this timeframe
                    await self._load_historical_data(context)
                    
                    # Send progress update
                    await self._safe_send_json(websocket, {
                        "type": "initialization_progress",
                        "message": f"Loaded historical data for {timeframe} ({i+1}/{len(subscription.timeframes)})",
                        "symbol": subscription.symbol,
                        "timeframe": timeframe,
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    # Check connection again
                    if not self._is_websocket_connected(websocket):
                        logger.warning(f"WebSocket disconnected during setup for {context_key}")
                        await self.remove_subscription(websocket)
                        return False
                    
                    # Load live data from Redis cache for this timeframe
                    await self._load_live_data(context)
                    
                    # Start periodic calculation task for this timeframe
                    await self._start_calculation_task(context_key)
            
            # Start Redis subscription for this symbol (shared across timeframes)
            await self._start_redis_subscription(subscription.symbol)
            
            # Remove from initializing set
            self._initializing_websockets.discard(websocket)
            
            # Final connection check before sending initial results
            if not self._is_websocket_connected(websocket):
                logger.warning(f"WebSocket disconnected before sending initial results for {subscription.symbol}")
                await self.remove_subscription(websocket)
                return False
            
            # Send initial regression results for all timeframes
            await self._send_initial_regression_results(websocket, subscription)
            
            logger.info(f"Added live regression subscription for {subscription.symbol} with {len(subscription.timeframes)} timeframes")
            return True
            
        except Exception as e:
            logger.error(f"Error adding live regression subscription: {e}", exc_info=True)
            self._initializing_websockets.discard(websocket)
            return False
    
    async def remove_subscription(self, websocket: WebSocket):
        """Remove a live regression subscription."""
        if websocket not in self.subscriptions:
            return
            
        subscription = self.subscriptions.pop(websocket)
        self._initializing_websockets.discard(websocket)
        
        # Check each timeframe to see if we can clean up contexts
        for timeframe in subscription.timeframes:
            context_key = f"{subscription.symbol}:{timeframe}"
            
            # Check if this was the last subscription for this context
            remaining_subs = [
                s for s in self.subscriptions.values() 
                if subscription.symbol == s.symbol and timeframe in s.timeframes
            ]
            
            if not remaining_subs:
                # Clean up context and tasks for this timeframe
                if context_key in self.calculation_contexts:
                    del self.calculation_contexts[context_key]
                
                if context_key in self.calculation_tasks:
                    self.calculation_tasks[context_key].cancel()
                    del self.calculation_tasks[context_key]
        
        # Check if we can clean up Redis subscription for this symbol
        symbol_subs = [s for s in self.subscriptions.values() if s.symbol == subscription.symbol]
        if not symbol_subs and subscription.symbol in self.redis_subscriptions:
            pubsub = self.redis_subscriptions.pop(subscription.symbol)
            await pubsub.unsubscribe()
            await pubsub.close()
        
        logger.info(f"Removed live regression subscription for {subscription.symbol} with {len(subscription.timeframes)} timeframes")
    
    async def _load_historical_data(self, context: RegressionCalculationContext):
        """Load historical data from InfluxDB."""
        try:
            # Get data for the last few days to ensure we have enough candles
            end_time = datetime.now(dt_timezone.utc)
            start_time = end_time - timedelta(days=30)
            
            historical_response = get_historical_data(
                session_token="live_regression",
                exchange="",  # Will be filled by the calling function
                token=context.symbol,
                interval_val=context.interval,
                start_time=start_time,
                end_time=end_time,
                timezone=context.timezone,
                data_type=schemas.DataType.REGULAR
            )
            
            if historical_response.candles:
                # Sort by timestamp descending (newest first)
                context.historical_candles = sorted(
                    historical_response.candles,
                    key=lambda c: c.unix_timestamp,
                    reverse=True
                )
                logger.info(f"Loaded {len(context.historical_candles)} historical candles for {context.symbol}")
            else:
                logger.warning(f"No historical data found for {context.symbol}")
                
        except Exception as e:
            logger.error(f"Error loading historical data for {context.symbol}: {e}", exc_info=True)
    
    async def _load_live_data(self, context: RegressionCalculationContext):
        """Load live tick data from Redis cache and resample to required interval."""
        try:
            cache_key = f"intraday_ticks:{context.symbol}"
            cached_ticks_str = await self.redis_client.lrange(cache_key, 0, -1)
            
            if cached_ticks_str:
                ticks = [json.loads(t) for t in cached_ticks_str]
                
                # Resample ticks to the required interval
                resampled_bars = await resample_ticks_to_bars(
                    ticks, context.interval, context.timezone
                )
                
                if resampled_bars:
                    # Sort by timestamp descending (newest first)
                    context.live_candles = sorted(
                        resampled_bars,
                        key=lambda c: c.unix_timestamp,
                        reverse=True
                    )
                    logger.info(f"Loaded {len(context.live_candles)} live candles for {context.symbol}")
                    
        except Exception as e:
            logger.error(f"Error loading live data for {context.symbol}: {e}", exc_info=True)
    
    async def _start_redis_subscription(self, symbol: str):
        """Start Redis subscription for live tick updates."""
        if symbol in self.redis_subscriptions:
            return  # Already subscribed
            
        try:
            pubsub = self.redis_client.pubsub()
            channel = f"live_ticks:{symbol}"
            await pubsub.subscribe(channel)
            self.redis_subscriptions[symbol] = pubsub
            
            # Start message handling task
            asyncio.create_task(self._handle_redis_messages(symbol, pubsub))
            logger.info(f"Started Redis subscription for symbol: {symbol}")
            
        except Exception as e:
            logger.error(f"Error starting Redis subscription for {symbol}: {e}", exc_info=True)
    
    async def _handle_redis_messages(self, symbol: str, pubsub):
        """Handle incoming Redis messages for live tick updates."""
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    tick_data = json.loads(message['data'])
                    await self._process_new_tick(symbol, tick_data)
        except asyncio.CancelledError:
            logger.info(f"Redis message handler for {symbol} was cancelled")
        except Exception as e:
            logger.error(f"Error in Redis message handler for {symbol}: {e}", exc_info=True)
    
    async def _process_new_tick(self, symbol: str, tick_data: dict):
        """Process a new tick and update relevant calculation contexts for all timeframes."""
        # Find all contexts for this symbol (across all timeframes)
        relevant_contexts = [
            (key, context) for key, context in self.calculation_contexts.items()
            if context.symbol == symbol
        ]
        
        for context_key, context in relevant_contexts:
            try:
                # Get existing ticks from Redis cache
                cache_key = f"intraday_ticks:{symbol}"
                cached_ticks_str = await self.redis_client.lrange(cache_key, 0, -1)
                all_ticks = []
                if cached_ticks_str:
                    all_ticks = [json.loads(t) for t in cached_ticks_str]
                
                # Resample to get updated candles for this specific timeframe
                resampled_bars = await resample_ticks_to_bars(
                    all_ticks, context.interval, context.timezone
                )
                
                if resampled_bars:
                    # Update live candles for this timeframe
                    context.live_candles = sorted(
                        resampled_bars,
                        key=lambda c: c.unix_timestamp,
                        reverse=True
                    )
                    
                    # Trigger regression calculation for this specific timeframe
                    await self._calculate_and_broadcast_regression(context_key)
                    
            except Exception as e:
                logger.error(f"Error processing tick for context {context_key}: {e}", exc_info=True)
    
    async def _start_calculation_task(self, context_key: str):
        """Start periodic regression calculation task."""
        async def calculation_loop():
            while context_key in self.calculation_contexts:
                try:
                    await self._calculate_and_broadcast_regression(context_key)
                    await asyncio.sleep(1)  # Calculate every second
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in calculation loop for {context_key}: {e}", exc_info=True)
                    await asyncio.sleep(5)  # Wait longer on error
        
        task = asyncio.create_task(calculation_loop())
        self.calculation_tasks[context_key] = task
    
    async def _calculate_and_broadcast_regression(self, context_key: str):
        """Calculate regression and broadcast to all subscribers."""
        if context_key not in self.calculation_contexts:
            return
            
        context = self.calculation_contexts[context_key]
        
        try:
            # Combine historical and live data
            all_candles = []
            
            # Add live candles first (they're more recent)
            if context.live_candles:
                all_candles.extend(context.live_candles)
            
            # Add historical candles (excluding any overlap)
            if context.historical_candles:
                live_start_time = min(c.unix_timestamp for c in context.live_candles) if context.live_candles else float('inf')
                historical_candles = [c for c in context.historical_candles if c.unix_timestamp < live_start_time]
                all_candles.extend(historical_candles)
            
            # Sort by timestamp descending (newest first)
            all_candles.sort(key=lambda c: c.unix_timestamp, reverse=True)
            
            if len(all_candles) < context.regression_length:
                logger.warning(f"Not enough candles for regression: {len(all_candles)} < {context.regression_length}")
                return
            
            # Calculate regression for each lookback period
            results = {}
            for lookback in context.lookback_periods:
                if lookback + context.regression_length > len(all_candles):
                    continue
                
                start_index = lookback
                end_index = start_index + context.regression_length
                
                candles_for_regression = all_candles[start_index:end_index]
                
                # Prepare data for regression (reverse to get ascending order)
                timestamps = [c.unix_timestamp for c in reversed(candles_for_regression)]
                closes = [c.close for c in reversed(candles_for_regression)]
                
                # Calculate linear regression
                slope, intercept, r_value, p_value, std_err = stats.linregress(timestamps, closes)
                
                results[str(lookback)] = {
                    "slope": slope,
                    "r_value": r_value,
                    "timestamp": datetime.now().isoformat()
                }
            
            # Broadcast to all subscribers for this context
            await self._broadcast_results(context_key, results)
            context.last_calculation_time = datetime.now()
            
        except Exception as e:
            logger.error(f"Error calculating regression for {context_key}: {e}", exc_info=True)
    
    async def _broadcast_results(self, context_key: str, results: dict):
        """Broadcast regression results to all subscribers interested in this timeframe."""
        symbol, timeframe = context_key.split(":", 1)
        
        # Find all websockets subscribed to this symbol and timeframe
        relevant_websockets = []
        for ws, sub in list(self.subscriptions.items()):  # Use list() to avoid dict changed during iteration
            if sub.symbol == symbol and timeframe in sub.timeframes:
                # Skip websockets that are still initializing
                if ws not in self._initializing_websockets and self._is_websocket_connected(ws):
                    relevant_websockets.append(ws)
        
        if not relevant_websockets:
            return
        
        payload = {
            "type": "live_regression_update",
            "symbol": symbol,
            "timeframe": timeframe,
            "context": context_key,
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
        
        # Send to all relevant websockets with proper error handling
        for websocket in relevant_websockets:
            success = await self._safe_send_json(websocket, payload)
            if not success:
                logger.debug(f"Failed to send regression update to websocket for {context_key}")

    async def _send_initial_regression_results(self, websocket: WebSocket, subscription: LiveRegressionSubscription):
        """Send initial regression results for all timeframes to a new subscriber."""
        if not self._is_websocket_connected(websocket):
            logger.warning("WebSocket disconnected before sending initial results")
            return
            
        for timeframe in subscription.timeframes:
            context_key = f"{subscription.symbol}:{timeframe}"
            if context_key in self.calculation_contexts:
                # Trigger immediate calculation and send for this timeframe
                await self._calculate_and_broadcast_regression(context_key)
    
    async def close(self):
        """Clean up all resources."""
        # Cancel all calculation tasks
        for task in self.calculation_tasks.values():
            task.cancel()
        
        # Close all Redis subscriptions
        for pubsub in self.redis_subscriptions.values():
            await pubsub.unsubscribe()
            await pubsub.close()
        
        await self.redis_client.close()
        logger.info("LiveRegressionService closed")

# Singleton instance
live_regression_service = LiveRegressionService()