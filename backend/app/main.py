from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import asyncio
import logging

from app.core.config import settings
from app.core.database import create_db_and_tables
from app.core.cache import cache
from app.api.v1.api import api_router
from app.utils.openai_service import openai_service

                   
from app.middleware.performance import (
    PerformanceMiddleware, 
    ResourceMonitoringMiddleware, 
    CacheOptimizationMiddleware
)
from app.middleware.rate_limiting import RateLimitMiddleware, AdaptiveRateLimitMiddleware
from app.middleware.timezone import TimezoneMiddleware

                   
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="English Test API",
    description="API for English language testing platform with advanced optimizations",
    version="2.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None
)

                                                                       
@app.middleware("http")
async def upload_middleware(request: Request, call_next):
    """Handle large file uploads and chunked uploads with better error handling"""
    
                               
    if request.url.path.startswith("/api/v1/proctoring/"):
        import asyncio
        try:
            response = await asyncio.wait_for(call_next(request), timeout=900)              
            return response
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=408,
                content={"error": "Request timeout", "message": "File upload took too long"}
            )
    
                                                        
    elif "/upload-screen/" in request.url.path:
        try:
            response = await call_next(request)
            return response
        except RuntimeError as e:
            if "generator didn't stop after athrow" in str(e):
                logger.error(f"Chunked upload generator error: {e}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": "Upload processing error",
                        "message": "There was an issue processing your chunked upload. Please try again.",
                        "detail": "Internal processing error"
                    }
                )
            raise
        except Exception as e:
            logger.error(f"Chunked upload error: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Upload error",
                    "message": "Failed to process upload request",
                    "detail": str(e)
                }
            )
    else:
        return await call_next(request)

                            
app.add_middleware(GZipMiddleware, minimum_size=1000)

                         
app.add_middleware(TimezoneMiddleware)

                                       
app.add_middleware(
    PerformanceMiddleware,
    slow_request_threshold=settings.slow_request_threshold
)

                                    
app.add_middleware(
    ResourceMonitoringMiddleware,
    cpu_threshold=80.0,
    memory_threshold=85.0
)

                                                           
app.add_middleware(
    CacheOptimizationMiddleware,
    cache_duration=settings.cache_default_ttl
)

                                                                        
app.add_middleware(
    RateLimitMiddleware,
    default_requests_per_minute=settings.default_rate_limit * 2,                                    
    burst_requests=settings.burst_rate_limit * 3                          
)

                                                                 
                     
                                  
                                          
   

                
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

                    
app.mount("/app/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

                          
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {exc}", exc_info=True)
    
                                                             
    if isinstance(exc, RuntimeError) and "generator didn't stop after athrow" in str(exc):
        logger.error("Generator athrow error detected - likely async context manager issue")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Upload processing error",
                "message": "There was an issue processing your upload. Please try again.",
                "detail": "Internal processing error"
            }
        )
    
                                
    error_data = {
        'error': str(exc),
        'path': request.url.path,
        'method': request.method,
        'timestamp': asyncio.get_event_loop().time()
    }
    
    try:
        await cache.aset(f"error:{id(exc)}", error_data, ttl=3600)
    except:
        pass                              
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred. Please try again later.",
            "request_id": getattr(request.state, 'request_id', 'unknown')
        }
    )

@app.on_event("startup")
async def startup_event():
    """Application startup tasks"""
    logger.info("Starting English Test API...")
    
                                  
    import os
    os.makedirs("/app/audio", exist_ok=True)
    os.makedirs("/app/uploads/speaking", exist_ok=True)
    os.makedirs("/app/uploads/proctoring", exist_ok=True)
    os.makedirs("/app/uploads/screen_recordings", exist_ok=True)
    logger.info("Required directories created")
    
                         
    create_db_and_tables()
    logger.info("Database initialized")
    
                           
    try:
        cache_health = await cache.ahealth_check()
        if cache_health:
            logger.info("Cache connection established")
        else:
            logger.warning("Cache connection failed - running without cache")
    except Exception as e:
        logger.error(f"Cache initialization error: {e}")
    
                               
    try:
                                                   
        logger.info("OpenAI service initialized")
    except Exception as e:
        logger.error(f"OpenAI service initialization error: {e}")
    
                            
    try:
        from app.tasks.maintenance import health_check
                                       
        asyncio.create_task(schedule_periodic_tasks())
        logger.info("Background tasks scheduled")
    except Exception as e:
        logger.error(f"Background tasks initialization error: {e}")
    
    logger.info("English Test API startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info("Shutting down English Test API...")
    
                             
    try:
        if cache._async_client:
            await cache._async_client.close()
        if cache._sync_client:
            cache._sync_client.close()
        logger.info("Cache connections closed")
    except Exception as e:
        logger.error(f"Error closing cache connections: {e}")
    
    logger.info("English Test API shutdown completed")

async def schedule_periodic_tasks():
    """Schedule periodic background tasks"""
    try:
        from app.tasks.maintenance import health_check, cleanup_temp_files
        
                                                
        while True:
            await asyncio.sleep(300)             
            try:
                health_check.delay()
            except Exception as e:
                logger.error(f"Failed to schedule health check: {e}")
    except Exception as e:
        logger.error(f"Error in periodic task scheduler: {e}")

                    
app.include_router(api_router, prefix="/api/v1")

                       
@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint"""
    health_status = {
        "status": "healthy",
        "timestamp": asyncio.get_event_loop().time(),
        "version": "2.0.0",
        "services": {}
    }
    
                 
    try:
        cache_health = await cache.ahealth_check()
        health_status["services"]["cache"] = "healthy" if cache_health else "unhealthy"
    except Exception as e:
        health_status["services"]["cache"] = f"error: {str(e)}"
    
                    
    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            result = await db.execute(text("SELECT 1"))
            await db.commit()
        health_status["services"]["database"] = "healthy"
    except Exception as e:
        health_status["services"]["database"] = f"error: {str(e)}"
        health_status["status"] = "unhealthy"
    
                            
    try:
        import psutil
        health_status["system"] = {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": psutil.disk_usage('/').percent
        }
    except Exception as e:
        health_status["system"] = f"error: {str(e)}"
    
    return health_status

                              
@app.get("/metrics")
async def get_metrics():
    """Get performance metrics"""
    try:
                            
        current_hour = int(asyncio.get_event_loop().time() // 3600)
        metrics_key = f"metrics_hour:{current_hour}"
        metrics = await cache.aget(metrics_key) or {}
        
                           
        system_health = await cache.aget('system_health') or {}
        
                           
        slow_requests = await cache.aget('slow_requests') or []
        
        return {
            "performance_metrics": metrics,
            "system_health": system_health,
            "slow_requests_count": len(slow_requests),
            "timestamp": asyncio.get_event_loop().time()
        }
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        return {"error": "Failed to retrieve metrics"}

@app.get("/")
async def read_root():
    return {
        "message": "Welcome to the Optimized English Test API!",
        "version": "2.0.0",
        "features": [
            "Advanced caching with Redis",
            "Background task processing with Celery",
            "Performance monitoring",
            "Rate limiting",
            "Resource monitoring",
            "Automatic scaling"
        ]
    } 