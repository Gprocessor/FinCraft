# FinCraft — Consolidated Fineract API Audit

**Status: compiled, not a new bug-fix pass.** This document consolidates every API-layer
finding from the project's audit history (`fixlogs/FIXLOG-api-audit.md`,
`FIXLOG-clients-module.md`, `FIXLOG-groups-centers-reports.md`, `FIXLOG-accounting-audit.md`,
`FIXLOG-users-module.md`, `FIXLOG-bulk-import.md`, `FIXLOG-rate-entity.md`,
`FIXLOG-doc-cross-check.md`, `FIXLOG-duplicate-api-calls.md`) plus the in-code
`FLAGGED`/`NOTE:` comments left throughout `js/api/**` by those passes, into the four
categories requested: **not used**, **used incorrectly**, **partially used**, **wrong
namespace**. It's organized by `js/api/<domain>.js` file, each tagged with its audit
depth so you know how much to trust "clean" vs. "not yet swept."

**Fresh verification done for this document** (not previously logged): every `make*API`
factory imported into `js/api/index.js` is instantiated (no orphaned domain module); every
`api.<namespace>.` call site across `js/pages/**` and `js/ui/**` resolves to a namespace
actually registered on `FineractAPIFull` (no dead/undefined namespace references); a
web-search spot-check of the Fineract self-service module (see Partially Used, `misc.js`).

**Audit depth per file** — "Full" = every method diffed against a source-derived Fineract
route map (`fineract_api_raw.json` and/or `Apache_Fineract_API_Documentation.html`, both used
in earlier sessions but not present in this checkpoint). "Spot-checked" = sampled, no full
per-method diff performed in this pass.

| File | Depth | Fixlog |
|---|---|---|
| `clients.js` | Full | FIXLOG-clients-module.md |
| `groups-centers.js`, `reports.js` | Full | FIXLOG-groups-centers-reports.md |
| `accounting.js` | Full | FIXLOG-accounting-audit.md |
| `admin.js` (users/roles/permissions), `auth-account.js` | Full | FIXLOG-users-module.md |
| `misc.js` (`makeBulkImportsAPI`) | Full | FIXLOG-bulk-import.md |
| `products.js` (`makeRatesAPI`) | Full | FIXLOG-rate-entity.md |
| `loans.js`, `savings-deposits.js`, `shares.js`, rest of `products.js` | Partial — in-code `FLAGGED`/`NOTE` comments only, no dedicated fixlog | inline |
| `organization.js` | Spot-checked | FIXLOG-api-audit.md ("no incorrect routes found") |
| `integrations.js` (SMS/Email/Hooks; notifications/externalEvents are Full) | Mixed | FIXLOG-api-audit.md |
| `misc.js` (self-service section) | Unconfirmable — see below | FIXLOG-api-audit.md backlog |

---

## 1. Not Used (zero frontend surface — Fineract capability with no `js/api/**` wrapper at all)

- **Working Capital Loans** — 9 backend resource classes, ~150 methods. No `js/api/**` file,
  no page.
- **Interoperation API** — entirely unimplemented.
- **Credit Bureau integration** — entirely unimplemented.
- **Interest Rate Charts + slabs** (distinct from the standalone `Rate` entity, which *is*
  implemented as `js/api/products.js#makeRatesAPI`) — entirely unimplemented.
- **Legacy PPI Survey / Likelihood / PovertyLine** feature set — entirely unimplemented.
- **`MixReport`** (`GET /v1/mixreport`) — no frontend surface.
- **`ReportMailingJobApiResource`** / **`ReportMailingJobRunHistoryApiResource`** — no
  frontend surface (scheduled report emailing).
- **Bulk CSV import/export** — the generic mechanism (`js/api/misc.js#makeBulkImportsAPI`:
  `list`/`template`/`upload`/`outputTemplate`/`outputTemplateLocation`) is fully built and
  correct, and wired for the 14 entities in `BULK_IMPORT_ENTITIES`
  (`js/ui/modal-dropdowns.js`). The remaining ~15 importable Fineract resources beyond that
  list have no `downloadtemplate`/`uploadtemplate` UI entry — same generic API would work,
  just needs dropdown entries added.
- **`js/api/groups-centers.js`** — bulk template download/upload for Groups/Centers
  specifically excluded from that module's audit, tracked here instead of duplicated.

## 2. Used Incorrectly (wrong path/method — real bugs; current status noted per item)

All of the following were **found and fixed** in prior checkpoints — listed here because
they're exactly what an "incorrect usage" audit is meant to catch, and the codebase should
stay this way. Spot-check these first if new endpoints are ever added nearby.

| Call site | Was | Fixed to | Fixlog |
|---|---|---|---|
| `reports.js#collectionSheet.get` | `GET /collectionsheet` (no such route) | `POST /collectionsheet` (matches `save()`) | api-audit #1 |
| `integrations.js#notifications.get/markRead` | `GET`/`PUT /notifications/{id}` (no per-ID route) | removed; only bulk `PUT /notifications` (mark-all-read) is real | api-audit #2 |
| `integrations.js#externalEvents.list/get` | `GET /externalevents[/{id}]` (only the internal, non-tenant resource has this) | removed; only `/externalevents/configuration` is real | api-audit #3 |
| `admin.js#configurations.cache/updateCache` | `/configurations/cache` (no route) | removed (dead code); real cache toggle is `caches.cacheTypes/switchCache` → `/v1/caches` | api-audit #4 |
| `loans.js` buy-down-fee allocation | `.../buydown-fees/{txId}/allocation` (extra segment) | `.../buydown-fees/{loanTransactionId}` | api-audit #5 |
| `loans.js` EAO `eaoTransfer`/`eaoBuyBack` | `/loans/{id}/external-asset-owners/transfer\|buy-back` (no route) | `POST /external-asset-owners/transfers/loans/{loanId}` | api-audit #6 |
| `loans.js` delinquency tags | `/delinquency-tags` (hyphenated) | `/delinquencytags` | inline `NOTE` |
| `accounting.js` GL-usage checkbox payload | sent `manualEntries` (not a real field) | corrected field name | FIXLOG-accounting-audit.md |
| `reports.js#runReports` | fired as `GET` | `POST` (Fineract has no GET route for parameterized report runs) | inline `NOTE` |
| `misc.js` (an update call, see inline) | `PUT` | `POST`, per `Fineract_Backend_API_Reference.md` | inline `NOTE` (misc.js:136) |
| `clients.js` client-transition commands | `"withdraw"`/`"undoTransfer"` used as literal commands | corrected to real Fineract command names | FIXLOG-clients-module.md |
| `savings-deposits.js` transactions list | undocumented bare `GET /savingsaccounts/{id}/transactions` | `GET` account with `associations=transactions` | inline `NOTE` |
| `shares.js#approveDividend` | `POST /shareproduct/{id}/dividend/{divId}` (no POST on this sub-path) | `PUT` (confirmed to exist); the `?command=approve` param itself is still unconfirmed | inline `FLAGGED` |
| `js/pages/centers/detail.js` tab lazy-load | referenced `lazyLoaders` without calling it — every non-default tab silently never loaded | called `lazyLoaders[name]()` | FIXLOG-groups-centers-reports.md |
| `js/pages/users/account/detail.js` `renderUserDetail` | fetched `roles.list()`+`permissions.list()` (900+ entries) and never used either | removed both dead fetches | FIXLOG-users-module.md |
| `js/pages/self-service/portal-users.js` "Linked Client" cell | malformed HTML, missing `<a href>` open tag | restored | FIXLOG-users-module.md |

**No currently-open "used incorrectly" items** in the fully-audited files. The two still-open
uncertainties are schema-level, not URL-level, and are listed under Partially Used below
(EAO request-body shape; share-dividend `approve` command).

## 3. Partially Used (resource exists and is called, but only some of its real methods/fields are wired, or the shape is unconfirmed)

- **`integrations.js#notifications`** — only `list()` and bulk `markAllRead()` remain (real
  routes). Per-notification read state has no backend route at all, so the UI's "mark as
  read" per row was removed, not fixed — a genuine Fineract-side gap, not a frontend TODO.
- **`integrations.js#externalEvents`** — only the `/configuration` sub-resource is real and
  wired; the "Recent Events" list UI that called the nonexistent list route was removed
  rather than pointed at a working substitute (none exists).
- **`loans.js` External Asset Owners** — URL now correct (see table above), but the
  request-body shape for sale vs. buy-back (buy-back omits `ownerExternalId`) is
  **unconfirmed** — the source-derived route map has no schema data. `eaoList` is also wired
  to the closest real route (`GET /external-asset-owners/transfers` filtered by `loanId`
  query param) rather than a confirmed per-loan endpoint, since none exists on this resource.
- **`shares.js` dividend approval** — `approveDividend`'s `?command=approve` query param is
  unconfirmed; the parsed resource only shows plain CRUD on that sub-path, no command
  dispatch documented.
- **`groups-centers.js` member-role assignment** — body shapes for
  assign/update/unassign confirmed against real doc examples, but the exact field name for a
  role-assignment's own id inside the `groupRoles` association (`.id` vs `.roleId`, etc.) is
  still not shown by any example — `loadRoles()` reads it defensively across a few plausible
  names rather than one confirmed name.
- **`admin.js#surveysAdmin`** (`SpmApiResource`) — no `template()` and no `delete()`, because
  the resource itself exposes neither a `/surveys/template` route nor a `DELETE` method at
  all (confirmed absence, not an oversight).
- **`admin.js#configurations`** doc-derived fields — the API reference gives no summary text
  or field names for some configuration entries, so rendering is defensive/best-effort in
  places (see inline `NOTE`, admin.js:118).
- **`users/security.js loadPasswordPolicy`** — parses `GET /passwordpreferences` defensively
  across three possible response shapes because `PasswordPreferencesApiResource`'s exact
  contract is missing from both source extracts used historically. **Still open** — needs a
  live server response to close out (flagged in FIXLOG-users-module.md item #4).
- **`misc.js#selfService`** (`/self/userdetails`, `/self/registration*`,
  `/self/beneficiaries/tpt*`) — previously **entirely unconfirmed** (paths absent from the
  route extraction used in past audits). Fresh check this pass: Fineract does have a real
  self-service module (`SelfServiceRegistrationApiResource` under
  `org.apache.fineract.portfolio.self.registration`, confirmed via Fineract's own commit
  history for FINERACT-2283), and it's **disabled by default** on a stock server — so even a
  correctly-implemented call here will 403/404 unless the module is explicitly enabled
  server-side. The exact path shapes used in `misc.js` (`/self/registration`,
  `/self/registration/user`, `/self/registration/resetpassword`,
  `/self/beneficiaries/tpt[/{id}]`) could not be independently reconfirmed against a full
  route list in this pass — still an audit gap, though now with more context than "could not
  verify at all."
- **`js/ui/handlers/user.js` legacy create-user path** — a second, parallel implementation of
  user creation (Cmd+K quick-action) alongside `pages/users/account/detail.js`'s form. Both
  call the correct endpoint; this is a duplication/consolidation note, not an API-correctness
  bug — flagged here since "partially used" can also mean "used redundantly from two call
  sites that could drift."

## 4. Wrong Namespace

**None found and currently open.** Namespace registration was checked two ways this pass:

1. Every `make*API` factory imported into `js/api/index.js` is instantiated exactly once on
   `FineractAPIFull` — no domain module is imported but never wired up.
2. Every `api.<name>.` call site across the entire `js/pages/**` and `js/ui/**` tree resolves
   to a namespace that's actually registered in the constructor — no page calls a namespace
   that doesn't exist (which would be a silent `undefined is not a function` at runtime).

Both checks came back clean. The one **historical** wrong-namespace-shaped bug — Center detail
tabs silently not loading — was actually a lazy-loader call-site bug (`js/pages/centers/detail.js`
referenced its loader map without invoking it), not a namespace registration problem; it's
listed under "Used Incorrectly" above since that's the more accurate category.

Two **intentional** namespace placements worth knowing about so they aren't mistaken for
misplacement if re-audited later (from `js/api/index.js`'s own header comment):
- `js/api/organization.js#makeTellerJournalAPI` → `api.tellerJournal`, backed by
  `/v1/cashiersjournal` — a **top-level** resource, deliberately *not* nested under
  `/tellers/{id}/...` the way the rest of the Tellers API is, per
  `Fineract_Backend_API_Reference.md` §3.2.
- Several single/dual-method namespaces (`runAccruals`, `openingBalances`, `collectionSheet`,
  `permissions`, `externalServices`, `batch`) look sparse next to full-CRUD namespaces like
  `clients` or `loans`, but each maps to one focused UI action by design, not a missed
  namespace consolidation.

---

## What this document does not cover

- **Permissions** (`can('...')` code correctness) — audited separately per-module in the same
  fixlogs referenced above; out of scope for an *API* audit specifically.
- **`organization.js`** and the **SMS/Email/Hooks** portions of `integrations.js` were only
  spot-checked historically, not diffed method-by-method. Given every fully-audited file
  turned out to already carry careful inline correctness notes, a full pass on these two is
  the natural next step if you want the whole `js/api/**` tree at "Full" depth — flagging
  as a recommendation, not a finding.
- Request/response **body schemas** generally — the source-derived route map used historically
  covers URL shape and HTTP method only, not payload fields, which is why several items above
  are flagged "unconfirmed" rather than "wrong."
