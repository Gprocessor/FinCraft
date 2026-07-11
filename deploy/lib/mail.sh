#!/usr/bin/env bash
# FinCraft · deploy/lib/mail.sh
# Shared "send an email over the Gmail SMTP creds configure-email.sh already
# put in .env" helper. Source this after loading .env:
#   set -a; . "$(dirname "$0")/.env" 2>/dev/null || true; set +a
#   . "$(dirname "$0")/lib/mail.sh"
#   send_mail "subject" "body"
# No-ops silently if GMAIL_ADDRESS / GMAIL_APP_PASSWORD / a recipient aren't
# configured — every caller can call it unconditionally.

send_mail() {
  local subject="$1" body="$2"
  local to="${DEPLOY_NOTIFY_EMAIL:-${GMAIL_ADDRESS:-}}"
  [ -n "${GMAIL_ADDRESS:-}" ] && [ -n "${GMAIL_APP_PASSWORD:-}" ] && [ -n "$to" ] || return 0
  local pass="${GMAIL_APP_PASSWORD// /}"
  { printf 'From: %s <%s>\r\n' "${GMAIL_FROM_NAME:-FinCraft}" "$GMAIL_ADDRESS"
    printf 'To: %s\r\n' "$to"
    printf 'Subject: %s\r\n' "$subject"
    printf 'Content-Type: text/plain; charset=UTF-8\r\n\r\n'
    printf '%s\n' "$body"
  } | curl -s --url "smtps://smtp.gmail.com:465" --ssl-reqd \
      --mail-from "$GMAIL_ADDRESS" --mail-rcpt "$to" \
      --user "${GMAIL_ADDRESS}:${pass}" --upload-file - || true
}
