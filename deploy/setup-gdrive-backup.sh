#!/usr/bin/env bash
# FinCraft · deploy/setup-gdrive-backup.sh
# One-time setup: installs rclone and wires backup.sh's existing
# BACKUP_UPLOAD_CMD hook up to a Google Drive folder in your own account.
#
# The one step this script CANNOT do for you: the OAuth consent click.
# rclone needs you to sign in to Google once; after that it holds a refresh
# token and every future backup upload is fully unattended — no browser,
# no re-auth, runs fine from cron on this headless VM.
#
# Usage: ./setup-gdrive-backup.sh [remote-name] [drive-folder]
#   remote-name   rclone remote name to create.        default: gdrive
#   drive-folder  folder inside "My Drive" to use.      default: fincraft-backups
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${1:-gdrive}"
FOLDER="${2:-fincraft-backups}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | sudo bash
fi

if rclone listremotes | grep -q "^${REMOTE}:$"; then
  echo "rclone remote '${REMOTE}' already configured — skipping auth step."
else
  cat <<INSTRUCTIONS

==================================================================
 One-time Google sign-in needed — this VM has no browser, so do
 this part from a machine that DOES (your laptop, or OCI Cloud
 Shell's own browser tab — NOT this SSH session):
==================================================================

 1. On that other machine, install rclone if it isn't already there:
      curl https://rclone.org/install.sh | sudo bash
    (or: brew install rclone / choco install rclone / etc.)

 2. Run this on that machine and follow the browser prompt to sign
    in to the Google account you want backups to land in:
      rclone authorize "drive"

 3. It prints a long token blob starting with something like:
      {"access_token":"...
    Copy the ENTIRE line.

 4. Back HERE, on this VM, run:
      rclone config create ${REMOTE} drive scope drive config_is_local false
    then paste that token blob when it asks for it.

==================================================================
INSTRUCTIONS
  read -rp "Press Enter once you've completed steps 1-4 above (or Ctrl+C to stop here and finish later)... " _
  if ! rclone listremotes | grep -q "^${REMOTE}:$"; then
    echo "Remote '${REMOTE}' still isn't configured — re-run this script once you've finished the steps above."
    exit 1
  fi
fi

echo "Testing '${REMOTE}:' and creating folder '${FOLDER}' if needed..."
rclone mkdir "${REMOTE}:${FOLDER}"
rclone lsd "${REMOTE}:" | grep -q " ${FOLDER}\$" && echo "OK — '${REMOTE}:${FOLDER}' is reachable."

UPLOAD_CMD="rclone copy {} ${REMOTE}:${FOLDER}/"
echo
echo "=================================================="
echo " Add this line to deploy/.env (replacing any existing"
echo " BACKUP_UPLOAD_CMD line), then backups will upload to"
echo " Google Drive automatically on the next nightly run:"
echo
echo "   BACKUP_UPLOAD_CMD='${UPLOAD_CMD}'"
echo
echo " Test it immediately without waiting for cron:"
echo "   ./backup.sh"
echo "=================================================="
