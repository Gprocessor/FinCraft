#!/usr/bin/env bash
# Configures Fineract's built-in Gmail SMTP relay for one tenant, via
# Fineract's own External Services API — this is Fineract's documented
# mechanism for outbound email (org.apache.fineract...GmailBackedPlatformEmailService,
# external service name 'SMTP_Email_Account'), not a bolt-on integration.
# Requires a Gmail *App Password* (Gmail Account -> Security -> 2-Step
# Verification -> App passwords), not the normal account password.
#
# Usage: ./configure-email.sh <tenant> [gmail-address] [gmail-app-password] [from-name]
# Falls back to GMAIL_ADDRESS / GMAIL_APP_PASSWORD / GMAIL_FROM_NAME in .env
# when the optional args are omitted.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env 2>/dev/null || true; set +a

TENANT="${1:?Usage: ./configure-email.sh <tenant> [gmail-address] [gmail-app-password] [from-name]}"
GMAIL_USER="${2:-${GMAIL_ADDRESS:-}}"
GMAIL_PASS="${3:-${GMAIL_APP_PASSWORD:-}}"
GMAIL_PASS="${GMAIL_PASS// /}"   # Google displays it as "abcd efgh ijkl mnop" — the real credential has no spaces
FROM_NAME="${4:-${GMAIL_FROM_NAME:-FinCraft}}"
ADMIN_USER="${FINERACT_ADMIN_USERNAME:-mifos}"
ADMIN_PASS="${FINERACT_ADMIN_PASSWORD:-password}"

if [ -z "$GMAIL_USER" ] || [ -z "$GMAIL_PASS" ]; then
  echo "No Gmail address/app password set — skipping email setup for tenant '${TENANT}'."
  echo "Set GMAIL_ADDRESS + GMAIL_APP_PASSWORD in .env, or run:"
  echo "  ./configure-email.sh ${TENANT} <gmail-address> <gmail-app-password>"
  exit 0
fi

echo "Waiting for tenant '${TENANT}' to be ready..."
CODE=""
for i in $(seq 1 40); do
  CODE=$(curl -k -s -o /dev/null -w '%{http_code}' \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -H "Fineract-Platform-TenantId: ${TENANT}" \
    "https://localhost:8443/fineract-provider/api/v1/offices" || true)
  [ "$CODE" = "200" ] && break
  sleep 3
done
if [ "$CODE" != "200" ]; then
  echo "WARNING: tenant '${TENANT}' didn't respond (HTTP ${CODE:-none}) within ~2 min — email not configured."
  echo "Once the tenant is confirmed up, re-run: ./configure-email.sh ${TENANT}"
  exit 1
fi

# Write the payload to a permission-locked temp file rather than inlining the
# app password on the command line (visible in `ps` output) or in any log.
PAYLOAD=$(mktemp); chmod 600 "$PAYLOAD"
trap 'rm -f "$PAYLOAD"' EXIT
cat > "$PAYLOAD" <<JSON
{
  "username": "${GMAIL_USER}",
  "password": "${GMAIL_PASS}",
  "host": "smtp.gmail.com",
  "port": "587",
  "useTLS": "true",
  "fromEmail": "${GMAIL_USER}",
  "fromName": "${FROM_NAME}"
}
JSON

RESP=$(curl -k -s -o /dev/null -w '%{http_code}' \
  -u "${ADMIN_USER}:${ADMIN_PASS}" \
  -H "Fineract-Platform-TenantId: ${TENANT}" \
  -H "Content-Type: application/json" \
  -X PUT "https://localhost:8443/fineract-provider/api/v1/externalservice/SMTP" \
  --data "@${PAYLOAD}")

case "$RESP" in
  200|204) echo "Gmail SMTP configured for tenant '${TENANT}' (${GMAIL_USER})." ;;
  401)     echo "WARNING: HTTP 401 configuring email for '${TENANT}' — admin credentials rejected." \
                "If you already rotated the admin password, set FINERACT_ADMIN_PASSWORD in .env" \
                "and re-run: ./configure-email.sh ${TENANT}" ;;
  *)       echo "WARNING: SMTP configuration for '${TENANT}' returned HTTP ${RESP} — check manually." ;;
esac
