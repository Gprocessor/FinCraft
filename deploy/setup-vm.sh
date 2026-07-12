#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"   # this script lives in deploy/ — frontend is at ../ (repo root)
log()  { echo; echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }
fail() { echo "ERROR: $*" >&2; exit 1; }

log "FinCraft / Fineract + PostgreSQL + nginx - PRODUCTION (multi-tenant) setup"
log "Single-repo deploy: run from deploy/. Frontend lives at the repo root (..)."

log "[1/11] Updating system packages"
sudo apt-get update -y -q

log "[2/11] Installing Docker, tools and host hardening"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
sudo apt-get install -y -q git openssl ufw cron curl fail2ban unattended-upgrades certbot >/dev/null 2>&1 || true
sudo systemctl enable --now docker
sudo systemctl enable --now fail2ban 2>/dev/null || true
sudo dpkg-reconfigure -f noninteractive unattended-upgrades 2>/dev/null || true

log "[3/11] Preparing .env (chmod 600)"
if [ ! -f .env ]; then
  cp .env.example .env
  PG_PASS=$(openssl rand -base64 32 | tr -d '/+=')
  APP_PASS=$(openssl rand -base64 32 | tr -d '/+=')
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${PG_PASS}/" .env
  sed -i "s/^FINERACT_DB_PASSWORD=.*/FINERACT_DB_PASSWORD=${APP_PASS}/" .env
  echo ".env created with generated passwords."
else
  echo ".env exists; keeping current values."
fi
chmod 600 .env
set -a; . ./.env; set +a

DOMAINS="${DOMAINS:-${DOMAIN:-}}"
PRIMARY_DOMAIN="$(echo "$DOMAINS" | awk '{print $1}')"
PUBLIC_IP=$(curl -s -4 ifconfig.me 2>/dev/null || true)
if [ -n "$PRIMARY_DOMAIN" ]; then PUBLIC_HOST="$PRIMARY_DOMAIN"; else PUBLIC_HOST=${PUBLIC_HOST:-${PUBLIC_IP:-localhost}}; fi
REPO_PRIVATE=${REPO_PRIVATE:-false}
DEPLOY_KEY=${DEPLOY_KEY:-$HOME/.ssh/fincraft_deploy}

log "[4/11] Checking frontend is present in this checkout"
# The frontend lives at the repo root (../ from here) as part of THIS repo —
# fail loudly if it's missing rather than let nginx silently serve a blank
# page.
[ -f ../index.html ] || fail "../index.html not found. Did you clone the full repo (frontend at repo root)?"

log "[5/11] Writing COMPLETE domain-aware config.js"
chmod +x regen-frontend-config.sh
./regen-frontend-config.sh ..

log "[6/11] Preparing certificates directory"
mkdir -p nginx-certs certbot-webroot
if [ ! -f nginx-certs/cert.pem ] || [ ! -f nginx-certs/key.pem ]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout nginx-certs/key.pem -out nginx-certs/cert.pem \
    -subj "/CN=${PUBLIC_HOST}/O=FinCraft/C=NG" \
    -addext "subjectAltName=IP:${PUBLIC_IP:-127.0.0.1},DNS:localhost,DNS:${PUBLIC_HOST}" >/dev/null 2>&1
fi

log "[7/11] Opening VM firewall ports 22, 80, 443"
sudo ufw allow 22/tcp >/dev/null 2>&1 || true
sudo ufw allow 80/tcp >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null 2>&1 || true
echo "NOTE: On Oracle Cloud you must ALSO open 80/443 in the VCN security list."

log "[8/11] Validating required files"
[ -f docker-compose.yml ] || fail "docker-compose.yml missing"
chmod +x init-db/01-init-fineract.sh

log "[9/11] Starting services"
sudo docker compose down --remove-orphans || true
sudo docker compose up -d

TLS_MODE="self-signed"
if [ -n "$DOMAINS" ] && [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
  log "[9b/11] Requesting Let's Encrypt certificate for: $DOMAINS"
  DFLAGS=""; for d in $DOMAINS; do DFLAGS="$DFLAGS -d $d"; done
  if sudo certbot certonly --webroot -w "$(pwd)/certbot-webroot" $DFLAGS --email "$LETSENCRYPT_EMAIL" --agree-tos --non-interactive; then
    sudo cp "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem" nginx-certs/cert.pem
    sudo cp "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/privkey.pem"   nginx-certs/key.pem
    sudo chmod 644 nginx-certs/cert.pem nginx-certs/key.pem
    sudo docker exec fincraft-ui nginx -s reload || true
    TLS_MODE="letsencrypt"
  else
    warn "certbot failed; staying on self-signed. Check DNS + ports 80/443."
  fi
fi

log "[10/11] Installing auto-update (pulls THIS repo's own git remote)"
DEPLOY_DIR=$(pwd)                                   # ./deploy — where docker-compose.yml lives
REPO_ROOT=$(cd .. && pwd)                            # repo root — what git tracks (frontend + deploy/)
if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  if [ "$REPO_PRIVATE" = "true" ]; then
    WATCHER_SSH="export GIT_SSH_COMMAND=\"ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new\""
  else
    WATCHER_SSH="# public/already-authenticated repo"
  fi
  CURRENT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
  sudo tee /usr/local/bin/fincraft-autoupdate.sh >/dev/null <<WATCHER
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$REPO_ROOT"
DEPLOY_DIR="$DEPLOY_DIR"
LOG="/var/log/fincraft-autoupdate.log"
$WATCHER_SSH
cd "\$REPO_ROOT"
# js/config.js is git-tracked (a sane demo default) but also regenerated in
# place on every deploy — discard the regenerated copy before pulling so a
# local diff on that one file can never block the pull.
# Every log write below goes through 'sudo tee -a' rather than a plain '>>' —
# this service runs as an unprivileged user (User=\$USER below) and /var/log
# is root-owned, so a bare '>>' redirect fails with "Permission denied" and
# (with set -e) kills the script before git pull ever runs.
log() { echo "\$(date): \$1" | sudo tee -a "\$LOG" >/dev/null; }

# Pull in Gmail SMTP creds configure-email.sh already put in .env, if present.
set -a; . "\$DEPLOY_DIR/.env" 2>/dev/null || true; set +a
NOTIFY_TO="\${DEPLOY_NOTIFY_EMAIL:-\${GMAIL_ADDRESS:-}}"

# Best-effort deploy-report email over Gmail SMTP — same creds
# configure-email.sh already configured, curl speaks SMTP natively so no new
# dependency. No-op if GMAIL_ADDRESS/GMAIL_APP_PASSWORD/NOTIFY_TO aren't set
# (e.g. configure-email.sh was never run, or DEPLOY_NOTIFY_EMAIL wasn't added).
send_mail() {
  local subject="\$1" body="\$2"
  [ -n "\${GMAIL_ADDRESS:-}" ] && [ -n "\${GMAIL_APP_PASSWORD:-}" ] && [ -n "\$NOTIFY_TO" ] || return 0
  local pass="\${GMAIL_APP_PASSWORD// /}"
  { printf 'From: %s <%s>\r\n' "\${GMAIL_FROM_NAME:-FinCraft}" "\$GMAIL_ADDRESS"
    printf 'To: %s\r\n' "\$NOTIFY_TO"
    printf 'Subject: %s\r\n' "\$subject"
    printf 'Content-Type: text/plain; charset=UTF-8\r\n\r\n'
    printf '%s\n' "\$body"
  } | curl -s --url "smtps://smtp.gmail.com:465" --ssl-reqd \
      --mail-from "\$GMAIL_ADDRESS" --mail-rcpt "\$NOTIFY_TO" \
      --user "\${GMAIL_ADDRESS}:\${pass}" --upload-file - \
      2>&1 | sudo tee -a "\$LOG" >/dev/null || true
}

on_error() {
  local status=\$?
  log "Deploy FAILED (exit \${status}). See log above."
  send_mail "FinCraft auto-deploy FAILED on \$(hostname)" \
"Auto-deploy hit an error on \$(hostname) at \$(date).

Last 40 lines of \${LOG}:
\$(tail -40 "\$LOG" 2>/dev/null)"
}
trap on_error ERR

git checkout -- js/config.js 2>&1 | sudo tee -a "\$LOG" >/dev/null || true
git fetch origin "$CURRENT_BRANCH" --quiet 2>&1 | sudo tee -a "\$LOG" >/dev/null
LOCAL=\$(git rev-parse HEAD)
REMOTE=\$(git rev-parse "origin/$CURRENT_BRANCH")
if [ "\$LOCAL" != "\$REMOTE" ]; then
  COMMITS=\$(git log --oneline "\$LOCAL..\$REMOTE")
  git pull --ff-only origin "$CURRENT_BRANCH" 2>&1 | sudo tee -a "\$LOG" >/dev/null
  "\$DEPLOY_DIR/regen-frontend-config.sh" "\$REPO_ROOT" --reload 2>&1 | sudo tee -a "\$LOG" >/dev/null
  (cd "\$DEPLOY_DIR" && docker compose up -d) 2>&1 | sudo tee -a "\$LOG" >/dev/null
  log "Deploy complete."
  send_mail "FinCraft deployed on \$(hostname): \$(git rev-parse --short HEAD)" \
"New commits pulled and deployed on \$(hostname) at \$(date):

\$COMMITS

Now at \$(git rev-parse --short HEAD)."
else
  log "No changes."
fi
WATCHER
  sudo chmod +x /usr/local/bin/fincraft-autoupdate.sh

  sudo tee /etc/systemd/system/fincraft-autoupdate.service >/dev/null <<SVC
[Unit]
Description=FinCraft repo auto-update
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/fincraft-autoupdate.sh
User=$USER
WorkingDirectory=$DEPLOY_DIR
SVC

  sudo tee /etc/systemd/system/fincraft-autoupdate.timer >/dev/null <<'TIMER'
[Unit]
Description=FinCraft repo auto-update timer
Requires=fincraft-autoupdate.service

[Timer]
OnBootSec=60
OnUnitActiveSec=60
AccuracySec=10

[Install]
WantedBy=timers.target
TIMER

  sudo systemctl daemon-reload
  sudo systemctl enable --now fincraft-autoupdate.timer
else
  warn "This directory isn't a git checkout — skipping auto-update timer. Use ./redeploy.sh manually to pick up changes."
fi

log "[11/11] Installing logrotate, backups, cert renewal and monitoring crons"
sudo tee /etc/logrotate.d/fincraft >/dev/null <<'ROTATE'
/var/log/fincraft-autoupdate.log
/var/log/fincraft-backup.log
/var/log/fincraft-monitor.log
/var/log/fincraft-daily-report.log
{
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
ROTATE

chmod +x backup.sh restore.sh monitor.sh renew-cert.sh rotate-admin-password.sh add-tenant.sh setup-deploy-key.sh setup-gdrive-backup.sh regen-frontend-config.sh redeploy.sh check-deployment.sh configure-email.sh daily-report.sh
CRON_TMP=$(mktemp)
crontab -l 2>/dev/null | grep -v "$DEPLOY_DIR/backup.sh" \
  | grep -v "$DEPLOY_DIR/monitor.sh" \
  | grep -v "$DEPLOY_DIR/renew-cert.sh" \
  | grep -v "$DEPLOY_DIR/daily-report.sh" > "$CRON_TMP" || true
echo "0 2 * * * $DEPLOY_DIR/backup.sh" >> "$CRON_TMP"
echo "*/5 * * * * $DEPLOY_DIR/monitor.sh" >> "$CRON_TMP"
echo "0 3 * * * $DEPLOY_DIR/renew-cert.sh" >> "$CRON_TMP"
echo "0 7 * * * $DEPLOY_DIR/daily-report.sh" >> "$CRON_TMP"
crontab "$CRON_TMP"; rm -f "$CRON_TMP"

./check-deployment.sh --wait

log "Configuring outbound email (Gmail SMTP) for tenant '${DEFAULT_TENANT_IDENTIFIER:-fincraft}'"
./configure-email.sh "${DEFAULT_TENANT_IDENTIFIER:-fincraft}" || warn "Email setup skipped/failed — see above. Re-run ./configure-email.sh ${DEFAULT_TENANT_IDENTIFIER:-fincraft} any time."

echo
echo "=================================================="
echo " Deployment complete. TLS: ${TLS_MODE}  Repo private: ${REPO_PRIVATE}"
for d in $DOMAINS; do echo "   https://$d -> tenant '$(grep "^$d:" <<<"$TENANT_DOMAINS" | cut -d: -f2)'"; done
echo " Login: mifos / password (tenant: ${DEFAULT_TENANT_IDENTIFIER:-fincraft})"
echo " Next: ./rotate-admin-password.sh 'YourStrongPass'"
echo
echo " Already running automatically, no action needed:"
echo "   - Nightly DB backups to ./backups (2 AM) + daily log digest email (7 AM)"
echo "   - Auto-deploy watcher (pulls + redeploys on new commits, every 60s)"
echo
echo " Optional, needs one manual step from you:"
echo "   - Backups only save locally right now. For off-site Google Drive"
echo "     uploads (one-time Google sign-in, then fully automatic): "
echo "     ./setup-gdrive-backup.sh"
echo "=================================================="
