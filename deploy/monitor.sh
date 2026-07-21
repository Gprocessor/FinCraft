#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
set -a; . ./.env 2>/dev/null || true; set +a
LOG="/var/log/fincraft-monitor.log"; FAIL=0
alert(){ echo "$(date): ALERT - $1" | sudo tee -a "$LOG" >/dev/null; [ -n "${ALERT_CMD:-}" ] && eval "${ALERT_CMD//\{\}/$1}" || true; FAIL=1; }
for c in fineract-postgres fineract-server fincraft-ui; do
  sudo docker ps --format '{{.Names}}' | grep -q "^${c}$" || alert "container ${c} not running"
done
curl -kfsS https://localhost/fineract/fineract-provider/actuator/health | grep -q '"status":"UP"' || alert "Fineract health FAILED"
curl -kfsS https://localhost/ | grep -qi "<title>FinCraft" || alert "Frontend index.html missing or blank (nginx up but no UI)"
exit $FAIL
