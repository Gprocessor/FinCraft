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
DATA_DIR="${REPORTING_DIR}/data"
ASSET_SHA_FILE="${REPORTING_DIR}/.birt-plugin-libs.sha256"
RELEASE_TAG="birt-plugin-latest"
ASSET_NAME="birt-plugin-libs.zip"

mkdir -p "$REPORTING_DIR" "${DATA_DIR}/reports" "${DATA_DIR}/fonts" "${DATA_DIR}/config"

# unzip isn't in setup-vm.sh's base apt-get install list (the old version of
# this script only needed git + Maven's own mvnw, never a zip). Self-heal
# rather than requiring a full setup-vm.sh re-run on already-provisioned VMs.
if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip not found — installing..."
  sudo apt-get update -y -q >/dev/null 2>&1 || true
  sudo apt-get install -y -q unzip >/dev/null 2>&1 || true
  command -v unzip >/dev/null 2>&1 || { echo "ERROR: unzip install failed." >&2; exit 1; }
fi

# Fineract's docker image runs as a non-root user (FINERACT_USER/FINERACT_GROUP
# in the upstream image) — bind-mounted host directories are otherwise created
# owned by whoever ran this script (root, on the VM), which the container's
# non-root process can't read. chmod wide open rather than guessing the
# container's actual UID, since FINERACT_USER/FINERACT_GROUP are configurable.
chmod -R 777 "${DATA_DIR}"

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
   && [ "$(find "$PLUGIN_LIBS_DIR" -name '*.jar' 2>/dev/null | wc -l)" -gt 0 ] \
   && [ "$(find "${DATA_DIR}/reports" -type f 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "Already have this exact build (sha256 ${NEW_SHA:0:12}...) — skipping unpack."
  exit 0
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -f "$TMP_ZIP"; rm -rf "$STAGE_DIR"' EXIT
unzip -q -o "$TMP_ZIP" -d "$STAGE_DIR"

JAR_COUNT="$(find "$STAGE_DIR/plugin-libs" -name '*.jar' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$JAR_COUNT" = "0" ]; then
  echo "ERROR: no jars found inside downloaded ${ASSET_NAME}." >&2
  exit 1
fi

rm -rf "$PLUGIN_LIBS_DIR"
mkdir -p "$PLUGIN_LIBS_DIR"
cp "$STAGE_DIR"/plugin-libs/*.jar "$PLUGIN_LIBS_DIR"/
chmod 644 "${PLUGIN_LIBS_DIR}"/*.jar 2>/dev/null || true

# The report/font/config files docker-compose.birt.yml bind-mounts at
# MIFOS_BIRT_REPORTS_PATH / MIFOS_BIRT_REPORTS_FONTS_PATH /
# MIFOS_BIRT_REPORTS_FONTS_CONFIG_PATH — these live in the plugin repo's own
# birt/ folder, not in target/, so they ride along in the same release asset
# rather than being built. Previously these directories were left empty and
# setup-birt-reporting.sh's printed instructions told you to drop them in
# by hand; this replaces that manual step.
REPORT_COUNT=0; FONT_COUNT=0; CONFIG_COUNT=0
if [ -d "$STAGE_DIR/birt/reports" ]; then
  rm -rf "${DATA_DIR}/reports"; mkdir -p "${DATA_DIR}/reports"
  cp "$STAGE_DIR"/birt/reports/* "${DATA_DIR}/reports/" 2>/dev/null || true
  REPORT_COUNT="$(find "${DATA_DIR}/reports" -type f | wc -l | tr -d ' ')"
fi
if [ -d "$STAGE_DIR/birt/fonts" ]; then
  rm -rf "${DATA_DIR}/fonts"; mkdir -p "${DATA_DIR}/fonts"
  cp "$STAGE_DIR"/birt/fonts/* "${DATA_DIR}/fonts/" 2>/dev/null || true
  FONT_COUNT="$(find "${DATA_DIR}/fonts" -type f | wc -l | tr -d ' ')"
fi
if [ -d "$STAGE_DIR/birt/config" ]; then
  rm -rf "${DATA_DIR}/config"; mkdir -p "${DATA_DIR}/config"
  cp "$STAGE_DIR"/birt/config/* "${DATA_DIR}/config/" 2>/dev/null || true
  CONFIG_COUNT="$(find "${DATA_DIR}/config" -type f | wc -l | tr -d ' ')"
fi
chmod -R 777 "${DATA_DIR}"

if [ "$REPORT_COUNT" = "0" ]; then
  echo "WARNING: no report files landed in ${DATA_DIR}/reports — reports UI will have nothing to run until some are added." >&2
fi

echo "$NEW_SHA" > "$ASSET_SHA_FILE"
if [ -f "$STAGE_DIR/PLUGIN_COMMIT.txt" ]; then
  cp "$STAGE_DIR/PLUGIN_COMMIT.txt" "${REPORTING_DIR}/PLUGIN_COMMIT.txt"
  echo "Provenance:"
  sed 's/^/  /' "${REPORTING_DIR}/PLUGIN_COMMIT.txt"
fi
echo "Fetched ${JAR_COUNT} jar(s), ${REPORT_COUNT} report(s), ${FONT_COUNT} font(s), ${CONFIG_COUNT} config file(s)."
