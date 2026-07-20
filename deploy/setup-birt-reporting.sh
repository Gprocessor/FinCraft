#!/usr/bin/env bash
# FinCraft · deploy/setup-birt-reporting.sh
#
# Sets up Eclipse BIRT-based reporting for Fineract via openMF/mifos-reporting-plugin
# (this replaced the older Pentaho-based plugin — see the README at
# https://github.com/openMF/mifos-reporting-plugin for the current state).
#
# WHAT THIS SCRIPT DOES:
#   1. Builds the plugin jar via build-birt-plugin.sh (same script the
#      auto-deploy watcher calls when ENABLE_BIRT_REPORTING=true)
#   2. Builds a custom Fineract image (deploy/reporting/Dockerfile.fineract-birt)
#      that layers those jars onto FINERACT_IMAGE via Fineract's own
#      plugin-jar mechanism (-Dloader.path=libs/)
#   3. Prints a throwaway docker-run smoke test so you can confirm a real
#      report renders BEFORE flipping ENABLE_BIRT_REPORTING=true in .env
#
# WHAT THIS SCRIPT DELIBERATELY DOES NOT DO, AND WHY:
#   - It does NOT flip ENABLE_BIRT_REPORTING on for you, and does not touch
#     your running fineract-server. The auto-deploy overlay
#     (docker-compose.birt.yml) and watcher wiring already exist — see
#     .env.example — but stay inert until you deliberately set that flag
#     AFTER the smoke test below passes. Same "isolate, verify, then flip
#     on" pattern as deploy/oauth-test/.
#   - It does NOT change the "Pentaho" report-type option in
#     js/pages/reports/manage-reports.js. The plugin's registered
#     ReportingProcessService type string is NOT confirmed (see the
#     printed warning at the end) — changing that dropdown before
#     confirming the actual type string risks breaking existing Pentaho-
#     labeled reports without fixing anything.
#
# REAL, UNRESOLVED RISK — read before running in anything but a throwaway
# test rig: the plugin's own README currently lists its Fineract-version
# compatibility table as "TBD | TBD | TBD". There is no published pinned
# pairing of plugin version <-> Fineract version. This script builds the
# plugin against its own `develop` branch (the only branch the plugin's
# docs claim to test against), matched with whatever FINERACT_IMAGE your
# .env already points at. That may not actually be a compatible pairing —
# only the smoke test at the end of this script tells you for sure.
#
# Usage: ./setup-birt-reporting.sh
set -euo pipefail
cd "$(dirname "$0")"

REPORTING_DIR="reporting"
PLUGIN_LIBS_DIR="${REPORTING_DIR}/plugin-libs"
REPORTS_DIR="${REPORTING_DIR}/data/reports"
FONTS_DIR="${REPORTING_DIR}/data/fonts"
CONFIG_DIR="${REPORTING_DIR}/data/config"

# --- 1-3. Download the prebuilt jar + report/font/config files from this
# repo's GitHub Release — shared with the auto-deploy watcher's
# non-interactive path, see build-birt-plugin.sh. The plugin is no longer
# built here or on the VM at all (see .github/workflows/build-birt-plugin.yml);
# this just fetches what that workflow already produced.
./build-birt-plugin.sh
PLUGIN_COMMIT="unknown"
if [ -f "${REPORTING_DIR}/PLUGIN_COMMIT.txt" ]; then
  PLUGIN_COMMIT="$(grep -m1 '^commit:' "${REPORTING_DIR}/PLUGIN_COMMIT.txt" | awk '{print $2}')"
fi
BASE_IMAGE="${FINERACT_IMAGE:-apache/fineract:latest}"
echo "Building fincraft-fineract-birt from base image: ${BASE_IMAGE}"
docker build \
  -f "${REPORTING_DIR}/Dockerfile.fineract-birt" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  -t fincraft-fineract-birt \
  "$REPORTING_DIR"

cat <<NEXT_STEPS

==================================================================
 Image built: fincraft-fineract-birt (base: ${BASE_IMAGE}, plugin: ${PLUGIN_COMMIT})
==================================================================

This built the image but has NOT flipped ENABLE_BIRT_REPORTING on — your
auto-deploy watcher and live stack are untouched. Test in isolation first:

1. build-birt-plugin.sh (run above) already fetched the plugin's own
   .rptdesign reports and fonts into:
     ${REPORTS_DIR}/
     ${FONTS_DIR}/
   from its GitHub Release — no manual copying needed. Drop in any
   additional custom reports/fonts here too if you have them.

2. Bring up a throwaway container using the new image, pointed at
   your existing fineract-net / db, e.g.:

   docker run --rm --network fineract-net \\
     -e FINERACT_HIKARI_JDBC_URL=jdbc:postgresql://db:5432/fineract_tenants \\
     -e FINERACT_HIKARI_USERNAME=fineract_app \\
     -e FINERACT_HIKARI_PASSWORD=\$FINERACT_DB_PASSWORD \\
     -e MIFOS_BIRT_REPORTS_LOCALE=en \\
     -e MIFOS_BIRT_REPORTS_PATH=/app/birt/reports \\
     -e MIFOS_BIRT_REPORTS_FONTS_PATH=/app/birt/fonts \\
     -e MIFOS_BIRT_REPORTS_FONTS_CONFIG_PATH=/app/birt/config \\
     -v "\$(pwd)/${REPORTS_DIR}:/app/birt/reports" \\
     -v "\$(pwd)/${FONTS_DIR}:/app/birt/fonts" \\
     -v "\$(pwd)/${CONFIG_DIR}:/app/birt/config" \\
     -p 18444:8443 \\
     fincraft-fineract-birt

3. Smoke-test against a real report name (adjust the report name and
   parameters — this exact call is from the plugin's own README, not
   guaranteed to match a report you actually have registered):

   curl -k -s "https://localhost:18444/fineract-provider/api/v1/runreports/<Report%20Name>?tenantIdentifier=default&locale=en&output-type=PDF" \\
     -H 'Fineract-Platform-TenantId: default' \\
     -H "Authorization: Basic \$(echo -n mifos:password | base64)"

   A real PDF back = the plugin loaded correctly against this Fineract
   version. An error mentioning "ReportingProcessServiceProvider" or
   "no ReportingProcessService registered" = version mismatch or the
   plugin didn't load — check container logs before debugging further.

==================================================================
 STILL UNCONFIRMED — do not skip before using this in production:
==================================================================
 - Plugin <-> Fineract version compatibility (plugin README lists this
   as "TBD" as of this writing).
 - Whether this plugin registers report type "BIRT", "Pentaho", or
   something else in Fineract's ReportingProcessServiceProvider — this
   determines whether js/pages/reports/manage-reports.js's "Pentaho"
   dropdown option still works as-is, needs renaming, or needs a new
   option added alongside it. Check the plugin's registration source
   (search for @Service / ReportingProcessService in
   ${REPORTING_DIR}/mifos-reporting-plugin/src) once the build above
   completes, or just try registering a test report with each type
   string via the smoke test above.

(Fixed, not just flagged: the mounted report/font/config directories are
made world-readable by build-birt-plugin.sh, since Fineract's image runs
as a non-root, configurable FINERACT_USER/FINERACT_GROUP that otherwise
can't read root-owned bind mounts.)

Once the smoke test above passes, set ENABLE_BIRT_REPORTING=true in .env —
the auto-deploy watcher will then build this plugin and layer
docker-compose.birt.yml in automatically on the next deploy. To apply it
immediately instead of waiting for the next git push:
  docker compose -f docker-compose.yml -f docker-compose.birt.yml up -d --build
NEXT_STEPS
