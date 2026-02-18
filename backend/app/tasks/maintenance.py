from celery import current_task
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.core.cache import cache
from app.models.test import TestSession, PreliminaryTestSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

@celery_app.task(name="cleanup_expired_sessions")
def cleanup_expired_sessions():
    """Task to cleanup expired test sessions"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_cleanup_sessions_internal())
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        logger.error(f"Error in cleanup_expired_sessions: {exc}")
        raise exc

async def _cleanup_sessions_internal():
    """Internal async function for session cleanup"""
    async with AsyncSessionLocal() as db:
        try:
                                                   
            expiration_time = datetime.utcnow() - timedelta(hours=24)
            
                                        
            main_sessions_result = await db.execute(
                select(TestSession).where(
                    and_(
                        TestSession.created_at < expiration_time,
                        TestSession.status.in_(["generating", "error", "abandoned"])
                    )
                )
            )
            expired_main_sessions = main_sessions_result.scalars().all()
            
                                               
            prelim_sessions_result = await db.execute(
                select(PreliminaryTestSession).where(
                    and_(
                        PreliminaryTestSession.created_at < expiration_time,
                        PreliminaryTestSession.status.in_(["in_progress", "error", "abandoned"])
                    )
                )
            )
            expired_prelim_sessions = prelim_sessions_result.scalars().all()
            
                                     
            for session in expired_main_sessions:
                await db.delete(session)
            
            for session in expired_prelim_sessions:
                await db.delete(session)
            
            await db.commit()
            
                                           
            for session in expired_main_sessions:
                cache.delete_pattern(f"*:{session.id}:*")
            
            for session in expired_prelim_sessions:
                cache.delete_pattern(f"*:{session.id}:*")
            
            return {
                'main_sessions_cleaned': len(expired_main_sessions),
                'prelim_sessions_cleaned': len(expired_prelim_sessions),
                'total_cleaned': len(expired_main_sessions) + len(expired_prelim_sessions)
            }
            
        except Exception as e:
            await db.rollback()
            raise e

@celery_app.task(name="cleanup_temp_files")
def cleanup_temp_files():
    """Task to cleanup temporary files"""
    try:
        temp_dirs = [
            '/tmp',
            '/app/temp',
            '/app/uploads/temp'
        ]
        
        cleaned_files = []
        current_time = datetime.now()
        max_age = timedelta(hours=2)           
        
        for temp_dir in temp_dirs:
            if not os.path.exists(temp_dir):
                continue
                
            for filename in os.listdir(temp_dir):
                file_path = os.path.join(temp_dir, filename)
                
                try:
                                      
                    if os.path.isdir(file_path):
                        continue
                    
                                    
                    file_time = datetime.fromtimestamp(os.path.getctime(file_path))
                    file_age = current_time - file_time
                    
                    if file_age > max_age:
                        os.unlink(file_path)
                        cleaned_files.append(file_path)
                        
                except Exception as e:
                    logger.warning(f"Error cleaning up {file_path}: {e}")
        
        return {
            'cleaned_files': len(cleaned_files),
            'files': cleaned_files[:10]                               
        }
        
    except Exception as exc:
        logger.error(f"Error in cleanup_temp_files: {exc}")
        raise exc

@celery_app.task(name="health_check")
def health_check():
    """Task to perform system health checks"""
    try:
        health_status = {
            'timestamp': datetime.utcnow().isoformat(),
            'cache': False,
            'database': False,
            'disk_space': None,
            'memory_usage': None
        }
        
                            
        try:
            health_status['cache'] = cache.health_check()
        except Exception as e:
            logger.error(f"Cache health check failed: {e}")
        
                               
        try:
            async def check_db():
                async with AsyncSessionLocal() as db:
                    await db.execute(select(1))
                    return True
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                health_status['database'] = loop.run_until_complete(check_db())
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
        
                          
        try:
            import shutil
            total, used, free = shutil.disk_usage('/')
            health_status['disk_space'] = {
                'total_gb': round(total / (1024**3), 2),
                'used_gb': round(used / (1024**3), 2),
                'free_gb': round(free / (1024**3), 2),
                'usage_percent': round((used / total) * 100, 2)
            }
        except Exception as e:
            logger.error(f"Disk space check failed: {e}")
        
                            
        try:
            import psutil
            memory = psutil.virtual_memory()
            health_status['memory_usage'] = {
                'total_gb': round(memory.total / (1024**3), 2),
                'used_gb': round(memory.used / (1024**3), 2),
                'available_gb': round(memory.available / (1024**3), 2),
                'usage_percent': memory.percent
            }
        except Exception as e:
            logger.error(f"Memory usage check failed: {e}")
        
                             
        cache.set('system_health', health_status, ttl=300)             
        
        return health_status
        
    except Exception as exc:
        logger.error(f"Error in health_check: {exc}")
        raise exc

@celery_app.task(name="optimize_cache")
def optimize_cache():
    """Task to optimize cache performance"""
    try:
        optimization_results = {
            'expired_keys_cleaned': 0,
            'memory_freed_mb': 0,
            'fragmentation_reduced': False
        }
        
                                                  
        try:
            client = cache.sync_client
            info_before = client.info('memory')
            
                                                                    
                                                  
            patterns_to_clean = [
                'metrics_hour:*',
                'temp:*',
                'session_temp:*',
                'error:*'
            ]
            
            total_deleted = 0
            for pattern in patterns_to_clean:
                deleted = cache.delete_pattern(pattern)
                total_deleted += deleted
            
            optimization_results['expired_keys_cleaned'] = total_deleted
            
                                  
            info_after = client.info('memory')
            
            memory_before = info_before.get('used_memory', 0)
            memory_after = info_after.get('used_memory', 0)
            
            optimization_results['memory_freed_mb'] = round((memory_before - memory_after) / (1024*1024), 2)
            optimization_results['fragmentation_reduced'] = memory_before > memory_after
            
        except Exception as e:
            logger.error(f"Cache optimization failed: {e}")
        
        return optimization_results
        
    except Exception as exc:
        logger.error(f"Error in optimize_cache: {exc}")
        raise exc

@celery_app.task(name="backup_critical_data")
def backup_critical_data():
    """Task to backup critical system data"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(_backup_data_internal())
            return result
        finally:
            loop.close()
            
    except Exception as exc:
        logger.error(f"Error in backup_critical_data: {exc}")
        raise exc

async def _backup_data_internal():
    """Internal async function for data backup"""
    import json
    from datetime import datetime
    
    backup_data = {
        'timestamp': datetime.utcnow().isoformat(),
        'active_sessions': [],
        'system_stats': {}
    }
    
    try:
        async with AsyncSessionLocal() as db:
                                         
            active_sessions_result = await db.execute(
                select(TestSession).where(
                    TestSession.status.in_(["in_progress", "ready", "generating"])
                )
            )
            active_sessions = active_sessions_result.scalars().all()
            
            for session in active_sessions:
                backup_data['active_sessions'].append({
                    'id': session.id,
                    'user_id': session.user_id,
                    'status': session.status,
                    'created_at': session.created_at.isoformat() if session.created_at else None,
                    'level': getattr(session, 'level', None)
                })
            
                                   
            backup_data['system_stats'] = {
                'total_active_sessions': len(active_sessions),
                'cache_health': cache.health_check()
            }
            
                                 
            backup_filename = f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            backup_path = f"/app/backups/{backup_filename}"
            
                                            
            os.makedirs(os.path.dirname(backup_path), exist_ok=True)
            
            with open(backup_path, 'w') as f:
                json.dump(backup_data, f, indent=2)
            
            return {
                'backup_file': backup_path,
                'sessions_backed_up': len(active_sessions),
                'backup_size_kb': round(os.path.getsize(backup_path) / 1024, 2)
            }
            
    except Exception as e:
        raise e

@celery_app.task(name="generate_performance_report")
def generate_performance_report():
    """Task to generate system performance report"""
    try:
        import psutil
        from datetime import datetime, timedelta
        
        report = {
            'timestamp': datetime.utcnow().isoformat(),
            'system_metrics': {},
            'cache_metrics': {},
            'database_metrics': {},
            'recommendations': []
        }
        
                        
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            report['system_metrics'] = {
                'cpu_usage_percent': cpu_percent,
                'memory_usage_percent': memory.percent,
                'disk_usage_percent': round((disk.used / disk.total) * 100, 2),
                'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
            }
            
                                                       
            if cpu_percent > 80:
                report['recommendations'].append("High CPU usage detected. Consider scaling workers.")
            
            if memory.percent > 85:
                report['recommendations'].append("High memory usage detected. Consider increasing memory or optimizing cache.")
            
            if (disk.used / disk.total) > 0.9:
                report['recommendations'].append("Low disk space. Consider cleanup or storage expansion.")
                
        except Exception as e:
            logger.error(f"System metrics collection failed: {e}")
        
                       
        try:
            client = cache.sync_client
            cache_info = client.info('memory')
            
            report['cache_metrics'] = {
                'used_memory_mb': round(cache_info.get('used_memory', 0) / (1024*1024), 2),
                'max_memory_mb': round(cache_info.get('maxmemory', 0) / (1024*1024), 2),
                'hit_rate': cache_info.get('keyspace_hits', 0) / max(cache_info.get('keyspace_hits', 0) + cache_info.get('keyspace_misses', 0), 1),
                'connected_clients': cache_info.get('connected_clients', 0)
            }
            
        except Exception as e:
            logger.error(f"Cache metrics collection failed: {e}")
        
                     
        report_filename = f"performance_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        report_path = f"/app/reports/{report_filename}"
        
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
                          
        cache.set('latest_performance_report', report, ttl=3600)
        
        return {
            'report_file': report_path,
            'summary': {
                'cpu_usage': report['system_metrics'].get('cpu_usage_percent'),
                'memory_usage': report['system_metrics'].get('memory_usage_percent'),
                'recommendations_count': len(report['recommendations'])
            }
        }
        
    except Exception as exc:
        logger.error(f"Error in generate_performance_report: {exc}")
        raise exc