"""
Middleware для работы с временными зонами
Автоматически добавляет информацию о временной зоне Алматы в ответы API
"""
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from ..utils.timezone import get_almaty_timezone_info
import json


class TimezoneMiddleware(BaseHTTPMiddleware):
    """Middleware для добавления информации о временной зоне в заголовки ответов"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
                                                           
        timezone_info = get_almaty_timezone_info()
        response.headers["X-Timezone"] = timezone_info["timezone"]
        response.headers["X-Timezone-Offset"] = timezone_info["offset"]
        response.headers["X-Current-Time-Almaty"] = timezone_info["current_time"]
        
        return response


def add_timezone_to_response(data: dict) -> dict:
    """Добавляет информацию о временной зоне к данным ответа"""
    if isinstance(data, dict):
        timezone_info = get_almaty_timezone_info()
        data["_timezone_info"] = {
            "timezone": timezone_info["timezone"],
            "name": timezone_info["name"],
            "current_time": timezone_info["current_time"],
            "offset": timezone_info["offset"]
        }
    return data