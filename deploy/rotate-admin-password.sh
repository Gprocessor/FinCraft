#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
NEW_PW="${1:-}"; TENANT="${2:-default}"
[ -z "$NEW_PW" ] && { echo "Usage: ./rotate-admin-password.sh 'NewPassword' [tenantId]"; exit 1; }
curl -kfsS -u mifos:password -H "Content-Type: application/json" -H "Fineract-Platform-TenantId: ${TENANT}" \
  -X PUT "https://localhost/fineract/fineract-provider/api/v1/users/1" \
  -d "{\"password\":\"${NEW_PW}\",\"repeatPassword\":\"${NEW_PW}\"}" \
  && echo " -> password changed for tenant '${TENANT}'." \
  || echo "FAILED (if already rotated, default no longer works)."
