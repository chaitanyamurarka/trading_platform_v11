# Port 8004 - Historical Heikin Ashi Data Service
import logging
import sys
import os
import json
import base64
import time
import pandas as pd
import re
from datetime import datetime, timezone as dt_timezone, timedelta
from typing import List, Optional, Dict, Any
from enum import Enum
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
from zoneinfo import ZoneInfo
from influxdb_client import InfluxDBClient

load_dotenv()

# Configuration
class Settings(BaseSettings):
    INFLUX_URL: str = os.getenv("INFLUX_URL")
    INFLUX_TOKEN: str = os.getenv("INFLUX_TOKEN")
    INFLUX_ORG: str = os.getenv("INFLUX_ORG")
    INFLUX_BUCKET: str = "trading_data"

settings = Settings()

from logging_config import setup_logging, correlation_id
setup_logging("historical_heikin_ashi")
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

class HeikinAshiCandle(BaseModel):
    open: float = Field(..., description="Heikin Ashi opening price")
    high: float = Field(..., description="Heikin Ashi highest price") 
    low: float = Field(..., description="Heikin Ashi lowest price")
    close: float = Field(..., description="Heikin Ashi closing price")
    volume: Optional[float] = Field(None, description="Trading volume")
    unix_timestamp: float = Field(..., description="UNIX timestamp")
    
    regular_open: Optional[float] = Field(None, description="Original OHLC open")
    regular_close: Optional[float] = Field(None, description="Original OHLC close")

class HeikinAshiDataResponse(BaseModel):
    request_id: Optional[str] = Field(None, description="Unique ID for pagination (cursor).")
    candles: List[HeikinAshiCandle] = Field(description="List of Heikin Ashi candles")
    is_partial: bool = Field(description="True if this is a subset of total data")
    message: str = Field(description="Descriptive message about the result")

class HeikinAshiDataChunkResponse(BaseModel):
    request_id: Optional[str] = Field(None, description="The new cursor for the next page.")
    candles: List[HeikinAshiCandle] = Field(description="List of Heikin Ashi candles for this chunk")
    is_partial: bool
    limit: int

# InfluxDB Client Setup
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG, timeout=60_000)
query_api = influx_client.query_api()
INITIAL_FETCH_LIMIT = 5000

class HeikinAshiService:
    @staticmethod
    def _query_and_process_influx_data(flux_query: str, timezone_str: str) -> List[Candle]:
        """Helper to run a Flux query and convert results to Candle schemas."""
        logger.debug(f"Executing Flux Query:\n{flux_query}") # DEBUG: Log full query text
        try:
            target_tz = ZoneInfo(timezone_str)
        except Exception:
            target_tz = ZoneInfo("UTC")
            logger.warning(f"Invalid timezone '{timezone_str}' provided. Defaulting to UTC.") # WARNING: Invalid parameters

        tables = query_api.query(query=flux_query)
        candles = []
        
        for table in tables:
            for record in table.records:
                utc_dt = record.get_time()
                local_dt = utc_dt.astimezone(target_tz)
                
                fake_utc_dt = datetime(
                    local_dt.year, local_dt.month, local_dt.day,
                    local_dt.hour, local_dt.minute, local_dt.second,
                    microsecond=local_dt.microsecond,
                    tzinfo=dt_timezone.utc
                )
                unix_timestamp_for_chart = fake_utc_dt.timestamp()

                candles.append(Candle(
                    timestamp=utc_dt,
                    open=record['open'],
                    high=record['high'],
                    low=record['low'],
                    close=record['close'],
                    volume=int(record['volume']),
                    unix_timestamp=unix_timestamp_for_chart
                ))

        candles.reverse()
        logger.debug(f"Processed {len(candles)} candles from InfluxDB") # DEBUG: Tick processing details
        return candles

    @staticmethod
    def _calculate_heikin_ashi_chunk(regular_candles: List[Candle], prev_ha_candle: Optional[HeikinAshiCandle] = None) -> List[HeikinAshiCandle]:
        """Calculate Heikin Ashi candles from regular OHLC data."""
        if not regular_candles:
            return []
        
        ha_candles = []
        if prev_ha_candle:
            prev_ha_open, prev_ha_close = prev_ha_candle.open, prev_ha_candle.close
        else:
            first_candle = regular_candles[0]
            prev_ha_open = (first_candle.open + first_candle.close) / 2
            prev_ha_close = (first_candle.open + first_candle.high + first_candle.low + first_candle.close) / 4
        
        for candle in regular_candles:
            ha_close = (candle.open + candle.high + candle.low + candle.close) / 4
            ha_open = (prev_ha_open + prev_ha_close) / 2
            ha_high = max(candle.high, ha_open, ha_close)
            ha_low = min(candle.low, ha_open, ha_close)
            
            ha_candles.append(HeikinAshiCandle(
                open=ha_open,
                high=ha_high,
                low=ha_low,
                close=ha_close,
                volume=candle.volume,
                unix_timestamp=candle.unix_timestamp,
                regular_open=candle.open,
                regular_close=candle.close
            ))
            prev_ha_open, prev_ha_close = ha_open, ha_close
        
        return ha_candles

    @staticmethod
    def _fetch_data_full_range(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone: str, limit: int) -> tuple[List[Candle], Optional[datetime]]:
        """Fetch data by querying all measurements in the date range at once."""
        logger.info("Using full-range fetch strategy for low-frequency data.")
        et_zone = ZoneInfo("America/New_York")
        start_et, end_et = start_utc.astimezone(et_zone), end_utc.astimezone(et_zone)
        date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D')
        date_regex_part = "|".join([day.strftime('%Y%m%d') for day in date_range])
        if not date_regex_part:
            return [], None
        
        sanitized_token = re.escape(token)
        measurement_regex = f"^ohlc_{sanitized_token}_({date_regex_part})_{interval_val}$"

        flux_query = f"""
            from(bucket: "{settings.INFLUX_BUCKET}")
              |> range(start: {start_utc.isoformat()}, stop: {end_utc.isoformat()})
              |> filter(fn: (r) => r._measurement =~ /{measurement_regex}/ and r.symbol == "{token}")
              |> drop(columns: ["_measurement", "_start", "_stop"])
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
              |> sort(columns: ["_time"], desc: true)
              |> limit(n: {limit})
        """
        
        candles = HeikinAshiService._query_and_process_influx_data(flux_query, timezone)
        
        next_cursor_timestamp = None
        if len(candles) >= limit and candles[0].timestamp > start_utc:
            next_cursor_timestamp = candles[0].timestamp - timedelta(microseconds=1)
        
        return candles, next_cursor_timestamp

    @staticmethod
    def _fetch_data_day_by_day(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone_str: str, limit: int) -> tuple[List[Candle], Optional[datetime]]:
        """Fetch data by querying day-by-day, newest to oldest, until the limit is reached."""
        logger.info("Using day-by-day fetch strategy for high-frequency data.")
        all_candles = []
        
        et_zone = ZoneInfo("America/New_York")
        start_et = start_utc.astimezone(et_zone)
        end_et = end_utc.astimezone(et_zone)
        
        date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D').sort_values(ascending=False)
        oldest_timestamp_found = None

        for day in date_range:
            remaining_limit = limit - len(all_candles)
            
            day_start_et = datetime.combine(day, datetime.min.time(), tzinfo=et_zone)
            day_end_et = day_start_et + timedelta(days=1)
            
            query_start = max(day_start_et.astimezone(dt_timezone.utc), start_utc)
            query_end = min(day_end_et.astimezone(dt_timezone.utc), end_utc)
            
            measurement_name = f"ohlc_{token}_{day.strftime('%Y%m%d')}_{interval_val}"
            
            flux_query = f"""
                from(bucket: "{settings.INFLUX_BUCKET}")
                  |> range(start: {query_start.isoformat()}, stop: {query_end.isoformat()})
                  |> filter(fn: (r) => r._measurement == "{measurement_name}" and r.symbol == "{token}")
                  |> drop(columns: ["_measurement", "_start", "_stop"])
                  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                  |> sort(columns: ["_time"], desc: true)
                  |> limit(n: {remaining_limit})
            """
            
            daily_candles = HeikinAshiService._query_and_process_influx_data(flux_query, timezone_str)
            if daily_candles:
                if oldest_timestamp_found is None or daily_candles[0].timestamp < oldest_timestamp_found:
                    oldest_timestamp_found = daily_candles[0].timestamp
                
                all_candles = daily_candles + all_candles
            
            if len(all_candles) >= limit:
                logger.info(f"Limit of {limit} reached. Stopping day-by-day fetch.")
                break
                
        all_candles.sort(key=lambda c: c.timestamp)

        next_cursor_timestamp = None
        if len(all_candles) >= limit and oldest_timestamp_found and oldest_timestamp_found > start_utc:
            next_cursor_timestamp = oldest_timestamp_found - timedelta(microseconds=1)

        return all_candles, next_cursor_timestamp

    @staticmethod
    def _create_cursor(original_start_iso: str, original_end_iso: str, next_start_iso: Optional[str], token: str, interval: str, timezone: str, last_ha_candle: Optional[HeikinAshiCandle] = None) -> Optional[str]:
        """Create a cursor for pagination."""
        if next_start_iso is None:
            return None
            
        cursor_data: Dict[str, Any] = {
            "original_start_iso": original_start_iso, 
            "original_end_iso": original_end_iso,
            "next_start_iso": next_start_iso,
            "token": token, 
            "interval": interval, 
            "timezone": timezone
        }
        if last_ha_candle:
            cursor_data['last_ha_candle'] = last_ha_candle.model_dump_json()
        return base64.urlsafe_b64encode(json.dumps(cursor_data).encode()).decode()

    @staticmethod
    def get_heikin_ashi_data(session_token: str, exchange: str, token: str, interval_val: str, start_time: datetime, end_time: datetime, timezone: str) -> HeikinAshiDataResponse:
        """Get Heikin Ashi data for the given parameters."""
        start_utc, end_utc = start_time.astimezone(dt_timezone.utc), end_time.astimezone(dt_timezone.utc)
        
        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        if is_high_frequency:
            regular_candles, next_cursor_timestamp = HeikinAshiService._fetch_data_day_by_day(token, interval_val, start_utc, end_utc, timezone, INITIAL_FETCH_LIMIT)
        else:
            regular_candles, next_cursor_timestamp = HeikinAshiService._fetch_data_full_range(token, interval_val, start_utc, end_utc, timezone, INITIAL_FETCH_LIMIT)

        if not regular_candles:
            logger.warning("Missing data scenario: No regular data available for Heikin Ashi calculation.") # WARNING: Missing data scenarios
            return HeikinAshiDataResponse(candles=[], is_partial=False, message="No data available for this range.", request_id=None)
        
        ha_candles = HeikinAshiService._calculate_heikin_ashi_chunk(regular_candles)
        is_partial = next_cursor_timestamp is not None
        
        next_cursor = HeikinAshiService._create_cursor(
            start_utc.isoformat(), 
            end_utc.isoformat(),
            next_cursor_timestamp.isoformat() if next_cursor_timestamp else None,
            token, 
            interval_val, 
            timezone,
            ha_candles[-1] if ha_candles else None
        )
        return HeikinAshiDataResponse(request_id=next_cursor, candles=ha_candles, is_partial=is_partial, message=f"Loaded initial {len(ha_candles)} Heikin Ashi bars.")

    @staticmethod
    def get_heikin_ashi_chunk(request_id: str, offset: Optional[int], limit: int) -> HeikinAshiDataChunkResponse:
        """Get a chunk of Heikin Ashi data using pagination cursor."""
        try:
            cursor_data = json.loads(base64.urlsafe_b64decode(request_id).decode())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request_id cursor.")
        
        original_start_utc = datetime.fromisoformat(cursor_data['original_start_iso'])
        next_start_utc = datetime.fromisoformat(cursor_data['next_start_iso'])
        interval_val = cursor_data['interval']

        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        if is_high_frequency:
            regular_candles, next_cursor_timestamp = HeikinAshiService._fetch_data_day_by_day(
                cursor_data['token'], 
                interval_val, 
                original_start_utc, 
                next_start_utc,
                cursor_data['timezone'], 
                limit
            )
        else:
            regular_candles, next_cursor_timestamp = HeikinAshiService._fetch_data_full_range(
                cursor_data['token'], 
                interval_val, 
                original_start_utc, 
                next_start_utc,
                cursor_data['timezone'], 
                limit
            )
            
        if not regular_candles:
            return HeikinAshiDataChunkResponse(candles=[], request_id=None, is_partial=False, limit=limit)

        prev_ha_candle = HeikinAshiCandle.model_validate_json(cursor_data.get('last_ha_candle')) if 'last_ha_candle' in cursor_data else None
        ha_candles = HeikinAshiService._calculate_heikin_ashi_chunk(regular_candles, prev_ha_candle)
        is_partial = next_cursor_timestamp is not None
        
        next_cursor = HeikinAshiService._create_cursor(
            cursor_data['original_start_iso'], 
            cursor_data['original_end_iso'],
            next_cursor_timestamp.isoformat() if next_cursor_timestamp else None,
            cursor_data['token'], 
            interval_val, 
            cursor_data['timezone'],
            ha_candles[-1] if ha_candles else None
        )
        return HeikinAshiDataChunkResponse(candles=ha_candles, request_id=next_cursor, is_partial=is_partial, limit=limit)

# FastAPI App
app = FastAPI(
    title="Historical Heikin Ashi Data Service",
    description="Service for fetching historical Heikin Ashi data",
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

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("Historical Heikin Ashi Data Service starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Historical Heikin Ashi Data Service shutting down...")
    influx_client.close()

# Routes
@app.get("/heikin-ashi/", response_model=HeikinAshiDataResponse, tags=["Heikin Ashi Data"])
async def fetch_heikin_ashi_data(
    session_token: str = Query(...),
    exchange: str = Query(...),
    token: str = Query(...),
    interval: Interval = Query(...),
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    timezone: str = Query("UTC"),
):
    """Fetch initial Heikin Ashi data."""
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be earlier than end_time")
    
    try:
        data = HeikinAshiService.get_heikin_ashi_data(
            session_token=session_token,
            exchange=exchange,
            token=token,
            interval_val=interval.value,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone
        )
        logger.info(f"Data fetch completion: Successfully fetched {len(data.candles)} Heikin Ashi data points for {token}/{interval.value}.") # INFO: Data fetch completions
        return data
    except Exception as e:
        logger.error(f"Critical data processing error: Error fetching Heikin Ashi data for {token}/{interval.value}: {e}", exc_info=True) # ERROR: Critical data processing errors
        raise HTTPException(status_code=500, detail=f"Error fetching Heikin Ashi data: {str(e)}")

@app.get("/heikin-ashi/chunk", response_model=HeikinAshiDataChunkResponse, tags=["Heikin Ashi Data"])
async def fetch_heikin_ashi_chunk(
    request_id: str = Query(...),
    offset: int = Query(..., ge=0),
    limit: int = Query(5000, ge=1, le=10000),
):
    """Fetch a chunk of Heikin Ashi data."""
    try:
        data = HeikinAshiService.get_heikin_ashi_chunk(
            request_id=request_id,
            offset=offset,
            limit=limit
        )
        logger.info(f"Data fetch completion: Successfully fetched {len(data.candles)} Heikin Ashi data points for request_id {request_id}.") # INFO: Data fetch completions
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical data processing error: Error fetching Heikin Ashi chunk for request_id {request_id}: {e}", exc_info=True) # ERROR: Critical data processing errors
        raise HTTPException(status_code=500, detail=f"Error fetching Heikin Ashi chunk: {str(e)}")

@app.get("/health", tags=["Health"])
async def health_check():
    """Historical Heikin Ashi Data Service health check."""
    influx_connected = True
    try:
        # Test InfluxDB connection with a simple query
        test_query = f'from(bucket: "{settings.INFLUX_BUCKET}") |> range(start: -1m) |> limit(n: 1)'
        query_api.query(query=test_query)
        logger.info("Health check: InfluxDB connection successful.") # INFO: Health check results
    except Exception as e:
        influx_connected = False
        logger.error(f"Database connection failures: InfluxDB connection test failed: {e}") # ERROR: Database connection failures
    
    status = "healthy" if influx_connected else "unhealthy"
    logger.info(f"Health check result: {status}. InfluxDB connected: {influx_connected}") # INFO: Health check results
    
    return {
        "status": status,
        "influx_connected": influx_connected,
        "service": "historical_heikin_ashi_data",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8004, 
        log_level="warning",  # Suppress info/debug
        access_log=False,     # No access logs in terminal
    )