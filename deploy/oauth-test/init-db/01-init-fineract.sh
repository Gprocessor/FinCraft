#!/bin/sh
set -eu
: "${FINERACT_DB_PASSWORD:?FINERACT_DB_PASSWORD must be set}"
DEFAULT_TENANT_DB_NAME="${DEFAULT_TENANT_DB_NAME:-fineract_fincraft}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  CREATE ROLE fineract_app WITH LOGIN CREATEDB PASSWORD '${FINERACT_DB_PASSWORD}';
  ALTER DATABASE fineract_tenants OWNER TO fineract_app;
  CREATE DATABASE ${DEFAULT_TENANT_DB_NAME} OWNER fineract_app;
  GRANT ALL PRIVILEGES ON DATABASE fineract_tenants TO fineract_app;
  GRANT ALL PRIVILEGES ON DATABASE ${DEFAULT_TENANT_DB_NAME} TO fineract_app;
  CREATE DATABASE keycloak OWNER postgres;
EOSQL

echo "PostgreSQL: fineract_app role + fineract_tenants + ${DEFAULT_TENANT_DB_NAME} + keycloak ready."
