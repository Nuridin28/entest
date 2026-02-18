import time
import logging
import asyncio
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
from app.core.cache import cache
import json
import psutil
import os

                          
perf_logger = logging.getLogger("performance")
perf_logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
perf_logger.addHandler(handler)

class PerformanceMiddleware(BaseHTTPMiddleware):
    """Enhanced middleware for monitoring and optimizing performance"""
    
    def __init__(self, app, slow_request_threshold: float = 1.0):
        super().__init__(app)
        self.slow_request_threshold = slow_request_threshold
        self.request_count = 0
        self.total_response_time = 0.0
        
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
                                           
        process = psutil.Process()
        cpu_before = process.cpu_percent()
        memory_before = process.memory_info().rss
        
                       
        self.request_count += 1
        request_id = f"req_{self.request_count}_{int(start_time)}"
        
                                               
        request.state.request_id = request_id
        
        try:
                             
            response = await call_next(request)
            
                                             
            if not response:
                perf_logger.error("No response returned from call_next in PerformanceMiddleware")
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=500,
                    content={"error": "Internal server error", "message": "No response generated"}
                )
            
                               
            process_time = time.time() - start_time
            self.total_response_time += process_time
            
                                              
            cpu_after = process.cpu_percent()
            memory_after = process.memory_info().rss
            memory_delta = memory_after - memory_before
            
                                        
            metrics = {
                'request_id': request_id,
                'method': request.method,
                'path': request.url.path,
                'status_code': response.status_code,
                'response_time': round(process_time, 3),
                'cpu_usage': round((cpu_before + cpu_after) / 2, 2),
                'memory_delta_mb': round(memory_delta / (1024 * 1024), 2),
                'timestamp': start_time,
                'user_agent': request.headers.get('user-agent', 'unknown')[:100]
            }
            
                                     
            response.headers["X-Process-Time"] = str(process_time)
            response.headers["X-Request-ID"] = request_id
            
                               
            if process_time > self.slow_request_threshold:
                perf_logger.warning(
                    f"Slow request: {request.method} {request.url.path} "
                    f"took {process_time:.3f}s (threshold: {self.slow_request_threshold}s)"
                )
                
                                                         
                await self._store_slow_request(metrics, request)
            
                              
            perf_logger.info(
                f"{request.method} {request.url.path} - "
                f"{response.status_code} - {process_time:.3f}s - "
                f"Memory: {memory_delta/1024/1024:.1f}MB"
            )
            
                                         
            await self._store_metrics(metrics)
            
                                          
            avg_response_time = self.total_response_time / self.request_count
            response.headers["X-Avg-Response-Time"] = str(round(avg_response_time, 3))
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            
                                                
            perf_logger.error(
                f"Request error: {request.method} {request.url.path} - "
                f"Error: {str(e)} - Time: {process_time:.3f}s"
            )
            
                                 
            error_metrics = {
                'request_id': request_id,
                'method': request.method,
                'path': request.url.path,
                'error': str(e),
                'response_time': round(process_time, 3),
                'timestamp': start_time
            }
            
            await self._store_error_metrics(error_metrics)
            
                                                                     
            if "No response returned" in str(e):
                perf_logger.error("Caught 'No response returned' error, returning 500 response")
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=500,
                    content={"error": "Internal server error", "message": "Request processing failed"}
                )
            
            raise e
    
    async def _store_metrics(self, metrics: dict):
        """Store performance metrics in cache for analytics"""
        try:
                                              
            cache_key = f"request_metrics:{metrics['request_id']}"
            await cache.aset(cache_key, metrics, ttl=3600)          
            
                                       
            await self._update_aggregated_metrics(metrics)
            
        except Exception as e:
            perf_logger.error(f"Failed to store metrics: {e}")
    
    async def _update_aggregated_metrics(self, metrics: dict):
        """Update aggregated performance metrics"""
        try:
                                                             
            hour_key = f"metrics_hour:{int(time.time() // 3600)}"
            
                                          
            aggregated = await cache.aget(hour_key) or {
                'request_count': 0,
                'total_response_time': 0.0,
                'status_codes': {},
                'paths': {},
                'slow_requests': 0,
                'errors': 0,
                'avg_memory_delta': 0.0,
                'start_time': time.time()
            }
            
                                       
            aggregated['request_count'] += 1
            aggregated['total_response_time'] += metrics['response_time']
            
                                
            status_code = str(metrics['status_code'])
            aggregated['status_codes'][status_code] = aggregated['status_codes'].get(status_code, 0) + 1
            
                         
            path = metrics['path']
            if path not in aggregated['paths']:
                aggregated['paths'][path] = {'count': 0, 'total_time': 0.0}
            aggregated['paths'][path]['count'] += 1
            aggregated['paths'][path]['total_time'] += metrics['response_time']
            
                                 
            if metrics['response_time'] > self.slow_request_threshold:
                aggregated['slow_requests'] += 1
            
                                
            memory_delta = metrics.get('memory_delta_mb', 0)
            current_avg = aggregated['avg_memory_delta']
            count = aggregated['request_count']
            aggregated['avg_memory_delta'] = (current_avg * (count - 1) + memory_delta) / count
            
                                              
            await cache.aset(hour_key, aggregated, ttl=7200)           
            
        except Exception as e:
            perf_logger.error(f"Failed to update aggregated metrics: {e}")
    
    async def _store_slow_request(self, metrics: dict, request: Request):
        """Store detailed information about slow requests"""
        try:
            slow_request_data = {
                **metrics,
                'query_params': dict(request.query_params),
                'headers': dict(request.headers),
                'client_ip': request.client.host if request.client else 'unknown'
            }
            
                                         
            slow_requests_key = "slow_requests"
            slow_requests = await cache.aget(slow_requests_key) or []
            slow_requests.append(slow_request_data)
            
                                              
            slow_requests = slow_requests[-100:]
            await cache.aset(slow_requests_key, slow_requests, ttl=86400)            
            
        except Exception as e:
            perf_logger.error(f"Failed to store slow request data: {e}")
    
    async def _store_error_metrics(self, error_metrics: dict):
        """Store error metrics for analysis"""
        try:
                                  
            errors_key = "request_errors"
            errors = await cache.aget(errors_key) or []
            errors.append(error_metrics)
            
                                       
            errors = errors[-200:]
            await cache.aset(errors_key, errors, ttl=86400)            
            
        except Exception as e:
            perf_logger.error(f"Failed to store error metrics: {e}")

class ResourceMonitoringMiddleware(BaseHTTPMiddleware):
    """Middleware for monitoring system resources and applying throttling"""
    
    def __init__(self, app, cpu_threshold: float = 80.0, memory_threshold: float = 85.0):
        super().__init__(app)
        self.cpu_threshold = cpu_threshold
        self.memory_threshold = memory_threshold
        self.throttle_active = False
        
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
                                
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory_percent = psutil.virtual_memory().percent
        
                                                
        if cpu_percent > self.cpu_threshold or memory_percent > self.memory_threshold:
            if not self.throttle_active:
                perf_logger.warning(
                    f"Resource throttling activated - CPU: {cpu_percent}%, Memory: {memory_percent}%"
                )
                self.throttle_active = True
            
                                                 
            if not self._is_critical_request(request):
                await asyncio.sleep(0.1)               
        else:
            if self.throttle_active:
                perf_logger.info("Resource throttling deactivated")
                self.throttle_active = False
        
                                               
        response = await call_next(request)
        response.headers["X-CPU-Usage"] = str(round(cpu_percent, 1))
        response.headers["X-Memory-Usage"] = str(round(memory_percent, 1))
        
        if self.throttle_active:
            response.headers["X-Throttled"] = "true"
        
        return response
    
    def _is_critical_request(self, request: Request) -> bool:
        """Determine if a request is critical and should not be throttled"""
        critical_paths = [
            '/api/v1/auth/',
            '/api/v1/health',
            '/api/v1/admin/'
        ]
        
        return any(request.url.path.startswith(path) for path in critical_paths)

class CacheOptimizationMiddleware(BaseHTTPMiddleware):
    """Middleware for intelligent caching and cache optimization"""
    
    def __init__(self, app, cache_duration: int = 300):
        super().__init__(app)
        self.cache_duration = cache_duration
        self.cacheable_paths = [
            '/api/v1/health',
            '/api/v1/preliminary-tests/questions',
            '/api/v1/tests/questions',
        ]
        self.cache_hit_count = 0
        self.cache_miss_count = 0
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
                                                        
            if request.method != "GET" or not self._should_cache(request):
                return await call_next(request)
            
            cache_key = self._generate_cache_key(request)
            
                                   
            try:
                cached_response = await cache.aget(cache_key)
                if cached_response and isinstance(cached_response, dict):
                    self.cache_hit_count += 1
                    
                    response = Response(
                        content=cached_response.get("content", ""),
                        status_code=cached_response.get("status_code", 200),
                        headers=cached_response.get("headers", {}),
                        media_type=cached_response.get("media_type", "application/json")
                    )
                    
                    response.headers["X-Cache"] = "HIT"
                    if self.cache_hit_count + self.cache_miss_count > 0:
                        response.headers["X-Cache-Hit-Rate"] = str(
                            round(self.cache_hit_count / (self.cache_hit_count + self.cache_miss_count) * 100, 1)
                        )
                    
                    return response
            except Exception as e:
                perf_logger.error(f"Cache retrieval failed: {e}")
            
                                          
            self.cache_miss_count += 1
            response = await call_next(request)
            
                                             
            if not response:
                perf_logger.error("No response returned from call_next")
                return Response(
                    content='{"error": "Internal server error"}',
                    status_code=500,
                    media_type="application/json"
                )
            
                                                                                 
            if response.status_code == 200:
                try:
                                                                                
                    content_type = response.headers.get('content-type', '')
                    if 'application/json' in content_type:
                                                  
                        response_body = getattr(response, 'body', None)
                        if response_body:
                            if isinstance(response_body, bytes):
                                content = response_body.decode('utf-8', errors='ignore')
                            else:
                                content = str(response_body)
                            
                            cache_data = {
                                "content": content,
                                "status_code": response.status_code,
                                "headers": dict(response.headers),
                                "media_type": response.media_type
                            }
                            
                                                             
                            asyncio.create_task(cache.aset(cache_key, cache_data, self.cache_duration))
                except Exception as e:
                    perf_logger.error(f"Failed to cache response: {e}")
            
                               
            response.headers["X-Cache"] = "MISS"
            if self.cache_hit_count + self.cache_miss_count > 0:
                response.headers["X-Cache-Hit-Rate"] = str(
                    round(self.cache_hit_count / (self.cache_hit_count + self.cache_miss_count) * 100, 1)
                )
            
            return response
        
        except Exception as e:
            perf_logger.error(f"Cache middleware error: {e}")
                                                             
            try:
                return await call_next(request)
            except Exception as inner_e:
                perf_logger.error(f"Fallback call_next also failed: {inner_e}")
                return Response(
                    content='{"error": "Internal server error"}',
                    status_code=500,
                    media_type="application/json"
                )
    
    def _should_cache(self, request: Request) -> bool:
        """Determine if request should be cached"""
        path = request.url.path
        return any(path.startswith(cacheable_path) for cacheable_path in self.cacheable_paths)
    
    def _generate_cache_key(self, request: Request) -> str:
        """Generate cache key for request"""
        key_data = {
            "path": request.url.path,
            "query": str(request.url.query),
            "user": request.headers.get("authorization", "anonymous")
        }
        key_string = json.dumps(key_data, sort_keys=True)
        import hashlib
        return f"api_cache:{hashlib.md5(key_string.encode()).hexdigest()}"