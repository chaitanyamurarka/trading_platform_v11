# app/routers/live_regression_router.py - FIXED VERSION
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Path, Query, HTTPException
from typing import List
import datetime
from urllib.parse import unquote, quote  # ADDED: For URL encoding/decoding
from .. import schemas
from ..services.live_regression_service import live_regression_service, LiveRegressionSubscription

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/live-regression/{symbol}/{exchange}")
async def live_regression_websocket(
    websocket: WebSocket,
    symbol: str = Path(..., description="Trading symbol (URL encoded)"),
    exchange: str = Path(..., description="Exchange (URL encoded)"),
    timeframes: str = Query(..., description="Comma-separated timeframes (e.g., '1m,5m,1h')"),
    timezone: str = Query("UTC", description="Timezone for calculations"),
    regression_length: int = Query(..., description="Number of candles for regression"),
    lookback_periods: str = Query(..., description="Comma-separated lookback periods")
):
    """
    FIXED: WebSocket endpoint for live linear regression updates supporting multiple timeframes.
    Now properly handles URL-encoded symbols with special characters.
    
    Parameters:
    - symbol: Trading symbol (URL encoded, e.g., "@NQ#" becomes "%40NQ%23")
    - exchange: Exchange name (URL encoded)
    - timeframes: Comma-separated time intervals (e.g., "1m,5m,15m,1h")
    - timezone: Timezone for calculations (default: "UTC")
    - regression_length: Number of candles to use for regression calculation
    - lookback_periods: Comma-separated list of lookback periods (e.g., "0,1,5,10")
    
    Returns real-time regression updates in the format:
    {
        "type": "live_regression_update",
        "symbol": "@NQ#",
        "timeframe": "1m",
        "context": "@NQ#:1m",
        "results": {
            "0": {"slope": 0.123, "r_value": 0.456, "timestamp": "..."},
            "1": {"slope": 0.789, "r_value": 0.234, "timestamp": "..."}
        },
        "timestamp": "..."
    }
    """
    await websocket.accept()
    
    try:
        # FIXED: Decode URL-encoded symbols to handle special characters
        decoded_symbol = unquote(symbol)
        decoded_exchange = unquote(exchange)
        
        logger.info(f"Live regression connection attempt - Original: {symbol}, Decoded: {decoded_symbol}")
        
        # Parse timeframes
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
        
        # Parse lookback periods
        try:
            lookback_list = [int(x.strip()) for x in lookback_periods.split(",")]
        except ValueError:
            await websocket.send_json({
                "type": "error",
                "message": "Invalid lookback_periods format. Use comma-separated integers."
            })
            await websocket.close()
            return
        
        # Validate regression length
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
        
        # Validate timeframes
        invalid_timeframes = []
        for tf in timeframe_list:
            try:
                schemas.Interval(tf)
            except ValueError:
                invalid_timeframes.append(tf)
        
        if invalid_timeframes:
            await websocket.send_json({
                "type": "error", 
                "message": f"Invalid timeframes: {', '.join(invalid_timeframes)}"
            })
            await websocket.close()
            return
        
        # FIXED: Use decoded symbol for the subscription
        subscription = LiveRegressionSubscription(
            websocket=websocket,
            symbol=decoded_symbol,  # Use decoded symbol
            exchange=decoded_exchange,  # Use decoded exchange
            timeframes=timeframe_list,
            timezone=timezone,
            regression_length=regression_length,
            lookback_periods=lookback_list
        )
        
        # Add to service
        success = await live_regression_service.add_subscription(websocket, subscription)
        
        if not success:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to initialize live regression subscription"
            })
            await websocket.close()
            return
        
        logger.info(f"Live regression subscription started for {decoded_symbol} with timeframes: {timeframe_list}")
        
        # Send confirmation message
        await websocket.send_json({
            "type": "subscription_confirmed",
            "symbol": decoded_symbol,
            "exchange": decoded_exchange,
            "timeframes": timeframe_list,
            "regression_length": regression_length,
            "lookback_periods": lookback_list,
            "timezone": timezone,
            "timestamp": datetime.datetime.now().isoformat()
        })
        
        # Keep connection alive
        while True:
            try:
                # Wait for any client messages (mostly just keep-alive)
                message = await websocket.receive_text()
                # Echo back as heartbeat
                await websocket.send_json({
                    "type": "heartbeat", 
                    "received": message,
                    "timestamp": datetime.datetime.now().isoformat()
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
                "timestamp": datetime.datetime.now().isoformat()
            })
        except:
            pass
    finally:
        # Clean up subscription
        await live_regression_service.remove_subscription(websocket)
        logger.info(f"Cleaned up live regression subscription for {symbol}")

@router.get("/live-regression/status", tags=["Live Regression"])
async def get_live_regression_status():
    """Get the current status of live regression subscriptions."""
    try:
        active_subscriptions = len(live_regression_service.subscriptions)
        active_contexts = len(live_regression_service.calculation_contexts)
        active_redis_subs = len(live_regression_service.redis_subscriptions)
        
        # Group contexts by symbol for better readability
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

# ADDED: Debug endpoint to test symbol encoding
@router.get("/live-regression/test-encoding/{symbol}", tags=["Live Regression"])
async def test_symbol_encoding(symbol: str = Path(..., description="Test symbol encoding")):
    """Test endpoint to verify symbol encoding/decoding."""
    decoded_symbol = unquote(symbol)
    return {
        "original": symbol,
        "decoded": decoded_symbol,
        "re_encoded": quote(decoded_symbol),
        "test_passed": symbol == quote(decoded_symbol)
    }