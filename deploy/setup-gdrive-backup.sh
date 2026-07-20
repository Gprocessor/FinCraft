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
 One-time Google sign-in needed — this VM has no browser, so this
 needs a machine that DOES (your laptop, or OCI Cloud Shell's own
 browser tab — NOT this SSH session) for one step in the middle.
==================================================================

 Right here, on THIS VM, run:
   rclone config

 Then answer the prompts exactly like this:
   n) New remote
   name>              ${REMOTE}
   Storage>           drive          (Google Drive — pick its number from the list)
   client_id>         <blank, just press Enter>
   client_secret>     <blank, just press Enter>
   scope>             1              (Full access)
   service_account_file>  <blank, just press Enter>
   Edit advanced config?  n
   Use auto config?       n          <- THE IMPORTANT ONE: say N, this VM has no browser

 At that point it prints something like:
   Option config_token.
   Execute the following on a machine with a web browser:
      rclone authorize "drive"

 NOW switch to the machine WITH a browser (laptop / Cloud Shell tab):
   1. Install rclone there if needed: curl https://rclone.org/install.sh | sudo bash
      (or: brew install rclone / choco install rclone / etc.)
   2. Run:  rclone authorize "drive"
   3. Approve it in the browser tab that opens.
   4. It prints a long token blob starting with {"access_token":...
      Copy that entire line.

 BACK HERE on this VM, at the "config_token>" prompt, paste that
 line, then answer "n" to "Configure this as a Shared Drive?" and
 "y" to confirm the remote looks right.
==================================================================
INSTRUCTIONS
  read -rp "Press Enter once you've run 'rclone config' and finished the steps above (or Ctrl+C to stop here and finish later)... " _
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
