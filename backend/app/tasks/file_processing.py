import os
import time
import shutil
import logging
import asyncio
import subprocess
import json
from typing import Optional, List
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.services.test_service import TestService
from app.services.preliminary_test_service import PreliminaryTestService
from app.schemas.test import TestSessionUpdate
from app.core.async_task import AsyncTask

                       
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

                                                                

async def run_subprocess_async(cmd: List[str], timeout: int) -> subprocess.CompletedProcess:
    """Запускает subprocess в отдельном потоке, чтобы не блокировать gevent loop."""
    return await asyncio.to_thread(
        subprocess.run, cmd, capture_output=True, text=True, timeout=timeout
    )

@celery_app.task(base=AsyncTask, bind=True, max_retries=3)
async def process_screen_recording(self, session_id: str, file_path: str, user_id: int):
    """
    Асинхронная обработка загруженной записи экрана (финальная стабильная версия)
    """
                                                                                 
    if not os.path.exists(file_path):
        logger.warning(f"File {file_path} not found for session {session_id}. Task is likely a duplicate. Skipping.")
                                                              
        return {"status": "skipped", "reason": "File not found"}
    
    logger.info(f"Starting screen recording processing for session {session_id}")

                                                                    
    temp_files = {file_path}
                                                        
    final_validation_result = {}
    
    try:

        file_size = os.path.getsize(file_path)
        logger.info(f"Processing file: {file_path}, size: {file_size} bytes")

                                                                                                         
        working_file_path = file_path
        
                                                       
        initial_validation = await validate_video_file(file_path)
        if not initial_validation.get("valid", False):
            logger.warning(f"Initial validation failed: {initial_validation.get('error')}. Attempting recovery.")
            
            recovered_path = await attempt_file_recovery(file_path)
            if recovered_path:
                working_file_path = recovered_path
                temp_files.add(recovered_path)
                logger.info(f"File recovery successful. Using new file: {working_file_path}")
            else:
                logger.warning("File recovery failed, proceeding with original (likely broken) file.")

                                      
                                                                                 
        if os.path.exists(working_file_path):
            logger.info(f"File size {os.path.getsize(working_file_path)} is within limits, skipping compression")

                                                                
        thumbnail_path = await create_video_thumbnail(working_file_path)
        if thumbnail_path:
            temp_files.add(thumbnail_path)

                                                        
        final_validation_result = await validate_video_file(working_file_path)

                                                              
        await update_session_with_processed_file(
            session_id=session_id,
            user_id=user_id,
            original_path=file_path,
            final_file_path=working_file_path,                                                    
            thumbnail_path=thumbnail_path,
            validation_result=final_validation_result
        )
        
                             
        logger.info(f"Screen recording processing completed for session {session_id}")
        logger.info(f"Final size: {os.path.getsize(working_file_path) if os.path.exists(working_file_path) else 0} bytes")
        
        final_size = os.path.getsize(working_file_path) if os.path.exists(working_file_path) else 0

        return {
            "status": "success",
            "session_id": session_id,
            "original_size": file_size,
            "processed_size": final_size,
            "thumbnail_path": thumbnail_path,
            "validation": final_validation_result
        }

    except Exception as exc:
        logger.error(f"Error processing screen recording for session {session_id}: {exc}", exc_info=True)
        
                                  
        try:
            retry_delay = min(60 * (2 ** self.request.retries), 300)
            logger.info(f"Retrying task, attempt {self.request.retries + 1}/{self.max_retries} in {retry_delay}s")
            raise self.retry(countdown=retry_delay, exc=exc)
        except self.MaxRetriesExceededError:
            logger.error(f"Task permanently failed for session {session_id} after {self.max_retries} retries.")
                                                              
            try:
                await update_session_with_processed_file(
                    session_id=session_id,
                    user_id=user_id,
                    original_path=file_path,
                    final_file_path=None,
                    thumbnail_path=None,
                    validation_result={"valid": False, "error": str(exc)}
                )
            except Exception as final_db_error:
                logger.error(f"Final database update also failed: {final_db_error}")
            
            return {"status": "failed", "session_id": session_id, "error": str(exc)}
    finally:
                                     
        files_to_keep_list = []
        if 'working_file_path' in locals() and os.path.exists(working_file_path) and final_validation_result.get("valid"):
            files_to_keep_list.append(working_file_path)
                                                                             
            if 'thumbnail_path' in locals() and thumbnail_path:
                files_to_keep_list.append(thumbnail_path)
        
        cleanup_temp_files(files_to_keep=files_to_keep_list, all_files=list(temp_files))
   
                                                                                  

async def create_video_thumbnail(file_path: str) -> Optional[str]:
    """
    Создает миниатюру видео
    """
    try:
        logger.info(f"Creating thumbnail for: {file_path}")
        
                                                         
                                                    
        probe_cmd = [
            'ffprobe', 
            '-v', 'error',                                
            '-select_streams', 'v:0',                             
            '-print_format', 'json', 
            '-show_format', 
            '-show_streams',
            file_path
        ]
        
        try:
            probe_result = await run_subprocess_async(probe_cmd, timeout=30)
            
            if probe_result.returncode != 0:
                logger.error(f"File validation failed for thumbnail: {probe_result.stderr}")
                return None
            
                                                      
            try:
                probe_info = json.loads(probe_result.stdout)
                streams = probe_info.get('streams', [])
                format_info = probe_info.get('format', {})
                
                if not streams:
                    logger.error("No video streams found in file")
                    return None
                
                video_stream = streams[0]
                duration = float(format_info.get('duration', 0))
                
                                                                  
                if duration <= 0:
                    logger.error(f"Invalid video duration: {duration}")
                    return None
                
                width = video_stream.get('width', 0)
                height = video_stream.get('height', 0)
                
                if width <= 0 or height <= 0:
                    logger.error(f"Invalid video dimensions: {width}x{height}")
                    return None
                
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.error(f"Error parsing ffprobe output: {str(e)}")
                return None
            
        except asyncio.TimeoutError:
            logger.error("ffprobe timeout during thumbnail validation")
            return None
        
        base_name = os.path.splitext(file_path)[0]
        thumbnail_path = f"{base_name}_thumbnail.jpg"
        
                                                                  
        timestamps = []
        if duration > 5:
            timestamps = ['00:00:01', '00:00:02', '00:00:05']
        elif duration > 2:
            timestamps = ['00:00:01', '00:00:02']
        elif duration > 1:
            timestamps = ['00:00:01']
        else:
            timestamps = ['00:00:00.5']                         
        
        for timestamp in timestamps:
            cmd = [
                'ffmpeg',
                '-i', file_path,
                '-ss', timestamp,
                '-vframes', '1',
                '-vf', 'scale=320:240',
                '-f', 'image2',
                '-y',
                thumbnail_path
            ]
            
            try:
                result = await run_subprocess_async(cmd, timeout=60)
                
                if result.returncode == 0 and os.path.exists(thumbnail_path):
                                                        
                    if os.path.getsize(thumbnail_path) > 1024:                
                        logger.info(f"Thumbnail created: {thumbnail_path}")
                        return thumbnail_path
                    else:
                        logger.warning(f"Thumbnail too small, trying next timestamp")
                        if os.path.exists(thumbnail_path):
                            os.remove(thumbnail_path)
                else:
                    logger.warning(f"Thumbnail creation failed at {timestamp}: {result.stderr}")
                    
            except asyncio.TimeoutError:
                logger.warning(f"Thumbnail creation timeout at {timestamp}")
                continue
        
        logger.error(f"Thumbnail creation failed for all timestamps")
        return None
            
    except Exception as e:
        logger.error(f"Error creating thumbnail: {str(e)}")
        return None

async def validate_video_file(file_path: str) -> dict:
    """
    Валидирует видео файл с улучшенной обработкой ошибок
    """
    try:
        
                                              
        if not os.path.exists(file_path):
            return {"valid": False, "error": "File does not exist"}
        
        file_size = os.path.getsize(file_path)
        if file_size < 1024:                 
            return {"valid": False, "error": "File too small"}
        
                                                                       
        try:
            with open(file_path, 'rb') as f:
                header = f.read(32)                       
                
                                               
            if not (header.startswith(b'\x1a\x45\xdf\xa3') or b'webm' in header.lower() or b'matroska' in header.lower()):
                return {"valid": False, "error": "Invalid file format or corrupted header"}
                
        except Exception as e:
            return {"valid": False, "error": f"Cannot read file: {str(e)}"}
        
                                                             
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-analyzeduration', '10000000',                            
            '-probesize', '50000000',                         
            file_path
        ]
        
        try:
            result = await run_subprocess_async(cmd, timeout=45)
            
            if result.returncode != 0:
                error_msg = result.stderr.strip() if result.stderr else "Unknown ffprobe error"
                
                                                   
                if "EBML header parsing failed" in error_msg or "Invalid data found when processing input" in error_msg:
                    return {"valid": False, "error": "Corrupted or incomplete WebM file"}
                elif "moov atom not found" in error_msg:
                    return {"valid": False, "error": "Incomplete video file (missing metadata)"}
                elif "No such file or directory" in error_msg:
                    return {"valid": False, "error": "File not accessible"}
                else:
                    return {"valid": False, "error": f"ffprobe failed: {error_msg}"}
            
                                   
            try:
                info = json.loads(result.stdout)
            except json.JSONDecodeError as e:
                return {"valid": False, "error": f"Invalid JSON response from ffprobe: {str(e)}"}
            
                                                   
            format_info = info.get('format', {})
            streams = info.get('streams', [])
            
            if not streams:
                return {"valid": False, "error": "No streams found in file"}
            
            video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
            audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
            
            if not video_stream:
                return {"valid": False, "error": "No video stream found"}
            
                                      
            duration = float(format_info.get('duration', 0))
            width = video_stream.get('width', 0)
            height = video_stream.get('height', 0)
            codec_name = video_stream.get('codec_name', 'unknown')
            
            validation_result = {
                "valid": True,
                "duration": duration,
                "size": file_size,
                "video_codec": codec_name,
                "video_resolution": f"{width}x{height}",
                "audio_codec": audio_stream.get('codec_name') if audio_stream else None,
                "bitrate": int(format_info.get('bit_rate', 0))
            }
            
                               
            if duration < 0.1:                   
                validation_result["valid"] = False
                validation_result["error"] = "Video duration too short"
            elif width <= 0 or height <= 0:
                validation_result["valid"] = False
                validation_result["error"] = "Invalid video dimensions"
            elif codec_name == 'unknown':
                validation_result["valid"] = False
                validation_result["error"] = "Unknown or unsupported video codec"
            
            return validation_result
            
        except asyncio.TimeoutError:
            return {"valid": False, "error": "Video validation timeout - file may be corrupted"}
            
    except Exception as e:
        return {
            "valid": False,
            "error": f"Validation error: {str(e)}"
        }
async def update_session_with_processed_file(
    session_id: str,
    user_id: int,
    original_path: str,
    final_file_path: Optional[str],
    thumbnail_path: Optional[str],
    validation_result: dict
) -> None:
    """
    Обновляет сессию информацией об обработанном файле (асинхронная версия)
    """
    try:
        async with AsyncSessionLocal() as db:
                                                   
            logger.info(f"Updating session {session_id} with final_file_path: {final_file_path}")
            normalized_path = None
            if final_file_path and os.path.exists(final_file_path):
                normalized_path = final_file_path.replace('/app/', '') if final_file_path.startswith('/app/') else final_file_path
                logger.info(f"Normalized path: {normalized_path}")
            else:
                logger.warning(f"Final file path is None or file doesn't exist: {final_file_path}")
            
            normalized_thumbnail_path = None
            if thumbnail_path and os.path.exists(thumbnail_path):
                normalized_thumbnail_path = thumbnail_path.replace('/app/', '') if thumbnail_path.startswith('/app/') else thumbnail_path
                
            metadata = {
                "original_path": original_path,
                "processed_path": final_file_path,
                "thumbnail_path": thumbnail_path,
                "validation": validation_result,
                "processed_at": int(time.time())
            }

                                                  
            test_service = TestService(db)
            session = await test_service.get_test_session(session_id)
            if session and session.user_id == user_id:
                update_data = TestSessionUpdate(
                    screen_recording_path=normalized_path,
                    screen_recording_thumbnail=normalized_thumbnail_path,
                    screen_recording_metadata=metadata
                )
                await test_service.update_test_session(session_id, update_data)
                logger.info(f"Updated regular test session {session_id}")
                return

                                                 
            prelim_service = PreliminaryTestService(db)
            prelim_session_id = int(session_id)
            prelim_session = await prelim_service.get_preliminary_test_session(prelim_session_id)
            logger.info(f"Found preliminary session: {prelim_session is not None}, user_id match: {prelim_session.user_id == user_id if prelim_session else False}")
            if prelim_session and prelim_session.user_id == user_id:
                logger.info(f"Updating preliminary session {prelim_session_id} with path: {normalized_path}")
                await prelim_service.update_preliminary_test_session(
                    prelim_session_id,
                    screen_recording_path=normalized_path,
                    screen_recording_thumbnail_path=normalized_thumbnail_path,
                    screen_recording_metadata=metadata
                )
                logger.info(f"Updated preliminary test session {session_id}")
                return

            logger.error(f"Session {session_id} not found or not authorized for user {user_id}")

    except Exception as e:
        logger.error(f"Error updating session {session_id} in database: {e}", exc_info=True)
        raise



async def attempt_file_recovery(file_path: str) -> Optional[str]:
    """
    Попытка восстановления поврежденного видео файла
    """
    try:
        logger.info(f"Attempting file recovery for: {file_path}")
        
        base_name = os.path.splitext(file_path)[0]
        recovered_path = f"{base_name}_recovered.webm"
        
                                                      
                                                                   
        cmd = [
            'ffmpeg',
            '-err_detect', 'ignore_err',                       
            '-i', file_path,
            '-c', 'copy',                                  
            '-avoid_negative_ts', 'make_zero',                             
            '-fflags', '+genpts',                    
            '-y',
            recovered_path
        ]
        
        try:
            result = await run_subprocess_async(cmd, timeout=120)
            
            if result.returncode == 0 and os.path.exists(recovered_path):
                recovered_size = os.path.getsize(recovered_path)
                if recovered_size > 1024:                
                    logger.info(f"File recovery successful: {recovered_path}")
                    return recovered_path
                else:
                    logger.warning("Recovered file too small")
                    if os.path.exists(recovered_path):
                        os.remove(recovered_path)
            else:
                logger.warning(f"File recovery failed: {result.stderr}")
                
        except asyncio.TimeoutError:
            logger.warning("File recovery timeout")
            
                                                                           
        cmd2 = [
            'ffmpeg',
            '-f', 'webm',                                
            '-err_detect', 'ignore_err',
            '-i', file_path,
            '-c:v', 'libvpx-vp9',                        
            '-c:a', 'libopus',                           
            '-crf', '35',                                                  
            '-deadline', 'realtime',                       
            '-y',
            recovered_path
        ]
        
        try:
            result2 = await run_subprocess_async(cmd2, timeout=180)
            
            if result2.returncode == 0 and os.path.exists(recovered_path):
                recovered_size = os.path.getsize(recovered_path)
                if recovered_size > 1024:
                    logger.info(f"File recovery successful (method 2): {recovered_path}")
                    return recovered_path
                else:
                    if os.path.exists(recovered_path):
                        os.remove(recovered_path)
                        
        except asyncio.TimeoutError:
            logger.warning("File recovery method 2 timeout")
            
        logger.error("All file recovery methods failed")
        return None
        
    except Exception as e:
        logger.error(f"Error during file recovery: {str(e)}")
        return None

def cleanup_temp_files(files_to_keep: List[str], all_files: List[str]):
    """
    Очищает временные файлы, сохраняя только нужные файлы из списка.
    """
                                              
    safe_files_to_keep = {f for f in files_to_keep if f}
    
    logger.info(f"Starting cleanup. Files to keep: {safe_files_to_keep}. All generated files: {all_files}")
    
    for file_path in all_files:
        if file_path and file_path not in safe_files_to_keep and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Removed temporary file: {file_path}")
            except OSError as e:
                logger.error(f"Error removing file {file_path}: {e}")


@celery_app.task(base=AsyncTask)
async def cleanup_old_uploads():
    """
    Периодическая задача для очистки старых загрузок (полностью неблокирующая версия)
    """
    try:
        current_time = time.time()
        active_sessions = await get_active_test_sessions()
        logger.info(f"Found {len(active_sessions)} active test sessions")

        from app.utils.file_paths import get_full_upload_path, FileTypes
        chunks_dir = get_full_upload_path(f"uploads/{FileTypes.CHUNKS}")

                                                       
        if not await asyncio.to_thread(os.path.exists, chunks_dir):
            logger.info("Chunks directory does not exist, skipping cleanup.")
            return

                                              
        items = await asyncio.to_thread(os.listdir, chunks_dir)
        
        for item in items:
            item_path = os.path.join(chunks_dir, item)

                                                               
            if not await asyncio.to_thread(os.path.isdir, item_path):
                continue
            
                                                
            dir_age = current_time - (await asyncio.to_thread(os.path.getctime, item_path))
            
            from app.utils.test_config import FILE_CLEANUP_TIMES, get_safe_cleanup_time
            
            if dir_age > FILE_CLEANUP_TIMES['chunks_force']:
                logger.info(f"Cleaned up very old chunks directory: {item_path}")
                                           
                await asyncio.to_thread(shutil.rmtree, item_path, ignore_errors=True)
                continue
            
            safe_cleanup_time = get_safe_cleanup_time()
            if dir_age > safe_cleanup_time:
                session_id = item
                if session_id not in active_sessions:
                    logger.info(f"Cleaned up old chunks directory: {item_path}")
                    await asyncio.to_thread(shutil.rmtree, item_path, ignore_errors=True)
                else:
                    logger.info(f"Skipping cleanup for active session: {session_id}")
        
        logger.info("Cleanup task completed")
        
    except Exception as e:
        logger.error(f"Error in cleanup task: {str(e)}", exc_info=True)

async def get_active_test_sessions() -> set:
    """
    Получает список активных тестовых сессий (асинхронная версия)
    """
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.test import TestSession, PreliminaryTestSession
        from sqlalchemy import select, or_
        from datetime import datetime, timedelta
        from app.utils.test_config import get_max_test_duration

        active_sessions = set()
        async with AsyncSessionLocal() as db:
            max_duration_hours = get_max_test_duration() / 3600
            cutoff_time = datetime.utcnow() - timedelta(hours=max_duration_hours + 2)                

                            
            main_q = select(TestSession.id).filter(
                or_(TestSession.end_time.is_(None), TestSession.start_time > cutoff_time)
            )
            main_sessions = (await db.execute(main_q)).scalars().all()
            active_sessions.update(str(s) for s in main_sessions)

                                   
            prelim_q = select(PreliminaryTestSession.id).filter(
                or_(PreliminaryTestSession.completed_at.is_(None), PreliminaryTestSession.start_time > cutoff_time)
            )
            prelim_sessions = (await db.execute(prelim_q)).scalars().all()
            active_sessions.update(str(s) for s in prelim_sessions)

        logger.info(f"Found {len(active_sessions)} active sessions.")
        return active_sessions
    except Exception as e:
        logger.error(f"Error getting active sessions: {e}", exc_info=True)
        return set()                                                         
        
@celery_app.task(base=AsyncTask)
async def validate_screen_recording(file_path: str) -> dict:
    """
    Отдельная задача для валидации видео файлов
    Полезна для отладки и диагностики
    """
    try:
        logger.info(f"Validating screen recording: {file_path}")
        
        if not os.path.exists(file_path):
            return {"valid": False, "error": "File does not exist"}
        
        validation_result = await validate_video_file(file_path)
        logger.info(f"Validation result for {file_path}: {validation_result}")
        
        return validation_result
        
    except Exception as e:
        logger.error(f"Error validating file {file_path}: {str(e)}")
        return {"valid": False, "error": f"Validation task error: {str(e)}"}

@celery_app.task(base=AsyncTask)
async def recover_corrupted_recording(file_path: str) -> dict:
    """
    Отдельная задача для восстановления поврежденных файлов
    """
    try:
        logger.info(f"Attempting to recover corrupted recording: {file_path}")
        
        if not os.path.exists(file_path):
            return {"success": False, "error": "File does not exist"}
        
        recovered_path = await attempt_file_recovery(file_path)
        
        if recovered_path:
                                             
            validation_result = await validate_video_file(recovered_path)
            
            return {
                "success": True,
                "recovered_path": recovered_path,
                "validation": validation_result
            }
        else:
            return {"success": False, "error": "Recovery failed"}
            
    except Exception as e:
        logger.error(f"Error recovering file {file_path}: {str(e)}")
        return {"success": False, "error": f"Recovery task error: {str(e)}"}

                                                     