#!/usr/bin/env bash
# FinCraft · deploy/daily-report.sh
# Once-a-day email digest: host-level logs (auto-update / backup / monitor)
# plus the last 24h of each container's logs (fineract-postgres,
# fineract-server, fincraft-ui). Installed by setup-vm.sh as a daily cron
# job. Best-effort — a missing log file or a docker hiccup just gets noted
# and skipped, never fails the run.
set -uo pipefail
cd "$(dirname "$0")"
set -a; . ./.env 2>/dev/null || true; set +a
. ./lib/mail.sh

MAXLINES=200   # per source — keeps the digest readable and well under any size limit

section() {
  local title="$1"; shift
  echo "===== ${title} ====="
  "$@" 2>&1 | tail -n "$MAXLINES"
  echo
}

BODY=$(
  echo "FinCraft daily log digest — $(hostname) — $(date)"
  echo

  for f in /var/log/fincraft-autoupdate.log /var/log/fincraft-backup.log /var/log/fincraft-monitor.log; do
    [ -r "$f" ] || continue
    section "$(basename "$f")" tail -n "$MAXLINES" "$f"
  done

  for c in fineract-postgres fineract-server fincraft-ui; do
    if sudo docker ps --format '{{.Names}}' | grep -q "^${c}\$"; then
      section "docker logs: ${c} (last 24h)" sudo docker logs --since 24h "$c"
    else
      echo "===== docker logs: ${c} ====="
      echo "(container not running)"
      echo
    fi
  done
)

send_mail "FinCraft daily digest: $(hostname) — $(date +%Y-%m-%d)" "$BODY"
echo "$(date): daily report sent." | sudo tee -a /var/log/fincraft-daily-report.log >/dev/null
