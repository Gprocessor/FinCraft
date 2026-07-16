# Fix Log — Full API Audit Pass

**Status: closed for the 6 confirmed bugs below.** This pass followed a full-codebase audit
(every `self._g/_p/_u/_d()` call in `js/api/**` diffed programmatically against every
method+path in `fineract_api_raw.json`, ~940 unique backend routes vs. 764 frontend calls),
then manually verified the highest-signal mismatches — calls that hit a URL with no backend
route at all — against actual call sites to separate live bugs from dead code, and against
Fineract source (PR history) where the raw JSON extraction looked incomplete.

Scope: `js/api/reports.js` (`makeCollectionSheetAPI`), `js/api/integrations.js`
(`makeNotificationsAPI`, `makeExternalEventsAPI`), `js/api/admin.js`
(`makeConfigurationsAPI`), `js/api/loans.js` (buy-down-fee + external-asset-owner helpers),
and the four page files that call them.

This pass did **not** attempt the module-level gaps identified in the same audit (Working
Capital Loans, Interoperation, Credit Bureau, Interest Rate Charts, bulk CSV import/export,
etc.) — those are net-new features, not bugs, and are tracked separately in the Backlog.

## Bugs found & fixed

### 1. Collection Sheet "Load Sheet" called a nonexistent GET route
**Files:** `js/api/reports.js` → `makeCollectionSheetAPI`, called from `js/pages/collections.js`

`CollectionSheetApiResource` exposes exactly one method — `POST /v1/collectionsheet`
(`generateCollectionSheet`), with `saveCollectionSheet` dispatched off the same endpoint via
`?command=`. `collectionSheet.get(params)` was sending a **GET**, which Fineract has no route
for. This is called directly from the "Load Sheet" button on the Collections page — the
feature could never have worked as shipped.

**Fix:** changed `get()` to `self._p('/collectionsheet', {}, { params })` — same query params
(officeId/staffId/meetingDate/etc.), now sent as a POST with an empty JSON body, matching how
`save()` right next to it already does it correctly. No caller-side changes needed.

### 2. Per-notification "mark as read" hit a nonexistent per-ID route
**Files:** `js/api/integrations.js` → `makeNotificationsAPI`, called from
`js/pages/notifications/feed.js`

`NotificationApiResource` (confirmed against the original PR that introduced the class, since
Fineract docs don't cover it) exposes exactly two routes: `GET /notifications` (list) and
`PUT /notifications` (bulk mark-all-read via `{ isRead: true }`). There is no per-notification
GET or PUT sub-path. `get(id)` and `markRead(id)` both called `/notifications/${id}`, which
doesn't exist. `markRead(id)` is wired live to the notification feed's per-row "mark as read"
button — that button has never actually worked.

**Fix:** this is a genuine capability gap on Fineract's side, not a URL typo — there's nothing
to redirect the call to. Removed `get()` and `markRead()` from the API layer, removed the
per-row "mark as read" button and its click handler from `feed.js`, and left the working
"Mark all read" bulk action (`markAllRead()` → `PUT /notifications`) in place. If per-item read
state is wanted later, it needs a Fineract-side change first — noted inline at both call sites.

### 3. External Events "Recent Events" list called a nonexistent route
**Files:** `js/api/integrations.js` → `makeExternalEventsAPI`, called from
`js/pages/system/loaders/integrations.js`

Only `/v1/externalevents/configuration` (`ExternalEventConfigurationApiResource`) is a real,
tenant-facing route under this name. `list(params)`/`get(id)` called `GET /externalevents` and
`GET /externalevents/{id}` — the only other resource with that prefix is
`/v1/internal/externalevents` (`InternalExternalEventsApiResource`), which is an
internal/system endpoint, not part of the public tenant API. `list()` was called live (wrapped
in `Promise.allSettled`, so it failed silently every time) to populate the "Recent Events (last
50)" table on the External Events settings page — that section has always rendered empty.

**Fix:** removed `list()`/`get()` from the API layer. Removed the "Recent Events" table and its
now-dead data wiring from the settings page, keeping the working event-configuration
toggle/save section intact. Dropped the now-unused `fmtDate` import from that file.

### 4. Dead cache toggle hit a nonexistent route (unused, but broken)
**Files:** `js/api/admin.js` → `makeConfigurationsAPI`

`cache()`/`updateCache()` called `/configurations/cache`, which
`GlobalConfigurationApiResource` has no route for. The real cache-toggle endpoint is
`/v1/caches` (`CacheApiResource`, GET/PUT) — already correctly implemented two lines below as
`cacheTypes()`/`switchCache()`, which is what `js/pages/system/loaders/info.js` actually calls.
Confirmed via grep that nothing in the codebase called `cache()`/`updateCache()`.

**Fix:** removed the dead/broken pair rather than leave unused code pointing at a route that
doesn't exist.

### 5. Buy-down-fee allocation endpoint had an extra path segment
**Files:** `js/api/loans.js` → `buyDownFeeAllocation`

Called `/loans/{id}/buydown-fees/{txId}/allocation`. The real route (per
`LoanBuyDownFeeApiResource`) is `GET {loanId}/buydown-fees/{loanTransactionId}` — no
`/allocation` suffix. Confirmed via grep that this method isn't called anywhere in the UI yet
(dead code), so no live impact — fixed the path anyway since it's a one-line correction and the
next thing to use it would otherwise inherit the bug silently.

**Fix:** dropped the trailing `/allocation` segment.

### 6. External Asset Owner sale/buy-back used a URL with no matching route
**Files:** `js/api/loans.js` (`eaoList`/`eaoTransfer`/`eaoBuyBack`), called from
`js/pages/loans/actions/collateral-guarantors.js` and
`js/pages/loans/detail/collateral-guarantors.js`

This one was already honestly flagged in a prior session (`<!-- FLAGGED, NOT ASSUMED -->` in
`collateral-guarantors.js`) as calling `/loans/{id}/external-asset-owners/transfer|buy-back`,
which doesn't match anything on `ExternalAssetOwnersApiResource`, with the URL shape left
unconfirmed pending a source-derived API map. That map is now available
(`fineract_api_raw.json`): the only loan-scoped route on that resource is
`POST /external-asset-owners/transfers/loans/{loanId}` (`transferRequestWithLoanId`) — no
separate buy-back sub-path exists at all.

**Fix:** pointed both `eaoTransfer` and `eaoBuyBack` at the confirmed real path
(`/external-asset-owners/transfers/loans/{loanId}`); the UI already prepares distinct request
bodies for sale vs. buy-back (buy-back omits `ownerExternalId`), which is left as-is since
that's presumably how Fineract distinguishes the two — **not confirmed**, since the raw API map
has no request-body schemas. `eaoList` has no per-loan equivalent on this resource at all; wired
it to the closest real route, the global `GET /external-asset-owners/transfers`, filtered by a
`loanId` query param — **also not confirmed**, since that method's `query_params` are empty in
the extraction. Updated the inline flag comment to reflect what's now fixed (the URL) vs. what's
still open (body/query-param shape) rather than removing the flag outright.

## Verified clean (no changes needed)

- Full syntax sweep (`node --check`) across every `.js` file in the repo: 0 failures.
- `npm test`: 3/3 suites pass (`business-logic.test.js`, `module-integrity.test.js` — 893
  exported functions across 295 files, `utils.test.js`).
- Permission-code sweep on all 8 touched files (regex for `can('ALL_CAPS')`, cross-referenced
  against `fineract_permissions_raw.json`): 0 unverified codes.
- Grepped for stray references to every removed method
  (`notifications.get(`, `notifications.markRead(`, `externalEvents.list(`,
  `externalEvents.get(`, `configurations.cache(`, `configurations.updateCache(`) across the
  whole codebase: none found outside this fix's own comments.
- `js/api/loans.js` `capitalizedIncomes(id)` (the sibling of the buy-down-fee helper fixed in
  #5) — already correct, matches `fetchCapitalizedIncomeDetails`'s real path.
- Teller/Cashier (`js/api/organization.js`), SMS/Email campaigns, Hooks, Jobs, and Reports API
  layers — spot-checked during the audit, no incorrect routes found.

## 7. Standalone `Rate` entity — moved to its own fix log
Was listed below under "Not touched in this pass" as entirely unimplemented; now built. See
`fixlogs/FIXLOG-rate-entity.md` for the full writeup — kept separate rather than appended here,
same reasoning as the Bulk Import split below (a distinct, self-contained feature addition
rather than a bug fix within this pass's scope).

## 8. Provisioning Category — closed, see accounting audit
Also listed below as entirely unimplemented; now built as part of a full accounting-module
audit. See `fixlogs/FIXLOG-accounting-audit.md`, which also fixed three real payload/field-name
bugs in the existing GL Account and Accounting Rule flows found during the same pass.

## 9. Checkpoint 13–15 — closed several previously-open items from other fixlogs
- Password policy loader (`js/pages/users/security.js`) — see `fixlogs/FIXLOG-doc-cross-check.md`.
- Deployment `teardown.sh` cron cleanup + `docker-compose.birt.yml` doc drift — see
  `fixlogs/FIXLOG-deployment-review.md`.
- Duplicate payment-type/reschedule-reason fetches (`js/modal-init.js`) and duplicate
  active-loan sampling (`js/pages/dashboard.js`) — see `fixlogs/FIXLOG-duplicate-api-calls.md`.

## Not touched in this pass (tracked in Backlog from the audit, not bugs)

- Entire Working Capital Loan product line (9 backend resource classes, ~150 methods) has zero
  frontend surface.
- Interoperation, Credit Bureau integration, Interest Rate Charts (+ slabs), and the legacy PPI
  Survey/Likelihood/PovertyLine feature set are all entirely unimplemented. (The standalone
  `Rate` entity and Provisioning Category that used to be listed here are now implemented — see
  `fixlogs/FIXLOG-rate-entity.md` and `fixlogs/FIXLOG-accounting-audit.md` respectively.)
- Bulk CSV import/export (`downloadtemplate`/`uploadtemplate`) is missing across ~15 resources
  — a coherent cross-cutting feature, not a per-module gap. **Update:** the piece of this that
  *was* implemented (the Organization → Bulk Imports tab) turned out to be broken rather than
  missing — see `fixlogs/FIXLOG-bulk-import.md` for the two bugs found and fixed there. The remaining
  ~15-resource gap this note originally referred to is still open.
- `js/api/misc.js` self-service helpers (`/self/userdetails`, `/self/registration*`,
  `/self/beneficiaries/tpt*`, `/cob-configurations`, `/loans/catch-up-processing`) reference
  paths not present anywhere in the supplied `fineract_api_raw.json` under any resource — could
  not verify these one way or the other since the self-service API resources weren't captured
  in the extraction at all. Left untouched per policy (don't guess where extraction data is
  incomplete) — needs a targeted re-extraction of Fineract's self-service API resources before
  this can be audited.

---
*(existing fixlogs/FIXLOG-users-module.md is unaffected by this pass — different scope, kept separate.)*
