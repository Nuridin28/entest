import redis
import redis.asyncio as aioredis
import json
import pickle
from typing import Any, Optional, Union
from functools import wraps
import asyncio
from app.core.config import settings

class CacheManager:
    """Unified cache manager supporting both sync and async operations"""
    
    def __init__(self):
                                   
        self.redis_url = getattr(settings, 'redis_url', 'redis://localhost:6379/0')
        self.default_ttl = getattr(settings, 'cache_default_ttl', 300)             
        
                           
        self._sync_client = None
                              
        self._async_client = None
        
    @property
    def sync_client(self) -> redis.Redis:
        """Get synchronous Redis client"""
        if self._sync_client is None:
            self._sync_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
        return self._sync_client
    
    async def get_async_client(self) -> aioredis.Redis:
        """Get asynchronous Redis client"""
        if self._async_client is None:
            try:
                self._async_client = aioredis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30
                )
                                     
                await self._async_client.ping()
            except Exception as e:
                print(f"Failed to create async Redis client: {e}")
                self._async_client = None
                raise
        return self._async_client
    
    def _serialize_value(self, value: Any) -> str:
        """Serialize value for Redis storage"""
        try:
            if isinstance(value, (str, int, float, bool)):
                return json.dumps(value)
            return json.dumps(value, default=str)
        except (TypeError, ValueError) as e:
            print(f"Cache serialization error: {e}")
                                               
            return json.dumps(str(value))
    
    def _deserialize_value(self, value: str) -> Any:
        """Deserialize value from Redis"""
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError) as e:
            print(f"Cache deserialization error: {e}, value: {value}")
            return value
    
                         
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache (sync)"""
        try:
            value = self.sync_client.get(key)
            return self._deserialize_value(value) if value else None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache (sync)"""
        try:
            ttl = ttl or self.default_ttl
            serialized = self._serialize_value(value)
            return self.sync_client.setex(key, ttl, serialized)
        except Exception as e:
            print(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache (sync)"""
        try:
            return bool(self.sync_client.delete(key))
        except Exception as e:
            print(f"Cache delete error: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache (sync)"""
        try:
            return bool(self.sync_client.exists(key))
        except Exception as e:
            print(f"Cache exists error: {e}")
            return False
    
                          
    async def aget(self, key: str) -> Optional[Any]:
        """Get value from cache (async)"""
        try:
            client = await self.get_async_client()
            value = await client.get(key)
            return self._deserialize_value(value) if value else None
        except Exception as e:
            print(f"Async cache get error for key '{key}': {e}")
                                               
            if "connection" in str(e).lower() or "timeout" in str(e).lower():
                self._async_client = None
            return None
    
    async def aset(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache (async)"""
        try:
            client = await self.get_async_client()
            ttl = ttl or self.default_ttl
            serialized = self._serialize_value(value)
            result = await client.setex(key, ttl, serialized)
            return bool(result)
        except Exception as e:
            print(f"Async cache set error for key '{key}': {e}")
                                               
            if "connection" in str(e).lower() or "timeout" in str(e).lower():
                self._async_client = None
            return False
    
    async def adelete(self, key: str) -> bool:
        """Delete key from cache (async)"""
        try:
            client = await self.get_async_client()
            result = await client.delete(key)
            return bool(result)
        except Exception as e:
            print(f"Async cache delete error for key '{key}': {e}")
                                               
            if "connection" in str(e).lower() or "timeout" in str(e).lower():
                self._async_client = None
            return False
    
    async def aexists(self, key: str) -> bool:
        """Check if key exists in cache (async)"""
        try:
            client = await self.get_async_client()
            return bool(await client.exists(key))
        except Exception as e:
            print(f"Async cache exists error: {e}")
            return False
    
                        
    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern (sync)"""
        try:
            keys = self.sync_client.keys(pattern)
            if keys:
                return self.sync_client.delete(*keys)
            return 0
        except Exception as e:
            print(f"Cache delete pattern error: {e}")
            return 0
    
    async def adelete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern (async)"""
        try:
            client = await self.get_async_client()
            keys = await client.keys(pattern)
            if keys:
                return await client.delete(*keys)
            return 0
        except Exception as e:
            print(f"Async cache delete pattern error: {e}")
            return 0
    
                  
    def health_check(self) -> bool:
        """Check Redis connection health"""
        try:
            return self.sync_client.ping()
        except Exception:
            return False
    
    async def ahealth_check(self) -> bool:
        """Check Redis connection health (async)"""
        try:
            client = await self.get_async_client()
            result = await client.ping()
            return result
        except Exception as e:
            print(f"Cache health check failed: {e}")
            return False

                       
cache = CacheManager()

                                        
def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator for caching function results"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
                                
            key_parts = [key_prefix or func.__name__]
            key_parts.extend(str(arg) for arg in args)
            key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
            cache_key = ":".join(key_parts)
            
                                   
            result = cache.get(cache_key)
            if result is not None:
                return result
            
                                               
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator

                             
def acached(ttl: int = 300, key_prefix: str = ""):
    """Async decorator for caching function results"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
                                
            key_parts = [key_prefix or func.__name__]
            key_parts.extend(str(arg) for arg in args)
            key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
            cache_key = ":".join(key_parts)
            
                                   
            result = await cache.aget(cache_key)
            if result is not None:
                return result
            
                                               
            result = await func(*args, **kwargs)
            await cache.aset(cache_key, result, ttl)
            return result
        return wrapper
    return decorator