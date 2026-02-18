"""
API endpoints для работы с временными зонами
"""
from fastapi import APIRouter
from ....utils.timezone import get_almaty_timezone_info, format_almaty_time
from datetime import datetime

router = APIRouter()


@router.get("/info")
async def get_timezone_info():
    """Получить информацию о временной зоне Алматы"""
    return get_almaty_timezone_info()


@router.get("/current-time")
async def get_current_almaty_time():
    """Получить текущее время в временной зоне Алматы"""
    timezone_info = get_almaty_timezone_info()
    return {
        "current_time": timezone_info["current_time"],
        "timezone": timezone_info["timezone"],
        "offset": timezone_info["offset"]
    }


@router.post("/format")
async def format_time(timestamp: str):
    """Форматировать время в формате Алматы"""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        formatted_time = format_almaty_time(dt)
        return {
            "original": timestamp,
            "formatted": formatted_time,
            "timezone": "Asia/Almaty"
        }
    except ValueError as e:
        return {
            "error": f"Invalid timestamp format: {str(e)}"
        }