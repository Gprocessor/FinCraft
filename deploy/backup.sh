#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
BACKUP_DIR="$(pwd)/backups"; STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p "$BACKUP_DIR"
DBS=$(sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres \
  psql -U postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'fineract\_%' ESCAPE '\'")
for DB in fineract_tenants $DBS; do
  OUT="${BACKUP_DIR}/fineract-${DB}-${STAMP}.sql.gz"
  sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres pg_dump -U postgres "$DB" | gzip > "$OUT"
  if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then CMD="${BACKUP_UPLOAD_CMD//\{\}/$OUT}"; eval "$CMD" || true; fi
done
find "$BACKUP_DIR" -name 'fineract-*.sql.gz' -mtime +7 -delete
echo "$(date): backup complete (${STAMP})" | sudo tee -a /var/log/fincraft-backup.log >/dev/null
