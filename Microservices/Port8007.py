# Port 8007 - Live Regression Service
import logging
import sys
import os
import asyncio
import json
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, field
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Path, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import redis.asyncio as aioredis
from starlette.websockets import WebSocketState
from websockets.exceptions import ConnectionClosed
from zoneinfo import ZoneInfo
import numpy as np
from scipy import stats
from urllib.parse import unquote, quote
from enum import Enum
import pandas as pd
import re
from influxdb_client import InfluxDBClient

load_dotenv()

# Configuration
class Settings(BaseSettings):
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    INFLUX_URL: str = os.getenv("INFLUX_URL")
    INFLUX_TOKEN: str = os.getenv("INFLUX_TOKEN")
    INFLUX_ORG: str = os.getenv("INFLUX_ORG")
    INFLUX_BUCKET: str = "trading_data"

settings = Settings()

from logging_config import setup_logging, correlation_id
setup_logging("live_regression")
logger = logging.getLogger(__name__)

# Schemas
class Interval(str, Enum):
    # Tick-based intervals
    TICK_1 = "1tick"
    TICK_10 = "10tick"
    TICK_100 = "100tick"
    TICK_1000 = "1000tick"
    
    # Time-based intervals
    SEC_1 = "1s"
    SEC_5 = "5s"
    SEC_10 = "10s"
    SEC_15 = "15s"
    SEC_30 = "30s"
    SEC_45 = "45s"
    MIN_1 = "1m"
    MIN_5 = "5m"
    MIN_10 = "10m"
    MIN_15 = "15m"
    MIN_30 = "30m"
    MIN_45 = "45m"
    HOUR_1 = "1h"
    DAY_1 = "1d"

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

class LiveRegressionResult(BaseModel):
    slope: float = Field(..., description="The slope of the regression line")
    intercept: float = Field(..., description="The intercept of the regression line.")
    r_value: float = Field(..., description="The R-value (correlation coefficient)")
    std_dev: float = Field(..., description="The standard deviation from the regression line.")
    timestamp: str = Field(..., description="ISO timestamp when this result was calculated")

# InfluxDB Client Setup
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG, timeout=60_000)
query_api = influx_client.query_api()

# Live Data Handler Classes
class TickBarResampler:
    """Aggregates raw ticks into bars of a specified tick-count."""
    def __init__(self, interval_str: str, timezone_str: str):
        try:
            self.ticks_per_bar = int(interval_str.replace('tick', ''))
        except ValueError:
            logger.warning(f"Invalid parameters with auto-correction: Invalid tick interval format: {interval_str}. Defaulting to 1000.") # WARNING: Invalid parameters with auto-correction
            self.ticks_per_bar = 1000
            
        self.current_bar: Optional[Candle] = None
        self.tick_count = 0
        try:
            self.tz = ZoneInfo(timezone_str)
        except:
            logger.warning(f"Invalid parameters with auto-correction: Timezone '{timezone_str}' not found. Defaulting to UTC.") # WARNING: Invalid parameters with auto-correction
            self.tz = dt_timezone.utc

        self.last_completed_bar_timestamp: Optional[float] = None

    def add_bar(self, tick_data: Dict) -> Optional[Candle]:
        if not all(k in tick_data for k in ['price', 'volume', 'timestamp']):
            return None

        price, volume, ts_float = float(tick_data['price']), int(tick_data['volume']), tick_data['timestamp']
        
        ts_utc = datetime.fromtimestamp(ts_float, tz=dt_timezone.utc)
        local_dt = ts_utc.astimezone(self.tz)
        fake_utc_dt = datetime(
            local_dt.year, local_dt.month, local_dt.day,
            local_dt.hour, local_dt.minute, local_dt.second,
            microsecond=local_dt.microsecond,
            tzinfo=dt_timezone.utc
        )
        fake_unix_timestamp = fake_utc_dt.timestamp()

        if self.last_completed_bar_timestamp is not None and fake_unix_timestamp <= self.last_completed_bar_timestamp:
            fake_unix_timestamp = self.last_completed_bar_timestamp + 0.000001

        if self.current_bar is None:
            self.current_bar = Candle(open=price, high=price, low=price, close=price, volume=0, unix_timestamp=fake_unix_timestamp)
        
        self.current_bar.high = max(self.current_bar.high, price)
        self.current_bar.low = min(self.current_bar.low, price)
        self.current_bar.close = price
        self.current_bar.volume += volume
        self.tick_count += 1
        
        if self.tick_count >= self.ticks_per_bar:
            completed_bar = self.current_bar
            self.last_completed_bar_timestamp = completed_bar.unix_timestamp
            self.current_bar = None
            self.tick_count = 0
            return completed_bar
        
        return None

class BarResampler:
    """Aggregates raw ticks into time-based OHLCV bars."""
    def __init__(self, interval_str: str, timezone_str: str):
        self.interval_td = self._parse_interval(interval_str)
        self.current_bar: Optional[Candle] = None
        try:
            self.tz = ZoneInfo(timezone_str)
        except:
            self.tz = dt_timezone.utc

    def _parse_interval(self, s: str) -> timedelta:
        unit, value = s[-1], int(s[:-1])
        if unit == 's': return timedelta(seconds=value)
        if unit == 'm': return timedelta(minutes=value)
        if unit == 'h': return timedelta(hours=value)
        raise ValueError(f"Invalid time-based interval: {s}")

    def add_bar(self, tick_data: Dict) -> Optional[Candle]:
        if not all(k in tick_data for k in ['price', 'volume', 'timestamp']):
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

async def resample_ticks_to_bars(ticks: List[Dict], target_interval_str: str, target_timezone_str: str, chunk_size: int = 25000) -> List[Candle]:
    """Asynchronously resample a list of raw tick data into OHLC bars."""
    if not ticks:
        return []

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
            
    if resampler.current_bar:
        completed_bars.append(resampler.current_bar)
        
    return completed_bars

@dataclass
class LiveRegressionSubscription:
    """Data class for live regression subscription information."""
    websocket: Any
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
    historical_candles: List[Candle] = field(default_factory=list)
    live_candles: List[Candle] = field(default_factory=list)
    last_calculation_time: Optional[datetime] = None
    resampler: Optional[Any] = None

class LiveRegressionService:
    """Service for providing real-time linear regression calculations."""
    
    def __init__(self):
        self.subscriptions: Dict[Any, LiveRegressionSubscription] = {}
        self.calculation_contexts: Dict[str, RegressionCalculationContext] = {}
        self.redis_subscriptions: Dict[str, Any] = {}
        self.calculation_tasks: Dict[str, asyncio.Task] = {}
        self.redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        
    async def add_subscription(self, websocket, subscription: LiveRegressionSubscription) -> bool:
        """Add a new live regression subscription supporting multiple timeframes."""
        logger.info(f"New client connection: Live regression subscription for {subscription.symbol} with timeframes: {subscription.timeframes}") # INFO: New client connections
        try:
            self.subscriptions[websocket] = subscription
            
            # Create calculation contexts for each timeframe
            for timeframe in subscription.timeframes:
                context_key = f"{subscription.symbol}:{timeframe}"
                
                if context_key not in self.calculation_contexts:
                    context = RegressionCalculationContext(
                        symbol=subscription.symbol,
                        interval=timeframe,
                        timezone=subscription.timezone,
                        regression_length=subscription.regression_length,
                        lookback_periods=subscription.lookback_periods
                    )

                    is_tick_based = 'tick' in timeframe
                    resampler_class = TickBarResampler if is_tick_based else BarResampler
                    context.resampler = resampler_class(timeframe, subscription.timezone)
                        
                    self.calculation_contexts[context_key] = context
                    
                    # Load historical data for this timeframe
                    await self._load_historical_data(context)
                    
                    # Load live data from Redis cache for this timeframe
                    await self._load_live_data(context)
                    
                    # Start periodic calculation task for this timeframe
                    await self._start_calculation_task(context_key)
            
            # Start Redis subscription for this symbol (shared across timeframes)
            await self._start_redis_subscription(subscription.symbol)
            
            # Send initial regression results for all timeframes
            await self._send_initial_regression_results(websocket, subscription)
            
            logger.info(f"Added live regression subscription for {subscription.symbol} with {len(subscription.timeframes)} timeframes")
            return True
            
        except Exception as e:
            logger.error(f"Service failures: Error adding live regression subscription: {e}", exc_info=True) # ERROR: Service failures
            return False
    
    async def remove_subscription(self, websocket):
        """Remove a live regression subscription."""
        if websocket not in self.subscriptions:
            logger.warning(f"Connection retries and fallbacks: Attempted to remove non-existent subscription for websocket: {websocket}") # WARNING: Connection retries and fallbacks
            return
            
        subscription = self.subscriptions.pop(websocket)
        logger.info(f"Client disconnection: Removing live regression subscription for {subscription.symbol} with {len(subscription.timeframes)} timeframes") # INFO: Client disconnections
        
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
                    logger.info(f"Cleanup operations: Deleting calculation context for {context_key}") # WARNING: Cleanup operations
                    del self.calculation_contexts[context_key]
                
                if context_key in self.calculation_tasks:
                    logger.info(f"Cleanup operations: Cancelling calculation task for {context_key}") # WARNING: Cleanup operations
                    self.calculation_tasks[context_key].cancel()
                    del self.calculation_tasks[context_key]
        
        # Check if we can clean up Redis subscription for this symbol
        symbol_subs = [s for s in self.subscriptions.values() if s.symbol == subscription.symbol]
        if not symbol_subs and subscription.symbol in self.redis_subscriptions:
            logger.info(f"Cleanup operations: Unsubscribing from Redis for symbol {subscription.symbol}") # WARNING: Cleanup operations
            pubsub = self.redis_subscriptions.pop(subscription.symbol)
            await pubsub.unsubscribe()
            await pubsub.close()
        
        logger.info(f"Removed live regression subscription for {subscription.symbol} with {len(subscription.timeframes)} timeframes")
    
    async def _load_historical_data(self, context: RegressionCalculationContext):
        """Load historical data from InfluxDB."""
        logger.debug(f"Loading historical data for {context.symbol}:{context.interval}") # DEBUG: Tick processing details
        try:
            end_time = datetime.now(dt_timezone.utc)
            start_time = end_time - timedelta(days=30)
            
            # Use the same query logic as the regression service
            is_high_frequency = context.interval.endswith('s') or context.interval.endswith('tick')
            et_zone = ZoneInfo("America/New_York")
            start_et, end_et = start_time.astimezone(et_zone), end_time.astimezone(et_zone)
            
            if is_high_frequency:
                # Day by day approach for high frequency
                all_candles = []
                date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D').sort_values(ascending=False)
                
                for day in date_range[:7]:  # Only last 7 days for live regression
                    day_start_et = datetime.combine(day, datetime.min.time(), tzinfo=et_zone)
                    day_end_et = day_start_et + timedelta(days=1)
                    
                    query_start = max(day_start_et.astimezone(dt_timezone.utc), start_time)
                    query_end = min(day_end_et.astimezone(dt_timezone.utc), end_time)
                    
                    measurement_name = f"ohlc_{context.symbol}_{day.strftime('%Y%m%d')}_{context.interval}"
                    
                    flux_query = f"""
                        from(bucket: "{settings.INFLUX_BUCKET}")
                          |> range(start: {query_start.isoformat()}, stop: {query_end.isoformat()})
                          |> filter(fn: (r) => r._measurement == "{measurement_name}" and r.symbol == "{context.symbol}")
                          |> drop(columns: ["_measurement", "_start", "_stop"])
                          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                          |> sort(columns: ["_time"], desc: false)
                          |> limit(n: 2000)
                    """
                    logger.debug(f"Detailed SQL/Flux query execution with full query text:{flux_query}") # DEBUG: Detailed SQL/Flux query execution
                    
                    try:
                        tables = query_api.query(query=flux_query)
                        daily_candles = []
                        
                        for table in tables:
                            for record in table.records:
                                utc_dt = record.get_time()
                                local_dt = utc_dt.astimezone(ZoneInfo(context.timezone))
                                fake_utc_dt = datetime(
                                    local_dt.year, local_dt.month, local_dt.day,
                                    local_dt.hour, local_dt.minute, local_dt.second,
                                    microsecond=local_dt.microsecond,
                                    tzinfo=dt_timezone.utc
                                )
                                
                                daily_candles.append(Candle(
                                    timestamp=utc_dt,
                                    open=record['open'],
                                    high=record['high'],
                                    low=record['low'],
                                    close=record['close'],
                                    volume=int(record['volume']),
                                    unix_timestamp=fake_utc_dt.timestamp()
                                ))
                        
                        all_candles.extend(daily_candles)
                        
                        if len(all_candles) >= 1000:  # Enough data for live regression
                            logger.debug(f"Data fetch completions: Reached 1000 historical candles for {context.symbol}:{context.interval}. Stopping early.") # INFO: Data fetch completions
                            break
                            
                    except Exception as e:
                        logger.warning(f"Missing data scenarios: Error querying day {day}: {e}") # WARNING: Missing data scenarios
                        continue
                
                context.historical_candles = sorted(all_candles, key=lambda c: c.unix_timestamp, reverse=True)
            else:
                # Full range approach for low frequency
                date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D')
                date_regex_part = "|".join([day.strftime('%Y%m%d') for day in date_range])
                sanitized_token = re.escape(context.symbol)
                measurement_regex = f"^ohlc_{sanitized_token}_({date_regex_part})_{context.interval}$"

                flux_query = f"""
                    from(bucket: "{settings.INFLUX_BUCKET}")
                      |> range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})
                      |> filter(fn: (r) => r._measurement =~ /{measurement_regex}/ and r.symbol == "{context.symbol}")
                      |> drop(columns: ["_measurement", "_start", "_stop"])
                      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                      |> sort(columns: ["_time"], desc: true)
                      |> limit(n: 1000)
                """
                logger.debug(f"Detailed SQL/Flux query execution with full query text:{flux_query}") # DEBUG: Detailed SQL/Flux query execution
                
                tables = query_api.query(query=flux_query)
                candles = []
                
                for table in tables:
                    for record in table.records:
                        utc_dt = record.get_time()
                        local_dt = utc_dt.astimezone(ZoneInfo(context.timezone))
                        fake_utc_dt = datetime(
                            local_dt.year, local_dt.month, local_dt.day,
                            local_dt.hour, local_dt.minute, local_dt.second,
                            microsecond=local_dt.microsecond,
                            tzinfo=dt_timezone.utc
                        )
                        
                        candles.append(Candle(
                            timestamp=utc_dt,
                            open=record['open'],
                            high=record['high'],
                            low=record['low'],
                            close=record['close'],
                            volume=int(record['volume']),
                            unix_timestamp=fake_utc_dt.timestamp()
                        ))
                
                context.historical_candles = candles
            
            logger.info(f"Data fetch completions: Loaded {len(context.historical_candles)} historical candles for {context.symbol}:{context.interval}") # INFO: Data fetch completions
                
        except Exception as e:
            logger.error(f"Database connection failures: Error loading historical data for {context.symbol}: {e}", exc_info=True) # ERROR: Database connection failures
    
    async def _load_live_data(self, context: RegressionCalculationContext):
        """Load live tick data from Redis cache and resample to required interval."""
        logger.debug(f"Loading live data for {context.symbol}:{context.interval}") # DEBUG: Tick processing details
        try:
            cache_key = f"intraday_ticks:{context.symbol}"
            cached_ticks_str = await self.redis_client.lrange(cache_key, 0, -1)
            logger.debug(f"Cache operations: Fetched {len(cached_ticks_str)} cached ticks for {context.symbol}.") # DEBUG: Cache operations
            
            if cached_ticks_str:
                ticks = [json.loads(t) for t in cached_ticks_str]
                logger.debug(f"Data transformation steps: Parsed {len(ticks)} ticks from cached data for {context.symbol}.") # DEBUG: Data transformation steps
                
                # Resample ticks to the required interval
                resampled_bars = await resample_ticks_to_bars(
                    ticks, context.interval, context.timezone
                )
                logger.debug(f"Data transformation steps: Resampled {len(ticks)} ticks into {len(resampled_bars)} bars for {context.symbol}:{context.interval}.") # DEBUG: Data transformation steps
                
                if resampled_bars:
                    # Sort by timestamp descending (newest first)
                    context.live_candles = sorted(
                        resampled_bars,
                        key=lambda c: c.unix_timestamp,
                        reverse=True
                    )
                    logger.info(f"Data fetch completions: Loaded {len(context.live_candles)} live candles for {context.symbol}:{context.interval}") # INFO: Data fetch completions
                    
        except Exception as e:
            logger.error(f"Critical data processing errors: Error loading live data for {context.symbol}: {e}", exc_info=True) # ERROR: Critical data processing errors
    
    async def _start_redis_subscription(self, symbol: str):
        """Start Redis subscription for live tick updates."""
        if symbol in self.redis_subscriptions:
            return
            
        try:
            pubsub = self.redis_client.pubsub()
            channel = f"live_ticks:{symbol}"
            await pubsub.subscribe(channel)
            self.redis_subscriptions[symbol] = pubsub
            
            asyncio.create_task(self._handle_redis_messages(symbol, pubsub))
            logger.info(f"Started Redis subscription for symbol: {symbol}")
            
        except Exception as e:
            logger.error(f"Error starting Redis subscription for {symbol}: {e}", exc_info=True)
    
    async def _handle_redis_messages(self, symbol: str, pubsub):
        """Handle incoming Redis messages for live tick updates."""
        try:
            async for message in pubsub.listen():
                logger.debug(f"Raw Redis messages and tick processing details: Received raw message from Redis on channel {symbol}: {message}") # DEBUG: Raw Redis messages and tick processing details
                if message['type'] == 'message':
                    tick_data = json.loads(message['data'])
                    await self._process_new_tick(symbol, tick_data)
        except asyncio.CancelledError:
            logger.info(f"Redis message handler for {symbol} was cancelled")
        except Exception as e:
            logger.error(f"Service failures: Error in Redis message handler for {symbol}: {e}", exc_info=True) # ERROR: Service failures
    
    async def _process_new_tick(self, symbol: str, tick_data: dict):
        relevant_contexts = [
            (key, context) for key, context in self.calculation_contexts.items()
            if context.symbol == symbol
        ]
        
        for context_key, context in relevant_contexts:
            try:
                # Process only the new tick!
                completed_bar = context.resampler.add_bar(tick_data)
                
                if completed_bar:
                    # Add the completed bar to live_candles
                    context.live_candles.insert(0, completed_bar)
                    
                    # Trim live_candles to a reasonable size
                    max_live_candles = context.regression_length + max(context.lookback_periods) + 100
                    context.live_candles = context.live_candles[:max_live_candles]
                    
                    # Calculate regression with the updated data
                    await self._calculate_and_broadcast_regression(context_key)
                    
            except Exception as e:
                logger.error(f"Error processing tick for context {context_key}: {e}")
                
    async def _start_calculation_task(self, context_key: str):
        """Start periodic regression calculation task."""
        async def calculation_loop():
            while context_key in self.calculation_contexts:
                try:
                    await self._calculate_and_broadcast_regression(context_key)
                    await asyncio.sleep(1)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in calculation loop for {context_key}: {e}", exc_info=True)
                    await asyncio.sleep(5)
        
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
            
            if context.live_candles:
                all_candles.extend(context.live_candles)
            
            if context.historical_candles:
                live_start_time = min(c.unix_timestamp for c in context.live_candles) if context.live_candles else float('inf')
                historical_candles = [c for c in context.historical_candles if c.unix_timestamp < live_start_time]
                all_candles.extend(historical_candles)
            
            all_candles.sort(key=lambda c: c.unix_timestamp, reverse=True)
            
            if len(all_candles) < context.regression_length:
                return
            
            # Calculate regression for each lookback period
            results = {}
            for lookback in context.lookback_periods:
                if lookback + context.regression_length > len(all_candles):
                    continue
                
                start_index = lookback
                end_index = start_index + context.regression_length
                
                candles_for_regression = all_candles[start_index:end_index]
                
                # Create a simple integer sequence for the x-axis
                x_values = np.array(range(len(candles_for_regression)))
                closes = np.array([c.close for c in reversed(candles_for_regression)])

                # Perform regression against the simple sequence
                slope, intercept, r_value, p_value, std_err = stats.linregress(x_values, closes)
                
                # Calculate the standard deviation of the residuals
                predicted_y = intercept + slope * x_values
                residuals = closes - predicted_y
                std_dev = np.std(residuals)

                logger.debug(f"Regression calculation intermediate steps: ... std_dev={std_dev:.4f}")
                
                results[str(lookback)] = {
                    "slope": slope,
                    "intercept": intercept,
                    "r_value": r_value,
                    "std_dev": std_dev,
                    "timestamp": datetime.now().isoformat()
                }
            
            await self._broadcast_results(context_key, results)
            context.last_calculation_time = datetime.now()
            logger.info(f"Successful regression calculations: Live regression calculated for {context_key}") # INFO: Successful regression calculations
            
        except Exception as e:
            logger.error(f"Critical data processing errors: Error calculating regression for {context_key}: {e}", exc_info=True) # ERROR: Critical data processing errors
    
    async def _broadcast_results(self, context_key: str, results: dict):
        """Broadcast regression results to all subscribers interested in this timeframe."""
        symbol, timeframe = context_key.split(":", 1)
        
        relevant_websockets = [
            ws for ws, sub in self.subscriptions.items()
            if sub.symbol == symbol and timeframe in sub.timeframes
        ]
        
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
        
        tasks = []
        for websocket in relevant_websockets:
            try:
                tasks.append(websocket.send_json(payload))
            except Exception as e:
                logger.error(f"Error preparing to send to websocket: {e}")
        
        if tasks:
            send_results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, result in enumerate(send_results):
                if isinstance(result, Exception):
                    logger.error(f"Error sending regression results: {result}")

    async def _send_initial_regression_results(self, websocket, subscription: LiveRegressionSubscription):
        """Send initial regression results for all timeframes to a new subscriber."""
        for timeframe in subscription.timeframes:
            context_key = f"{subscription.symbol}:{timeframe}"
            if context_key in self.calculation_contexts:
                await self._calculate_and_broadcast_regression(context_key)
    
    async def close(self):
        """Clean up all resources."""
        for task in self.calculation_tasks.values():
            task.cancel()
        
        for pubsub in self.redis_subscriptions.values():
            await pubsub.unsubscribe()
            await pubsub.close()
        
        await self.redis_client.close()
        logger.info("LiveRegressionService closed")

# FastAPI App
app = FastAPI(
    title="Live Regression Service",
    description="Service for real-time linear regression calculations via WebSocket",
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

# Global live regression service instance
live_regression_service = LiveRegressionService()

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("Live Regression Service starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Live Regression Service shutting down...")
    await live_regression_service.close()
    influx_client.close()

# WebSocket Routes
@app.websocket("/ws/live-regression/{symbol}/{exchange}")
async def live_regression_websocket(
    websocket: WebSocket,
    symbol: str = Path(..., description="Trading symbol (URL encoded)"),
    exchange: str = Path(..., description="Exchange (URL encoded)"),
    timeframes: str = Query(..., description="Comma-separated timeframes (e.g., '1m,5m,1h')"),
    timezone: str = Query("UTC", description="Timezone for calculations"),
    regression_length: int = Query(..., description="Number of candles for regression"),
    lookback_periods: str = Query(..., description="Comma-separated lookback periods")
):
    """WebSocket endpoint for live linear regression updates supporting multiple timeframes."""
    await websocket.accept()
    
    try:
        decoded_symbol = unquote(symbol)
        decoded_exchange = unquote(exchange)
        
        logger.info(f"Live regression connection attempt - Original: {symbol}, Decoded: {decoded_symbol}")
        
        try:
            timeframe_list = [tf.strip() for tf in timeframes.split(",")]
            if not timeframe_list:
                raise ValueError("At least one timeframe must be specified")
        except ValueError as e:
            await websocket.send_json({
                "type": "error",
                "message": f"Invalid timeframes format: {str(e)}"
            })
            await websocket.close()
            return
        
        try:
            lookback_list = [int(x.strip()) for x in lookback_periods.split(",")]
        except ValueError:
            await websocket.send_json({
                "type": "error",
                "message": "Invalid lookback_periods format. Use comma-separated integers."
            })
            await websocket.close()
            return
        
        if regression_length < 2:
            await websocket.send_json({
                "type": "error",
                "message": "Regression length must be at least 2"
            })
            await websocket.close()
            return
        
        if regression_length > 1000:
            await websocket.send_json({
                "type": "error",
                "message": "Regression length cannot exceed 1000"
            })
            await websocket.close()
            return
        
        invalid_timeframes = []
        for tf in timeframe_list:
            try:
                Interval(tf)
            except ValueError:
                invalid_timeframes.append(tf)
        
        if invalid_timeframes:
            await websocket.send_json({
                "type": "error", 
                "message": f"Invalid timeframes: {', '.join(invalid_timeframes)}"
            })
            await websocket.close()
            return
        
        subscription = LiveRegressionSubscription(
            websocket=websocket,
            symbol=decoded_symbol,
            exchange=decoded_exchange,
            timeframes=timeframe_list,
            timezone=timezone,
            regression_length=regression_length,
            lookback_periods=lookback_list
        )
        
        success = await live_regression_service.add_subscription(websocket, subscription)
        
        if not success:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to initialize live regression subscription"
            })
            await websocket.close()
            return
        
        logger.info(f"Live regression subscription started for {decoded_symbol} with timeframes: {timeframe_list}")
        
        await websocket.send_json({
            "type": "subscription_confirmed",
            "symbol": decoded_symbol,
            "exchange": decoded_exchange,
            "timeframes": timeframe_list,
            "regression_length": regression_length,
            "lookback_periods": lookback_list,
            "timezone": timezone,
            "timestamp": datetime.now().isoformat()
        })
        
        while True:
            try:
                message = await websocket.receive_text()
                await websocket.send_json({
                    "type": "heartbeat", 
                    "received": message,
                    "timestamp": datetime.now().isoformat()
                })
            except WebSocketDisconnect:
                break
                
    except WebSocketDisconnect:
        logger.info(f"Live regression client disconnected: {decoded_symbol if 'decoded_symbol' in locals() else symbol}")
    except Exception as e:
        logger.error(f"Error in live regression websocket for {symbol}: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Internal server error: {str(e)}",
                "timestamp": datetime.now().isoformat()
            })
        except:
            pass
    finally:
        await live_regression_service.remove_subscription(websocket)
        logger.info(f"Cleaned up live regression subscription for {symbol}")

# HTTP Routes
@app.get("/live-regression/status", tags=["Live Regression"])
async def get_live_regression_status():
    """Get the current status of live regression subscriptions."""
    try:
        active_subscriptions = len(live_regression_service.subscriptions)
        active_contexts = len(live_regression_service.calculation_contexts)
        active_redis_subs = len(live_regression_service.redis_subscriptions)
        
        contexts_by_symbol = {}
        for context_key in live_regression_service.calculation_contexts.keys():
            symbol, timeframe = context_key.split(":", 1)
            if symbol not in contexts_by_symbol:
                contexts_by_symbol[symbol] = []
            contexts_by_symbol[symbol].append(timeframe)
        
        return {
            "status": "healthy",
            "active_subscriptions": active_subscriptions,
            "active_calculation_contexts": active_contexts,
            "active_redis_subscriptions": active_redis_subs,
            "contexts": list(live_regression_service.calculation_contexts.keys()),
            "contexts_by_symbol": contexts_by_symbol
        }
    except Exception as e:
        logger.error(f"Error getting live regression status: {e}", exc_info=True)
        return {
            "status": "error",
            "message": str(e)
        }

@app.get("/live-regression/test-encoding/{symbol}", tags=["Live Regression"])
async def test_symbol_encoding(symbol: str = Path(..., description="Test symbol encoding")):
    """Test endpoint to verify symbol encoding/decoding."""
    decoded_symbol = unquote(symbol)
    return {
        "original": symbol,
        "decoded": decoded_symbol,
        "re_encoded": quote(decoded_symbol),
        "test_passed": symbol == quote(decoded_symbol)
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Live Regression Service health check."""
    redis_connected = True
    influx_connected = True
    
    try:
        await live_regression_service.redis_client.ping()
        logger.info("Health check results: Redis connection successful.") # INFO: Health check results
    except Exception:
        redis_connected = False
        logger.error("Database connection failures: Redis connection failed during health check.") # ERROR: Database connection failures
    
    try:
        test_query = f'from(bucket: "{settings.INFLUX_BUCKET}") |> range(start: -1m) |> limit(n: 1)'
        query_api.query(query=test_query)
        logger.info("Health check results: InfluxDB connection successful.") # INFO: Health check results
    except Exception:
        influx_connected = False
        logger.error("Database connection failures: InfluxDB connection failed during health check.") # ERROR: Database connection failures
    
    active_subscriptions = len(live_regression_service.subscriptions)
    active_contexts = len(live_regression_service.calculation_contexts)
    
    status = "healthy" if (redis_connected and influx_connected) else "unhealthy"
    logger.info(f"Health check results: Service status: {status}, Redis connected: {redis_connected}, InfluxDB connected: {influx_connected}, Active subscriptions: {active_subscriptions}, Active contexts: {active_contexts}") # INFO: Health check results
    
    return {
        "status": status,
        "redis_connected": redis_connected,
        "influx_connected": influx_connected,
        "active_subscriptions": active_subscriptions,
        "active_calculation_contexts": active_contexts,
        "service": "live_regression",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8007, 
        log_level="warning",  # Suppress info/debug
        access_log=False,     # No access logs in terminal
    )