# src/core/container.py
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()
    
    # Infrastructure
    redis_client = providers.Singleton(...)
    influx_client = providers.Singleton(...)
    
    # Repositories
    market_data_repository = providers.Singleton(...)
    symbol_repository = providers.Singleton(...)
    
    # Services
    historical_data_service = providers.Singleton(...)
    live_data_service = providers.Singleton(...)
    regression_service = providers.Singleton(...)