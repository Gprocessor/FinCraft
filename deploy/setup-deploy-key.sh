#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/fincraft_deploy}"
mkdir -p "$(dirname "$DEPLOY_KEY")"; chmod 700 "$(dirname "$DEPLOY_KEY")"
if [ ! -f "$DEPLOY_KEY" ]; then
  ssh-keygen -t ed25519 -f "$DEPLOY_KEY" -N "" -C "fincraft-deploy-$(hostname)"
fi
SSH_CFG="$HOME/.ssh/config"; touch "$SSH_CFG"; chmod 600 "$SSH_CFG"
if ! grep -q "Host github.com" "$SSH_CFG" 2>/dev/null; then
  printf '\nHost github.com\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' "$DEPLOY_KEY" >> "$SSH_CFG"
fi
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
echo "==== ADD AS READ-ONLY DEPLOY KEY (GitHub -> repo -> Settings -> Deploy keys) ===="
cat "${DEPLOY_KEY}.pub"
echo "Then set REPO_PRIVATE=true in .env and run ./setup-vm.sh"
