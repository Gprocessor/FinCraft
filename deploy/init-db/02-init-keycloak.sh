#!/bin/sh
# FinCraft · deploy/init-db/02-init-keycloak.sh
# Only runs on a FRESH Postgres volume (docker-entrypoint-initdb.d convention
# — Postgres skips these once the data directory already exists). For an
# already-running production database, run the equivalent SQL manually once
# instead — see deploy/KEYCLOAK-SETUP.md.
#
# Optional: only creates the Keycloak role/database if KEYCLOAK_DB_PASSWORD
# is actually set, so this is a no-op on deployments that haven't added
# Keycloak yet — existing fresh-deploy behavior is unchanged.
set -eu

if [ -z "${KEYCLOAK_DB_PASSWORD:-}" ]; then
  echo "KEYCLOAK_DB_PASSWORD not set — skipping Keycloak database setup."
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  CREATE ROLE keycloak WITH LOGIN PASSWORD '${KEYCLOAK_DB_PASSWORD}';
  CREATE DATABASE keycloak OWNER keycloak;
  GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
EOSQL

echo "PostgreSQL: keycloak role + keycloak database ready."
