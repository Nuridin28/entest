#!/usr/bin/env bash
# Dumps the entest Postgres database to a timestamped file before running migrations.
# Requires DATABASE_URL in the environment (same one the app uses).
#
# Usage:
#   ./scripts/backup-db.sh                 # writes to ./backups/entest-YYYYMMDD-HHMMSS.dump
#   BACKUP_DIR=/somewhere ./scripts/backup-db.sh

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  # entest builds DATABASE_URL from POSTGRES_* if not set; reconstruct here for the backup
  if [[ -n "${POSTGRES_USER:-}" && -n "${POSTGRES_DB:-}" ]]; then
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
  else
    echo "DATABASE_URL is not set and POSTGRES_* vars are missing." >&2
    exit 1
  fi
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/entest-$STAMP.dump"

echo "Dumping entest DB → $OUT"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
echo "Done. Size: $(du -h "$OUT" | cut -f1)"
echo
echo "To restore later:"
echo "  pg_restore --clean --if-exists -d \"\$DATABASE_URL\" \"$OUT\""
