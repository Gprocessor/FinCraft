#!/usr/bin/env bash
# FinCraft · deploy/create-keycloak-realm.sh
# Creates one Keycloak realm per Fineract tenant, mirroring the same
# per-tenant isolation your Postgres databases already use (see
# deploy/KEYCLOAK-SETUP.md for why a single shared realm doesn't work here:
# usernames would have to be globally unique across every tenant forever).
#
# Realm name == Fineract tenant identifier, so the frontend can derive the
# right realm from the same domain->tenant mapping it already resolves via
# TENANT_DOMAINS, with no new mapping table to maintain.
#
# Usage: ./create-keycloak-realm.sh <tenant_identifier> [client_id]
#   client_id defaults to fincraft-web
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env 2>/dev/null || true; set +a

IDENT="${1:-}"
CLIENT_ID="${2:-fincraft-web}"
KC_URL="http://127.0.0.1:8080"

if [ -z "$IDENT" ]; then
  echo "Usage: ./create-keycloak-realm.sh <tenant_identifier> [client_id]"
  exit 1
fi
: "${KEYCLOAK_ADMIN_USER:?KEYCLOAK_ADMIN_USER must be set in .env}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD must be set in .env}"

echo "[1/3] Getting an admin token from Keycloak..."
ADMIN_TOKEN=$(curl -fsS -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=${KEYCLOAK_ADMIN_USER}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | jq -r '.access_token')

if curl -fsS -o /dev/null -w "" -H "Authorization: Bearer ${ADMIN_TOKEN}" "${KC_URL}/admin/realms/${IDENT}" 2>/dev/null; then
  echo "      Realm '${IDENT}' already exists — skipping creation, will still ensure the client exists."
else
  echo "[2/3] Creating realm '${IDENT}'..."
  curl -fsS -X POST "${KC_URL}/admin/realms" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"realm\": \"${IDENT}\", \"enabled\": true, \"sslRequired\": \"external\"}"
fi

echo "[3/3] Ensuring client '${CLIENT_ID}' exists in realm '${IDENT}' (direct access grants, for the web app's username+password flow)..."
EXISTING=$(curl -fsS -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "${KC_URL}/admin/realms/${IDENT}/clients?clientId=${CLIENT_ID}" \
  | jq -r '.[0].id // empty')

if [ -n "$EXISTING" ]; then
  echo "      Client '${CLIENT_ID}' already exists in realm '${IDENT}' — nothing to do."
else
  curl -fsS -X POST "${KC_URL}/admin/realms/${IDENT}/clients" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"${CLIENT_ID}\",
      \"publicClient\": true,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": false,
      \"enabled\": true
    }"
  echo "      Created."
fi

echo
echo "Done. Realm '${IDENT}' ready with client '${CLIENT_ID}'."
echo "Add users for this tenant via the admin console (SSH tunnel — see KEYCLOAK-SETUP.md),"
echo "or Keycloak's Admin REST API if you're scripting bulk creation later."
