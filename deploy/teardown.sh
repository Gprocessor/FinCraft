#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"   # deploy/
echo "FULL TEARDOWN (containers/volumes/cron/timer for this deploy). Will NOT"
echo "touch: repo files (frontend at ../, this deploy/ dir), nginx-certs/, .env, backups/"
read -r -p "Type 'yes' to confirm: " C
[ "$C" != "yes" ] && { echo "Aborted."; exit 0; }
sudo docker compose down -v --remove-orphans 2>/dev/null || true
sudo systemctl disable --now fincraft-autoupdate.timer 2>/dev/null || true
sudo rm -f /etc/systemd/system/fincraft-autoupdate.service /etc/systemd/system/fincraft-autoupdate.timer
sudo systemctl daemon-reload
D=$(pwd); ( crontab -l 2>/dev/null | grep -v "$D/backup.sh" | grep -v "$D/monitor.sh" | grep -v "$D/renew-cert.sh" | grep -v "$D/daily-report.sh" ) | crontab - 2>/dev/null || true
sudo docker image prune -f >/dev/null 2>&1 || true
echo "Teardown complete."
