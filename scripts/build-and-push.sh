#!/bin/bash
# Локальная сборка и пуш образов в registry
# Использование: ./scripts/build-and-push.sh [registry] [tag]
# Пример: ./scripts/build-and-push.sh ghcr.io/username
# Или:   ./scripts/build-and-push.sh myuser  (для Docker Hub → docker.io/myuser/...)

set -e

REGISTRY="${1:?Укажите registry, например: ghcr.io/username или dockerhub-username}"
IMAGE_NAME="englishtest-backend"
TAG="${2:-latest}"

# Docker Hub: если нет слэша, добавляем префикс
if [[ "$REGISTRY" != *"/"* ]]; then
  FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
  FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
fi

echo "=== Building ${FULL_IMAGE} ==="
docker build -t "${FULL_IMAGE}" -f backend/Dockerfile .

echo "=== Pushing ${FULL_IMAGE} ==="
docker push "${FULL_IMAGE}"

echo ""
echo "=== Готово. На сервере выполните: ==="
echo "  export BACKEND_IMAGE=${FULL_IMAGE}"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.registry.yml pull"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.registry.yml up -d"
