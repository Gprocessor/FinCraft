#!/usr/bin/env bash
# Manual redeploy: pulls this repo's own git remote (infra + frontend
# together — frontend lives at the repo root, one level above this deploy/
# folder), regenerates config.js, and restarts the stack. The auto-update
# timer installed by setup-vm.sh does this automatically every minute; run
# this by hand any time you want it immediately.
set -euo pipefail
cd "$(dirname "$0")"      # deploy/
set -a; . ./.env; set +a
REPO_PRIVATE=${REPO_PRIVATE:-false}
DEPLOY_KEY=${DEPLOY_KEY:-$HOME/.ssh/fincraft_deploy}
[ "$REPO_PRIVATE" = "true" ] && export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

DEPLOY_DIR=$(pwd)
REPO_ROOT=$(cd .. && pwd)

if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
  # js/config.js is git-tracked but also regenerated in place on every
  # deploy — discard the regenerated copy before pulling so it can never
  # block a fast-forward.
  git -C "$REPO_ROOT" checkout -- js/config.js 2>/dev/null || true
  git -C "$REPO_ROOT" pull --ff-only origin "$BRANCH"
else
  echo "Not a git checkout — skipping pull, just regenerating config and restarting."
fi

chmod +x regen-frontend-config.sh
./regen-frontend-config.sh "$REPO_ROOT"
sudo docker compose up -d
sudo docker exec fincraft-ui nginx -s reload || true
./check-deployment.sh --wait
