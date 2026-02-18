#!/usr/bin/env python3
"""
Admin Tools для English Test Platform
Скрипт для административных задач
"""

import os
import sys
import argparse
from datetime import datetime
from typing import Optional, List, Dict, Any
import json

                                                              
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
                                                         
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)


from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.user import User
from app.models.test import TestSession, Question
from app.models.proctoring_log import ProctoringLog
from app.core.security import get_password_hash
from app.schemas.user import UserCreate
from app.services.user_service import UserService
from app.services.test_service import TestService


def get_db() -> Session:
    """Получить сессию базы данных"""
    db = SessionLocal()
    try:
        return db
    except Exception as e:
        db.close()
        raise e


def create_admin_user(email: str, password: str, full_name: str) -> bool:
    """Создать пользователя с правами администратора"""
    db = get_db()
    try:
        user_service = UserService(db)
        
                                               
        existing_user = user_service.get_user_by_email(email)
        if existing_user:
            print(f"❌ Пользователь с email {email} уже существует")
            return False
        
                              
        user_data = UserCreate(
            email=email,
            password=password,
            full_name=full_name
        )
        
        user = user_service.create_user(user_data)
        user.is_superuser = True
        db.commit()
        
        print(f"✅ Администратор создан успешно!")
        print(f"   Email: {email}")
        print(f"   Имя: {full_name}")
        print(f"   ID: {user.id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при создании администратора: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def list_users(show_detailed: bool = False) -> None:
    """Показать список всех пользователей"""
    db = get_db()
    try:
        users = db.query(User).all()
        
        if not users:
            print("📋 Пользователи не найдены")
            return
        
        print(f"📋 Всего пользователей: {len(users)}")
        print("=" * 80)
        
        for user in users:
            status = "👑 Админ" if user.is_superuser else "👤 Пользователь"
            created = user.created_at.strftime("%d.%m.%Y %H:%M")
            
            print(f"ID: {user.id} | {status}")
            print(f"   Имя: {user.full_name}")
            print(f"   Email: {user.email}")
            print(f"   Создан: {created}")
            
            if show_detailed:
                                              
                test_count = db.query(TestSession).filter(TestSession.user_id == user.id).count()
                completed_tests = db.query(TestSession).filter(
                    TestSession.user_id == user.id, 
                    TestSession.status == "completed"
                ).count()
                
                print(f"   Тестов: {test_count} (завершено: {completed_tests})")
                
                                
                last_test = db.query(TestSession).filter(
                    TestSession.user_id == user.id
                ).order_by(TestSession.start_time.desc()).first()
                
                if last_test:
                    last_test_date = last_test.start_time.strftime("%d.%m.%Y %H:%M")
                    print(f"   Последний тест: {last_test_date} ({last_test.status})")
            
            print("-" * 80)
            
    except Exception as e:
        print(f"❌ Ошибка при получении списка пользователей: {e}")
    finally:
        db.close()


def show_test_sessions(user_id: Optional[int] = None, session_id: Optional[str] = None) -> None:
    """Показать тестовые сессии"""
    db = get_db()
    try:
        query = db.query(TestSession)
        
        if user_id:
            query = query.filter(TestSession.user_id == user_id)
        
        if session_id:
            query = query.filter(TestSession.id == session_id)
        
        sessions = query.order_by(TestSession.start_time.desc()).all()
        
        if not sessions:
            print("📝 Тестовые сессии не найдены")
            return
        
        print(f"📝 Найдено сессий: {len(sessions)}")
        print("=" * 100)
        
        for session in sessions:
            user = db.query(User).filter(User.id == session.user_id).first()
            start_time = session.start_time.strftime("%d.%m.%Y %H:%M:%S")
            end_time = session.end_time.strftime("%d.%m.%Y %H:%M:%S") if session.end_time else "—"
            
            print(f"ID: {session.id}")
            print(f"   Пользователь: {user.full_name} ({user.email})")
            print(f"   Статус: {session.status}")
            print(f"   Уровень CEFR: {session.cefr_level or '—'}")
            print(f"   Начало: {start_time}")
            print(f"   Конец: {end_time}")
            
                               
            scores = []
            if session.reading_score is not None:
                scores.append(f"Чтение: {session.reading_score:.1f}%")
            if session.listening_score is not None:
                scores.append(f"Аудирование: {session.listening_score:.1f}%")
            if session.writing_score is not None:
                scores.append(f"Письмо: {session.writing_score:.1f}%")
            if session.speaking_score is not None:
                scores.append(f"Говорение: {session.speaking_score:.1f}%")
            
            if scores:
                print(f"   Оценки: {' | '.join(scores)}")
            
                                            
            questions_count = db.query(Question).filter(Question.test_session_id == session.id).count()
            print(f"   Вопросов: {questions_count}")
            
                               
            recordings = []
            if session.initial_photo_path:
                recordings.append("📷 Фото")
            if session.screen_recording_path:
                recordings.append("🎥 Запись экрана")
            
            if recordings:
                print(f"   Записи: {' | '.join(recordings)}")
            
            print("-" * 100)
            
    except Exception as e:
        print(f"❌ Ошибка при получении тестовых сессий: {e}")
    finally:
        db.close()


def show_proctoring_logs(session_id: str, event_type: Optional[str] = None) -> None:
    """Показать логи прокторинга для сессии"""
    db = get_db()
    try:
        query = db.query(ProctoringLog).filter(ProctoringLog.test_session_id == session_id)
        
        if event_type:
            query = query.filter(ProctoringLog.event_type == event_type)
        
        logs = query.order_by(ProctoringLog.timestamp.desc()).all()
        
        if not logs:
            print(f"📊 Логи прокторинга для сессии {session_id} не найдены")
            return
        
                                          
        event_counts = {}
        for log in logs:
            event_counts[log.event_type] = event_counts.get(log.event_type, 0) + 1
        
        print(f"📊 Логи прокторинга для сессии {session_id}")
        print("=" * 80)
        print("Статистика событий:")
        for event, count in sorted(event_counts.items()):
            print(f"   {event}: {count}")
        
        print(f"\nПоследние {min(20, len(logs))} событий:")
        print("-" * 80)
        
        for log in logs[:20]:
            timestamp = log.timestamp.strftime("%d.%m.%Y %H:%M:%S")
            event_data = ""
            
            if log.event_data:
                try:
                    data = json.loads(log.event_data)
                    if isinstance(data, dict):
                        event_data = " | " + " | ".join([f"{k}: {v}" for k, v in data.items()])
                    else:
                        event_data = f" | {data}"
                except:
                    event_data = f" | {log.event_data}"
            
            print(f"[{timestamp}] {log.event_type}{event_data}")
            
    except Exception as e:
        print(f"❌ Ошибка при получении логов прокторинга: {e}")
    finally:
        db.close()


def delete_user(user_id: int, confirm: bool = False) -> bool:
    """Удалить пользователя и все связанные данные"""
    db = get_db()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"❌ Пользователь с ID {user_id} не найден")
            return False
        
        if not confirm:
            print(f"⚠️  Вы собираетесь удалить пользователя:")
            print(f"   ID: {user.id}")
            print(f"   Имя: {user.full_name}")
            print(f"   Email: {user.email}")
            print(f"   Админ: {'Да' if user.is_superuser else 'Нет'}")
            
                                         
            session_count = db.query(TestSession).filter(TestSession.user_id == user_id).count()
            print(f"   Тестовых сессий: {session_count}")
            
            print("\n⚠️  Все данные пользователя будут удалены навсегда!")
            response = input("Подтвердите удаление, введите 'DELETE': ")
            if response != 'DELETE':
                print("❌ Удаление отменено")
                return False
        
                                  
        sessions = db.query(TestSession).filter(TestSession.user_id == user_id).all()
        for session in sessions:
                             
            db.query(Question).filter(Question.test_session_id == session.id).delete()
                                      
            db.query(ProctoringLog).filter(ProctoringLog.test_session_id == session.id).delete()
        
                        
        db.query(TestSession).filter(TestSession.user_id == user_id).delete()
        
                              
        db.delete(user)
        db.commit()
        
        print(f"✅ Пользователь {user.full_name} удален успешно")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при удалении пользователя: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def database_stats() -> None:
    """Показать статистику базы данных"""
    db = get_db()
    try:
        users_count = db.query(User).count()
        admins_count = db.query(User).filter(User.is_superuser == True).count()
        sessions_count = db.query(TestSession).count()
        completed_sessions = db.query(TestSession).filter(TestSession.status == "completed").count()
        questions_count = db.query(Question).count()
        logs_count = db.query(ProctoringLog).count()
        
        print("📊 Статистика базы данных")
        print("=" * 50)
        print(f"👥 Пользователей: {users_count} (админов: {admins_count})")
        print(f"📝 Тестовых сессий: {sessions_count} (завершено: {completed_sessions})")
        print(f"❓ Вопросов: {questions_count}")
        print(f"📋 Логов прокторинга: {logs_count}")
        
                                    
        cefr_stats = db.query(TestSession.cefr_level, db.func.count(TestSession.id)).filter(
            TestSession.cefr_level.isnot(None)
        ).group_by(TestSession.cefr_level).all()
        
        if cefr_stats:
            print("\n🎯 Распределение по уровням CEFR:")
            for level, count in sorted(cefr_stats):
                print(f"   {level}: {count}")
        
                          
        recent_sessions = db.query(TestSession).filter(
            TestSession.status == "completed"
        ).order_by(TestSession.end_time.desc()).limit(5).all()
        
        if recent_sessions:
            print("\n🕒 Последние завершенные тесты:")
            for session in recent_sessions:
                user = db.query(User).filter(User.id == session.user_id).first()
                end_time = session.end_time.strftime("%d.%m.%Y %H:%M")
                print(f"   {end_time} | {user.full_name} | {session.cefr_level or '—'}")
        
    except Exception as e:
        print(f"❌ Ошибка при получении статистики: {e}")
    finally:
        db.close()


def show_violations_report():
    """Отчет по всем нарушениям прокторинга"""
    db = get_db()
    try:
        from app.models.proctoring_violations import ProctoringViolation
        from sqlalchemy import func
        
        print("\n🚨 Отчет по нарушениям прокторинга")
        print("=" * 60)
        
                          
        total_violations = db.query(ProctoringViolation).count()
        print(f"📊 Всего нарушений: {total_violations}")
        
        if total_violations == 0:
            print("✅ Нарушений не найдено")
            return
        
                             
        print(f"\n📈 Топ-10 типов нарушений:")
        type_stats = db.query(
            ProctoringViolation.violation_type,
            func.count(ProctoringViolation.id).label('count')
        ).group_by(ProctoringViolation.violation_type).order_by(
            func.count(ProctoringViolation.id).desc()
        ).limit(10).all()
        
        for i, (vtype, count) in enumerate(type_stats, 1):
            print(f"  {i}. {vtype}: {count}")
        
                                   
        print(f"\n⚡ Распределение по серьезности:")
        severity_stats = db.query(
            ProctoringViolation.severity,
            func.count(ProctoringViolation.id).label('count')
        ).group_by(ProctoringViolation.severity).order_by(
            func.count(ProctoringViolation.id).desc()
        ).all()
        
        for severity, count in severity_stats:
            emoji = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🔴"}.get(severity, "⚪")
            percentage = (count / total_violations) * 100
            print(f"  {emoji} {severity}: {count} ({percentage:.1f}%)")
        
                                                         
        print(f"\n👥 Топ-5 пользователей с нарушениями:")
        user_stats = db.query(
            User.full_name,
            User.email,
            func.count(ProctoringViolation.id).label('violation_count')
        ).join(ProctoringViolation).group_by(
            User.id, User.full_name, User.email
        ).order_by(
            func.count(ProctoringViolation.id).desc()
        ).limit(5).all()
        
        for i, (name, email, count) in enumerate(user_stats, 1):
            print(f"  {i}. {name} ({email}): {count} нарушений")
    
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        db.close()

def show_session_violations(session_id: str):
    """Показать нарушения для конкретной сессии"""
    db = get_db()
    try:
        from app.models.proctoring_violations import ProctoringViolation
        
                                        
        session = db.query(TestSession).filter(TestSession.id == session_id).first()
        if not session:
            print(f"❌ Сессия {session_id} не найдена")
            return
        
                               
        user = db.query(User).filter(User.id == session.user_id).first()
        
        print(f"\n🔍 Анализ нарушений для сессии: {session_id}")
        print(f"👤 Пользователь: {user.full_name} ({user.email})")
        print(f"📅 Дата: {session.start_time.strftime('%d.%m.%Y %H:%M:%S')}")
        print("=" * 60)
        
        violations = db.query(ProctoringViolation).filter(
            ProctoringViolation.session_id == session_id
        ).order_by(ProctoringViolation.timestamp).all()
        
        if not violations:
            print("✅ Нарушений прокторинга не обнаружено")
            return
        
                    
        violation_counts = {}
        severity_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        
        for violation in violations:
            violation_counts[violation.violation_type] = violation_counts.get(violation.violation_type, 0) + 1
            severity_counts[violation.severity] += 1
        
        print(f"📊 Всего нарушений: {len(violations)}")
        print("\n📈 По типам:")
        for vtype, count in sorted(violation_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  • {vtype}: {count}")
        
        print("\n⚡ По серьезности:")
        for severity, count in severity_counts.items():
            if count > 0:
                emoji = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🔴"}[severity]
                print(f"  {emoji} {severity}: {count}")
        
                                  
        print(f"\n📋 Детали нарушений:")
        print("-" * 60)
        
        for violation in violations:
            timestamp = violation.timestamp.strftime("%H:%M:%S")
            severity_emoji = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🔴"}[violation.severity]
            
            print(f"[{timestamp}] {severity_emoji} {violation.violation_type}")
            if violation.description:
                print(f"    📝 {violation.description}")
            if violation.violation_metadata:
                print(f"    📊 Метаданные: {violation.violation_metadata}")
            print()
    
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        db.close()

def main():
    """Главная функция"""
    parser = argparse.ArgumentParser(description="Admin Tools для English Test Platform")
    subparsers = parser.add_subparsers(dest='command', help='Доступные команды')
    
                             
    create_admin_parser = subparsers.add_parser('create-admin', help='Создать администратора')
    create_admin_parser.add_argument('--email', required=True, help='Email администратора')
    create_admin_parser.add_argument('--password', required=True, help='Пароль администратора')
    create_admin_parser.add_argument('--name', required=True, help='Полное имя администратора')
    
                          
    list_users_parser = subparsers.add_parser('list-users', help='Показать список пользователей')
    list_users_parser.add_argument('--detailed', action='store_true', help='Подробная информация')
    
                     
    sessions_parser = subparsers.add_parser('sessions', help='Показать тестовые сессии')
    sessions_parser.add_argument('--user-id', type=int, help='ID пользователя')
    sessions_parser.add_argument('--session-id', help='ID сессии')
    
                      
    logs_parser = subparsers.add_parser('logs', help='Показать логи прокторинга')
    logs_parser.add_argument('--session-id', required=True, help='ID сессии')
    logs_parser.add_argument('--event-type', help='Тип события')
    
                           
    delete_parser = subparsers.add_parser('delete-user', help='Удалить пользователя')
    delete_parser.add_argument('--user-id', type=int, required=True, help='ID пользователя')
    delete_parser.add_argument('--force', action='store_true', help='Принудительное удаление без подтверждения')
    
                         
    subparsers.add_parser('violations-report', help='Отчет по всем нарушениям прокторинга')
    
                          
    session_violations_parser = subparsers.add_parser('session-violations', help='Нарушения для конкретной сессии')
    session_violations_parser.add_argument('--session-id', required=True, help='ID сессии')
    
                
    subparsers.add_parser('stats', help='Показать статистику базы данных')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    print("🚀 English Test Platform - Admin Tools")
    print("=" * 50)
    
    if args.command == 'create-admin':
        create_admin_user(args.email, args.password, args.name)
    
    elif args.command == 'list-users':
        list_users(args.detailed)
    
    elif args.command == 'sessions':
        show_test_sessions(args.user_id, args.session_id)
    
    elif args.command == 'logs':
        show_proctoring_logs(args.session_id, args.event_type)
    
    elif args.command == 'violations-report':
        show_violations_report()
    
    elif args.command == 'session-violations':
        show_session_violations(args.session_id)
    
    elif args.command == 'delete-user':
        delete_user(args.user_id, args.force)
    
    elif args.command == 'stats':
        database_stats()

                                                                                        
if __name__ == "__main__":
    main() 