                        

import asyncio
from celery import Task


class AsyncTask(Task):
    """
    Custom class for running asyncio tasks in Celery with prefork pool.
    Uses a persistent event loop that lives for the entire worker process lifetime.
    """
    def __call__(self, *args, **kwargs):
        """
        Execute the task using the persistent event loop for this worker process.
        This prevents event loop conflicts with SQLAlchemy connection pooling.
        """
                                               
        from app.core.celery_app import get_worker_loop
        
        loop = get_worker_loop()
        if loop is None:
                                                                          
            raise RuntimeError("Asyncio event loop not initialized for worker process")
        
                                                        
        return loop.run_until_complete(self.run(*args, **kwargs))