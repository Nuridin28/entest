from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import asyncio
import os
import hashlib

from ..models.test import TestSession, Question
from ..schemas.test import TestSessionCreate, TestSessionUpdate, QuestionCreate, QuestionUpdate
from ..utils.openai_service import openai_service
from ..utils.audio_service import audio_service
from app.core.cache import cache
from ..utils.timezone import get_almaty_now


class TestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_test_session(self, session_id: str) -> Optional[TestSession]:
        result = await self.db.execute(
            select(TestSession)
            .options(joinedload(TestSession.questions))
            .filter(TestSession.id == session_id)
        )
        return result.scalars().first()

    async def get_user_test_sessions(self, user_id: int) -> List[TestSession]:
        result = await self.db.execute(
            select(TestSession)
            .options(joinedload(TestSession.questions))
            .filter(TestSession.user_id == user_id)
        )
        return result.scalars().all()
    
    async def get_test_result_id_by_main_session(self, session_id: str) -> Optional[int]:
        """Получает ID результата теста по ID основной сессии"""
        from ..models.test_result import TestResult
        result = await self.db.execute(
            select(TestResult.id).filter(TestResult.main_test_id == session_id)
        )
        return result.scalars().first()

    async def create_test_session(self, session_id: str, user_id: int) -> TestSession:
        db_session = TestSession(
            id=session_id,
            user_id=user_id,
            status="generating"
        )
        self.db.add(db_session)
        await self.db.commit()
        await self.db.refresh(db_session)
        
                                                                                        
        return await self.get_test_session(db_session.id)

    async def update_test_session(self, session_id: str, session_data: TestSessionUpdate) -> Optional[TestSession]:
        db_session = await self.get_test_session(session_id)
        if not db_session:
            return None

        update_data = session_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_session, field, value)

        await self.db.commit()
        await self.db.refresh(db_session)
        return db_session

    async def complete_test_session(self, session_id: str, test_result_id: int = None) -> Optional[TestSession]:
        db_session = await self.get_test_session(session_id)
        if not db_session:
            return None

        reading_score = await self._calculate_section_score(session_id, "reading")
        listening_score = await self._calculate_section_score(session_id, "listening") 
        writing_score = await self._calculate_section_score(session_id, "writing")
        speaking_score = await self._calculate_section_score(session_id, "speaking")

        all_scores = [s for s in [reading_score, listening_score, writing_score, speaking_score] if s is not None]
        final_score = sum(all_scores) / len(all_scores) if all_scores else 0.0

        cefr_level = openai_service.calculate_cefr_level(
            reading_score, listening_score, writing_score, speaking_score
        )

        db_session.status = "completed"
        db_session.end_time = get_almaty_now().replace(tzinfo=None)
        db_session.reading_score = reading_score
        db_session.listening_score = listening_score
        db_session.writing_score = writing_score
        db_session.speaking_score = speaking_score
        db_session.final_score = final_score
        db_session.cefr_level = cefr_level
        
        await self.db.commit()
        await self.db.refresh(db_session)
        
                                                                
        if test_result_id:
            from .test_result_service import TestResultService
            result_service = TestResultService(self.db)
            await result_service.update_main_test_results(test_result_id, db_session)
        
        return db_session

    async def _bulk_create_questions(self, questions_data: List[QuestionCreate]) -> List[Question]:
        try:
            db_questions = [Question(**q.dict()) for q in questions_data]
            self.db.add_all(db_questions)
            await self.db.flush()
            
                                                    
            for question in db_questions:
                await self.db.refresh(question)
            
            return db_questions
        except Exception as e:
            print(f"[ERROR] Failed to bulk create questions: {e}")
            await self.db.rollback()
            raise e

    async def create_question(self, question_data: QuestionCreate) -> Question:
        db_question = Question(**question_data.dict())
        self.db.add(db_question)
        await self.db.commit()
        await self.db.refresh(db_question)
        return db_question

    async def get_session_questions(self, session_id: str) -> List[Question]:
        result = await self.db.execute(select(Question).filter(Question.test_session_id == session_id))
        return result.scalars().all()

    async def get_session_questions_by_type(self, session_id: str, question_type: str) -> List[Question]:
        result = await self.db.execute(select(Question).filter(
            Question.test_session_id == session_id,
            Question.question_type == question_type
        ))
        return result.scalars().all()

    async def update_question(self, question_id: int, question_data: QuestionUpdate) -> Optional[Question]:
        result = await self.db.execute(select(Question).filter(Question.id == question_id))
        db_question = result.scalars().first()
        if not db_question:
            return None

        update_data = question_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_question, field, value)

        await self.db.commit()
        await self.db.refresh(db_question)
        return db_question

    async def generate_full_test(self, session_id: str, level: str) -> Dict[str, Any]:
        """Generates a full test, including all sections, asynchronously with caching and background processing."""
        from app.core.cache import cache
        from app.tasks.test_generation import generate_full_test_async
        
                                                                 
        cache_key = f"generated_test:{session_id}:{level}"
        cached_test = await cache.aget(cache_key)
        if cached_test and cached_test.get("status") != "error":
            print(f"[DEBUG] Using cached test data for session {session_id}")
            return cached_test
        
                                                  
        generation_key = f"generating:{session_id}"
        if await cache.aexists(generation_key):
            print(f"[DEBUG] Test generation already in progress for session {session_id}")
                                
            return {
                "status": "generating",
                "message": "Test generation in progress",
                "session_id": session_id
            }
        
                            
        await cache.aset(generation_key, True, ttl=300)                        
        print(f"[DEBUG] Marked session {session_id} as generating")
        
        try:
                                                                
                                                                
            import asyncio
            
            try:
                                                                               
                print(f"[DEBUG] Starting test generation for session {session_id}, level {level}")
                full_test_data = await asyncio.wait_for(
                    openai_service.generate_full_test(level), 
                    timeout=120.0                                       
                )
                print(f"[DEBUG] Test generation completed for session {session_id}")
                
                                                                                                 
                reading_data = await self._process_section(
                    session_id, "reading", full_test_data.get("reading"), self._process_reading_section
                )
                try:
                    listening_raw_data = full_test_data.get("listening")
                    print(f"[DEBUG] Raw listening data from OpenAI: {listening_raw_data}")
                    
                    if not listening_raw_data or "error" in listening_raw_data:
                        print(f"[ERROR] Invalid listening data from OpenAI: {listening_raw_data}")
                        listening_data = {"error": "Failed to generate listening test data from OpenAI"}
                    else:
                        listening_data = await self._process_section(
                            session_id, "listening", listening_raw_data, self._process_listening_section
                        )
                except Exception as e:
                    print(f"[ERROR] Failed to process listening section: {e}")
                    import traceback
                    print(f"[ERROR] Traceback: {traceback.format_exc()}")
                    listening_data = {"error": f"Failed to process listening section: {str(e)}"}
                writing_data = await self._process_section(
                    session_id, "writing", full_test_data.get("writing"), self._process_writing_section
                )
                speaking_data = await self._process_section(
                    session_id, "speaking", full_test_data.get("speaking"), self._process_speaking_section
                )

                                                                
                await self.db.commit()
                print(f"[DEBUG] Database committed for session {session_id}")
                
                session = await self.get_test_session(session_id)
                if session:
                    session.status = "ready"
                    await self.db.commit()
                    print(f"[DEBUG] Session status updated to 'ready' for {session_id}")

                result = {
                    "reading": reading_data,
                    "listening": listening_data,
                    "writing": writing_data,
                    "speaking": speaking_data,
                }
                
                                               
                if not any("error" in section for section in result.values() if isinstance(section, dict)):
                    await cache.aset(cache_key, result, ttl=1800)              
                    print(f"[DEBUG] Cached successful test result for session {session_id}")
                else:
                    print(f"[DEBUG] Not caching result due to errors in sections")
                
                return result
                
            except asyncio.TimeoutError:
                print(f"[WARNING] Test generation timed out for session {session_id}, falling back to background task")
                                                                  
                task = generate_full_test_async.delay(session_id, level)
                print(f"[DEBUG] Background task created with ID: {task.id}")
                
                                       
                session = await self.get_test_session(session_id)
                if session:
                    session.status = "generating"
                    await self.db.commit()
                
                return {
                    "status": "generating",
                    "task_id": task.id,
                    "message": "Test generation started in background",
                    "session_id": session_id,
                    "estimated_time": "2-5 minutes"
                }
                
        except Exception as e:
            print(f"[ERROR] Exception in generate_full_test: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            
                                                   
            try:
                await self.db.rollback()
                print(f"[DEBUG] Database rolled back due to error")
            except:
                pass
            
                                            
            await cache.adelete(cache_key)
            await cache.adelete(generation_key)
            
                                            
            try:
                session = await self.get_test_session(session_id)
                if session:
                    session.status = "error"
                    await self.db.commit()
            except:
                pass
            
            raise e
        finally:
                                    
            await cache.adelete(generation_key)

    async def _process_section(self, session_id: str, section_type: str, test_data: Optional[Dict[str, Any]], processing_func) -> Dict[str, Any]:
        print(f"[DEBUG] Processing section '{section_type}' for session {session_id}")
        if not test_data:
            print(f"[DEBUG] No test data for section '{section_type}'")
            return {"error": f"Failed to generate {section_type} test data."}
        
                                              
        if isinstance(test_data, dict) and "error" in test_data:
            print(f"[ERROR] Test data for '{section_type}' contains error: {test_data['error']}")
            return test_data                          
            
        print(f"[DEBUG] Test data for '{section_type}': {test_data}")
        result = await processing_func(session_id, test_data)
        print(f"[DEBUG] Section '{section_type}' processing result: {result}")
        return result

    async def _process_reading_section(self, session_id: str, test_data: Dict[str, Any]) -> Dict[str, Any]:
        questions_to_create = [
            QuestionCreate(
                test_session_id=session_id,
                question_type="reading",
                content=json.dumps({
                    "passage": test_data.get("passage", ""),
                    "question": q_data["question"],
                    "question_number": i + 1
                }),
                options=json.dumps(q_data["options"]),
                correct_answer=q_data["correct_answer"]
            ) for i, q_data in enumerate(test_data.get("questions", []))
        ]
        
        created_questions = await self._bulk_create_questions(questions_to_create)
        await self.db.commit()
        print(f"[DEBUG] Database committed after creating reading questions")
        
        return {
            "passage": test_data.get("passage", ""),
            "questions": [{
                "id": q.id,
                "question": json.loads(q.content)["question"],
                "options": json.loads(q.options),
                "question_number": json.loads(q.content)["question_number"]
            } for q in created_questions]
        }

    async def _process_listening_section(self, session_id: str, test_data: Dict[str, Any]) -> Dict[str, Any]:
        print(f"[DEBUG] Processing listening section for session {session_id}")
        print(f"[DEBUG] Listening test_data: {test_data}")
        
        if not test_data:
            print(f"[ERROR] No test data provided for listening section")
            return {"error": "No test data provided"}
        
        scenarios = test_data.get("scenarios", [])
        print(f"[DEBUG] Found {len(scenarios)} scenarios to process")
        
        if not scenarios:
            print(f"[ERROR] No scenarios found in listening test data")
            return {"error": "No scenarios found in test data"}
        
        async def create_question_schema(i, scenario):
            print(f"[DEBUG] Processing scenario {i+1}: {scenario.get('question', 'No question')}")
            print(f"[DEBUG] Scenario data: {scenario}")
            
                                    
            if not scenario.get("audio_script"):
                print(f"[ERROR] No audio_script found in scenario {i+1}")
                audio_path = None
            else:
                try:
                    print(f"[DEBUG] Generating TTS for scenario {i+1} with text: {scenario['audio_script'][:100]}...")
                    audio_data = await audio_service.text_to_speech(scenario["audio_script"])
                    audio_path = None
                    if audio_data:
                                                       
                        os.makedirs("/app/audio", exist_ok=True)
                        audio_filename = f"listening_{session_id}_{i+1}.mp3"
                        audio_path = f"/app/audio/{audio_filename}"
                        await audio_service.save_audio_file(audio_data, audio_path)
                        print(f"[DEBUG] Audio saved to: {audio_path}")
                    else:
                        print(f"[WARNING] No audio data generated for scenario {i+1}")
                except Exception as e:
                    print(f"[ERROR] Failed to generate audio for scenario {i+1}: {e}")
                    import traceback
                    print(f"[ERROR] Audio generation traceback: {traceback.format_exc()}")
                    audio_path = None

            return QuestionCreate(
                test_session_id=session_id,
                question_type="listening",
                content=json.dumps({
                    "audio_script": scenario["audio_script"], "audio_path": audio_path,
                    "question": scenario["question"], "scenario_number": i + 1
                }),
                options=json.dumps(scenario["options"]), correct_answer=scenario["correct_answer"]
            )

        question_schemas = await asyncio.gather(*[
            create_question_schema(i, s) for i, s in enumerate(scenarios)
        ])
        print(f"[DEBUG] Created {len(question_schemas)} question schemas")

        created_questions = await self._bulk_create_questions(question_schemas)
        print(f"[DEBUG] Bulk created {len(created_questions)} questions in database")
        
                                                     
        await self.db.commit()
        print(f"[DEBUG] Database committed after creating listening questions")
        
                                              
        verification_result = await self.db.execute(
            select(Question).where(
                Question.test_session_id == session_id,
                Question.question_type == "listening"
            )
        )
        saved_questions = verification_result.scalars().all()
        print(f"[DEBUG] Verification: {len(saved_questions)} listening questions found in database after save")
        
        scenarios_created = [
            {
                "id": db_question.id, 
                "audio_path": json.loads(db_question.content)["audio_path"], 
                "question": json.loads(db_question.content)["question"],
                "options": json.loads(db_question.options), 
                "scenario_number": json.loads(db_question.content)["scenario_number"]
            } for db_question in created_questions
        ]
        
        print(f"[DEBUG] Returning {len(scenarios_created)} scenarios")
        return {"scenarios": scenarios_created}

    async def _process_writing_section(self, session_id: str, test_data: Dict[str, Any]) -> Dict[str, Any]:
        prompts_to_create = [
            QuestionCreate(
                test_session_id=session_id, question_type="writing",
                content=json.dumps({
                    "title": p["title"], "prompt": p["prompt"], "instructions": p["instructions"],
                    "word_count": p["word_count"], "time_limit": p["time_limit"],
                    "evaluation_criteria": p["evaluation_criteria"], "prompt_number": i + 1
                })
            ) for i, p in enumerate(test_data.get("prompts", []))
        ]
        
        created_prompts_db = await self._bulk_create_questions(prompts_to_create)
        await self.db.commit()
        print(f"[DEBUG] Database committed after creating writing questions")
        
        created_prompts = [
            {"id": p.id, **json.loads(p.content)} for p in created_prompts_db
        ]

        return {"prompts": created_prompts}

    async def _process_speaking_section(self, session_id: str, test_data: Dict[str, Any]) -> Dict[str, Any]:
        print(f"[DEBUG] Processing speaking section for session {session_id}")
        print(f"[DEBUG] Speaking test_data: {test_data}")
        
        if not test_data:
            print(f"[ERROR] No test data provided for speaking section")
            return {"error": "No test data provided"}
        
        questions = test_data.get("questions", [])
        print(f"[DEBUG] Found {len(questions)} speaking questions to process")
        
        if not questions:
            print(f"[ERROR] No questions found in speaking test data")
            return {"error": "No questions found in test data"}
        
        async def create_speaking_question_schema(i, q_data):
            print(f"[DEBUG] Processing speaking question {i+1}: {q_data.get('question', 'No question')[:50]}...")
            print(f"[DEBUG] Question data: {q_data}")
            
            try:
                audio_text = f"{q_data['question']} {q_data.get('follow_up', '')}".strip()
                print(f"[DEBUG] Generating TTS for speaking question {i+1}: {audio_text[:100]}...")
                
                audio_data = await audio_service.text_to_speech(audio_text)
                audio_path = None
                if audio_data:
                                                   
                    os.makedirs("/app/audio", exist_ok=True)
                    audio_filename = f"speaking_{session_id}_{i+1}.mp3"
                    audio_path = f"/app/audio/{audio_filename}"
                    await audio_service.save_audio_file(audio_data, audio_path)
                    print(f"[DEBUG] Speaking audio saved to: {audio_path}")
                else:
                    print(f"[WARNING] No audio data generated for speaking question {i+1}")

                content = {**q_data, "audio_path": audio_path, "question_number": i + 1}
                return QuestionCreate(
                    test_session_id=session_id, question_type="speaking",
                    content=json.dumps(content)
                )
            except Exception as e:
                print(f"[ERROR] Failed to process speaking question {i+1}: {e}")
                import traceback
                print(f"[ERROR] Speaking question traceback: {traceback.format_exc()}")
                                                             
                content = {**q_data, "audio_path": None, "question_number": i + 1}
                return QuestionCreate(
                    test_session_id=session_id, question_type="speaking",
                    content=json.dumps(content)
                )

        question_schemas = await asyncio.gather(*[
            create_speaking_question_schema(i, q) for i, q in enumerate(test_data.get("questions", []))
        ])

        created_questions_db = await self._bulk_create_questions(question_schemas)
        await self.db.commit()
        print(f"[DEBUG] Database committed after creating speaking questions")

        questions_created = [{"id": db_question.id, **json.loads(db_question.content)} for db_question in created_questions_db]

        return {"questions": questions_created}

    async def submit_reading_answer(self, question_id: int, user_answer: str) -> Dict[str, Any]:
        """Submit and evaluate reading answer"""
        result = await self.db.execute(select(Question).filter(Question.id == question_id))
        question = result.scalars().first()
        if not question:
            raise Exception("Question not found")

        if user_answer == "unanswered":
            question.user_answer = user_answer
            question.score = 0
            question.feedback = "No answer was provided."
            await self.db.commit()
            return {"score": 0, "feedback": "No answer was provided."}

        content = json.loads(question.content)
        evaluation = openai_service.evaluate_reading_answer(
            content["question"], question.correct_answer, user_answer
        )

        if evaluation:
            question.user_answer = user_answer
            question.score = evaluation["score"]
            question.feedback = evaluation["feedback"]
            await self.db.commit()

        return evaluation

    async def submit_listening_answer(self, question_id: int, user_answer: str) -> Dict[str, Any]:
        """Submit and evaluate listening answer"""
        result = await self.db.execute(select(Question).filter(Question.id == question_id))
        question = result.scalars().first()
        if not question:
            raise Exception("Question not found")

        content = json.loads(question.content)
                                              
                                                                                       
        if user_answer == "unanswered":
            score = 0
            feedback = "No answer was provided."
        else:
            is_correct = user_answer == question.correct_answer
            score = 100 if is_correct else 0
            feedback = "Correct" if is_correct else f"Incorrect. The correct answer is {question.correct_answer}."

        question.user_answer = user_answer
        question.score = score
        question.feedback = feedback
        await self.db.commit()

        return {"score": score, "feedback": feedback}

    async def save_writing_draft(self, question_id: int, user_answer: str) -> Dict[str, Any]:
        """Save writing answer as draft without evaluation"""
        result = await self.db.execute(select(Question).filter(Question.id == question_id))
        question = result.scalars().first()
        if not question:
            raise Exception("Question not found")

                                                              
        question.user_answer = user_answer
        await self.db.commit()
        
        print(f"[DEBUG] Saved writing draft for question {question_id}, length: {len(user_answer)}")
        return {
            "status": "draft_saved", 
            "message": "Answer saved as draft",
            "word_count": len(user_answer.strip().split()) if user_answer.strip() else 0
        }

    async def submit_writing_answer(self, question_id: int, user_answer: str, level: str) -> Optional[Dict[str, Any]]:
        """Submit and evaluate writing answer"""
        try:
            result = await self.db.execute(select(Question).filter(Question.id == question_id))
            question = result.scalars().first()
            if not question:
                raise Exception("Question not found")

                                                                                          
            if question.user_answer == user_answer and question.feedback:
                try:
                    existing_evaluation = json.loads(question.feedback)
                    print(f"[DEBUG] Returning cached evaluation for question {question_id}")
                    return existing_evaluation
                except (json.JSONDecodeError, TypeError):
                    print(f"[DEBUG] Invalid cached feedback for question {question_id}, re-evaluating")

            content = json.loads(question.content)
            
                                                                                      
            prompt_text = content['prompt']
            cache_key = f"writing_eval:{hashlib.md5(f'{prompt_text}:{user_answer}:{level}'.encode()).hexdigest()}"
            
                                                
            cached_evaluation = await cache.aget(cache_key)
            if cached_evaluation:
                try:
                    evaluation = json.loads(cached_evaluation)
                    print(f"[DEBUG] Using cached OpenAI evaluation for question {question_id}")
                except (json.JSONDecodeError, TypeError):
                    evaluation = None
            else:
                evaluation = None
            
                                                  
            if not evaluation:
                print(f"[DEBUG] Calling OpenAI for writing evaluation - question {question_id}")
                evaluation = await openai_service.evaluate_writing_answer(prompt_text, user_answer, level)
                
                                                 
                if evaluation:
                    await cache.aset(cache_key, json.dumps(evaluation), ttl=3600)
            
            if evaluation:
                question.user_answer = user_answer
                question.score = evaluation.get("score")
                question.feedback = json.dumps(evaluation)
                await self.db.commit()

            return evaluation
            
        except Exception as e:
            print(f"[ERROR] Error in submit_writing_answer: {e}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            raise e

    async def submit_speaking_answer(self, question_id: int, audio_data: bytes, level: str) -> Dict[str, Any]:
        """Submit and evaluate speaking answer"""
        result = await self.db.execute(select(Question).filter(Question.id == question_id))
        question = result.scalars().first()
        if not question:
            raise Exception("Question not found")

        transcribed_text = await audio_service.speech_to_text_from_bytes(audio_data)
        if not transcribed_text:
            return {"error": "Failed to transcribe audio"}

        question.user_answer = transcribed_text
        content = json.loads(question.content)
        evaluation = await openai_service.evaluate_speaking_answer(content["question"], transcribed_text, level)
        
        if evaluation:
            question.score = evaluation.get("score")
            question.feedback = json.dumps(evaluation)
        else:
            evaluation = {"error": "Failed to evaluate speaking answer"}
        
        await self.db.commit()

        audio_filename = f"speaking_answer_{question.test_session_id}_{question_id}.webm"
        file_path = f"/app/uploads/speaking/{audio_filename}"
        saved = await audio_service.save_audio_file(audio_data, file_path)
        if saved:
            question.attachment_path = file_path
            await self.db.commit()
            
        return {"transcription": transcribed_text, "evaluation": evaluation}
    
    async def _calculate_section_score(self, session_id: str, section_type: str) -> float:
        """Calculate the average score for a given section, treating unanswered questions as having a score of 0."""
        result = await self.db.execute(
            select(Question).where(
                Question.test_session_id == session_id,
                Question.question_type == section_type
            )
        )
        questions = result.scalars().all()
        if not questions:
            return 0.0

        total_score = sum(q.score if q.score is not None else 0 for q in questions)
        number_of_questions = len(questions)

        return total_score / number_of_questions if number_of_questions > 0 else 0.0

    async def get_test_results(self, session_id: str) -> Dict[str, Any]:
        """Retrieve test results, including scores and answered questions."""
        session = await self.get_test_session(session_id)
        if not session:
            return {"error": "Test session not found"}

        questions = await self.get_session_questions(session_id)

        return {
            "session": {
                "id": session.id,
                "status": session.status,
                "start_time": session.start_time,
                "end_time": session.end_time,
                "cefr_level": session.cefr_level,
                "reading_score": session.reading_score,
                "listening_score": session.listening_score,
                "writing_score": session.writing_score,
                "speaking_score": session.speaking_score
            },
            "questions": [
                {
                    "id": q.id,
                    "question_type": q.question_type,
                    "content": json.loads(q.content),
                    "user_answer": q.user_answer,
                    "score": q.score,
                    "feedback": q.feedback
                } for q in questions
            ]
        } 