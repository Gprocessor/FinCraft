#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
DOMAINS="${DOMAINS:-${DOMAIN:-}}"; PRIMARY_DOMAIN="$(echo "$DOMAINS" | awk '{print $1}')"
[ -z "$PRIMARY_DOMAIN" ] && { echo "No DOMAINS; nothing to renew."; exit 0; }
sudo certbot renew --webroot -w "$(pwd)/certbot-webroot" --quiet || true
if [ -f "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem" ]; then
  sudo cp "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem" nginx-certs/cert.pem
  sudo cp "/etc/letsencrypt/live/${PRIMARY_DOMAIN}/privkey.pem"   nginx-certs/key.pem
  sudo chmod 644 nginx-certs/cert.pem nginx-certs/key.pem
  sudo docker exec fincraft-ui nginx -s reload || true
  echo "Cert renewed + nginx reloaded."
fi
