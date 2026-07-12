# Fix Log — Bulk Import

**Status: closed for the 2 confirmed bugs below.** This closes part of the "Bulk CSV
import/export ... missing across ~15 resources" item noted as **not touched** in
`fixlogs/FIXLOG-api-audit.md`'s Backlog section — that note flagged the feature as largely
unimplemented; this pass covers the piece of it that *was* implemented (Organization →
Bulk Imports tab) and was silently broken.

Scope: `js/api/misc.js` (`makeBulkImportsAPI`) and
`js/pages/organization/loaders/integrations/imports-sms.js` (`loadBulkImports`), plus
the `bulkImportModal` markup in `views/modals.html` (checked, not touched — see below).

Method: every entity code in the "New Import" dropdown was cross-checked against
`fineract_api_raw.json` for a matching `downloadtemplate`/`uploadtemplate` route on the
resource's `class_path`; the download code path was traced against `js/api/core.js`'s
`_req()` response handling and compared to every other binary-download call site in the
app (`js/ui/handlers/run-report.js`, `js/pages/*/detail/notes-docs.js`, etc.) to confirm
the correct pattern.

## Bugs found & fixed

### 1. Four entity codes in the import dropdown didn't match any real Fineract resource
**File:** `js/pages/organization/loaders/integrations/imports-sms.js` → `loadBulkImports`

`api.bulkImports.template()`/`.upload()` build the request URL as
`/${entity}/downloadtemplate` / `/${entity}/uploadtemplate`, so `entity` has to be an
exact, real resource path segment. Four of the fourteen options weren't:

- `loanrepayments` — no such top-level resource; the real route is nested under
  `LoansApiResource` at `repayments/downloadtemplate`.
- `savingstransactions` — same issue, nested under `SavingsAccountsApiResource` at
  `transactions/downloadtemplate`.
- `chartofaccounts` — `GLAccountsApiResource`'s actual `class_path` is `/v1/glaccounts`;
  `chartofaccounts` doesn't exist as a route.
- `shareaccounts` — no template/upload endpoint exists for share accounts anywhere in
  the extracted API map at all (only `ShareDividendApiResource`, an unrelated resource
  under `/v1/shareproduct/{productId}/dividend`). Selecting this option could never have
  worked.

Every one of these would 404 the instant a user picked that option and tried to
download or upload.

**Fix:** corrected the three nested-path entities to their real values
(`loans/repayments`, `savingsaccounts/transactions`, `glaccounts`), removed
`shareaccounts` entirely since no backend route backs it, and added `users` (a real,
previously-missing `downloadtemplate`/`uploadtemplate` pair on `UsersApiResource`) plus
the fixed-deposit/recurring-deposit *transaction* template variants for parity with
savings. `bulkImportModal` in `views/modals.html` (the other, smaller entry point to the
same upload flow) was checked and already used only valid top-level entity codes
(`clients`, `loans`, `savingsaccounts`, `groups`, `centers`) — left unchanged.

Because entity values can now contain a `/` (e.g. `loans/repayments`), the download
handler's `a.download` filename construction was also patched to replace `/` with `-` so
the browser doesn't misread it as a path separator.

### 2. Template download corrupted the binary `.xlsx` file
**Files:** `js/api/misc.js` → `makeBulkImportsAPI.template()`;
`js/pages/organization/loaders/integrations/imports-sms.js` → download click handler

`/{entity}/downloadtemplate` streams back a binary Excel workbook, not JSON. `template()`
called the ordinary `self._g(...)` path, and `core.js`'s `_req()` only special-cases
`content-type: application/json` (→ `r.json()`) — everything else, including the binary
`application/vnd.ms-excel` response here, falls through to `r.text()`, which decodes the
raw workbook bytes as UTF-8 and corrupts them. The loader then wrapped that
already-mangled string in a `new Blob([res])` as a fallback path, producing a `.xlsx`
file that's either broken/unopenable or throws outright depending on the exact bytes
involved — this was the reported "error when trying to download."

Every other binary download in the app avoids this by requesting the raw `fetch`
`Response` (`{ raw: true }`) and calling `res.blob()` on it directly — see
`js/ui/handlers/run-report.js`, `js/pages/loans/detail/notes-docs.js`, and others. The
bulk-import template call was the one place that didn't follow that pattern.

**Fix:** `template()` now calls `self._req('GET', ..., { raw: true })` instead of
`self._g(...)`. The download handler was simplified to match the established pattern —
`const blob = await res.blob()` — replacing the old speculative
`typeof res === 'string' ? window.open(...) : new Blob([res])` branching, which was
guessing at a response shape Fineract never actually returns for this endpoint.

## Verified clean (no changes needed)

- `bulkImports.upload()` (`POST /{entity}/uploadtemplate`) — already correctly built
  without `raw: true`; Fineract's upload response is a normal JSON import-status object,
  not binary, so the default `_req()` JSON handling is correct here. Not touched.
- `bulkImports.list()` (`GET /imports`) — matches `BulkImportApiResource#retrieveImportDocuments`
  exactly, already correct.
- Grepped for every other caller of `api.bulkImports.*` across the codebase
  (`js/ui/handlers/bulk-import.js`, the loader itself): no other call site needed
  updating.
- `node --check` across all 300 `.js` files in the repo after the fix: 0 failures.
- Diffed the fixed zip against the pre-fix checkpoint: only `js/api/misc.js` and
  `js/pages/organization/loaders/integrations/imports-sms.js` changed — no unintended
  edits elsewhere.

## Not touched in this pass (still open, tracked in Backlog)

- `BulkImportApiResource`'s two other real methods — `getOutputTemplateLocation` and
  `downloadOutputTemplate` — are still unused; there's no per-import-row way to fetch or
  re-download a *processed* import's output/error report from the UI. The Import History
  table already notes inline (in code comments) that there's no per-row GET/DELETE on
  this resource to build such buttons from.
- The much larger "entire feature is unimplemented" items from `fixlogs/FIXLOG-api-audit.md`'s
  Backlog (Working Capital Loans, Interoperation, Credit Bureau, Interest Rate Charts,
  etc.) are unrelated to this fix and remain untouched.

---
*(fixlogs/FIXLOG-api-audit.md and fixlogs/FIXLOG-users-module.md are unaffected by this pass — different
scope, kept separate; fixlogs/FIXLOG-api-audit.md's Backlog section has a pointer added here.)*
