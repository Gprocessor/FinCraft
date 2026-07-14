#!/usr/bin/env bash
# FinCraft · deploy/build-birt-plugin.sh
#
# Non-interactive FETCH step: downloads the prebuilt BIRT reporting plugin
# jar + bundled libs from this repo's own GitHub Release (tag
# birt-plugin-latest) and unpacks them into reporting/plugin-libs/, ready
# for docker-compose.birt.yml's build context.
#
# The actual Maven build of openMF/mifos-reporting-plugin now happens on
# GitHub's own runners — see .github/workflows/build-birt-plugin.yml — which
# have full internet access and aren't subject to office-network proxy
# restrictions or free-tier VM CPU/RAM limits. This script just pulls the
# result down. To pick up new upstream commits, run that workflow manually
# from the Actions tab (or wait for its weekly schedule) — then the next
# time this script runs it'll fetch the new build automatically.
#
# This is the script fincraft-autoupdate.sh calls automatically when
# ENABLE_BIRT_REPORTING=true. For the full interactive walkthrough with a
# smoke test BEFORE you flip that flag on, use setup-birt-reporting.sh instead.
#
# Optional override: set BIRT_PLUGIN_REPO=owner/repo in .env if the release
# lives on a different repo than this checkout's own git origin (e.g. you
# forked FinCraft but still want to pull the upstream org's prebuilt jars).
#
# Usage: ./build-birt-plugin.sh
set -euo pipefail
cd "$(dirname "$0")"

REPORTING_DIR="reporting"
PLUGIN_LIBS_DIR="${REPORTING_DIR}/plugin-libs"
ASSET_SHA_FILE="${REPORTING_DIR}/.birt-plugin-libs.sha256"
RELEASE_TAG="birt-plugin-latest"
ASSET_NAME="birt-plugin-libs.zip"

mkdir -p "$REPORTING_DIR" "${REPORTING_DIR}/data/reports" "${REPORTING_DIR}/data/fonts" "${REPORTING_DIR}/data/config"
# Fineract's docker image runs as a non-root user (FINERACT_USER/FINERACT_GROUP
# in the upstream image) — bind-mounted host directories are otherwise created
# owned by whoever ran this script (root, on the VM), which the container's
# non-root process can't read. chmod wide open rather than guessing the
# container's actual UID, since FINERACT_USER/FINERACT_GROUP are configurable.
chmod -R 777 "${REPORTING_DIR}/data"

# --- Work out which GitHub repo to pull the release from ---
if [ -n "${BIRT_PLUGIN_REPO:-}" ]; then
  REPO="$BIRT_PLUGIN_REPO"
else
  ORIGIN_URL="$(git -C .. remote get-url origin 2>/dev/null || true)"
  # Handles both git@github.com:owner/repo.git and https://github.com/owner/repo.git
  REPO="$(echo "$ORIGIN_URL" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
fi

if [ -z "${REPO:-}" ]; then
  echo "ERROR: couldn't determine the GitHub repo to fetch the BIRT plugin release from." >&2
  echo "Set BIRT_PLUGIN_REPO=owner/repo in .env, or run this from a checkout whose 'origin' remote points at GitHub." >&2
  exit 1
fi

echo "Checking release '${RELEASE_TAG}' on ${REPO}..."
API_URL="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}"
RELEASE_JSON="$(curl -sfL -H "Accept: application/vnd.github+json" "$API_URL")" || {
  echo "ERROR: couldn't reach ${API_URL}." >&2
  echo "Has the 'Build BIRT Reporting Plugin' workflow run at least once on ${REPO} yet? (Actions tab -> Run workflow)" >&2
  exit 1
}

ASSET_URL="$(echo "$RELEASE_JSON" | grep -oP '"browser_download_url":\s*"\K[^"]+' | grep -F "/${ASSET_NAME}" || true)"
if [ -z "$ASSET_URL" ]; then
  echo "ERROR: release '${RELEASE_TAG}' on ${REPO} has no '${ASSET_NAME}' asset yet." >&2
  echo "Run the build workflow first: ${REPO} -> Actions -> Build BIRT Reporting Plugin -> Run workflow." >&2
  exit 1
fi

TMP_ZIP="$(mktemp)"
trap 'rm -f "$TMP_ZIP"' EXIT
echo "Downloading ${ASSET_NAME}..."
curl -sfL "$ASSET_URL" -o "$TMP_ZIP" || {
  echo "ERROR: download failed from ${ASSET_URL}." >&2
  exit 1
}

NEW_SHA="$(sha256sum "$TMP_ZIP" | awk '{print $1}')"
if [ -f "$ASSET_SHA_FILE" ] && [ "$(cat "$ASSET_SHA_FILE")" = "$NEW_SHA" ] \
   && [ "$(find "$PLUGIN_LIBS_DIR" -name '*.jar' 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "Already have this exact build (sha256 ${NEW_SHA:0:12}...) — skipping unpack."
  exit 0
fi

rm -rf "$PLUGIN_LIBS_DIR"
mkdir -p "$PLUGIN_LIBS_DIR"
unzip -q -o "$TMP_ZIP" -d "$PLUGIN_LIBS_DIR"

JAR_COUNT="$(find "$PLUGIN_LIBS_DIR" -name '*.jar' | wc -l | tr -d ' ')"
if [ "$JAR_COUNT" = "0" ]; then
  echo "ERROR: no jars found inside downloaded ${ASSET_NAME}." >&2
  exit 1
fi
chmod 644 "${PLUGIN_LIBS_DIR}"/*.jar 2>/dev/null || true

echo "$NEW_SHA" > "$ASSET_SHA_FILE"
if [ -f "${PLUGIN_LIBS_DIR}/PLUGIN_COMMIT.txt" ]; then
  echo "Provenance:"
  sed 's/^/  /' "${PLUGIN_LIBS_DIR}/PLUGIN_COMMIT.txt"
fi
echo "Fetched ${JAR_COUNT} jar(s) into ${PLUGIN_LIBS_DIR}."
