from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import Optional, Dict, Any
from datetime import datetime
import json

from ..models.test_result import TestResult
from ..models.test import PreliminaryTestSession, TestSession
from ..models.user import User
from ..utils.timezone import get_almaty_now


class TestResultService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_test_result(self, user_id: int) -> TestResult:
        """Создает новый результат теста"""
                                                            
        user_result = await self.db.execute(select(User).filter(User.id == user_id))
        user = user_result.scalars().first()
        
        if not user:
            raise ValueError("User not found")
        
        if user.test_attempts_used >= user.max_test_attempts:
            raise ValueError(f"User has exceeded maximum test attempts ({user.max_test_attempts})")
        
                                     
        user.test_attempts_used += 1
        
        test_result = TestResult(
            user_id=user_id,
            status="in_progress"
        )
        self.db.add(test_result)
        await self.db.commit()
        await self.db.refresh(test_result)
        return test_result

    async def get_test_result(self, result_id: int) -> Optional[TestResult]:
        """Получает результат теста по ID"""
        result = await self.db.execute(
            select(TestResult)
            .options(
                joinedload(TestResult.user),
                joinedload(TestResult.preliminary_test),
                joinedload(TestResult.main_test)
            )
            .filter(TestResult.id == result_id)
        )
        return result.scalars().first()

    async def get_user_test_results(self, user_id: int) -> list[TestResult]:
        """Получает все результаты тестов пользователя"""
        result = await self.db.execute(
            select(TestResult)
            .options(
                joinedload(TestResult.preliminary_test),
                joinedload(TestResult.main_test)
            )
            .filter(TestResult.user_id == user_id)
            .order_by(TestResult.created_at.desc())
        )
        return result.scalars().all()

    async def update_preliminary_results(
        self, 
        result_id: int, 
        preliminary_session: PreliminaryTestSession
    ) -> Optional[TestResult]:
        """Обновляет результаты предварительного теста"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return None

                                                               
        preliminary_data = {
            "session_id": preliminary_session.id,
            "current_level": preliminary_session.current_level,
            "score_percentage": preliminary_session.score_percentage,
            "determined_level": preliminary_session.determined_level,
            "next_action": preliminary_session.next_action,
            "completed_at": preliminary_session.completed_at.isoformat() if preliminary_session.completed_at else None
        }

        test_result.preliminary_test_id = preliminary_session.id
        test_result.preliminary_results = preliminary_data
        test_result.preliminary_completed = True

                                                                                
        if preliminary_session.next_action == "set_level":
            test_result.final_cefr_level = preliminary_session.determined_level
            test_result.final_score = preliminary_session.score_percentage
            test_result.status = "completed"
            test_result.end_time = get_almaty_now().replace(tzinfo=None)

        test_result.updated_at = get_almaty_now().replace(tzinfo=None)
        await self.db.commit()
        await self.db.refresh(test_result)
        
                                        
        await self.update_violations_count(result_id)
        
        return test_result

    async def update_main_test_results(
        self, 
        result_id: int, 
        main_session: TestSession
    ) -> Optional[TestResult]:
        """Обновляет результаты основного теста"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return None

                                                        
        main_test_data = {
            "session_id": main_session.id,
            "cefr_level": main_session.cefr_level,
            "reading_score": main_session.reading_score,
            "listening_score": main_session.listening_score,
            "writing_score": main_session.writing_score,
            "speaking_score": main_session.speaking_score,
            "final_score": main_session.final_score,
            "completed_at": main_session.end_time.isoformat() if main_session.end_time else None
        }

        test_result.main_test_id = main_session.id
        test_result.main_test_results = main_test_data

                                              
        is_ai_test = (test_result.preliminary_completed and 
                     test_result.preliminary_results and 
                     test_result.preliminary_results.get("next_action") == "ai_test")

        if is_ai_test:
                                                                                    
            test_result.ai_test_completed = True
            test_result.main_test_completed = False
            
                                                             
            final_level = self._determine_ai_test_level(test_result, main_session)
            test_result.final_cefr_level = final_level
            
                                                    
            test_result.ai_test_results = {
                "session_id": main_session.id,
                "final_score": main_session.final_score,
                "final_level": final_level,
                "completed_at": main_session.end_time.isoformat() if main_session.end_time else None
            }
        else:
                                                             
            test_result.main_test_completed = True
            test_result.final_cefr_level = main_session.cefr_level

        test_result.final_score = main_session.final_score
        test_result.status = "completed"
        test_result.end_time = get_almaty_now().replace(tzinfo=None)

        test_result.updated_at = get_almaty_now().replace(tzinfo=None)
        await self.db.commit()
        await self.db.refresh(test_result)
        
                                        
        await self.update_violations_count(result_id)
        
        return test_result

    def _determine_ai_test_level(self, test_result: TestResult, main_session: TestSession) -> str:
        """Определяет финальный уровень для ИИ теста на основе результатов"""
        if not test_result.preliminary_results:
            return "A1"
        
                                                     
        prelim_current_level = test_result.preliminary_results.get("current_level")
        prelim_determined_level = test_result.preliminary_results.get("determined_level")
        
                                     
        ai_test_score = main_session.final_score or 0
        ai_test_passed = ai_test_score >= 70
        
                                             
        if prelim_current_level == "upper_intermediate":
                                                                 
            if prelim_determined_level == "intermediate":
                if ai_test_passed:
                    return "B1"                                     
                else:
                    return "A2"                                        
        
        elif prelim_current_level == "advanced":
            if prelim_determined_level == "advanced":
                                                     
                if ai_test_passed:
                    return "C1"                                 
                else:
                    return "B2"                                    
            else:
                                                                 
                if ai_test_passed:
                    return "B2"                                           
                else:
                    return "B1"                                              
        
                  
        return "A1"

    async def update_ai_test_results(
        self, 
        result_id: int, 
        ai_test_data: Dict[str, Any]
    ) -> Optional[TestResult]:
        """Обновляет результаты AI теста"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return None

        test_result.ai_test_results = ai_test_data
        test_result.ai_test_completed = True

                                                              
        test_result.final_cefr_level = ai_test_data.get("final_level")
        test_result.final_score = ai_test_data.get("final_score")
        test_result.status = "completed"
        test_result.end_time = get_almaty_now().replace(tzinfo=None)

        test_result.updated_at = get_almaty_now().replace(tzinfo=None)
        await self.db.commit()
        await self.db.refresh(test_result)
        
                                        
        await self.update_violations_count(result_id)
        
        return test_result

    async def invalidate_test_result(
        self, 
        result_id: int, 
        reason: str
    ) -> Optional[TestResult]:
        """Аннулирует результат теста"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return None

        test_result.is_invalidated = True
        test_result.invalidation_reason = reason
        test_result.status = "invalidated"
        test_result.updated_at = get_almaty_now().replace(tzinfo=None)

        await self.db.commit()
        await self.db.refresh(test_result)
        
                                        
        await self.update_violations_count(result_id)
        
        return test_result

    async def get_test_progress(self, result_id: int) -> Dict[str, Any]:
        """Получает прогресс прохождения теста"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return {}

        return {
            "id": test_result.id,
            "status": test_result.status,
            "preliminary_completed": test_result.preliminary_completed,
            "main_test_completed": test_result.main_test_completed,
            "ai_test_completed": test_result.ai_test_completed,
            "final_cefr_level": test_result.final_cefr_level,
            "final_score": test_result.final_score,
            "current_stage": self._determine_current_stage(test_result),
            "next_action": self._determine_next_action(test_result)
        }

    def _determine_current_stage(self, test_result: TestResult) -> str:
        """Определяет текущий этап тестирования"""
        if not test_result.preliminary_completed:
            return "preliminary"
        elif test_result.preliminary_completed and not test_result.main_test_completed and not test_result.ai_test_completed:
                                                           
            if test_result.preliminary_results:
                next_action = test_result.preliminary_results.get("next_action")
                if next_action == "ai_test":
                    return "ai_test"
                elif next_action == "continue_test":
                    return "main_test"
                else:
                    return "completed"
        elif test_result.main_test_completed:
            return "completed"
        elif test_result.ai_test_completed:
            return "completed"
        else:
            return "unknown"

    def _determine_next_action(self, test_result: TestResult) -> str:
        """Определяет следующее действие"""
        current_stage = self._determine_current_stage(test_result)
        
        if current_stage == "preliminary":
            return "continue_preliminary"
        elif current_stage == "main_test":
            return "start_main_test"
        elif current_stage == "ai_test":
            return "start_ai_test"
        elif current_stage == "completed":
            return "show_results"
        else:
            return "unknown"

    async def update_violations_count(self, result_id: int) -> Optional[TestResult]:
        """Обновляет количество нарушений в результате теста"""
        from ..models.proctoring_violations import ProctoringViolation
        from ..models.preliminary_proctoring_violations import PreliminaryProctoringViolation
        
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return None

        total_violations = 0

                                                          
        if test_result.preliminary_test_id:
            prelim_violations_result = await self.db.execute(
                select(PreliminaryProctoringViolation)
                .filter(PreliminaryProctoringViolation.session_id == test_result.preliminary_test_id)
            )
            prelim_violations = prelim_violations_result.scalars().all()
            total_violations += len(prelim_violations)

                                                   
        if test_result.main_test_id:
            main_violations_result = await self.db.execute(
                select(ProctoringViolation)
                .filter(ProctoringViolation.session_id == test_result.main_test_id)
            )
            main_violations = main_violations_result.scalars().all()
            total_violations += len(main_violations)

                                        
        test_result.violations_count = total_violations
        test_result.updated_at = get_almaty_now().replace(tzinfo=None)
        
        await self.db.commit()
        await self.db.refresh(test_result)
        return test_result

    async def get_complete_test_results(self, result_id: int) -> Dict[str, Any]:
        """Получает полные результаты теста для отображения"""
        test_result = await self.get_test_result(result_id)
        if not test_result:
            return {}

                                                                    
        await self.update_violations_count(result_id)
        
                                        
        test_result = await self.get_test_result(result_id)

        return {
            "id": test_result.id,
            "user_id": test_result.user_id,
            "user_name": test_result.user.full_name if test_result.user else "Unknown",
            "start_time": test_result.start_time,
            "end_time": test_result.end_time,
            "status": test_result.status,
            "final_cefr_level": test_result.final_cefr_level,
            "final_score": test_result.final_score,
            "preliminary_results": test_result.preliminary_results,
            "main_test_results": test_result.main_test_results,
            "ai_test_results": test_result.ai_test_results,
            "violations_count": test_result.violations_count,
            "is_invalidated": test_result.is_invalidated,
            "invalidation_reason": test_result.invalidation_reason,
            "test_stages": {
                "preliminary_completed": test_result.preliminary_completed,
                "main_test_completed": test_result.main_test_completed,
                "ai_test_completed": test_result.ai_test_completed
            }
        }

    async def can_user_start_test(self, user_id: int) -> Dict[str, Any]:
        """Проверяет, может ли пользователь начать новый тест"""
        user_result = await self.db.execute(select(User).filter(User.id == user_id))
        user = user_result.scalars().first()
        
        if not user:
            return {
                "can_start": False,
                "reason": "User not found",
                "attempts_used": 0,
                "max_attempts": 3,
                "remaining_attempts": 0
            }
        
        can_start = user.test_attempts_used < user.max_test_attempts
        remaining = max(0, user.max_test_attempts - user.test_attempts_used)
        
        return {
            "can_start": can_start,
            "reason": "Maximum attempts exceeded" if not can_start else None,
            "attempts_used": user.test_attempts_used,
            "max_attempts": user.max_test_attempts,
            "remaining_attempts": remaining
        }

    async def reset_user_attempts(self, user_id: int) -> bool:
        """Сбрасывает попытки пользователя (только для админов)"""
        user_result = await self.db.execute(select(User).filter(User.id == user_id))
        user = user_result.scalars().first()
        
        if not user:
            return False
        
        user.test_attempts_used = 0
        await self.db.commit()
        return True