#!/usr/bin/env bash
# FinCraft · deploy/restore.sh
# Restore a single database from a backup.sh dump (plain pg_dump | gzip,
# filename fineract-<db>-<stamp>.sql.gz).
#
# DESTRUCTIVE: drops and recreates the target database, replacing it
# entirely with the dump's contents. fineract-server is stopped for the
# duration so nothing writes to a half-restored database.
#
# Usage:
#   ./restore.sh --list                            List local backups
#   ./restore.sh <path/to/fineract-<db>-<stamp>.sql.gz>
#                                                   Restore from a local file
#   ./restore.sh --from-drive <db-name> [remote]   Pull the newest matching
#                                                   backup from Drive first,
#                                                   then restore it. remote
#                                                   defaults to gdrive:fincraft-backups
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env 2>/dev/null || true; set +a
. ./lib/mail.sh
BACKUP_DIR="$(pwd)/backups"

usage() {
  cat <<USAGE
Usage:
  ./restore.sh --list
  ./restore.sh <path-to-backup.sql.gz>
  ./restore.sh --from-drive <db-name> [remote]      (remote default: gdrive:fincraft-backups)
USAGE
  exit 1
}

[ $# -ge 1 ] || usage

if [ "$1" = "--list" ]; then
  ls -lh "$BACKUP_DIR"/fineract-*.sql.gz 2>/dev/null || echo "(no local backups found in $BACKUP_DIR)"
  exit 0
fi

FILE=""
if [ "$1" = "--from-drive" ]; then
  DB_HINT="${2:?Usage: ./restore.sh --from-drive <db-name> [remote]}"
  REMOTE="${3:-gdrive:fincraft-backups}"
  command -v rclone >/dev/null 2>&1 || { echo "rclone not installed — run ./setup-gdrive-backup.sh first."; exit 1; }
  echo "Looking up the newest backup for '${DB_HINT}' on ${REMOTE}..."
  LATEST=$(rclone lsf "$REMOTE" --include "fineract-${DB_HINT}-*.sql.gz" 2>/dev/null | sort | tail -1)
  [ -n "$LATEST" ] || { echo "No backup found matching 'fineract-${DB_HINT}-*.sql.gz' on ${REMOTE}"; exit 1; }
  mkdir -p "$BACKUP_DIR"
  echo "Downloading ${LATEST}..."
  rclone copy "${REMOTE}/${LATEST}" "$BACKUP_DIR"
  FILE="${BACKUP_DIR}/${LATEST}"
else
  FILE="$1"
fi

[ -f "$FILE" ] || { echo "File not found: $FILE"; exit 1; }

# backup.sh names files fineract-<db>-<YYYYMMDD>-<HHMMSS>.sql.gz — <db> is
# already e.g. "fineract_tenants" or "fineract_<tenant>", so this recovers
# the exact database name to restore into.
BASENAME=$(basename "$FILE")
DB=$(echo "$BASENAME" | sed -E 's/^fineract-(.+)-[0-9]{8}-[0-9]{6}\.sql\.gz$/\1/')
if [ -z "$DB" ] || [ "$DB" = "$BASENAME" ]; then
  echo "Couldn't determine the target database from filename '${BASENAME}'."
  echo "Expected pattern: fineract-<db>-<YYYYMMDD>-<HHMMSS>.sql.gz"
  exit 1
fi

echo
echo "=================================================================="
echo "  Target database:   ${DB}"
echo "  Source file:        ${FILE}"
echo "  This DROPS the current '${DB}' and replaces it with the dump."
echo "  fineract-server will be stopped for the duration."
echo "=================================================================="
read -rp "Type the database name (${DB}) to confirm: " CONFIRM
if [ "$CONFIRM" != "$DB" ]; then
  echo "Confirmation did not match — aborted, nothing was touched."
  exit 1
fi

on_error() {
  send_mail "FinCraft restore FAILED on $(hostname)" \
"Restoring '${DB}' from ${BASENAME} on $(hostname) failed partway through
at $(date). The database may be in an inconsistent state — check
/var/log/fincraft-backup.log and consider restoring again before bringing
fineract-server back up."
}
trap on_error ERR

echo "Stopping fineract-server (database container stays up)..."
sudo docker stop fineract-server >/dev/null

echo "Terminating other connections to '${DB}'..."
sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres \
  psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();" >/dev/null

echo "Dropping and recreating '${DB}'..."
sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres \
  psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB}\";"
sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres \
  psql -U postgres -c "CREATE DATABASE \"${DB}\";"

echo "Loading dump into '${DB}'..."
gunzip -c "$FILE" | sudo docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD}" fineract-postgres \
  psql -U postgres -d "${DB}" >/dev/null

echo "Restarting fineract-server..."
sudo docker start fineract-server >/dev/null

trap - ERR
echo "$(date): restored ${DB} from ${BASENAME}" | sudo tee -a /var/log/fincraft-backup.log >/dev/null
send_mail "FinCraft restore complete on $(hostname)" \
"Restored '${DB}' from ${BASENAME} on $(hostname) at $(date).
fineract-server has been restarted — give it a minute, then run ./check-deployment.sh."

echo "Done. Give fineract-server a minute to come back up, then run: ./check-deployment.sh"
