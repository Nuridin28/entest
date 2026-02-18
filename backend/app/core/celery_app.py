from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown
from app.core.config import settings
import warnings
import logging
import asyncio

                                    
warnings.filterwarnings("ignore", message=".*register_connect_callback.*")
logging.getLogger('celery.backends.redis').setLevel(logging.ERROR)

                                                   

                                                                 
_WORKER_LOOP = None

@worker_process_init.connect
def init_async_loop(**kwargs):
    """
    Called once when each worker process starts.
    Creates and stores a persistent event loop for this process.
    """
    global _WORKER_LOOP
    _WORKER_LOOP = asyncio.new_event_loop()
    asyncio.set_event_loop(_WORKER_LOOP)
    logging.info(f"Initialized asyncio event loop for worker process {kwargs.get('sender', 'unknown')}")

@worker_process_shutdown.connect
def shutdown_async_loop(**kwargs):
    """
    Called when worker process shuts down.
    Properly closes the event loop.
    """
    global _WORKER_LOOP
    if _WORKER_LOOP:
        _WORKER_LOOP.close()
        asyncio.set_event_loop(None)
        logging.info("Closed asyncio event loop for worker process")

def get_worker_loop():
    """Get the persistent event loop for this worker process."""
    return _WORKER_LOOP

                                   

                        
celery_app = Celery(
    "english_test_worker",
    broker=getattr(settings, 'redis_url', 'redis://localhost:6379/0'),
    backend=getattr(settings, 'redis_url', 'redis://localhost:6379/0'),
    include=[
        'app.tasks.test_generation',
        'app.tasks.audio_processing', 
        'app.tasks.evaluation',
        'app.tasks.notifications',
        'app.tasks.file_processing'
    ]
)

                      
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
                  
    task_routes={
        'app.tasks.test_generation.*': {'queue': 'test_generation'},
        'app.tasks.audio_processing.*': {'queue': 'audio_processing'},
        'app.tasks.evaluation.*': {'queue': 'evaluation'},
        'app.tasks.notifications.*': {'queue': 'notifications'},
        'app.tasks.file_processing.*': {'queue': 'file_processing'},
    },
    
                                                 
    worker_prefetch_multiplier=1,                                                         
    task_acks_late=True,
    worker_max_tasks_per_child=1000,                                         
    
                      
    task_soft_time_limit=300,             
    task_time_limit=600,                   
    
                             
    result_expires=3600,               
    result_backend_transport_options={
        'visibility_timeout': 3600,
        'retry_on_timeout': True,
        'health_check_interval': 30,
    },
    
                                                        
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        'visibility_timeout': 3600,
        'fanout_prefix': True,
        'fanout_patterns': True,
    },
    
                         
    task_default_retry_delay=60,
    task_max_retries=3,
    
                                      
    beat_schedule={
        'cleanup-expired-sessions': {
            'task': 'app.tasks.maintenance.cleanup_expired_sessions',
            'schedule': 3600.0,              
        },
        'cleanup-temp-files': {
            'task': 'app.tasks.maintenance.cleanup_temp_files',
            'schedule': 1800.0,                    
        },
        'health-check': {
            'task': 'app.tasks.maintenance.health_check',
            'schedule': 600.0,                    
        },
        'cleanup-old-uploads': {
            'task': 'app.tasks.file_processing.cleanup_old_uploads',
            'schedule': 10800.0,                                               
        },
    },
)

                
celery_app.autodiscover_tasks()

if __name__ == '__main__':
    celery_app.start()