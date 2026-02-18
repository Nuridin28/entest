from celery import current_task
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.utils.audio_service import audio_service
from app.core.cache import cache
import asyncio
import os
import tempfile
from typing import Optional

@celery_app.task(bind=True, name="process_audio_tts")
def process_audio_tts(self, text: str, session_id: str, audio_type: str, index: int = 0):
    """Background task for text-to-speech processing"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 2, 'status': 'Starting TTS processing...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_process_tts_internal(text, session_id, audio_type, index, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'text_preview': text[:50] + '...'}
        )
        raise exc

async def _process_tts_internal(text: str, session_id: str, audio_type: str, index: int, task):
    """Internal async function for TTS processing"""
    try:
                           
        cache_key = f"tts_audio:{hash(text)}:{audio_type}"
        cached_path = await cache.aget(cache_key)
        
        if cached_path and os.path.exists(cached_path):
            task.update_state(
                state='SUCCESS',
                meta={'current': 2, 'total': 2, 'status': 'Using cached audio', 'audio_path': cached_path}
            )
            return {'audio_path': cached_path, 'cached': True}
        
        task.update_state(
            state='PROGRESS',
            meta={'current': 1, 'total': 2, 'status': 'Generating audio...'}
        )
        
                        
        audio_data = await audio_service.text_to_speech(text)
        
        if not audio_data:
            raise Exception("Failed to generate audio")
        
                         
        filename = f"{audio_type}_{session_id}_{index}.mp3"
        audio_path = f"/app/audio/{filename}"
        
                                 
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)
        
        success = await audio_service.save_audio_file(audio_data, audio_path)
        
        if not success:
            raise Exception("Failed to save audio file")
        
                          
        await cache.aset(cache_key, audio_path, ttl=3600)          
        
        task.update_state(
            state='SUCCESS',
            meta={'current': 2, 'total': 2, 'status': 'Audio generated successfully', 'audio_path': audio_path}
        )
        
        return {'audio_path': audio_path, 'cached': False}
        
    except Exception as e:
        raise e

@celery_app.task(bind=True, name="process_audio_transcription")
def process_audio_transcription(self, audio_data: bytes, session_id: str, question_id: int):
    """Background task for speech-to-text processing"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 3, 'status': 'Starting transcription...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_process_transcription_internal(audio_data, session_id, question_id, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'session_id': session_id, 'question_id': question_id}
        )
        raise exc

async def _process_transcription_internal(audio_data: bytes, session_id: str, question_id: int, task):
    """Internal async function for transcription processing"""
    try:
        task.update_state(
            state='PROGRESS',
            meta={'current': 1, 'total': 3, 'status': 'Processing audio data...'}
        )
        
                                                  
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name
        
        try:
            task.update_state(
                state='PROGRESS',
                meta={'current': 2, 'total': 3, 'status': 'Transcribing speech...'}
            )
            
                              
            transcription = await audio_service.speech_to_text_from_bytes(audio_data)
            
            if not transcription:
                raise Exception("Failed to transcribe audio")
            
                                             
            audio_filename = f"speaking_answer_{session_id}_{question_id}.webm"
            permanent_path = f"/app/uploads/speaking/{audio_filename}"
            
                                     
            os.makedirs(os.path.dirname(permanent_path), exist_ok=True)
            
                                                  
            os.rename(temp_path, permanent_path)
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 3, 'total': 3, 'status': 'Transcription completed', 'transcription': transcription}
            )
            
            return {
                'transcription': transcription,
                'audio_path': permanent_path,
                'question_id': question_id
            }
            
        finally:
                                                   
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        raise e

@celery_app.task(name="batch_generate_audio")
def batch_generate_audio(audio_requests: list):
    """Task to generate multiple audio files in batch"""
    results = []
    
    for request in audio_requests:
        try:
            text = request.get('text')
            session_id = request.get('session_id')
            audio_type = request.get('audio_type')
            index = request.get('index', 0)
            
                                        
            result = process_audio_tts.delay(text, session_id, audio_type, index)
            results.append({
                'request': request,
                'task_id': result.id,
                'status': 'queued'
            })
            
        except Exception as e:
            results.append({
                'request': request,
                'error': str(e),
                'status': 'failed'
            })
    
    return results

@celery_app.task(name="cleanup_audio_files")
def cleanup_audio_files(max_age_hours: int = 24):
    """Task to cleanup old audio files"""
    import time
    
    audio_dirs = ['/app/audio', '/app/uploads/speaking']
    cleaned_files = []
    
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600
    
    for audio_dir in audio_dirs:
        if not os.path.exists(audio_dir):
            continue
            
        for filename in os.listdir(audio_dir):
            file_path = os.path.join(audio_dir, filename)
            
            try:
                                
                file_age = current_time - os.path.getctime(file_path)
                
                if file_age > max_age_seconds:
                    os.unlink(file_path)
                    cleaned_files.append(file_path)
                    
            except Exception as e:
                print(f"Error cleaning up {file_path}: {e}")
    
    return {
        'cleaned_files': len(cleaned_files),
        'files': cleaned_files
    }