import time
import asyncio
from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable, Dict, Optional
from app.core.cache import cache
import json
import logging

logger = logging.getLogger(__name__)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Advanced rate limiting middleware with multiple strategies"""
    
    def __init__(
        self,
        app,
        default_requests_per_minute: int = 60,
        burst_requests: int = 10,
        burst_window_seconds: int = 10
    ):
        super().__init__(app)
        self.default_rpm = default_requests_per_minute
        self.burst_requests = burst_requests
        self.burst_window = burst_window_seconds
        
                                                                           
        self.endpoint_limits = {
            '/api/v1/auth/login': {'rpm': 200, 'burst': 40},                        
            '/api/v1/auth/register': {'rpm': 100, 'burst': 20},                     
            '/api/v1/tests/': {'rpm': 1000, 'burst': 200},                          
            '/api/v1/preliminary-tests/': {'rpm': 1000, 'burst': 200},              
            '/api/v1/admin/': {'rpm': 2000, 'burst': 400}                           
        }
        
                                                 
        self.user_tier_limits = {
            'free': {'rpm': 150, 'burst': 25},                   
            'premium': {'rpm': 600, 'burst': 100},               
            'admin': {'rpm': 2500, 'burst': 500}                 
        }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = self._get_client_ip(request)
        user_id = self._get_user_id(request)
        endpoint = self._normalize_endpoint(request.url.path)
        
                           
        rate_limit_result = await self._check_rate_limits(client_ip, user_id, endpoint, request)
        
        if not rate_limit_result['allowed']:
                                                 
            response = Response(
                content=json.dumps({
                    'error': 'Rate limit exceeded',
                    'message': rate_limit_result['message'],
                    'retry_after': rate_limit_result['retry_after']
                }),
                status_code=429,
                media_type='application/json'
            )
            
            response.headers['Retry-After'] = str(rate_limit_result['retry_after'])
            response.headers['X-RateLimit-Limit'] = str(rate_limit_result['limit'])
            response.headers['X-RateLimit-Remaining'] = '0'
            response.headers['X-RateLimit-Reset'] = str(rate_limit_result['reset_time'])
            
            return response
        
                            
        await self._record_request(client_ip, user_id, endpoint)
        
                             
        response = await call_next(request)
        
                                            
        remaining_requests = await self._get_remaining_requests(client_ip, user_id, endpoint)
        response.headers['X-RateLimit-Limit'] = str(rate_limit_result['limit'])
        response.headers['X-RateLimit-Remaining'] = str(remaining_requests)
        response.headers['X-RateLimit-Reset'] = str(rate_limit_result['reset_time'])
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
                                           
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        
        real_ip = request.headers.get('X-Real-IP')
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else 'unknown'
    
    def _get_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request (if authenticated)"""
                                                                
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
                                                                  
                                              
            return f"user_{hash(auth_header) % 10000}"
        return None
    
    def _normalize_endpoint(self, path: str) -> str:
        """Normalize endpoint path for rate limiting"""
                                       
        import re
        
                                                         
        path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}', path)
        path = re.sub(r'/\d+', '/{id}', path)
        
        return path
    
    async def _check_rate_limits(self, client_ip: str, user_id: Optional[str], endpoint: str, request: Request) -> Dict:
        """Check if request is within rate limits"""
        current_time = time.time()
        
                                     
        limits = self._get_applicable_limits(endpoint, user_id, request)
        
                                        
        burst_allowed = await self._check_burst_limit(client_ip, user_id, limits['burst'])
        if not burst_allowed:
            return {
                'allowed': False,
                'message': f'Burst limit exceeded. Maximum {limits["burst"]} requests per {self.burst_window} seconds.',
                'retry_after': self.burst_window,
                'limit': limits['burst'],
                'reset_time': int(current_time + self.burst_window)
            }
        
                                      
        rate_allowed = await self._check_rate_limit(client_ip, user_id, endpoint, limits['rpm'])
        if not rate_allowed:
            return {
                'allowed': False,
                'message': f'Rate limit exceeded. Maximum {limits["rpm"]} requests per minute.',
                'retry_after': 60,
                'limit': limits['rpm'],
                'reset_time': int(current_time + 60)
            }
        
        return {
            'allowed': True,
            'limit': limits['rpm'],
            'reset_time': int(current_time + 60)
        }
    
    def _get_applicable_limits(self, endpoint: str, user_id: Optional[str], request: Request) -> Dict:
        """Get applicable rate limits for the request"""
                                   
        limits = {
            'rpm': self.default_rpm,
            'burst': self.burst_requests
        }
        
                                        
        for pattern, endpoint_limits in self.endpoint_limits.items():
            if endpoint.startswith(pattern):
                limits.update(endpoint_limits)
                break
        
                                                           
        if user_id:
            user_tier = self._get_user_tier(user_id, request)
            if user_tier in self.user_tier_limits:
                tier_limits = self.user_tier_limits[user_tier]
                                                           
                limits['rpm'] = max(limits['rpm'], tier_limits['rpm'])
                limits['burst'] = max(limits['burst'], tier_limits['burst'])
        
        return limits
    
    def _get_user_tier(self, user_id: str, request: Request) -> str:
        """Determine user tier (free, premium, admin)"""
                                                                             
                                                                        
        if request.url.path.startswith('/api/v1/admin/'):
            return 'admin'
        
                                                            
                                                   
        return 'free'
    
    async def _check_burst_limit(self, client_ip: str, user_id: Optional[str], burst_limit: int) -> bool:
        """Check burst limit using sliding window"""
        key = f"burst:{client_ip}:{user_id or 'anonymous'}"
        current_time = time.time()
        window_start = current_time - self.burst_window
        
                             
        recent_requests = await cache.aget(key) or []
        
                                                 
        recent_requests = [req_time for req_time in recent_requests if req_time > window_start]
        
                                     
        if len(recent_requests) >= burst_limit:
            return False
        
                                  
        recent_requests.append(current_time)
        
                                
        await cache.aset(key, recent_requests, ttl=self.burst_window + 1)
        
        return True
    
    async def _check_rate_limit(self, client_ip: str, user_id: Optional[str], endpoint: str, rpm_limit: int) -> bool:
        """Check rate limit using token bucket algorithm"""
        key = f"rate:{client_ip}:{user_id or 'anonymous'}:{endpoint}"
        current_time = time.time()
        
                                  
        bucket_data = await cache.aget(key) or {
            'tokens': rpm_limit,
            'last_refill': current_time
        }
        
                                                      
        time_passed = current_time - bucket_data['last_refill']
        tokens_to_add = int(time_passed * (rpm_limit / 60))                     
        
                       
        bucket_data['tokens'] = min(rpm_limit, bucket_data['tokens'] + tokens_to_add)
        bucket_data['last_refill'] = current_time
        
                                           
        if bucket_data['tokens'] < 1:
            return False
        
                       
        bucket_data['tokens'] -= 1
        
                                    
        await cache.aset(key, bucket_data, ttl=120)                 
        
        return True
    
    async def _record_request(self, client_ip: str, user_id: Optional[str], endpoint: str):
        """Record request for analytics"""
        try:
            request_data = {
                'client_ip': client_ip,
                'user_id': user_id,
                'endpoint': endpoint,
                'timestamp': time.time()
            }
            
                                      
            analytics_key = f"request_analytics:{int(time.time() // 3600)}"                  
            analytics_data = await cache.aget(analytics_key) or []
            analytics_data.append(request_data)
            
                                                   
            analytics_data = analytics_data[-1000:]
            await cache.aset(analytics_key, analytics_data, ttl=7200)           
            
        except Exception as e:
            logger.error(f"Failed to record request analytics: {e}")
    
    async def _get_remaining_requests(self, client_ip: str, user_id: Optional[str], endpoint: str) -> int:
        """Get remaining requests for rate limit headers"""
        key = f"rate:{client_ip}:{user_id or 'anonymous'}:{endpoint}"
        bucket_data = await cache.aget(key)
        
        if bucket_data:
            return max(0, int(bucket_data['tokens']))
        
        return self.default_rpm

class AdaptiveRateLimitMiddleware(BaseHTTPMiddleware):
    """Adaptive rate limiting that adjusts based on system load"""
    
    def __init__(self, app, base_rpm: int = 60):
        super().__init__(app)
        self.base_rpm = base_rpm
        self.load_check_interval = 30           
        self.last_load_check = 0
        self.current_multiplier = 1.0
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
                                        
        current_time = time.time()
        if current_time - self.last_load_check > self.load_check_interval:
            await self._update_rate_multiplier()
            self.last_load_check = current_time
        
                                      
        client_ip = self._get_client_ip(request)
        adaptive_limit = int(self.base_rpm * self.current_multiplier)
        
                                    
        rate_key = f"adaptive_rate:{client_ip}"
        current_requests = await cache.aget(rate_key) or 0
        
        if current_requests >= adaptive_limit:
            return Response(
                content=json.dumps({
                    'error': 'Rate limit exceeded',
                    'message': f'Adaptive rate limit: {adaptive_limit} requests per minute',
                    'system_load_factor': round(self.current_multiplier, 2)
                }),
                status_code=429,
                media_type='application/json'
            )
        
                                 
        await cache.aset(rate_key, current_requests + 1, ttl=60)
        
                         
        response = await call_next(request)
        
                                         
        response.headers['X-Adaptive-Rate-Limit'] = str(adaptive_limit)
        response.headers['X-Load-Factor'] = str(round(self.current_multiplier, 2))
        
        return response
    
    async def _update_rate_multiplier(self):
        """Update rate limit multiplier based on system load"""
        try:
            import psutil
            
                                
            cpu_percent = psutil.cpu_percent(interval=1)
            memory_percent = psutil.virtual_memory().percent
            
                                   
            load_factor = (cpu_percent + memory_percent) / 200              
            
                                                                                      
            if load_factor > 0.8:
                self.current_multiplier = 0.3               
            elif load_factor > 0.6:
                self.current_multiplier = 0.5          
            elif load_factor > 0.4:
                self.current_multiplier = 0.7            
            else:
                self.current_multiplier = 1.0          
            
                                
            load_metrics = {
                'cpu_percent': cpu_percent,
                'memory_percent': memory_percent,
                'load_factor': load_factor,
                'rate_multiplier': self.current_multiplier,
                'timestamp': time.time()
            }
            
            await cache.aset('system_load_metrics', load_metrics, ttl=300)
            
        except Exception as e:
            logger.error(f"Failed to update adaptive rate multiplier: {e}")
            self.current_multiplier = 1.0                      
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.client.host if request.client else 'unknown'