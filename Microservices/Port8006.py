# Port 8006 - Linear Regression Service
import logging
import sys
import os
import json
import base64
import time
import pandas as pd
import re
import numpy as np
from datetime import datetime, timezone as dt_timezone, timedelta
from typing import List, Optional, Dict, Any
from enum import Enum
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
from zoneinfo import ZoneInfo
from influxdb_client import InfluxDBClient
from scipy import stats

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
    log_formatter = logging.Formatter('%(asctime)s - REGRESSION_SERVICE - %(levelname)s - %(message)s')
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

class RegressionRequest(BaseModel):
    symbol: str = Field(..., description="The trading symbol to analyze.")
    exchange: str = Field(..., description="The exchange where the symbol is traded.")
    regression_length: int = Field(..., description="The number of candles to use for the regression calculation.")
    lookback_periods: List[int] = Field(..., description="A list of lookback periods from the current candle.")
    timeframes: List[Interval] = Field(..., description="A list of timeframes to perform the regression on.")

class RegressionResult(BaseModel):
    slope: float = Field(..., description="The slope of the regression line.")
    r_value: float = Field(..., description="The R-value of the regression.")

class TimeframeRegressionResult(BaseModel):
    timeframe: Interval
    results: Dict[str, RegressionResult]

class RegressionResponse(BaseModel):
    request_params: RegressionRequest
    regression_results: List[TimeframeRegressionResult]

# InfluxDB Client Setup
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG, timeout=60_000)
query_api = influx_client.query_api()
INITIAL_FETCH_LIMIT = 5000

class RegressionService:
    @staticmethod
    def _query_and_process_influx_data(flux_query: str, timezone_str: str) -> List[Candle]:
        """Helper to run a Flux query and convert results to Candle schemas."""
        logger.info(f"Executing Flux Query for regression:\n{flux_query}")
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
        logger.info(f"Processed {len(candles)} candles from InfluxDB for regression")
        return candles

    @staticmethod
    def _fetch_data_full_range(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone: str, limit: int) -> List[Candle]:
        """Fetch data by querying all measurements in the date range at once."""
        logger.info("Using full-range fetch strategy for regression data.")
        et_zone = ZoneInfo("America/New_York")
        start_et, end_et = start_utc.astimezone(et_zone), end_utc.astimezone(et_zone)
        date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D')
        date_regex_part = "|".join([day.strftime('%Y%m%d') for day in date_range])
        if not date_regex_part:
            return []
        
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
        
        return RegressionService._query_and_process_influx_data(flux_query, timezone)

    @staticmethod
    def _fetch_data_day_by_day(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone_str: str, limit: int) -> List[Candle]:
        """Fetch data by querying day-by-day, newest to oldest, until the limit is reached."""
        logger.info("Using day-by-day fetch strategy for regression data.")
        all_candles = []
        
        et_zone = ZoneInfo("America/New_York")
        start_et = start_utc.astimezone(et_zone)
        end_et = end_utc.astimezone(et_zone)
        
        date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D').sort_values(ascending=False)

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
            
            daily_candles = RegressionService._query_and_process_influx_data(flux_query, timezone_str)
            if daily_candles:
                all_candles = daily_candles + all_candles
            
            if len(all_candles) >= limit:
                logger.info(f"Limit of {limit} reached. Stopping day-by-day fetch.")
                break
                
        all_candles.sort(key=lambda c: c.timestamp)
        return all_candles

    @staticmethod
    def get_historical_data(token: str, interval_val: str, start_time: datetime, end_time: datetime, timezone: str) -> List[Candle]:
        """Get historical data for regression analysis."""
        start_utc, end_utc = start_time.astimezone(dt_timezone.utc), end_time.astimezone(dt_timezone.utc)
        
        # Fetch enough data for the largest possible regression analysis
        fetch_limit = 10000  # Increase limit for regression analysis
        
        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        if is_high_frequency:
            candles = RegressionService._fetch_data_day_by_day(token, interval_val, start_utc, end_utc, timezone, fetch_limit)
        else:
            candles = RegressionService._fetch_data_full_range(token, interval_val, start_utc, end_utc, timezone, fetch_limit)

        return candles

    @staticmethod
    def calculate_regression(request: RegressionRequest) -> List[TimeframeRegressionResult]:
        """Calculate linear regression for the given request."""
        all_results = []

        for timeframe in request.timeframes:
            timeframe_results = TimeframeRegressionResult(timeframe=timeframe, results={})

            # Fetch initial data to get the latest timestamp
            end_time = datetime.now(dt_timezone.utc)
            start_time = end_time - timedelta(days=90)  # Look back up to 90 days

            try:
                candles = RegressionService.get_historical_data(
                    token=request.symbol,
                    interval_val=timeframe.value,
                    start_time=start_time,
                    end_time=end_time,
                    timezone="UTC"
                )
            except Exception as e:
                logger.error(f"Could not fetch data for timeframe {timeframe.value}: {e}")
                continue

            if not candles:
                logger.warning(f"No candles found for {request.symbol} on timeframe {timeframe.value}")
                continue

            # Sort candles by timestamp descending to easily get the latest
            sorted_candles = sorted(candles, key=lambda c: c.unix_timestamp, reverse=True)
            logger.info(f"Processing {len(sorted_candles)} candles for {request.symbol} on {timeframe.value}")

            for lookback in request.lookback_periods:
                if lookback >= len(sorted_candles):
                    logger.warning(f"Lookback period {lookback} exceeds available data ({len(sorted_candles)} candles)")
                    continue

                start_index = lookback
                end_index = start_index + request.regression_length

                if end_index > len(sorted_candles):
                    logger.warning(f"Regression length {request.regression_length} with lookback {lookback} exceeds available data")
                    continue

                candles_for_regression = sorted_candles[start_index:end_index]

                if len(candles_for_regression) < 2:
                    logger.warning(f"Not enough candles for regression: {len(candles_for_regression)}")
                    continue

                # Timestamps should be in ascending order for regression
                timestamps = [c.unix_timestamp for c in reversed(candles_for_regression)]
                closes = [c.close for c in reversed(candles_for_regression)]

                try:
                    slope, intercept, r_value, p_value, std_err = stats.linregress(timestamps, closes)
                    
                    timeframe_results.results[str(lookback)] = RegressionResult(
                        slope=slope, 
                        r_value=r_value
                    )
                    logger.info(f"Calculated regression for {request.symbol} {timeframe.value} lookback {lookback}: slope={slope:.6f}, r_value={r_value:.4f}")
                except Exception as e:
                    logger.error(f"Error calculating regression for lookback {lookback}: {e}")
                    continue

            if timeframe_results.results:
                all_results.append(timeframe_results)

        logger.info(f"Completed regression analysis for {request.symbol}. Found results for {len(all_results)} timeframes.")
        return all_results

# FastAPI App
app = FastAPI(
    title="Linear Regression Service",
    description="Service for calculating linear regression on historical data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Global regression service instance
regression_service = RegressionService()

# Lifecycle Events
@app.on_event("startup")
async def startup_event():
    logger.info("Linear Regression Service starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Linear Regression Service shutting down...")
    influx_client.close()

# Routes
@app.post("/regression", response_model=RegressionResponse, tags=["Regression"])
async def calculate_regression(request: RegressionRequest):
    """Calculate linear regression on historical data for a given symbol."""
    try:
        logger.info(f"Received regression request for {request.symbol} with {len(request.timeframes)} timeframes")
        
        # Validate request parameters
        if request.regression_length < 2:
            raise HTTPException(status_code=400, detail="Regression length must be at least 2")
        
        if request.regression_length > 1000:
            raise HTTPException(status_code=400, detail="Regression length cannot exceed 1000")
        
        if not request.lookback_periods:
            raise HTTPException(status_code=400, detail="At least one lookback period must be specified")
        
        if any(lb < 0 for lb in request.lookback_periods):
            raise HTTPException(status_code=400, detail="Lookback periods must be non-negative")
        
        if not request.timeframes:
            raise HTTPException(status_code=400, detail="At least one timeframe must be specified")

        results = regression_service.calculate_regression(request)
        
        if not results:
            logger.warning(f"No regression results found for {request.symbol}")
            
        response = RegressionResponse(request_params=request, regression_results=results)
        logger.info(f"Returning regression results for {request.symbol}: {len(results)} timeframes processed")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating regression: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error calculating regression: {str(e)}")

@app.get("/regression/test/{symbol}", tags=["Regression"])
async def test_regression(
    symbol: str,
    timeframe: Interval = Interval.MIN_5,
    regression_length: int = 20,
    lookback_periods: str = "0,1,5,10"
):
    """Test regression calculation for a specific symbol."""
    try:
        lookback_list = [int(x.strip()) for x in lookback_periods.split(",")]
        
        test_request = RegressionRequest(
            symbol=symbol,
            exchange="test",
            regression_length=regression_length,
            lookback_periods=lookback_list,
            timeframes=[timeframe]
        )
        
        results = regression_service.calculate_regression(test_request)
        
        return {
            "symbol": symbol,
            "timeframe": timeframe.value,
            "regression_length": regression_length,
            "lookback_periods": lookback_list,
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in test regression: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error in test regression: {str(e)}")

@app.get("/health", tags=["Health"])
async def health_check():
    """Linear Regression Service health check."""
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
        "service": "linear_regression",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/regression/status", tags=["Regression"])
async def get_regression_status():
    """Get the current status of the regression service."""
    return {
        "service": "linear_regression",
        "status": "operational",
        "supported_timeframes": [interval.value for interval in Interval],
        "max_regression_length": 1000,
        "max_lookback_days": 90,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006, log_level="info")