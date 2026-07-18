# Fix Log — Bulk Import

**Status: Pass 1 closed the 2 bugs below. Pass 2 (see bottom of this file) implements the
"export" half of the feature that Pass 1 had incorrectly marked as impossible, plus two
more bugs found while doing that.** Together these close the "Bulk CSV import/export ...
missing across ~15 resources" item noted as **not touched** in
`fixlogs/FIXLOG-api-audit.md`'s Backlog section.

Scope (Pass 1): `js/api/misc.js` (`makeBulkImportsAPI`) and
`js/pages/organization/loaders/integrations/imports-sms.js` (`loadBulkImports`), plus
the `bulkImportModal` markup in `views/modals.html` (checked, not touched at the time —
see Pass 2 below, where it *was* touched).

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

## Not touched in Pass 1 — corrected in Pass 2, see below

~~`BulkImportApiResource`'s two other real methods — `getOutputTemplateLocation` and
`downloadOutputTemplate` — are still unused; there's no per-import-row way to fetch or
re-download a *processed* import's output/error report from the UI.~~ **This assumption
was wrong — see Pass 2.**

- The much larger "entire feature is unimplemented" items from `fixlogs/FIXLOG-api-audit.md`'s
  Backlog (Working Capital Loans, Interoperation, Credit Bureau, Interest Rate Charts,
  etc.) are unrelated to this fix and remain untouched.

---
*(fixlogs/FIXLOG-api-audit.md and fixlogs/FIXLOG-users-module.md are unaffected by this pass — different
scope, kept separate; fixlogs/FIXLOG-api-audit.md's Backlog section has a pointer added here.)*

## Pass 2 — "export" side (per-import output report) + two more bugs

**This corrects Pass 1's own "Not touched" claim above.** Pass 1 asserted, without an
external source, that `getOutputTemplateLocation`/`downloadOutputTemplate` "take no
per-import id." That was an unverified assumption, and it was wrong.

**Evidence:** Apache Fineract JIRA **FINERACT-2121** ("Importer error - Postgres syntax
error") documents a live user-reported bug in exactly this code path, and its description
includes the actual SQL involved:

```sql
select d.location, d.file_name from m_import_document i
inner join m_document d on i.document_id = d.id where i.id = ?
```

`i.id` is the individual import job's row id (`m_import_document.id`) — i.e. both methods
*do* take a per-import id (`importDocumentId`), used to look up and stream back the
processed workbook (annotated with per-row success/failure) for that specific job. That's
the "export" half of bulk import/export: template out → fill in → upload → **processed
report back out**. The JIRA report is itself a user trying to use exactly this per-row
download link in production, confirming it's a real, expected UI affordance, not a
theoretical one.

### 3. Import History had no way to retrieve a job's output/error report
**Files:** `js/api/misc.js`, `js/pages/organization/loaders/integrations/imports-sms.js`

**Fix:** Added `api.bulkImports.outputTemplate(importDocumentId)` →
`GET /imports/downloadOutputTemplate?importDocumentId=…` with `raw: true` (same
binary-download pattern as `template()`/`run-report.js`). Added a "Report" button to each
Import History row, wired to it. `getOutputTemplateLocation` was also added to the API
layer for parity/completeness, but deliberately **not** wired to any UI button — it
returns a server-side filesystem path string per the SQL above (`d.location`), which
isn't a fetchable resource from a browser, so no UI action would make sense for it.

Caveat, stated plainly rather than assumed away: the exact JSON field name for an import
row's id in `retrieveImportDocuments`'s response isn't in this project's extracted API
docs (`fineract_api_raw.json`'s method-level extraction doesn't include field-level
response shapes). The code uses `h.id` — the standard Fineract primary-key field name
used everywhere else in this entire API — with `h.importDocumentId`/`h.documentId` as
defensive fallbacks, and only renders the button when one of the three resolves to a
non-null value. **This should be verified against a live Fineract instance's actual
`/v1/imports` response** before relying on it in production; the fallback chain and the
`importId != null` guard mean the worst case if the field name is wrong is simply "no
Report button appears" (fails closed, not a broken button).

### 4. `officeId` collected in the UI but silently dropped on template download
**File:** `js/pages/organization/loaders/integrations/imports-sms.js`

The "Office (filter for some imports)" select was read and appended to the upload
`FormData` correctly, but the *download template* click handler never read it at all —
so the office filter only ever half-worked (affecting uploads, never downloads),
depending on which button you clicked. Many `*/template` GET endpoints across this exact
API accept `officeId` to scope the pre-populated dropdown data embedded in the sheet
(`clients/template`, `groups/template`, `centers/template`, etc., per the Fineract API
docs); `template()` now forwards an optional `params` object, and the download handler
passes `officeId` through when set. Fineract silently ignores unrecognized query params,
so this is safe even on resources where `officeId` isn't actually a supported filter.

### 5. Generic `bulkImportModal` (views/modals.html) had a *third*, further-out-of-sync entity list, and its own office select was completely dead
**Files:** `views/modals.html`, `js/ui/handlers/bulk-import.js`, `js/ui/modal-dropdowns.js`,
`js/bulk-import-entities.js` (new)

Pass 1 checked this modal and found its 5 hardcoded options were all individually valid,
and left it alone. But "individually valid" isn't the same as "in sync" — this was a
*second*, independently-maintained copy of the entity list (in addition to the one this
fixlog already fixed once in Pass 1), offering only 5 of the 14 real entities, with no
way to know that more existed. This is exactly the kind of drift Pass 1's bug #1 was
about, just not caught yet in this second copy.

Additionally, its Office `<select>` was populated (via `data-populate="offices"`, same
mechanism as everywhere else) but had **no `name` attribute**, so
`js/ui/handlers/bulk-import.js`'s submit handler had no way to read it even if it wanted
to — the office filter appeared present in the UI but could never have been sent, on
either upload or download (there was no download button here at all).

**Fix:**
- Extracted the entity list to a new shared module, `js/bulk-import-entities.js`, and
  made both this modal and the Organization tab loader read from it, so there is now
  exactly one list to keep in sync, not two (or three).
- Populated via the existing `data-populate` mechanism (`js/ui/modal-dropdowns.js`), no
  network call needed since it's a static constant.
- Added `name="officeId"` to the office select and `name="entity"` to the entity select
  (the modal's own `submit-import` handler already expected `[name="entity"]`).
- Added a "Download Template" button + `download-import-template` handler (this modal
  previously supported upload only — no way to see the expected file shape first).
- Fixed `submit-import` to actually append `officeId` to the upload `FormData` now that
  the field can be read.

## Verified clean in Pass 2 (no changes needed)

- `js/ui/handlers/run-report.js` — the app's other "export" surface (report
  CSV/XLS/PDF download via `runreports?output-type=…`) already follows the correct
  `raw: true` + `res.blob()` pattern from Pass 1; not touched.
- `node --check` on every file touched in this pass: 0 failures.

## Not touched in Pass 2 (still open, tracked in Backlog)

- The larger "entire feature is unimplemented" Backlog items in
  `fixlogs/FIXLOG-api-audit.md` remain unrelated and untouched.
- The exact response field name for an import row's id (see bug #3 caveat above) — flagged
  for verification against a live server rather than assumed.
