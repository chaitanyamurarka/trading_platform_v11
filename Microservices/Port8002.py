# Port 8002 - Historical Regular Data Service
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

# Logging Setup
def setup_logging():
    log_formatter = logging.Formatter('%(asctime)s - HISTORICAL_REGULAR - %(levelname)s - %(message)s')
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    return root_logger

setup_logging()
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

class HistoricalDataResponse(BaseModel):
    request_id: Optional[str] = Field(None, description="A cursor for fetching the next chunk of data, if more is available.")
    candles: List[Candle] = Field(description="The list of OHLC candle data.")
    is_partial: bool = Field(description="True if the returned 'candles' are a subset of the total available.")
    message: str = Field(description="A descriptive message about the result of the data load.")

class HistoricalDataChunkResponse(BaseModel):
    request_id: Optional[str] = Field(None, description="The new cursor for the next page of data.")
    candles: List[Candle]
    is_partial: bool
    limit: int

# InfluxDB Client Setup
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG, timeout=60_000)
query_api = influx_client.query_api()
INITIAL_FETCH_LIMIT = 5000

class HistoricalService:
    @staticmethod
    def _query_and_process_influx_data(flux_query: str, timezone_str: str) -> List[Candle]:
        """Helper to run a Flux query and convert results to Candle schemas."""
        logger.info(f"Executing Flux Query:\n{flux_query}")
        try:
            target_tz = ZoneInfo(timezone_str)
        except Exception:
            target_tz = ZoneInfo("UTC")

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
        logger.info(f"Processed {len(candles)} candles from InfluxDB")
        return candles

    @staticmethod
    def _fetch_data_full_range(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone: str, limit: int) -> tuple[List[Candle], Optional[datetime]]:
        """Fetches data by querying all measurements in the date range at once."""
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
        
        candles = HistoricalService._query_and_process_influx_data(flux_query, timezone)
        
        next_cursor_timestamp = None
        if len(candles) >= limit and candles[0].timestamp > start_utc:
            next_cursor_timestamp = candles[0].timestamp - timedelta(microseconds=1)
        
        return candles, next_cursor_timestamp

    @staticmethod
    def _fetch_data_day_by_day(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone_str: str, limit: int) -> tuple[List[Candle], Optional[datetime]]:
        """Correctly fetches data by querying day-by-day, newest to oldest, until the limit is reached."""
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
            
            daily_candles = HistoricalService._query_and_process_influx_data(flux_query, timezone_str)
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
    def _create_cursor(original_start_iso: str, original_end_iso: str, next_start_iso: Optional[str], token: str, interval: str, timezone: str) -> Optional[str]:
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
        return base64.urlsafe_b64encode(json.dumps(cursor_data).encode()).decode()

    @staticmethod
    def get_historical_data(session_token: str, exchange: str, token: str, interval_val: str, start_time: datetime, end_time: datetime, timezone: str) -> HistoricalDataResponse:
        """Get historical data for the given parameters."""
        start_utc, end_utc = start_time.astimezone(dt_timezone.utc), end_time.astimezone(dt_timezone.utc)
        
        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        if is_high_frequency:
            regular_candles, next_cursor_timestamp = HistoricalService._fetch_data_day_by_day(token, interval_val, start_utc, end_utc, timezone, INITIAL_FETCH_LIMIT)
        else:
            regular_candles, next_cursor_timestamp = HistoricalService._fetch_data_full_range(token, interval_val, start_utc, end_utc, timezone, INITIAL_FETCH_LIMIT)

        if not regular_candles:
            return HistoricalDataResponse(candles=[], is_partial=False, message="No data available for this range.", request_id=None)
        
        is_partial = next_cursor_timestamp is not None
        next_cursor = HistoricalService._create_cursor(
            start_utc.isoformat(), 
            end_utc.isoformat(),
            next_cursor_timestamp.isoformat() if next_cursor_timestamp else None,
            token, 
            interval_val, 
            timezone
        )
        return HistoricalDataResponse(request_id=next_cursor, candles=regular_candles, is_partial=is_partial, message=f"Loaded initial {len(regular_candles)} bars.")

    @staticmethod
    def get_historical_chunk(request_id: str, offset: Optional[int], limit: int) -> HistoricalDataChunkResponse:
        """Get a chunk of historical data using pagination cursor."""
        try:
            cursor_data = json.loads(base64.urlsafe_b64decode(request_id).decode())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request_id cursor.")
        
        original_start_utc = datetime.fromisoformat(cursor_data['original_start_iso'])
        next_start_utc = datetime.fromisoformat(cursor_data['next_start_iso'])
        interval_val = cursor_data['interval']

        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        if is_high_frequency:
            regular_candles, next_cursor_timestamp = HistoricalService._fetch_data_day_by_day(
                cursor_data['token'], 
                interval_val, 
                original_start_utc, 
                next_start_utc,
                cursor_data['timezone'], 
                limit
            )
        else:
            regular_candles, next_cursor_timestamp = HistoricalService._fetch_data_full_range(
                cursor_data['token'], 
                interval_val, 
                original_start_utc, 
                next_start_utc,
                cursor_data['timezone'], 
                limit
            )
            
        if not regular_candles:
            return HistoricalDataChunkResponse(candles=[], request_id=None, is_partial=False, limit=limit)

        is_partial = next_cursor_timestamp is not None
        next_cursor = HistoricalService._create_cursor(
            cursor_data['original_start_iso'], 
            cursor_data['original_end_iso'],
            next_cursor_timestamp.isoformat() if next_cursor_timestamp else None,
            cursor_data['token'], 
            interval_val, 
            cursor_data['timezone']
        )
        return HistoricalDataChunkResponse(candles=regular_candles, request_id=next_cursor, is_partial=is_partial, limit=limit)

# FastAPI App
app = FastAPI(
    title="Historical Regular Data Service",
    description="Service for fetching historical regular OHLC data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("Historical Regular Data Service starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Historical Regular Data Service shutting down...")
    influx_client.close()

# Routes
@app.get("/historical/", response_model=HistoricalDataResponse, tags=["Historical Data"])
async def fetch_initial_historical_data(
    session_token: str = Query(...),
    exchange: str = Query(...),
    token: str = Query(...),
    interval: Interval = Query(...),
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    timezone: str = Query("UTC"),
):
    """Fetch initial historical regular data."""
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be earlier than end_time")
    
    try:
        data = HistoricalService.get_historical_data(
            session_token=session_token,
            exchange=exchange,
            token=token,
            interval_val=interval.value,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone
        )
        logger.info(f"Returning historical data for {token}")
        return data
    except Exception as e:
        logger.error(f"Error fetching historical data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching historical data: {str(e)}")

@app.get("/historical/chunk", response_model=HistoricalDataChunkResponse, tags=["Historical Data"])
async def fetch_historical_data_chunk(
    request_id: str = Query(...),
    offset: int = Query(..., ge=0),
    limit: int = Query(5000, ge=1, le=10000),
):
    """Fetch a chunk of historical regular data."""
    try:
        data = HistoricalService.get_historical_chunk(
            request_id=request_id,
            offset=offset,
            limit=limit
        )
        logger.info(f"Returning historical data chunk for request_id {request_id}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching historical chunk: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching historical chunk: {str(e)}")

@app.get("/health", tags=["Health"])
async def health_check():
    """Historical Regular Data Service health check."""
    influx_connected = True
    try:
        # Test InfluxDB connection with a simple query
        test_query = f'from(bucket: "{settings.INFLUX_BUCKET}") |> range(start: -1m) |> limit(n: 1)'
        query_api.query(query=test_query)
    except Exception as e:
        influx_connected = False
        logger.error(f"InfluxDB connection test failed: {e}")
    
    return {
        "status": "healthy" if influx_connected else "unhealthy",
        "influx_connected": influx_connected,
        "service": "historical_regular_data",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")