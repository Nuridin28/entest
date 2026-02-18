"""
Утилиты для работы с видео файлами и WebM контейнерами
"""
import os
import struct
import logging
from typing import Optional, Tuple, List
import asyncio
import aiofiles

logger = logging.getLogger(__name__)

class WebMValidator:
    """Валидатор для WebM файлов"""
    
    WEBM_SIGNATURE = b'\x1a\x45\xdf\xa3'                  
    WEBM_DOCTYPE = b'webm'
    
    @staticmethod
    async def validate_webm_header(file_path: str) -> bool:
        """Проверяет, является ли файл валидным WebM"""
        try:
            async with aiofiles.open(file_path, 'rb') as f:
                                                               
                header = await f.read(32)
                
                if len(header) < 8:
                    return False
                
                                          
                if header[:4] != WebMValidator.WEBM_SIGNATURE:
                    return False
                
                                       
                return WebMValidator.WEBM_DOCTYPE in header
                
        except Exception as e:
            logger.error(f"Error validating WebM header: {e}")
            return False
    
    @staticmethod
    async def get_file_info(file_path: str) -> dict:
        """Получает информацию о WebM файле"""
        try:
            file_size = os.path.getsize(file_path)
            is_valid = await WebMValidator.validate_webm_header(file_path)
            
            return {
                "size": file_size,
                "is_valid_webm": is_valid,
                "exists": True
            }
        except Exception as e:
            logger.error(f"Error getting file info: {e}")
            return {
                "size": 0,
                "is_valid_webm": False,
                "exists": False,
                "error": str(e)
            }

class SafeVideoAppender:
    """Безопасное добавление видео данных к существующему файлу"""
    
    def __init__(self, target_file: str):
        self.target_file = target_file
        self.temp_file = f"{target_file}.tmp"
        self.backup_file = f"{target_file}.backup"
    
    async def append_video_data(self, new_data: bytes) -> dict:
        """
        Безопасно добавляет новые видео данные к существующему файлу
        
        Returns:
            dict: Результат операции с информацией о файле
        """
        result = {
            "success": False,
            "original_size": 0,
            "new_size": 0,
            "appended_bytes": len(new_data),
            "error": None
        }
        
        try:
                                                    
            if os.path.exists(self.target_file):
                result["original_size"] = os.path.getsize(self.target_file)
                
                                         
                await self._create_backup()
                
                                                          
                if not await WebMValidator.validate_webm_header(self.target_file):
                    logger.warning(f"Target file {self.target_file} is not a valid WebM")
                                                          
                    result["warning"] = "Target file is not a valid WebM"
            
                                                 
            await self._write_to_temp_file(new_data)
            
                                                 
            await self._atomic_replace()
            
            result["new_size"] = os.path.getsize(self.target_file)
            result["success"] = True
            
                                                
            await self._cleanup_backup()
            
            logger.info(f"Successfully appended {len(new_data)} bytes to {self.target_file}")
            
        except Exception as e:
            logger.error(f"Error appending video data: {e}")
            result["error"] = str(e)
            
                                                           
            await self._restore_from_backup()
        
        finally:
                                     
            await self._cleanup_temp_files()
        
        return result
    
    async def _create_backup(self):
        """Создает резервную копию оригинального файла"""
        if os.path.exists(self.target_file):
            async with aiofiles.open(self.target_file, 'rb') as src:
                async with aiofiles.open(self.backup_file, 'wb') as dst:
                    while chunk := await src.read(8192):
                        await dst.write(chunk)
    
    async def _write_to_temp_file(self, new_data: bytes):
        """Записывает данные во временный файл"""
        async with aiofiles.open(self.temp_file, 'wb') as temp_f:
                                                      
            if os.path.exists(self.target_file):
                async with aiofiles.open(self.target_file, 'rb') as orig_f:
                    while chunk := await orig_f.read(8192):
                        await temp_f.write(chunk)
            
                                    
            await temp_f.write(new_data)
    
    async def _atomic_replace(self):
        """Атомарно заменяет оригинальный файл временным"""
        if os.path.exists(self.temp_file):
                                               
            os.rename(self.temp_file, self.target_file)
    
    async def _restore_from_backup(self):
        """Восстанавливает файл из резервной копии"""
        if os.path.exists(self.backup_file):
            try:
                os.rename(self.backup_file, self.target_file)
                logger.info(f"Restored {self.target_file} from backup")
            except Exception as e:
                logger.error(f"Failed to restore from backup: {e}")
    
    async def _cleanup_backup(self):
        """Удаляет резервную копию"""
        if os.path.exists(self.backup_file):
            try:
                os.remove(self.backup_file)
            except Exception as e:
                logger.warning(f"Failed to cleanup backup: {e}")
    
    async def _cleanup_temp_files(self):
        """Очищает временные файлы"""
        for temp_file in [self.temp_file, self.backup_file]:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp file {temp_file}: {e}")

class VideoSegmentManager:
    """Менеджер для работы с сегментами видео"""
    
    def __init__(self, base_path: str):
        self.base_path = base_path
        self.segments_dir = f"{base_path}_segments"
    
    async def create_segment(self, segment_data: bytes, segment_index: int) -> str:
        """Создает сегмент видео"""
        os.makedirs(self.segments_dir, exist_ok=True)
        segment_path = os.path.join(self.segments_dir, f"segment_{segment_index:06d}.webm")
        
        async with aiofiles.open(segment_path, 'wb') as f:
            await f.write(segment_data)
        
        return segment_path
    
    async def merge_segments(self) -> str:
        """Объединяет все сегменты в один файл"""
        if not os.path.exists(self.segments_dir):
            raise FileNotFoundError("Segments directory not found")
        
                                        
        segments = sorted([
            f for f in os.listdir(self.segments_dir) 
            if f.startswith('segment_') and f.endswith('.webm')
        ])
        
        if not segments:
            raise ValueError("No segments found")
        
                             
        async with aiofiles.open(self.base_path, 'wb') as output:
            for segment_name in segments:
                segment_path = os.path.join(self.segments_dir, segment_name)
                async with aiofiles.open(segment_path, 'rb') as segment:
                    while chunk := await segment.read(8192):
                        await output.write(chunk)
        
                          
        await self._cleanup_segments()
        
        return self.base_path
    
    async def _cleanup_segments(self):
        """Удаляет директорию с сегментами"""
        try:
            import shutil
            if os.path.exists(self.segments_dir):
                shutil.rmtree(self.segments_dir)
        except Exception as e:
            logger.warning(f"Failed to cleanup segments: {e}")

                                 
async def safe_append_video(file_path: str, new_data: bytes) -> dict:
    """Безопасно добавляет видео данные к файлу"""
    appender = SafeVideoAppender(file_path)
    return await appender.append_video_data(new_data)

async def validate_video_file(file_path: str) -> dict:
    """Валидирует видео файл"""
    return await WebMValidator.get_file_info(file_path)