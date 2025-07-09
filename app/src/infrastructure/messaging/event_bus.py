# src/infrastructure/messaging/event_bus.py
from typing import Dict, List, Callable
import asyncio

class EventBus:
    def __init__(self):
        self._handlers: Dict[str, List[Callable]] = {}
    
    def subscribe(self, event_type: str, handler: Callable):
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)
    
    async def publish(self, event_type: str, data: dict):
        if event_type in self._handlers:
            tasks = [handler(data) for handler in self._handlers[event_type]]
            await asyncio.gather(*tasks)