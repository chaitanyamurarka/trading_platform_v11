# Port 8006 - Linear Regression Service with Paging Support
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
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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

from logging_config import setup_logging, correlation_id
setup_logging("regression_service")
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
    # NEW: Add timestamp fields for consistency
    start_time: Optional[datetime] = Field(None, description="Start time for data fetching")
    end_time: Optional[datetime] = Field(None, description="End time for data fetching")
    timezone: str = Field("UTC", description="Timezone for data processing")

class RegressionResult(BaseModel):
    slope: float = Field(..., description="The slope of the regression line.")
    intercept: float = Field(..., description="The intercept of the regression line.")
    r_value: float = Field(..., description="The R-value of the regression.")
    std_dev: float = Field(..., description="The standard deviation from the regression line.")
    timestamp: str = Field(..., description="ISO timestamp when this result was calculated")

class TimeframeRegressionResult(BaseModel):
    timeframe: Interval
    results: Dict[str, RegressionResult]
    data_count: int = Field(..., description="Number of data points used")
    is_partial: bool = Field(False, description="Whether this is a partial result")

class RegressionResponse(BaseModel):
    request_params: RegressionRequest
    regression_results: List[TimeframeRegressionResult]
    request_id: Optional[str] = Field(None, description="Cursor for pagination if results are partial")
    is_partial: bool = Field(False, description="Whether more results are available")
    timestamp: str = Field(..., description="ISO timestamp of the response")

# NEW: Paging-related schemas
class RegressionPageRequest(BaseModel):
    request_id: str = Field(..., description="The pagination cursor from previous response")
    limit: int = Field(50, ge=1, le=100, description="Maximum number of lookback periods per page")

class PaginationState(BaseModel):
    """State information for pagination"""
    original_request: RegressionRequest
    processed_timeframes: List[str] = []
    current_timeframe_index: int = 0
    current_lookback_index: int = 0
    total_results: Dict[str, TimeframeRegressionResult] = {}

# InfluxDB Client Setup
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG, timeout=60_000)
query_api = influx_client.query_api()

# Constants
INITIAL_FETCH_LIMIT = 5000
MAX_CANDLES_PER_FETCH = 10000  # Maximum candles to fetch per timeframe
LOOKBACK_PERIODS_PER_PAGE = 20  # Number of lookback periods to process per page

class RegressionService:
    @staticmethod
    def _query_and_process_influx_data(flux_query: str, timezone_str: str) -> List[Candle]:
        """Helper to run a Flux query and convert results to Candle schemas."""
        logger.debug(f"Detailed SQL/Flux query execution with full query text:\n{flux_query}")
        try:
            target_tz = ZoneInfo(timezone_str)
        except Exception:
            target_tz = ZoneInfo("UTC")
            logger.warning(f"Invalid parameters with auto-correction: Timezone '{timezone_str}' not found. Defaulting to UTC.")

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
        logger.debug(f"Processed {len(candles)} candles from InfluxDB for regression")
        return candles

    @staticmethod
    def _fetch_data_with_limit(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone: str, limit: int) -> Tuple[List[Candle], bool]:
        """Fetch data with a specific limit and indicate if more data is available."""
        is_high_frequency = interval_val.endswith('s') or interval_val.endswith('tick')
        
        if is_high_frequency:
            candles = RegressionService._fetch_data_day_by_day_limited(token, interval_val, start_utc, end_utc, timezone, limit)
        else:
            candles = RegressionService._fetch_data_full_range_limited(token, interval_val, start_utc, end_utc, timezone, limit)
        
        # Check if we got the full limit, indicating more data might be available
        is_more_data = len(candles) >= limit
        
        return candles, is_more_data

    @staticmethod
    def _fetch_data_full_range_limited(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone: str, limit: int) -> List[Candle]:
        """Fetch data by querying all measurements in the date range with a limit."""
        logger.info(f"Using full-range fetch strategy for regression data with limit {limit}.")
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
    def _fetch_data_day_by_day_limited(token: str, interval_val: str, start_utc: datetime, end_utc: datetime, timezone_str: str, limit: int) -> List[Candle]:
        """Fetch data by querying day-by-day with a total limit."""
        logger.info(f"Using day-by-day fetch strategy for regression data with limit {limit}.")
        all_candles = []
        
        et_zone = ZoneInfo("America/New_York")
        start_et = start_utc.astimezone(et_zone)
        end_et = end_utc.astimezone(et_zone)
        
        date_range = pd.date_range(start=start_et.date(), end=end_et.date(), freq='D').sort_values(ascending=False)

        for day in date_range:
            remaining_limit = limit - len(all_candles)
            if remaining_limit <= 0:
                break
                
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
                
        all_candles.sort(key=lambda c: c.timestamp)
        return all_candles[:limit]  # Ensure we don't exceed the limit

    @staticmethod
    def _create_pagination_cursor(state: PaginationState) -> str:
        """Create a pagination cursor from the current state."""
        
        # Convert the original request to a dictionary
        request_dict = state.original_request.dict()
        
        # Manually convert datetime objects to ISO 8601 strings
        if isinstance(request_dict.get('start_time'), datetime):
            request_dict['start_time'] = request_dict['start_time'].isoformat()
        if isinstance(request_dict.get('end_time'), datetime):
            request_dict['end_time'] = request_dict['end_time'].isoformat()

        cursor_data = {
            "original_request": request_dict,
            "processed_timeframes": state.processed_timeframes,
            "current_timeframe_index": state.current_timeframe_index,
            "current_lookback_index": state.current_lookback_index,
            "total_results": {k: v.dict() for k, v in state.total_results.items()}
        }
        
        # Encode the dictionary to a JSON string and then to base64
        return base64.urlsafe_b64encode(json.dumps(cursor_data).encode()).decode()

    @staticmethod
    def _decode_pagination_cursor(cursor: str) -> PaginationState:
        """Decode a pagination cursor back to state."""
        try:
            # Decode the base64 string and then the JSON string
            cursor_data = json.loads(base64.urlsafe_b64decode(cursor).decode())

            # Manually convert ISO 8601 strings back to datetime objects
            request_dict = cursor_data.get("original_request", {})
            if request_dict.get('start_time') and isinstance(request_dict['start_time'], str):
                request_dict['start_time'] = datetime.fromisoformat(request_dict['start_time'])
            if request_dict.get('end_time') and isinstance(request_dict['end_time'], str):
                request_dict['end_time'] = datetime.fromisoformat(request_dict['end_time'])

            # Reconstruct the PaginationState object
            state = PaginationState(
                original_request=RegressionRequest(**request_dict),
                processed_timeframes=cursor_data.get("processed_timeframes", []),
                current_timeframe_index=cursor_data.get("current_timeframe_index", 0),
                current_lookback_index=cursor_data.get("current_lookback_index", 0),
                total_results={k: TimeframeRegressionResult(**v) for k, v in cursor_data.get("total_results", {}).items()}
            )
            return state
        except Exception as e:
            logger.error(f"Error decoding pagination cursor: {e}")
            raise HTTPException(status_code=400, detail="Invalid pagination cursor")

    @staticmethod
    def calculate_regression_paginated(request: RegressionRequest, page_size: int = LOOKBACK_PERIODS_PER_PAGE) -> RegressionResponse:
        """Calculate linear regression with pagination support."""
        state = PaginationState(original_request=request)
        results = []
        
        # Determine time range
        if request.start_time and request.end_time:
            start_time = request.start_time.astimezone(dt_timezone.utc)
            end_time = request.end_time.astimezone(dt_timezone.utc)
        else:
            # Default to last 90 days if not specified
            end_time = datetime.now(dt_timezone.utc)
            start_time = end_time - timedelta(days=90)
        
        timezone = request.timezone or "UTC"
        
        # Process timeframes
        for tf_index, timeframe in enumerate(request.timeframes):
            if tf_index < state.current_timeframe_index:
                continue  # Skip already processed timeframes
                
            timeframe_result = TimeframeRegressionResult(
                timeframe=timeframe,
                results={},
                data_count=0,
                is_partial=False
            )
            
            # Fetch data for this timeframe with limit
            try:
                candles, has_more_data = RegressionService._fetch_data_with_limit(
                    token=request.symbol,
                    interval_val=timeframe.value,
                    start_utc=start_time,
                    end_utc=end_time,
                    timezone=timezone,
                    limit=MAX_CANDLES_PER_FETCH
                )
                
                if not candles:
                    logger.warning(f"No candles found for {request.symbol} on timeframe {timeframe.value}")
                    continue
                
                sorted_candles = sorted(candles, key=lambda c: c.unix_timestamp, reverse=True)
                timeframe_result.data_count = len(sorted_candles)
                
                # Process lookback periods for this page
                lookback_start = state.current_lookback_index if tf_index == state.current_timeframe_index else 0
                lookback_end = min(lookback_start + page_size, len(request.lookback_periods))
                
                for lb_index in range(lookback_start, lookback_end):
                    lookback = request.lookback_periods[lb_index]
                    
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
                        continue
                    
                    # Calculate regression
                    x_values = np.array(range(len(candles_for_regression)))
                    closes = np.array([c.close for c in reversed(candles_for_regression)])
                    
                    try:
                        slope, intercept, r_value, p_value, std_err = stats.linregress(x_values, closes)
                        predicted_y = intercept + slope * x_values
                        residuals = closes - predicted_y
                        std_dev = np.std(residuals)
                        
                        timeframe_result.results[str(lookback)] = RegressionResult(
                            slope=slope,
                            intercept=intercept,
                            r_value=r_value,
                            std_dev=std_dev,
                            timestamp=datetime.now().isoformat()
                        )
                        
                    except Exception as e:
                        logger.error(f"Error calculating regression for lookback {lookback}: {e}")
                        continue
                
                # Check if we processed all lookback periods for this timeframe
                if lookback_end < len(request.lookback_periods):
                    timeframe_result.is_partial = True
                    state.current_timeframe_index = tf_index
                    state.current_lookback_index = lookback_end
                else:
                    state.current_lookback_index = 0
                    state.processed_timeframes.append(timeframe.value)
                
                if timeframe_result.results:
                    results.append(timeframe_result)
                    state.total_results[timeframe.value] = timeframe_result
                
                # If we've filled a page, stop processing
                if timeframe_result.is_partial:
                    break
                    
            except Exception as e:
                logger.error(f"Error processing timeframe {timeframe.value}: {e}")
                continue
        
        # Determine if there are more results
        is_partial = (
            state.current_timeframe_index < len(request.timeframes) - 1 or
            (state.current_timeframe_index == len(request.timeframes) - 1 and 
             state.current_lookback_index < len(request.lookback_periods))
        )
        
        # Create response
        response = RegressionResponse(
            request_params=request,
            regression_results=results,
            is_partial=is_partial,
            timestamp=datetime.now().isoformat()
        )
        
        if is_partial:
            response.request_id = RegressionService._create_pagination_cursor(state)
        
        logger.info(f"Completed regression analysis page for {request.symbol}. Results: {len(results)} timeframes, partial: {is_partial}")
        return response

    @staticmethod
    def get_next_regression_page(page_request: RegressionPageRequest) -> RegressionResponse:
        """Get the next page of regression results."""
        state = RegressionService._decode_pagination_cursor(page_request.request_id)
        
        # Continue from where we left off
        return RegressionService.calculate_regression_paginated(
            state.original_request,
            page_size=page_request.limit
        )

# FastAPI App
app = FastAPI(
    title="Linear Regression Service",
    description="Service for calculating linear regression on historical data with pagination support",
    version="2.0.0",
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
    """Calculate linear regression on historical data with pagination support."""
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
        
        # Ensure timestamps are provided
        if not request.start_time or not request.end_time:
            logger.info("No timestamps provided, using default 90-day range")
            request.end_time = datetime.now(dt_timezone.utc)
            request.start_time = request.end_time - timedelta(days=90)

        results = regression_service.calculate_regression_paginated(request)
        
        if not results.regression_results:
            logger.warning(f"No regression results found for {request.symbol}")
        else:
            logger.info(f"Successful regression calculations: Found results for {len(results.regression_results)} timeframes.")
            
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating regression: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error calculating regression: {str(e)}")

@app.post("/regression/page", response_model=RegressionResponse, tags=["Regression"])
async def get_regression_page(page_request: RegressionPageRequest):
    """Get the next page of regression results using a pagination cursor."""
    try:
        logger.info(f"Fetching regression page with cursor: {page_request.request_id[:20]}...")
        
        results = regression_service.get_next_regression_page(page_request)
        
        logger.info(f"Returned {len(results.regression_results)} timeframe results, partial: {results.is_partial}")
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching regression page: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching regression page: {str(e)}")

@app.get("/regression/test/{symbol}", tags=["Regression"])
async def test_regression(
    symbol: str,
    timeframe: Interval = Interval.MIN_5,
    regression_length: int = 20,
    lookback_periods: str = "0,1,5,10",
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    timezone: str = Query("UTC")
):
    """Test regression calculation for a specific symbol with pagination."""
    try:
        lookback_list = [int(x.strip()) for x in lookback_periods.split(",")]
        
        # Use provided timestamps or defaults
        if not end_time:
            end_time = datetime.now(dt_timezone.utc)
        if not start_time:
            start_time = end_time - timedelta(days=30)
        
        test_request = RegressionRequest(
            symbol=symbol,
            exchange="test",
            regression_length=regression_length,
            lookback_periods=lookback_list,
            timeframes=[timeframe],
            start_time=start_time,
            end_time=end_time,
            timezone=timezone
        )
        
        results = regression_service.calculate_regression_paginated(test_request)
        
        return {
            "symbol": symbol,
            "timeframe": timeframe.value,
            "regression_length": regression_length,
            "lookback_periods": lookback_list,
            "results": results.regression_results,
            "is_partial": results.is_partial,
            "request_id": results.request_id,
            "timestamp": results.timestamp
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
        logger.info("Health check results: InfluxDB connection successful.")
    except Exception as e:
        influx_connected = False
        logger.error(f"Database connection failures: InfluxDB connection test failed: {e}")
    
    status = "healthy" if influx_connected else "unhealthy"
    logger.info(f"Health check results: Service status: {status}, InfluxDB connected: {influx_connected}")
    
    return {
        "status": status,
        "influx_connected": influx_connected,
        "service": "linear_regression",
        "version": "2.0.0",
        "features": ["pagination", "timestamp_support"],
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
        "max_candles_per_fetch": MAX_CANDLES_PER_FETCH,
        "lookback_periods_per_page": LOOKBACK_PERIODS_PER_PAGE,
        "features": {
            "pagination": True,
            "timestamp_support": True,
            "multi_timeframe": True
        },
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8006, 
        log_level="warning",
        access_log=False,
    )