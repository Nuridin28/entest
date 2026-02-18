#!/bin/sh

# Apply database migrations
echo "Applying database migrations..."
alembic upgrade head

# Start the application
echo "Starting application..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload