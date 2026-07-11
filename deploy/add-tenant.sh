#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a

IDENT="${1:-}"; DOMAIN="${2:-}"; DISPLAY="${3:-$IDENT}"
if [ -z "$IDENT" ] || [ -z "$DOMAIN" ]; then
  echo "Usage: ./add-tenant.sh <tenant_identifier> <domain> [\"Display Name\"]"
  echo "  e.g. ./add-tenant.sh darkvera darkvera.duckdns.org \"DarkVera Ltd\""
  exit 1
fi
SCHEMA="fineract_${IDENT}"

PSQL() { sudo docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i fineract-postgres psql -v ON_ERROR_STOP=1 -U postgres "$@"; }

echo "[1/5] Creating tenant database '${SCHEMA}'..."
PSQL -d postgres -c "CREATE DATABASE ${SCHEMA} OWNER fineract_app;" || echo "  (may already exist)"

echo "[2/5] Registering tenant '${IDENT}' in registry..."
PSQL -d fineract_tenants <<SQL
DO \$\$
DECLARE conn_cols text; ten_cols text; new_conn_id bigint;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO conn_cols
    FROM information_schema.columns WHERE table_name='tenant_server_connections' AND column_name<>'id';
  EXECUTE format('INSERT INTO tenant_server_connections (%1\$s) SELECT %1\$s FROM tenant_server_connections ORDER BY id LIMIT 1 RETURNING id', conn_cols) INTO new_conn_id;
  UPDATE tenant_server_connections SET schema_name='${SCHEMA}' WHERE id=new_conn_id;
  SELECT string_agg(quote_ident(column_name), ', ') INTO ten_cols
    FROM information_schema.columns WHERE table_name='tenants' AND column_name<>'id';
  EXECUTE format('INSERT INTO tenants (%1\$s) SELECT %1\$s FROM tenants ORDER BY id LIMIT 1', ten_cols);
  UPDATE tenants SET identifier='${IDENT}', name='${DISPLAY}', oltp_id=new_conn_id WHERE id=(SELECT max(id) FROM tenants);
END
\$\$;
SQL

echo "[3/5] *** RESTARTING Fineract to run Liquibase migrations for '${SCHEMA}' ***"
echo "      (Fineract only picks up a NEW tenant on restart -- this is required.)"
sudo docker restart fineract-server >/dev/null
echo "      Fineract restarted. Give it ~1-2 min to migrate the new tenant DB."

echo "[4/5] Registering '${DOMAIN}' -> '${IDENT}' in TENANT_DOMAINS (.env) and regenerating config.js..."
if grep -q "^TENANT_DOMAINS=" .env; then
  # append, avoiding a duplicate entry for the same domain
  CURRENT=$(grep "^TENANT_DOMAINS=" .env | sed 's/^TENANT_DOMAINS=//; s/^"//; s/"$//')
  CURRENT=$(printf '%s\n' "$CURRENT" | tr ' ' '\n' | grep -v "^${DOMAIN}:" | tr '\n' ' ' | sed 's/[[:space:]]*$//')
  NEW="${CURRENT:+$CURRENT }${DOMAIN}:${IDENT}"
  sed -i "s#^TENANT_DOMAINS=.*#TENANT_DOMAINS=\"${NEW}\"#" .env
else
  echo "TENANT_DOMAINS=\"${DOMAIN}:${IDENT}\"" >> .env
fi
chmod +x regen-frontend-config.sh
./regen-frontend-config.sh .. --reload

echo "[5/5] Done."
echo
echo "Next: add '${DOMAIN}' to DOMAINS in .env (comma/space-separated, primary"
echo "first), point its DNS to this SAME server IP, then re-run ./setup-vm.sh"
echo "to extend the TLS cert to cover it."
