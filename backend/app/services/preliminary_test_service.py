import json
import os
import random
from typing import Dict, List, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from ..models.test import PreliminaryTestSession, PreliminaryQuestion
from ..schemas.test import PreliminaryTestSessionCreate, PreliminaryQuestionCreate
from ..utils.timezone import get_almaty_now


class PreliminaryTestService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.questions_base_path = "/app/app/questions_data"
        
    async def create_preliminary_test_session(self, user_id: int) -> PreliminaryTestSession:
        """Создает новую сессию предварительного тестирования"""
        session = PreliminaryTestSession(
            user_id=user_id,
            status="in_progress",
            current_level="pre_intermediate"
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session
    
    async def get_preliminary_test_session(self, session_id: int) -> Optional[PreliminaryTestSession]:
        """Получает сессию предварительного тестирования"""
        result = await self.db.execute(
            select(PreliminaryTestSession).filter(PreliminaryTestSession.id == session_id)
        )
        return result.scalars().first()
    
    async def get_test_result_id_by_preliminary_session(self, session_id: int) -> Optional[int]:
        """Получает ID результата теста по ID предварительной сессии"""
        from ..models.test_result import TestResult
        result = await self.db.execute(
            select(TestResult.id).filter(TestResult.preliminary_test_id == session_id)
        )
        return result.scalars().first()
        
    async def update_preliminary_test_session(self, session_id: int, **kwargs) -> Optional[PreliminaryTestSession]:
        """Обновляет сессию предварительного тестирования"""
        session = await self.get_preliminary_test_session(session_id)
        if not session:
            return None
            
        for key, value in kwargs.items():
            if hasattr(session, key):
                setattr(session, key, value)
                
        await self.db.commit()
        await self.db.refresh(session)
        return session
    
    def _load_questions_from_file(self, level: str, category: str) -> List[Dict]:
        """Загружает вопросы из JSON файла"""
        file_path = os.path.join(self.questions_base_path, category, level, "questions.json")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return []
    
    def _select_first_questions(self, questions: List[Dict], count: int = 10) -> List[Dict]:
        """Выбирает первые count вопросов из списка"""
        if len(questions) <= count:
            return questions
        return questions[:count]
    
    async def generate_level_test(self, session_id: int, level: str) -> Dict[str, Any]:
        """Генерирует тест для определенного уровня"""
        session = await self.get_preliminary_test_session(session_id)
        if not session:
            raise Exception("Preliminary test session not found")
        
                                                
        delete_stmt = PreliminaryQuestion.__table__.delete().where(PreliminaryQuestion.session_id == session_id)
        await self.db.execute(delete_stmt)
        await self.db.commit()
        
                                         
        grammar_questions = self._load_questions_from_file(level, "grammar")
        vocabulary_questions = self._load_questions_from_file(level, "vocabulary")
        reading_questions = self._load_questions_from_file(level, "reading")
        
                                                         
        selected_grammar = self._select_first_questions(grammar_questions, 10)
        selected_vocabulary = self._select_first_questions(vocabulary_questions, 10)
        selected_reading = self._select_first_questions(reading_questions, 10)
        
                                         
        all_questions = []
        
                           
        for i, q in enumerate(selected_grammar):
            question = PreliminaryQuestion(
                session_id=session_id,
                category="grammar",
                question_data=json.dumps(q),
                order_number=i + 1
            )
            self.db.add(question)
            all_questions.append(question)
        
                              
        for i, q in enumerate(selected_vocabulary):
            question = PreliminaryQuestion(
                session_id=session_id,
                category="vocabulary", 
                question_data=json.dumps(q),
                order_number=i + 11                      
            )
            self.db.add(question)
            all_questions.append(question)
        
                                                         
                                                                
        reading_questions_count = 0
        for passage_data in selected_reading:
            if "questions" in passage_data:
                for i, q in enumerate(passage_data["questions"]):
                                                              
                    if reading_questions_count >= 10:
                        break
                        
                    question_with_text = {
                        "text": passage_data.get("text", ""),
                        "question": q
                    }
                    question = PreliminaryQuestion(
                        session_id=session_id,
                        category="reading",
                        question_data=json.dumps(question_with_text),
                        order_number=len(all_questions) + 1
                    )
                    self.db.add(question)
                    all_questions.append(question)
                    reading_questions_count += 1
                
                                                              
                if reading_questions_count >= 10:
                    break
        
        await self.db.commit()
        
                                 
        session.current_level = level
        session.status = "ready"
        await self.db.commit()
        
        return {
            "session_id": session_id,
            "level": level,
            "total_questions": len(all_questions),
            "grammar_count": len(selected_grammar),
            "vocabulary_count": len(selected_vocabulary),
            "reading_count": reading_questions_count
        }
    
    async def get_test_questions(self, session_id: int) -> Dict[str, List[Dict]]:
        """Получает все вопросы для сессии, сгруппированные по категориям"""
        result = await self.db.execute(
            select(PreliminaryQuestion)
            .filter(PreliminaryQuestion.session_id == session_id)
            .order_by(PreliminaryQuestion.order_number)
        )
        questions = result.scalars().all()
        
        grouped_questions = {
            "grammar": [],
            "vocabulary": [],
            "reading": []
        }
        
        for q in questions:
            question_data = json.loads(q.question_data)
            question_info = {
                "id": q.id,
                "order_number": q.order_number,
                "data": question_data
            }
            grouped_questions[q.category].append(question_info)
        
        return grouped_questions
    
    async def submit_answer(self, question_id: int, user_answer: str) -> Dict[str, Any]:
        """Отправляет ответ на вопрос"""
        try:
            result = await self.db.execute(
                select(PreliminaryQuestion).filter(PreliminaryQuestion.id == question_id)
            )
            question = result.scalars().first()
            
            if not question:
                print(f"Question with ID {question_id} not found")
                                                                         
                                         
                return {
                    "is_correct": False,
                    "correct_answer": None,
                    "warning": "Question not found - may have been replaced by new level"
                }
            
                                                             
            was_answered_before = question.user_answer is not None
            if was_answered_before:
                print(f"Question {question_id} answer being updated from '{question.user_answer}' to '{user_answer}'")
            
            question_data = json.loads(question.question_data)
            
                                                                    
            if question.category in ["grammar", "vocabulary"]:
                correct_answer = question_data.get("correct_answer")
            elif question.category == "reading":
                correct_answer = question_data.get("question", {}).get("correct_answer")
            else:
                correct_answer = None
            
            is_correct = user_answer == correct_answer
            
            question.user_answer = user_answer
            question.is_correct = is_correct
            question.answered_at = get_almaty_now().replace(tzinfo=None)
            
            await self.db.commit()
            
            return {
                "is_correct": is_correct,
                "correct_answer": correct_answer,
                "was_updated": was_answered_before
            }
        except Exception as e:
            print(f"Error in submit_answer: {str(e)}")
            await self.db.rollback()
                                                             
            return {
                "is_correct": False,
                "correct_answer": None,
                "error": str(e)
            }
    


    async def calculate_test_score(self, session_id: int) -> Dict[str, Any]:
        """Вычисляет результат теста"""
        result = await self.db.execute(
            select(PreliminaryQuestion)
            .filter(PreliminaryQuestion.session_id == session_id)
        )
        questions = result.scalars().all()
        
        total_questions = len(questions)
        correct_answers = sum(1 for q in questions if q.is_correct)
        
        score_percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0
        
                                                           
        category_stats = {}
        for category in ["grammar", "vocabulary", "reading"]:
            category_questions = [q for q in questions if q.category == category]
            category_correct = sum(1 for q in category_questions if q.is_correct)
            category_total = len(category_questions)
            
            category_stats[category] = {
                "correct": category_correct,
                "total": category_total,
                "percentage": (category_correct / category_total * 100) if category_total > 0 else 0
            }
        
        return {
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "score_percentage": score_percentage,
            "category_stats": category_stats,
            "passed": score_percentage >= 70
        }
    

    
    async def complete_test_session(self, session_id: int, test_result_id: int = None) -> Dict[str, Any]:
        """Завершает сессию предварительного тестирования и определяет следующий шаг"""
        try:
            session = await self.get_preliminary_test_session(session_id)
            if not session:
                raise Exception("Session not found")
            
                                                           
            if session.status == "completed":
                print(f"Session {session_id} already completed in service, returning existing data")
                                                
                next_action = {"action": session.next_action}
                if session.determined_level:
                    next_action["level"] = session.determined_level
                
                return {
                    "score_percentage": session.score_percentage or 0,
                    "passed": session.score_percentage >= 70 if session.score_percentage else False,
                    "current_level": session.current_level,
                    "next_action": next_action
                }
            
            score_data = await self.calculate_test_score(session_id)
            
            session.status = "completed"
            session.score_percentage = score_data["score_percentage"]
            session.completed_at = get_almaty_now().replace(tzinfo=None)
            
                                                         
            current_level = session.current_level
            passed = score_data["passed"]
            
            next_action = self._determine_next_action(current_level, passed)
            
            session.next_action = next_action["action"]
            session.determined_level = next_action.get("level")
            
            await self.db.commit()
            
                                                                    
            if test_result_id:
                from .test_result_service import TestResultService
                result_service = TestResultService(self.db)
                await result_service.update_preliminary_results(test_result_id, session)
            
            return {
                **score_data,
                "current_level": current_level,
                "next_action": next_action
            }
        except Exception as e:
            await self.db.rollback()
            raise e
    
    def _determine_next_action(self, current_level: str, passed: bool) -> Dict[str, Any]:
        """
        Определяет следующее действие согласно алгоритму:
        
        1. Pre-intermediate: если прошел -> Intermediate, если нет -> A1
        2. Intermediate: если прошел -> Upper-intermediate, если нет -> A2  
        3. Upper-intermediate: 
           - Если прошел -> Advanced
           - Если не прошел -> запустить ИИ-тест уровня Intermediate
             - Если прошел ИИ-тест (≥70%) -> Intermediate (B1)
             - Если не прошел ИИ-тест (<70%) -> Pre-Intermediate (A2)
        4. Advanced: 
           - Если прошел -> запустить ИИ-тест уровня Advanced
             - Если прошел ИИ-тест (≥70%) -> Advanced (C1)
             - Если не прошел ИИ-тест (<70%) -> Upper-Intermediate (B2)
           - Если не прошел -> запустить ИИ-тест уровня Upper-Intermediate
             - Если прошел ИИ-тест (≥70%) -> Upper-Intermediate (B2)
             - Если не прошел ИИ-тест (<70%) -> Intermediate (B1)
        """
        
        if current_level == "pre_intermediate":
            if passed:
                return {"action": "continue_test", "next_level": "intermediate"}
            else:
                result = {"action": "set_level", "level": "A1"}
                return result
        
        elif current_level == "intermediate":
            if passed:
                return {"action": "continue_test", "next_level": "upper_intermediate"}
            else:
                return {"action": "set_level", "level": "A2"}
        
        elif current_level == "upper_intermediate":
            if passed:
                                                                             
                return {"action": "continue_test", "next_level": "advanced"}
            else:
                                                                                                 
                return {"action": "ai_test", "level": "intermediate", "options": [
                    {"result": "pass", "level": "B1"},                                                           
                    {"result": "fail", "level": "A2"}                                                                   
                ]}
        
        elif current_level == "advanced":
            if passed:
                                                       
                result = {"action": "ai_test", "level": "advanced", "options": [
                    {"result": "pass", "level": "C1"},                                                       
                    {"result": "fail", "level": "B2"}                                                                     
                ]}
                return result
            else:
                                                        
                result = {"action": "ai_test", "level": "upper_intermediate", "options": [
                    {"result": "pass", "level": "B2"},                                                                 
                    {"result": "fail", "level": "B1"}                                                               
                ]}
                return result
        
        return {"action": "error", "message": "Unknown level or state"}