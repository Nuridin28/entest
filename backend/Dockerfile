FROM python:3.11-slim AS base

# Set environment variables to prevent caching of bytecode
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        python3-dev \
        linux-libc-dev \
        libc6-dev \
        ffmpeg \
        curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/app ./app
COPY backend/admin_tools.py /app/admin_tools.py

# Copy Alembic configuration and migrations
COPY backend/alembic.ini /app/alembic.ini
COPY backend/alembic /app/alembic

# Copy startup scripts
COPY backend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create directory for generated PDF certificates, uploads, and audio
RUN mkdir -p /app/certificates
RUN mkdir -p /app/uploads
RUN mkdir -p /app/uploads/chunks
RUN mkdir -p /app/uploads/screen_recordings
RUN mkdir -p /app/audio

# Expose port and set command
EXPOSE 8000

CMD ["/app/start.sh"] 