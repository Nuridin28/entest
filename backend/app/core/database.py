from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import QueuePool
import asyncio
from .config import settings

                                                    
engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,                                     
    max_overflow=40,                             
    pool_pre_ping=True,                             
    pool_recycle=1800,                                     
    pool_timeout=20,                            
    echo=False,                                             
    connect_args={
        "connect_timeout": 10,
        "application_name": "english_test_api"
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

                                                     
async_engine = create_async_engine(
    settings.async_database_url,
    pool_size=20,                                     
    max_overflow=40,                             
    pool_pre_ping=True,                             
    pool_recycle=1800,                                     
    pool_timeout=20,                            
    echo=False,                                             
    connect_args={
        "server_settings": {
            "application_name": "english_test_api_async"
        }
    }
)
AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()

                   
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

                    
async def get_async_db() -> AsyncSession:
    """Async DB session. Простой паттерн без retry — избегает 'generator didn't stop after athrow'."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

                                  
async def get_async_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

def create_db_and_tables():
    try:
        Base.metadata.create_all(engine, checkfirst=True)
        print("Database tables created successfully")
    except Exception as e:
        print(f"Database tables creation error (may be normal if tables exist): {e}")
                                                          