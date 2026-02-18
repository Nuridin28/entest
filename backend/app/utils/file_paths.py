"""
Утилиты для работы с путями файлов
"""
import os
from typing import Tuple

def get_upload_paths() -> Tuple[str, str]:
    """
    Возвращает базовую директорию и относительный путь для uploads
    
    Returns:
        Tuple[str, str]: (base_dir, relative_path)
        - base_dir: абсолютный путь к базовой директории (/app в Docker)
        - relative_path: относительный путь для сохранения в БД (uploads/...)
    """
    base_dir = os.environ.get('UPLOAD_BASE_DIR', '/app')
    return base_dir, "uploads"

def get_full_upload_path(relative_path: str) -> str:
    """
    Преобразует относительный путь в абсолютный
    
    Args:
        relative_path: относительный путь (например, "uploads/screen_recordings/file.webm")
    
    Returns:
        str: абсолютный путь к файлу
    """
    base_dir, _ = get_upload_paths()
    return os.path.join(base_dir, relative_path)

def get_relative_upload_path(file_type: str, filename: str) -> str:
    """
    Создает относительный путь для файла
    
    Args:
        file_type: тип файла (screen_recordings, initial_photos, etc.)
        filename: имя файла
    
    Returns:
        str: относительный путь для сохранения в БД
    """
    _, uploads_dir = get_upload_paths()
    return os.path.join(uploads_dir, file_type, filename)

def ensure_upload_directory(file_type: str) -> str:
    """
    Создает директорию для загрузки файлов и возвращает абсолютный путь
    
    Args:
        file_type: тип файла (screen_recordings, initial_photos, etc.)
    
    Returns:
        str: абсолютный путь к директории
    """
    base_dir, uploads_dir = get_upload_paths()
    full_dir = os.path.join(base_dir, uploads_dir, file_type)
    os.makedirs(full_dir, exist_ok=True)
    return full_dir

                            
class FileTypes:
    SCREEN_RECORDINGS = "screen_recordings"
    INITIAL_PHOTOS = "initial_photos"
    CHUNKS = "chunks"
    PROCTORING = "proctoring"
    AUDIO = "audio"
    