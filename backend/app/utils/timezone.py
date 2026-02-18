"""
Утилиты для работы с временными зонами
Настроено для использования временной зоны Алматы (Казахстан)
"""
from datetime import datetime, timezone, timedelta
import pytz
from typing import Optional


                               
ALMATY_TZ = pytz.timezone('Asia/Almaty')


def get_almaty_now() -> datetime:
    """Получить текущее время в временной зоне Алматы"""
    return datetime.now(ALMATY_TZ)


def utc_to_almaty(utc_dt: datetime) -> datetime:
    """Конвертировать UTC время в время Алматы"""
    if utc_dt.tzinfo is None:
                                                        
        utc_dt = utc_dt.replace(tzinfo=pytz.UTC)
    return utc_dt.astimezone(ALMATY_TZ)


def almaty_to_utc(almaty_dt: datetime) -> datetime:
    """Конвертировать время Алматы в UTC"""
    if almaty_dt.tzinfo is None:
                                                                    
        almaty_dt = ALMATY_TZ.localize(almaty_dt)
    return almaty_dt.astimezone(pytz.UTC)


def format_almaty_time(dt: datetime, format_str: str = "%d.%m.%Y, %H:%M:%S") -> str:
    """Форматировать время в формате Алматы"""
    if dt.tzinfo is None:
                                                                       
        dt = dt.replace(tzinfo=pytz.UTC)
    
    almaty_time = dt.astimezone(ALMATY_TZ)
    return almaty_time.strftime(format_str)


def get_almaty_timezone_info() -> dict:
    """Получить информацию о временной зоне Алматы"""
    now = get_almaty_now()
    return {
        "timezone": "Asia/Almaty",
        "offset": now.strftime("%z"),
        "name": "Алматы",
        "current_time": format_almaty_time(now)
    }


def create_almaty_datetime(year: int, month: int, day: int, 
                          hour: int = 0, minute: int = 0, second: int = 0) -> datetime:
    """Создать datetime объект в временной зоне Алматы"""
    return ALMATY_TZ.localize(datetime(year, month, day, hour, minute, second))


def is_same_day_almaty(dt1: datetime, dt2: datetime) -> bool:
    """Проверить, что два datetime объекта относятся к одному дню в временной зоне Алматы"""
    almaty_dt1 = utc_to_almaty(dt1) if dt1.tzinfo else ALMATY_TZ.localize(dt1)
    almaty_dt2 = utc_to_almaty(dt2) if dt2.tzinfo else ALMATY_TZ.localize(dt2)
    
    return almaty_dt1.date() == almaty_dt2.date()


def get_day_boundaries_almaty(date_dt: datetime) -> tuple[datetime, datetime]:
    """Получить начало и конец дня в временной зоне Алматы"""
    if date_dt.tzinfo is None:
        date_dt = ALMATY_TZ.localize(date_dt)
    else:
        date_dt = date_dt.astimezone(ALMATY_TZ)
    
    start_of_day = date_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = date_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    return start_of_day, end_of_day