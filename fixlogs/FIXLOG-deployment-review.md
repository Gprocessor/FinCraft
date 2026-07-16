# Fix Log — Deployment System Review (`deploy/` + frontend-serving config)

**Status: findings pass complete; bugs #1 and #2 are now fixed (Checkpoint 14 below). #3 and #4
remain informational/dead-code notes, no action needed.** Requested check: "run a check on the
deployment system... is anything wrong... especially for fincraft-ui." Covers every file in
`deploy/` plus the frontend-facing pieces that ship alongside it (`docker-compose.yml`'s
`fincraft-ui` service, `nginx-fincraft.conf`, `service-worker.js`, `manifest.json`, `index.html`).

## Fixed (Checkpoint 14)

### 1. `deploy/teardown.sh` doesn't clean up the `daily-report.sh` cron entry

`setup-vm.sh`'s step 12 installs four cron jobs:

```bash
echo "0 2 * * * $DEPLOY_DIR/backup.sh"       >> "$CRON_TMP"
echo "*/5 * * * * $DEPLOY_DIR/monitor.sh"    >> "$CRON_TMP"
echo "0 3 * * * $DEPLOY_DIR/renew-cert.sh"   >> "$CRON_TMP"
echo "0 7 * * * $DEPLOY_DIR/daily-report.sh" >> "$CRON_TMP"
```

`teardown.sh`'s cleanup only strips three of them:

```bash
( crontab -l 2>/dev/null | grep -v "$D/backup.sh" | grep -v "$D/monitor.sh" | grep -v "$D/renew-cert.sh" ) | crontab -
```

`daily-report.sh` is missing from that filter — looks like it was added to `setup-vm.sh` after
`teardown.sh` was last touched, and the two drifted. After a teardown, the daily digest cron job
keeps firing every morning against a stack whose containers no longer exist (email digest of
`docker logs` for containers that error out / are gone, indefinitely, until someone notices or
manually edits crontab).

**Suggested fix:** add `| grep -v "$D/daily-report.sh"` to the same pipeline in `teardown.sh`.

**Fix applied:** exactly that — added `| grep -v "$D/daily-report.sh"` to the same
`crontab -l | grep -v ... | crontab -` pipeline in `teardown.sh`, alongside the three existing
filters.

## Documentation drift (not functionally broken, but misleading) — fixed (Checkpoint 14)

### 2. `deploy/docker-compose.birt.yml`'s header comment contradicts `deploy/.env.example`'s actual default

`docker-compose.birt.yml` says:
> "NOT applied by default — only merged in by fincraft-autoupdate.sh when
> ENABLE_BIRT_REPORTING=true is set in .env (see .env.example for why it's off by default:
> unconfirmed plugin<->Fineract version compatibility)."

But `.env.example` actually ships `ENABLE_BIRT_REPORTING=true`, and its own comment says the
opposite: *"ON by default so reporting comes up as part of the normal deploy."* Actual runtime
behavior follows `.env.example`'s `true` (that's what's copied into `.env` on a fresh deploy), so
this is stale documentation rather than a functional bug — but anyone reading
`docker-compose.birt.yml` in isolation would wrongly conclude BIRT is opt-in.

**Suggested fix:** update the comment in `docker-compose.birt.yml` to match — reporting is on by
default, not off, with the Fineract-version-compatibility caveat as the reason it's easy to
disable rather than the reason it starts disabled.

**Fix applied:** rewrote the header comment in `docker-compose.birt.yml` to say BIRT is ON by
default (matching `.env.example`'s shipped `ENABLE_BIRT_REPORTING=true`), reframing the
version-compatibility "TBD" caveat as the reason it's easy to turn off rather than the reason it
starts off.

## Minor — dead but harmless

### 3. CSP `frame-ancestors 'none'` in `index.html`'s `<meta>` tag has no effect

Per spec, `frame-ancestors` (like `sandbox`) is ignored when set via
`<meta http-equiv="Content-Security-Policy">` — it's only honored as a real HTTP response header.
No actual clickjacking exposure exists here since `nginx-fincraft.conf` separately sends
`X-Frame-Options: SAMEORIGIN` as a true header (which does work), but the `frame-ancestors`
directive in the meta tag itself is inert. Cosmetic/documentation-accuracy issue only.

### 4. `404.html` + `js/spa-404-redirect.js` / `js/spa-redirect.js` are inert in this deployment

This pair implements the classic GitHub-Pages SPA-fallback trick (store the requested path in
`sessionStorage`, redirect to `index.html`, restore the path via `history.replaceState`). It's
wired up correctly and does no harm, but it never actually fires here: the app is entirely
hash-routed (`location.hash = ...`, confirmed across `router.js` and every page module), and
`nginx-fincraft.conf` already does server-side `try_files $uri $uri/ /index.html` — there's no
path-based deep link this mechanism would ever need to catch. Dead weight carried over from
before/alongside the GitHub Pages deployment target, not a bug.

## Verified clean (no changes needed)

- `docker-compose.yml`'s `fincraft-ui` service: every bind-mounted path (`index.html`, `404.html`,
  `favicon.svg`, `manifest.json`, `robots.txt`, `service-worker.js`, `css/`, `js/`, `views/`)
  confirmed to exist at the repo root.
- The two already-fixed races documented inline in `docker-compose.yml` — Fineract's
  `start_period: 600s` healthcheck (was cascading into `fincraft-ui` never starting on a slow
  first-boot migration) and the `127.0.0.1` vs `localhost`/IPv6 healthcheck fix — both still
  correct as committed.
- `nginx-fincraft.conf`: `/healthz` on both the :80 and :443 server blocks, `/fineract/` proxy
  path matches the `apiBase: '/fineract/fineract-provider/api/v1'` the frontend is configured
  with, static-asset caching vs. `no-cache` on `/` correctly split.
- `regen-frontend-config.sh`: `TENANT_MAP` generation, `DEFAULT_TENANT_IDENTIFIER` fallback, and
  the `--reload` flag all consistent with how `redeploy.sh`, `add-tenant.sh`, and the
  auto-update watcher (`setup-vm.sh` step 11) each call it.
- `check-deployment.sh`: the `<title>FinCraft` and `js/app.js` checks both match real files;
  `grep -q "auto-generated by regen-frontend-config.sh"` matches the header
  `regen-frontend-config.sh` actually writes.
- `add-tenant.sh`, `renew-cert.sh`, `monitor.sh`, `daily-report.sh`: container name
  (`fincraft-ui`) spelled consistently everywhere, no typos found.
- `service-worker.js`: network-first fetch strategy (already fixed in a prior pass per its own
  inline comment), correctly excludes `/fineract-provider/` (API calls) from caching regardless
  of the `/fineract/` proxy prefix.
- `manifest.json`: `favicon.svg` reference resolves correctly.
