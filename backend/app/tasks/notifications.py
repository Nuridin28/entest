from celery import current_task
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.core.cache import cache
from app.models.user import User
from app.models.test import TestSession
from sqlalchemy import select
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="send_test_completion_notification")
def send_test_completion_notification(self, user_id: int, session_id: str, final_score: float, cefr_level: str):
    """Task to send test completion notification"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 2, 'status': 'Preparing notification...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_send_completion_notification_internal(
                user_id, session_id, final_score, cefr_level, self
            ))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'user_id': user_id, 'session_id': session_id}
        )
        raise exc

async def _send_completion_notification_internal(user_id: int, session_id: str, final_score: float, cefr_level: str, task):
    """Internal async function for sending completion notification"""
    try:
        async with AsyncSessionLocal() as db:
                                  
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalars().first()
            
            if not user:
                raise Exception("User not found")
            
            task.update_state(
                state='PROGRESS',
                meta={'current': 1, 'total': 2, 'status': 'Sending notification...'}
            )
            
                                          
            notification_data = {
                'user_name': user.full_name,
                'user_email': user.email,
                'session_id': session_id,
                'final_score': final_score,
                'cefr_level': cefr_level,
                'completion_time': datetime.utcnow().isoformat()
            }
            
                                                     
            email_sent = await _send_email_notification(notification_data)
            
                                      
            in_app_sent = await _send_in_app_notification(user_id, notification_data)
            
                                                   
            cache_key = f"user_notifications:{user_id}"
            notifications = await cache.aget(cache_key) or []
            notifications.append({
                'type': 'test_completion',
                'data': notification_data,
                'timestamp': datetime.utcnow().isoformat(),
                'read': False
            })
            
                                             
            notifications = notifications[-10:]
            await cache.aset(cache_key, notifications, ttl=86400)            
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 2, 'total': 2, 'status': 'Notification sent successfully'}
            )
            
            return {
                'email_sent': email_sent,
                'in_app_sent': in_app_sent,
                'user_id': user_id,
                'session_id': session_id
            }
            
    except Exception as e:
        raise e

async def _send_email_notification(notification_data: dict) -> bool:
    """Send email notification"""
    try:
                                                                
                                                                       
        
        logger.info(f"Email notification would be sent to {notification_data['user_email']}")
        logger.info(f"Subject: Test Completion - CEFR Level {notification_data['cefr_level']}")
        
                                
        await asyncio.sleep(0.1)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email notification: {e}")
        return False

async def _send_in_app_notification(user_id: int, notification_data: dict) -> bool:
    """Send in-app notification"""
    try:
                                                            
        notification_key = f"live_notification:{user_id}"
        
        notification = {
            'type': 'test_completion',
            'title': 'Test Completed!',
            'message': f"Congratulations! You've achieved CEFR level {notification_data['cefr_level']} with a score of {notification_data['final_score']:.1f}%",
            'data': notification_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await cache.aset(notification_key, notification, ttl=3600)          
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to send in-app notification: {e}")
        return False

@celery_app.task(bind=True, name="send_test_reminder")
def send_test_reminder(self, user_id: int, session_id: str):
    """Task to send test reminder notification"""
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current': 0, 'total': 1, 'status': 'Sending reminder...'}
        )
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_send_reminder_internal(user_id, session_id, self))
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        current_task.update_state(
            state='FAILURE',
            meta={'error': str(exc), 'user_id': user_id, 'session_id': session_id}
        )
        raise exc

async def _send_reminder_internal(user_id: int, session_id: str, task):
    """Internal async function for sending reminder"""
    try:
        async with AsyncSessionLocal() as db:
                                              
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalars().first()
            
            session_result = await db.execute(select(TestSession).where(TestSession.id == session_id))
            session = session_result.scalars().first()
            
            if not user or not session:
                raise Exception("User or session not found")
            
                                              
            if session.status not in ['in_progress', 'ready']:
                return {'skipped': True, 'reason': 'Session not active'}
            
            reminder_data = {
                'user_name': user.full_name,
                'user_email': user.email,
                'session_id': session_id,
                'session_status': session.status,
                'created_at': session.created_at.isoformat() if session.created_at else None
            }
            
                                        
            notification_key = f"live_notification:{user_id}"
            
            notification = {
                'type': 'test_reminder',
                'title': 'Test Reminder',
                'message': 'You have an incomplete test. Please complete it to get your results.',
                'data': reminder_data,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            await cache.aset(notification_key, notification, ttl=3600)
            
            task.update_state(
                state='SUCCESS',
                meta={'current': 1, 'total': 1, 'status': 'Reminder sent'}
            )
            
            return {
                'reminder_sent': True,
                'user_id': user_id,
                'session_id': session_id
            }
            
    except Exception as e:
        raise e

@celery_app.task(name="batch_send_notifications")
def batch_send_notifications(notifications: list):
    """Task to send multiple notifications in batch"""
    results = []
    
    for notification in notifications:
        try:
            notification_type = notification.get('type')
            
            if notification_type == 'test_completion':
                result = send_test_completion_notification.delay(
                    notification['user_id'],
                    notification['session_id'],
                    notification['final_score'],
                    notification['cefr_level']
                )
            elif notification_type == 'test_reminder':
                result = send_test_reminder.delay(
                    notification['user_id'],
                    notification['session_id']
                )
            else:
                raise ValueError(f"Unknown notification type: {notification_type}")
            
            results.append({
                'notification': notification,
                'task_id': result.id,
                'status': 'queued'
            })
            
        except Exception as e:
            results.append({
                'notification': notification,
                'error': str(e),
                'status': 'failed'
            })
    
    return results

@celery_app.task(name="cleanup_old_notifications")
def cleanup_old_notifications():
    """Task to cleanup old notifications from cache"""
    try:
        from datetime import datetime, timedelta
        
                                   
        notification_keys = cache.sync_client.keys("user_notifications:*")
        cleaned_count = 0
        
        cutoff_time = datetime.utcnow() - timedelta(days=7)              
        
        for key in notification_keys:
            try:
                notifications = cache.get(key) or []
                
                                              
                filtered_notifications = [
                    notif for notif in notifications
                    if datetime.fromisoformat(notif.get('timestamp', '1970-01-01T00:00:00')) > cutoff_time
                ]
                
                if len(filtered_notifications) != len(notifications):
                    cache.set(key, filtered_notifications, ttl=86400)
                    cleaned_count += len(notifications) - len(filtered_notifications)
                
            except Exception as e:
                logger.error(f"Error cleaning notifications for key {key}: {e}")
        
        return {
            'keys_processed': len(notification_keys),
            'notifications_cleaned': cleaned_count
        }
        
    except Exception as exc:
        logger.error(f"Error in cleanup_old_notifications: {exc}")
        raise exc

@celery_app.task(name="send_system_alert")
def send_system_alert(alert_type: str, message: str, severity: str = "info"):
    """Task to send system alerts to administrators"""
    try:
        alert_data = {
            'type': alert_type,
            'message': message,
            'severity': severity,
            'timestamp': datetime.utcnow().isoformat(),
            'hostname': os.uname().nodename if hasattr(os, 'uname') else 'unknown'
        }
        
                                                  
        alerts_key = "system_alerts"
        alerts = cache.get(alerts_key) or []
        alerts.append(alert_data)
        
                                  
        alerts = alerts[-50:]
        cache.set(alerts_key, alerts, ttl=86400)            
        
                       
        log_level = {
            'info': logging.INFO,
            'warning': logging.WARNING,
            'error': logging.ERROR,
            'critical': logging.CRITICAL
        }.get(severity, logging.INFO)
        
        logger.log(log_level, f"System Alert [{alert_type}]: {message}")
        
                                                   
                                                                        
        
        return alert_data
        
    except Exception as exc:
        logger.error(f"Error in send_system_alert: {exc}")
        raise exc