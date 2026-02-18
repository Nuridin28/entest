from celery import current_task
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.services.test_service import TestService
from app.utils.openai_service import openai_service
from app.core.cache import cache
import asyncio
import json
from typing import Dict, Any, Optional

@celery_app.task(bind=True, name="evaluate_writing_answer_async")
def evaluate_writing_answer_async(self, question_id: int, prompt: str, user_answer: str, level: str):
    """Background task for evaluating writing answers"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 2, 'status': 'Starting writing evaluation...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_evaluate_writing_internal(question_id, prompt, user_answer, level, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'question_id': question_id}
        )
        raise exc

async def _evaluate_writing_internal(question_id: int, prompt: str, user_answer: str, level: str, task):
    """Internal async function for writing evaluation"""
    try:
                                             
        cache_key = f"writing_eval:{hash(prompt + user_answer + level)}"
        cached_result = await cache.aget(cache_key)
        
        if cached_result:
            task.update_state(
                state='SUCCESS',
                meta={'current': 2, 'total': 2, 'status': 'Using cached evaluation'}
            )
            return cached_result
        
        task.update_state(
            state='PROGRESS',
            meta={'current': 1, 'total': 2, 'status': 'Evaluating writing...'}
        )
        
                              
        evaluation = await openai_service.evaluate_writing_answer(prompt, user_answer, level)
        
        if not evaluation:
            raise Exception("Failed to evaluate writing answer")
        
                         
        async with AsyncSessionLocal() as db:
            test_service = TestService(db)
            await test_service.update_question(question_id, {
                'user_answer': user_answer,
                'score': evaluation.get('score'),
                'feedback': json.dumps(evaluation)
            })
        
                          
        await cache.aset(cache_key, evaluation, ttl=1800)              
        
        task.update_state(
            state='SUCCESS',
            meta={'current': 2, 'total': 2, 'status': 'Writing evaluation completed'}
        )
        
        return evaluation
        
    except Exception as e:
        raise e

@celery_app.task(bind=True, name="evaluate_speaking_answer_async")
def evaluate_speaking_answer_async(self, question_id: int, question: str, transcribed_text: str, level: str):
    """Background task for evaluating speaking answers"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 2, 'status': 'Starting speaking evaluation...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_evaluate_speaking_internal(question_id, question, transcribed_text, level, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'question_id': question_id}
        )
        raise exc

async def _evaluate_speaking_internal(question_id: int, question: str, transcribed_text: str, level: str, task):
    """Internal async function for speaking evaluation"""
    try:
                                             
        cache_key = f"speaking_eval:{hash(question + transcribed_text + level)}"
        cached_result = await cache.aget(cache_key)
        
        if cached_result:
            task.update_state(
                state='SUCCESS',
                meta={'current': 2, 'total': 2, 'status': 'Using cached evaluation'}
            )
            return cached_result
        
        task.update_state(
            state='PROGRESS',
            meta={'current': 1, 'total': 2, 'status': 'Evaluating speaking...'}
        )
        
                               
        evaluation = await openai_service.evaluate_speaking_answer(question, transcribed_text, level)
        
        if not evaluation:
            raise Exception("Failed to evaluate speaking answer")
        
                         
        async with AsyncSessionLocal() as db:
            test_service = TestService(db)
            await test_service.update_question(question_id, {
                'user_answer': transcribed_text,
                'score': evaluation.get('score'),
                'feedback': json.dumps(evaluation)
            })
        
                          
        await cache.aset(cache_key, evaluation, ttl=1800)              
        
        task.update_state(
            state='SUCCESS',
            meta={'current': 2, 'total': 2, 'status': 'Speaking evaluation completed'}
        )
        
        return evaluation
        
    except Exception as e:
        raise e

@celery_app.task(bind=True, name="batch_evaluate_answers")
def batch_evaluate_answers(self, evaluation_requests: list):
    """Task to evaluate multiple answers in batch"""
    results = []
    total = len(evaluation_requests)
    
    for i, request in enumerate(evaluation_requests):
        try:
            current_task.update_state(
                state='PROGRESS',
                meta={'current': i, 'total': total, 'status': f'Processing evaluation {i+1}/{total}'}
            )
            
            eval_type = request.get('type')
            
            if eval_type == 'writing':
                result = evaluate_writing_answer_async.delay(
                    request['question_id'],
                    request['prompt'],
                    request['user_answer'],
                    request['level']
                )
            elif eval_type == 'speaking':
                result = evaluate_speaking_answer_async.delay(
                    request['question_id'],
                    request['question'],
                    request['transcribed_text'],
                    request['level']
                )
            else:
                raise ValueError(f"Unknown evaluation type: {eval_type}")
            
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
    
    current_task.update_state(
        state='SUCCESS',
        meta={'current': total, 'total': total, 'status': 'Batch evaluation completed'}
    )
    
    return results

@celery_app.task(bind=True, name="calculate_final_scores")
def calculate_final_scores(self, session_id: str):
    """Task to calculate final test scores"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 3, 'status': 'Starting score calculation...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_calculate_scores_internal(session_id, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'session_id': session_id}
        )
        raise exc

async def _calculate_scores_internal(session_id: str, task):
    """Internal async function for score calculation"""
    try:
        async with AsyncSessionLocal() as db:
            test_service = TestService(db)
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 1, 'total': 3, 'status': 'Calculating section scores...'}
            )
            
                                      
            reading_score = await test_service._calculate_section_score(session_id, "reading")
            listening_score = await test_service._calculate_section_score(session_id, "listening")
            writing_score = await test_service._calculate_section_score(session_id, "writing")
            speaking_score = await test_service._calculate_section_score(session_id, "speaking")
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 2, 'total': 3, 'status': 'Calculating final score and CEFR level...'}
            )
            
                                                  
            all_scores = [s for s in [reading_score, listening_score, writing_score, speaking_score] if s is not None]
            final_score = sum(all_scores) / len(all_scores) if all_scores else 0.0
            
            cefr_level = openai_service.calculate_cefr_level(
                reading_score, listening_score, writing_score, speaking_score
            )
            
                                               
            session = await test_service.get_test_session(session_id)
            if session:
                session.reading_score = reading_score
                session.listening_score = listening_score
                session.writing_score = writing_score
                session.speaking_score = speaking_score
                session.final_score = final_score
                session.cefr_level = cefr_level
                session.status = "completed"
                
                await db.commit()
            
            result = {
                'session_id': session_id,
                'reading_score': reading_score,
                'listening_score': listening_score,
                'writing_score': writing_score,
                'speaking_score': speaking_score,
                'final_score': final_score,
                'cefr_level': cefr_level
            }
            
                               
            cache_key = f"final_scores:{session_id}"
            await cache.aset(cache_key, result, ttl=3600)          
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 3, 'total': 3, 'status': 'Score calculation completed'}
            )
            
            return result
            
    except Exception as e:
        raise e

@celery_app.task(name="precompute_evaluations")
def precompute_evaluations(common_answers: list):
    """Task to precompute evaluations for common answers"""
    results = {}
    
    for answer_data in common_answers:
        try:
            answer_type = answer_data.get('type')
            cache_key = None
            
            if answer_type == 'writing':
                cache_key = f"writing_eval:{hash(answer_data['prompt'] + answer_data['answer'] + answer_data['level'])}"
            elif answer_type == 'speaking':
                cache_key = f"speaking_eval:{hash(answer_data['question'] + answer_data['answer'] + answer_data['level'])}"
            
            if cache_key:
                                              
                evaluation = answer_data.get('evaluation')
                cache.set(cache_key, evaluation, ttl=3600)
                results[cache_key] = 'cached'
                
        except Exception as e:
            results[f"error_{answer_data.get('id', 'unknown')}"] = str(e)
    
    return results