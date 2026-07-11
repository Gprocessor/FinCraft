# FinCraft — Fineract Deployment

A production deployment of [Apache Fineract](https://fineract.apache.org/)
(open-source core banking / microfinance platform) with a static web
frontend, PostgreSQL, and nginx — all in one repo.

The frontend lives at the repo root, just like a normal clone of the
FinCraft app. Everything needed to deploy it lives in **`./deploy/`**.

## Stack

| Component | What |
|---|---|
| Backend | Apache Fineract (`apache/fineract` Docker image) |
| Database | PostgreSQL 16 |
| Frontend | FinCraft — static HTML/CSS/JS SPA, no build step (repo root) |
| Reverse proxy / TLS | nginx (Let's Encrypt via certbot, self-signed fallback) |
| Orchestration | Docker Compose (`deploy/docker-compose.yml`) |

Multi-tenant: each tenant is a fully isolated Postgres database. The first
tenant is provisioned automatically as `fincraft`; more can be added later
with `./add-tenant.sh`.

## Repo layout

```
.
├── index.html, js/, css/, ...    # the frontend app (repo root)
├── FRONTEND.md                    # frontend app details (features, architecture, local dev)
├── deploy/                        # everything needed to deploy
│   ├── docker-compose.yml
│   ├── setup-vm.sh                # run this first
│   ├── .env.example
│   └── ...
```

nginx mounts an explicit allowlist of frontend paths from the repo root
(`index.html`, `css/`, `js/`, etc.) — `deploy/.env` and `deploy/nginx-certs/`
(secrets, TLS private key) are never exposed to it.

## Requirements

- Ubuntu VM, 4+ GB RAM (8+ GB recommended — first-boot migration is heavy)
- A domain's A-record pointing at the VM's public IP
- Inbound TCP 22, 80, 443 open (VM firewall + cloud security group/VCN)

## Deploy

```bash
git clone <your-repo-url> fincraft-deploy
cd fincraft-deploy/deploy
chmod +x *.sh init-db/*.sh
cp .env.example .env && nano .env   # set DOMAINS, LETSENCRYPT_EMAIL at minimum
./setup-vm.sh
```

`setup-vm.sh` installs Docker, starts Postgres/Fineract/nginx, generates the
frontend's tenant config, issues a TLS certificate, and installs auto-update,
backups, and monitoring. First boot takes 5–10 minutes.

Then:
```bash
./check-deployment.sh              # verify everything is actually serving
./rotate-admin-password.sh 'YourStrongPassword'
```

Open `https://YOUR-DOMAIN/` — Server URL and Tenant ID on the login page are
auto-filled. Default login is `mifos` / `password` until you rotate it.

## Day-to-day operations

Run these from inside `deploy/`:

| Task | Command |
|---|---|
| Redeploy immediately (normally automatic, ~60s) | `./redeploy.sh` |
| Add a tenant | `./add-tenant.sh <identifier> <domain> "Display Name"` |
| Manual backup | `./backup.sh` |
| Health check | `./check-deployment.sh` or `./monitor.sh` |
| Rotate admin password | `./rotate-admin-password.sh '<password>' [tenant]` |
| Tear down | `./teardown.sh` |

Further reading: [deploy/SETUP-GUIDE.md](./deploy/SETUP-GUIDE.md) ·
[deploy/MULTI-TENANT.md](./deploy/MULTI-TENANT.md) ·
[deploy/PRIVATE-REPO.md](./deploy/PRIVATE-REPO.md) ·
[deploy/PRODUCTION.md](./deploy/PRODUCTION.md) ·
[FRONTEND.md](./FRONTEND.md) (frontend app details)
