#!/usr/bin/env bash
# FinCraft · deploy/build-birt-plugin.sh
#
# Non-interactive build step: clones/updates openMF/mifos-reporting-plugin,
# builds the jar, and collects it + its bundled BIRT libs into
# reporting/plugin-libs/, ready for docker-compose.birt.yml's build context.
#
# This is the script fincraft-autoupdate.sh calls automatically when
# ENABLE_BIRT_REPORTING=true. For the full interactive walkthrough with a
# smoke test BEFORE you flip that flag on, use setup-birt-reporting.sh instead.
#
# Usage: ./build-birt-plugin.sh
set -euo pipefail
cd "$(dirname "$0")"

REPORTING_DIR="reporting"
PLUGIN_SRC_DIR="${REPORTING_DIR}/mifos-reporting-plugin"
PLUGIN_LIBS_DIR="${REPORTING_DIR}/plugin-libs"

mkdir -p "$REPORTING_DIR" "${REPORTING_DIR}/data/reports" "${REPORTING_DIR}/data/fonts" "${REPORTING_DIR}/data/config"
# Fineract's docker image runs as a non-root user (FINERACT_USER/FINERACT_GROUP
# in the upstream image, non-root by default) — bind-mounted host directories
# are otherwise created owned by whoever ran this script (root, on the VM),
# which the container's non-root process can't read. Confirmed via Fineract's
# own docs, which warn about exactly this class of Docker Compose permission
# issue. chmod wide open rather than guessing the container's actual UID,
# since FINERACT_USER/FINERACT_GROUP are configurable, not fixed.
chmod -R 777 "${REPORTING_DIR}/data"

if [ -d "$PLUGIN_SRC_DIR/.git" ]; then
  echo "Plugin source present — checking for updates..."
  git -C "$PLUGIN_SRC_DIR" fetch origin develop --quiet
  BEFORE="$(git -C "$PLUGIN_SRC_DIR" rev-parse HEAD)"
  AFTER="$(git -C "$PLUGIN_SRC_DIR" rev-parse origin/develop)"
  if [ "$BEFORE" = "$AFTER" ] && [ -d "$PLUGIN_LIBS_DIR" ] && [ "$(find "$PLUGIN_LIBS_DIR" -name '*.jar' | wc -l)" -gt 0 ]; then
    echo "No new plugin commits and jars already built — skipping rebuild."
    exit 0
  fi
  git -C "$PLUGIN_SRC_DIR" checkout develop --quiet
  git -C "$PLUGIN_SRC_DIR" reset --hard origin/develop --quiet
else
  echo "Cloning openMF/mifos-reporting-plugin (develop)..."
  git clone --branch develop --quiet https://github.com/openMF/mifos-reporting-plugin.git "$PLUGIN_SRC_DIR"
fi

PLUGIN_COMMIT="$(git -C "$PLUGIN_SRC_DIR" rev-parse --short HEAD)"
echo "Building plugin at commit ${PLUGIN_COMMIT}..."
( cd "$PLUGIN_SRC_DIR" && ./mvnw -q -Dmaven.test.skip=true clean package )

rm -rf "$PLUGIN_LIBS_DIR"
mkdir -p "$PLUGIN_LIBS_DIR"
cp "${PLUGIN_SRC_DIR}"/target/*.jar "$PLUGIN_LIBS_DIR"/ 2>/dev/null || true
[ -d "${PLUGIN_SRC_DIR}/target/lib" ] && cp "${PLUGIN_SRC_DIR}"/target/lib/*.jar "$PLUGIN_LIBS_DIR"/ 2>/dev/null || true

JAR_COUNT="$(find "$PLUGIN_LIBS_DIR" -name '*.jar' | wc -l | tr -d ' ')"
if [ "$JAR_COUNT" = "0" ]; then
  echo "ERROR: no jars produced by plugin build at commit ${PLUGIN_COMMIT}." >&2
  exit 1
fi
echo "Built ${JAR_COUNT} jar(s) at commit ${PLUGIN_COMMIT}."
