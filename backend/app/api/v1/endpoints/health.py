from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_async_db
from app.core.cache import cache
from app.models.user import User
from app.core.security import get_current_active_user
import asyncio
import time
from typing import Dict, Any

router = APIRouter()

@router.get("/health")
async def get_basic_health():
    """Get basic system health status - no authentication required"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "service": "english-test-api"
    }

@router.get("/system-health")
async def get_system_health(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get comprehensive system health status"""
    
                                                                                           
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    health_status = {
        "timestamp": time.time(),
        "overall_status": "healthy",
        "services": {},
        "performance": {},
        "alerts": []
    }
    
                        
    try:
        cache_health = await cache.ahealth_check()
        health_status["services"]["cache"] = {
            "status": "healthy" if cache_health else "unhealthy",
            "response_time": None
        }
        
                                             
        start_time = time.time()
        test_value = await cache.aget("health_check_test")
        cache_response_time = (time.time() - start_time) * 1000
        
        health_status["services"]["cache"]["response_time"] = round(cache_response_time, 2)
        
        if cache_response_time > 100:                   
            health_status["alerts"].append("Cache response time is high")
            
    except Exception as e:
        health_status["services"]["cache"] = {
            "status": "error",
            "error": str(e)
        }
        health_status["overall_status"] = "degraded"
    
                                        
    try:
        start_time = time.time()
        result = await db.execute("SELECT 1")
        db_response_time = (time.time() - start_time) * 1000
        
        health_status["services"]["database"] = {
            "status": "healthy",
            "response_time": round(db_response_time, 2)
        }
        
        if db_response_time > 200:                   
            health_status["alerts"].append("Database response time is high")
            
    except Exception as e:
        health_status["services"]["database"] = {
            "status": "error",
            "error": str(e)
        }
        health_status["overall_status"] = "unhealthy"
    
                                                            
    try:
        import psutil
        
                                         
        cached_metrics = await cache.aget("system_metrics")
        if cached_metrics:
            health_status["performance"] = cached_metrics
        else:
            cpu_percent = psutil.cpu_percent(interval=0)                
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            metrics = {
                "cpu_usage_percent": cpu_percent,
                "memory_usage_percent": memory.percent,
                "disk_usage_percent": round((disk.used / disk.total) * 100, 2),
                "available_memory_gb": round(memory.available / (1024**3), 2),
                "free_disk_gb": round(disk.free / (1024**3), 2)
            }
            
            health_status["performance"] = metrics
            
                                                 
            await cache.aset("system_metrics", metrics, ttl=30)
        
                                                                 
        if cpu_percent > 80:
            health_status["alerts"].append({
                "type": "cpu",
                "level": "warning",
                "message": f"High CPU usage: {cpu_percent}%",
                "recommendation": "Consider scaling workers or optimizing background tasks"
            })
        if memory.percent > 85:
            health_status["alerts"].append({
                "type": "memory", 
                "level": "warning",
                "message": f"High memory usage: {memory.percent}%",
                "recommendation": "Clear cache or restart services to free memory"
            })
        if (disk.used / disk.total) > 0.9:
            health_status["alerts"].append({
                "type": "disk",
                "level": "critical",
                "message": f"Low disk space: {(disk.used / disk.total) * 100:.1f}% used",
                "recommendation": "Run cleanup tasks immediately or expand storage"
            })
        elif (disk.used / disk.total) > 0.8:
            health_status["alerts"].append({
                "type": "disk",
                "level": "warning", 
                "message": f"Disk space getting low: {(disk.used / disk.total) * 100:.1f}% used",
                "recommendation": "Schedule cleanup tasks soon"
            })
            
    except Exception as e:
        health_status["performance"] = {"error": str(e)}
    
                                                                    
    try:
                                          
        cached_celery_status = await cache.aget("celery_status")
        if cached_celery_status:
            health_status["services"]["celery"] = cached_celery_status
        else:
            from app.core.celery_app import celery_app
            
                                                        
            inspect = celery_app.control.inspect(timeout=0.5)
            active_workers = inspect.active() or {}
            
            if active_workers:
                celery_status = {
                    "status": "healthy",
                    "active_workers": len(active_workers),
                    "worker_names": list(active_workers.keys())
                }
            else:
                celery_status = {
                    "status": "no_workers",
                    "active_workers": 0
                }
            
            health_status["services"]["celery"] = celery_status
            
                                  
            await cache.aset("celery_status", celery_status, ttl=60)
            
    except Exception as e:
        health_status["services"]["celery"] = {
            "status": "unavailable",
            "error": "Celery not available or timeout"
        }
    
                              
    if health_status["alerts"]:
        if health_status["overall_status"] == "healthy":
            health_status["overall_status"] = "degraded"
    
    return health_status

@router.get("/performance-metrics")
async def get_performance_metrics(
    current_user: User = Depends(get_current_active_user)
):
    """Get detailed performance metrics"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
                                  
        current_hour = int(time.time() // 3600)
        metrics_key = f"metrics_hour:{current_hour}"
        current_metrics = await cache.aget(metrics_key) or {}
        
                                          
        prev_hour_key = f"metrics_hour:{current_hour - 1}"
        prev_metrics = await cache.aget(prev_hour_key) or {}
        
                           
        slow_requests = await cache.aget('slow_requests') or []
        
                           
        errors = await cache.aget('request_errors') or []
        
                          
        trends = {}
        if prev_metrics and current_metrics:
            prev_avg = prev_metrics.get('total_response_time', 0) / max(prev_metrics.get('request_count', 1), 1)
            curr_avg = current_metrics.get('total_response_time', 0) / max(current_metrics.get('request_count', 1), 1)
            
            trends['response_time_trend'] = 'improving' if curr_avg < prev_avg else 'degrading'
            trends['request_count_trend'] = 'increasing' if current_metrics.get('request_count', 0) > prev_metrics.get('request_count', 0) else 'decreasing'
        
        return {
            "current_hour_metrics": current_metrics,
            "previous_hour_metrics": prev_metrics,
            "slow_requests": {
                "count": len(slow_requests),
                "recent": slow_requests[-10:] if slow_requests else []
            },
            "errors": {
                "count": len(errors),
                "recent": errors[-10:] if errors else []
            },
            "trends": trends,
            "timestamp": time.time()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get performance metrics: {str(e)}")

@router.get("/cache-stats")
async def get_cache_stats(
    current_user: User = Depends(get_current_active_user)
):
    """Get cache statistics and performance"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        client = cache.sync_client
        info = client.info()
        
                                           
        cache_stats = {
            "memory": {
                "used_memory": info.get('used_memory', 0),
                "used_memory_human": info.get('used_memory_human', '0B'),
                "max_memory": info.get('maxmemory', 0),
                "memory_usage_percent": round((info.get('used_memory', 0) / max(info.get('maxmemory', 1), 1)) * 100, 2)
            },
            "performance": {
                "keyspace_hits": info.get('keyspace_hits', 0),
                "keyspace_misses": info.get('keyspace_misses', 0),
                "hit_rate": round(info.get('keyspace_hits', 0) / max(info.get('keyspace_hits', 0) + info.get('keyspace_misses', 0), 1) * 100, 2)
            },
            "connections": {
                "connected_clients": info.get('connected_clients', 0),
                "total_connections_received": info.get('total_connections_received', 0)
            },
            "operations": {
                "total_commands_processed": info.get('total_commands_processed', 0),
                "instantaneous_ops_per_sec": info.get('instantaneous_ops_per_sec', 0)
            },
            "keys": {
                "total_keys": sum([info.get(f'db{i}', {}).get('keys', 0) for i in range(16)])
            }
        }
        
        return cache_stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cache stats: {str(e)}")

@router.post("/clear-cache")
async def clear_cache(
    pattern: str = "*",
    current_user: User = Depends(get_current_active_user)
):
    """Clear cache entries matching pattern"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        deleted_count = cache.delete_pattern(pattern)
        
        return {
            "message": f"Cleared {deleted_count} cache entries",
            "pattern": pattern,
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@router.get("/active-tasks")
async def get_active_tasks(
    current_user: User = Depends(get_current_active_user)
):
    """Get active Celery tasks"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        from app.core.celery_app import celery_app
        
                              
        inspect = celery_app.control.inspect()
        
        active_tasks = inspect.active() or {}
        scheduled_tasks = inspect.scheduled() or {}
        reserved_tasks = inspect.reserved() or {}
        
                             
        stats = inspect.stats() or {}
        
        return {
            "active_tasks": active_tasks,
            "scheduled_tasks": scheduled_tasks,
            "reserved_tasks": reserved_tasks,
            "worker_stats": stats,
            "total_active": sum(len(tasks) for tasks in active_tasks.values()),
            "total_scheduled": sum(len(tasks) for tasks in scheduled_tasks.values()),
            "total_reserved": sum(len(tasks) for tasks in reserved_tasks.values())
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get active tasks: {str(e)}")

@router.post("/optimize-system")
async def optimize_system(
    current_user: User = Depends(get_current_active_user)
):
    """Trigger system optimization tasks"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        from app.tasks.maintenance import optimize_cache, cleanup_temp_files, cleanup_expired_sessions
        
                                    
        cache_task = optimize_cache.delay()
        cleanup_task = cleanup_temp_files.delay()
        session_cleanup_task = cleanup_expired_sessions.delay()
        
        return {
            "message": "System optimization tasks started",
            "tasks": {
                "cache_optimization": cache_task.id,
                "temp_file_cleanup": cleanup_task.id,
                "session_cleanup": session_cleanup_task.id
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start optimization: {str(e)}")

@router.post("/emergency-cleanup")
async def emergency_cleanup(
    current_user: User = Depends(get_current_active_user)
):
    """Emergency cleanup for critical disk space issues"""
    
    if not getattr(current_user, 'is_superuser', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        import os
        import shutil
        from datetime import datetime, timedelta
        
        cleanup_results = {
            "temp_files_removed": 0,
            "old_logs_removed": 0,
            "cache_cleared": False,
            "space_freed_mb": 0
        }
        
                                
        disk_before = shutil.disk_usage('/')
        
                                     
        temp_dirs = ['/tmp', '/app/temp', '/app/uploads/temp']
        for temp_dir in temp_dirs:
            if os.path.exists(temp_dir):
                for filename in os.listdir(temp_dir):
                    file_path = os.path.join(temp_dir, filename)
                    try:
                        if os.path.isfile(file_path):
                            os.unlink(file_path)
                            cleanup_results["temp_files_removed"] += 1
                    except Exception:
                        continue
        
                                 
        try:
            cache.delete_pattern("*")
            cleanup_results["cache_cleared"] = True
        except Exception:
            pass
        
                               
        disk_after = shutil.disk_usage('/')
        space_freed = disk_before.free - disk_after.free
        cleanup_results["space_freed_mb"] = round(space_freed / (1024*1024), 2)
        
        return {
            "message": "Emergency cleanup completed",
            "results": cleanup_results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Emergency cleanup failed: {str(e)}")