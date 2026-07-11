# FinCraft / Fineract - Step-by-Step Setup Guide

This is ONE repo: the FinCraft frontend lives at the repo root (just like a
normal clone of the app), and everything needed to deploy it lives in this
`deploy/` folder.

## Prerequisites
- Ubuntu VM, >= 4 GB RAM (first-boot Liquibase migration needs it).
- A DuckDNS (or any) domain A-record pointing to the VM PUBLIC IP.
- Cloud security list: open inbound TCP 22, 80, 443.

## 1. Get the repo onto the VM
    git clone <your-repo-url> fincraft-deploy
    cd fincraft-deploy/deploy
    chmod +x *.sh init-db/*.sh
(Private repo? See PRIVATE-REPO.md first.)

All commands below are run from inside `deploy/`.

## 2. (Optional) edit .env
setup-vm.sh auto-creates .env with random DB passwords. To customise:
    cp .env.example .env && nano .env
Set DOMAINS (primary first), LETSENCRYPT_EMAIL, DEFAULT_TENANT_IDENTIFIER
and DEFAULT_TENANT_DB_NAME (both default to 'fincraft'), TENANT_DOMAINS.

## 3. Deploy
    ./setup-vm.sh
Installs Docker+tools, starts Postgres/Fineract/nginx, writes complete
config.js from the ALREADY-CHECKED-IN frontend at the repo root, issues
Let's Encrypt cert for all DOMAINS, installs auto-update (pulls THIS repo's
git remote periodically) + backups + monitoring, waits for health. First
boot 5-10 min.

nginx mounts an explicit allowlist of frontend files/folders from `../`
(index.html, css/, js/, etc.) — `.env` and `nginx-certs/` in this deploy/
folder are never exposed to it.

## 4. Verify
    ./check-deployment.sh
    curl -v https://YOUR-DOMAIN/healthz 2>&1 | grep -i "issuer\|verify ok"

## 5. Secure admin + open app
    ./rotate-admin-password.sh 'A-Strong-Passphrase'
    # https://YOUR-DOMAIN/  (mifos / new-password / tenant 'fincraft')
Server URL and Tenant ID on the login page are both auto-filled from the
browser's own address — you shouldn't need to type either.

## Adding a tenant
    ./add-tenant.sh darkvera darkvera.duckdns.org "DarkVera Ltd"
IMPORTANT: this RESTARTS Fineract automatically -- Fineract only loads a NEW
tenant on restart, and the restart triggers the Liquibase migration for the
new tenant schema (a brand-new, fully isolated database — not a shared
table). Wait ~1-2 min. It also registers darkvera.duckdns.org -> 'darkvera'
in TENANT_DOMAINS (.env) and regenerates+reloads the frontend's config.js
for you. Then:
  1. DuckDNS: darkvera.duckdns.org -> SAME server IP
  2. .env: DOMAINS="fincraft.duckdns.org darkvera.duckdns.org" (primary first)
  3. ./setup-vm.sh   (extends TLS cert)
  4. ./rotate-admin-password.sh 'StrongPass' darkvera
Browse https://darkvera.duckdns.org/ -- UI auto-selects tenant AND server URL
by hostname.

## Updating (frontend, infra scripts, or docker-compose.yml)
Push changes to your repo's remote. The auto-update timer (installed by
setup-vm.sh) pulls every ~60s and redeploys automatically. To do it
immediately by hand:
    ./redeploy.sh

## Maintenance
- Backups nightly 2 AM -> ./backups/ (all tenant DBs, 7-day). Manual: ./backup.sh
- Cert renewal auto (3 AM). Auto-update every 60s.
- Health: ./check-deployment.sh | ./monitor.sh
- Logs: sudo docker logs fineract-server --tail 100 ; /var/log/fincraft-*.log

## Troubleshooting
- Blank UI: run ./check-deployment.sh — it checks that index.html and
  js/app.js actually render/serve, not just that nginx is "healthy". Also
  check the browser console (app.js surfaces bootstrap errors visibly and
  logs them) and unregister any stale service worker from a prior broken
  deploy attempt.
- Fineract "unhealthy": healthcheck is tool-free (grep :20FB) since the Alpine
  image has no curl; check sudo docker logs fineract-server.
- certbot failed: dig +short YOUR-DOMAIN must show this IP; open 80/443 at the
  cloud level; re-run ./setup-vm.sh.
- VM change: re-clone the repo, cd into deploy/, ./setup-vm.sh (TLS
  re-issues, Fineract re-migrates). Restore a dump from ./backups/ for data.
