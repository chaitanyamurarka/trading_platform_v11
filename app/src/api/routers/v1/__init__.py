# src/api/routers/v1/__init__.py
from fastapi import APIRouter
from src.api.routers.market_data_router import router as market_data_router
from src.api.routers.regression_router import router as analysis_router

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(market_data_router, prefix="/market-data", tags=["Market Data"])
v1_router.include_router(analysis_router, prefix="/analysis", tags=["Analysis"])