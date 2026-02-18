#!/usr/bin/env python3
"""
Celery worker startup script for English Test API
"""

import os
import sys
from celery import Celery

                                      
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.celery_app import celery_app

if __name__ == '__main__':
                             
    celery_app.start()