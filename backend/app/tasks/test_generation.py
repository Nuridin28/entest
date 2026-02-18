from celery import current_task
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.services.test_service import TestService
from app.services.preliminary_test_service import PreliminaryTestService
from app.utils.openai_service import openai_service
from app.core.cache import cache
import asyncio
import json
from typing import Dict, Any

@celery_app.task(bind=True, name="generate_full_test_async")
def generate_full_test_async(self, session_id: str, level: str):
    """Background task for generating full test"""
    try:
                            
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 4, 'status': 'Starting test generation...'}
        )
        
                                          
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_generate_full_test_internal(session_id, level, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'session_id': session_id}
        )
        raise exc

async def _generate_full_test_internal(session_id: str, level: str, task):
    """Internal async function for test generation"""
    async with AsyncSessionLocal() as db:
        test_service = TestService(db)
        
        try:
                                   
            session = await test_service.get_test_session(session_id)
            if not session:
                raise Exception("Test session not found")
            
            session.status = "generating"
            await db.commit()
            
                                    
            task.update_state(
                state='PROGRESS',
                meta={'current': 1, 'total': 4, 'status': 'Generating reading section...'}
            )
            
                                          
            cache_key = f"generated_test:{session_id}:{level}"
            
                                             
            cached_test = await cache.aget(cache_key)
            if cached_test:
                task.update_state(
                    state='PROGRESS',
                    meta={'current': 4, 'total': 4, 'status': 'Using cached test data...'}
                )
                return cached_test
            
                                
            full_test_data = await openai_service.generate_full_test(level)
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 2, 'total': 4, 'status': 'Processing test sections...'}
            )
            
                              
            reading_data = await test_service._process_section(
                session_id, "reading", full_test_data.get("reading"), 
                test_service._process_reading_section
            )
            
            listening_data = await test_service._process_section(
                session_id, "listening", full_test_data.get("listening"), 
                test_service._process_listening_section
            )
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 3, 'total': 4, 'status': 'Finalizing test...'}
            )
            
            writing_data = await test_service._process_section(
                session_id, "writing", full_test_data.get("writing"), 
                test_service._process_writing_section
            )
            
            speaking_data = await test_service._process_section(
                session_id, "speaking", full_test_data.get("speaking"), 
                test_service._process_speaking_section
            )
            
                                   
            session.status = "ready"
            await db.commit()
            
            result = {
                "reading": reading_data,
                "listening": listening_data,
                "writing": writing_data,
                "speaking": speaking_data,
            }
            
                              
            await cache.aset(cache_key, result, ttl=1800)              
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 4, 'total': 4, 'status': 'Test generation completed!'}
            )
            
            return result
            
        except Exception as e:
                                            
            session.status = "error"
            await db.commit()
            raise e

@celery_app.task(bind=True, name="generate_preliminary_test_async")
def generate_preliminary_test_async(self, session_id: int, level: str):
    """Background task for generating preliminary test"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 3, 'status': 'Starting preliminary test generation...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_generate_preliminary_test_internal(session_id, level, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'session_id': session_id}
        )
        raise exc

async def _generate_preliminary_test_internal(session_id: int, level: str, task):
    """Internal async function for preliminary test generation"""
    async with AsyncSessionLocal() as db:
        preliminary_service = PreliminaryTestService(db)
        
        try:
            task.update_state(
                state='PROGRESS',
                meta={'current': 1, 'total': 3, 'status': 'Loading questions...'}
            )
            
                                            
            cache_key = f"preliminary_test:{session_id}:{level}"
            
                               
            cached_test = await cache.aget(cache_key)
            if cached_test:
                return cached_test
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 2, 'total': 3, 'status': 'Generating test questions...'}
            )
            
                           
            result = await preliminary_service.generate_level_test(session_id, level)
            
                              
            await cache.aset(cache_key, result, ttl=900)              
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 3, 'total': 3, 'status': 'Preliminary test generated!'}
            )
            
            return result
            
        except Exception as e:
            raise e

@celery_app.task(name="invalidate_test_cache")
def invalidate_test_cache(session_id: str, level: str = None):
    """Task to invalidate test-related cache entries"""
    try:
        patterns = [
            f"generated_test:{session_id}:*",
            f"preliminary_test:{session_id}:*",
            f"test_questions:{session_id}:*",
            f"test_results:{session_id}:*"
        ]
        
        if level:
            patterns.extend([
                f"generated_test:*:{level}",
                f"preliminary_test:*:{level}"
            ])
        
        total_deleted = 0
        for pattern in patterns:
            deleted = cache.delete_pattern(pattern)
            total_deleted += deleted
        
        return {"deleted_keys": total_deleted, "patterns": patterns}
        
    except Exception as exc:
        raise exc

@celery_app.task(name="pregenerate_tests")
def pregenerate_tests(levels: list = None):
    """Task to pregenerate tests for common levels"""
    if not levels:
        levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    
    results = {}
    
    for level in levels:
        try:
                                          
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                test_data = loop.run_until_complete(openai_service.generate_full_test(level))
                cache_key = f"pregenerated_test:{level}"
                cache.set(cache_key, test_data, ttl=3600)          
                results[level] = "success"
            finally:
                loop.close()
                
        except Exception as e:
            results[level] = f"error: {str(e)}"
    
    return results