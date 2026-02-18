import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
                     
    port: int = 8000
    environment: str = "development"
    fastapi_env: str = "development"
    
                       
    postgres_user: str = os.getenv("POSTGRES_USER", "user")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "password")
    postgres_db: str = os.getenv("POSTGRES_DB", "englishtest_db")
    postgres_host: str = os.getenv("POSTGRES_HOST", "db")
    postgres_port: int = 5432
    
    @property
    def database_url(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    
                                                               
    azure_openai_endpoint: Optional[str] = ""
    azure_openai_api_key: Optional[str] = ""
    azure_openai_deployment: str = "gpt-4o-mini"
    azure_openai_model_name: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2024-03-01-preview"

    azure_openai_endpoint_audio: Optional[str] = ""
    azure_openai_api_key_audio: Optional[str] = "" 
    azure_openai_tts_deployment: str = "gpt-4o-mini-tts"
    azure_openai_transcribe_deployment: str = "gpt-4o-transcribe"
    azure_openai_audio_api_version: str = "2025-03-01-preview" 
    azure_openai_tts_api_version: str = "2025-03-01-preview"
    
                        
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 10080                       
    
                   
    cors_origins_str: str = "http://localhost:3000,http://localhost:5173,http://localhost:80,http://frontend:80,https://entest.almv.kz"
    
    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_str.split(",")]
    
                    
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    redis_max_connections: int = 20
    
                                           
    cache_default_ttl: int = 600                                
    cache_max_size: int = 5000                  
    
                          
    slow_request_threshold: float = 1.0           
    max_request_size: int = 10 * 1024 * 1024        
    max_proctoring_file_size: int = 2 * 1024 * 1024 * 1024                             
    
                                          
    default_rate_limit: int = 300                                     
    burst_rate_limit: int = 50                                   
    
                     
    celery_broker_url: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    celery_result_backend: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    
                       
    default_timezone: str = "Asia/Almaty"
    timezone_display_format: str = "%d.%m.%Y, %H:%M:%S"
    
    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings() 