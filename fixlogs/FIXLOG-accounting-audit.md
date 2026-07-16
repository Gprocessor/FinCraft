# Fix Log — Accounting Module Audit

**Status: closed for the items below.** Requested scope: "fix all APIs, namespace and
permission yet to be completed, wrongly used or not used in the accounting module — check
everything that has to do with accounting." Covers `js/api/accounting.js`, all of
`js/pages/accounting/**` (index/shared/actions/loaders), and the two accounting-related
command-palette handlers, `js/ui/handlers/gl-account.js` and `js/ui/handlers/accounting-rule.js`.

This also closes the Provisioning Category item tracked as backlog in
`fixlogs/FIXLOG-api-audit.md` (see its item #8) — kept as a single combined log since bug
fixes and the gap-closure were found and fixed together in one pass over the same module,
unlike the Rate-entity split which was a standalone feature addition.

## Bugs found and fixed

### 1. GL Account: `manualEntriesAllowed` field name
`pages/accounting/actions/coa.js`'s "Add GL Account" flow (Chart of Accounts tab) sends the
correct Fineract field, `manualEntriesAllowed`. A second, independent create/update path
reachable from the command palette (`ui/handlers/gl-account.js`, wired to
`views/modals.html#glAccountModal`) sent `manualEntries` instead — not a real Fineract field,
so the API silently ignored it and the checkbox had no effect on accounts created that way.

**Fix:** map the form's `manualEntries` value onto the correct `manualEntriesAllowed` payload
key in `ui/handlers/gl-account.js`. No HTML changes needed — only the payload construction was
wrong.

### 2. GL Account: usage-code fallback reversed
`openGLAccountModal` (`actions/coa.js`) falls back to a hardcoded usage-options list if
`GET /glaccounts/template` fails. That fallback was `{id:1,value:'HEADER'}, {id:2,value:'DETAIL'}`
— backwards from Fineract's real `GLAccountUsage` enum (1=DETAIL, 2=HEADER), which
`views/modals.html`'s static command-palette version of the same form had correct.

**Fix:** swapped the fallback to `{id:1,value:'DETAIL'}, {id:2,value:'HEADER'}`.

### 3. Accounting Rule: payload shape (verified against source, not guessed)
Same duplicate-implementation pattern as bug #1: `actions/coa.js`'s `openAccountingRuleModal`
sent `debitAccounts: [{ glAccountId }]` / `creditAccounts: [{ glAccountId }]`, while
`ui/handlers/accounting-rule.js` sent singular `debitAccountId`/`creditAccountId`. The two
disagreed on wire format, so at least one was wrong — this wasn't safe to leave as an
unverified guess, so it was checked against source before touching either side.

Web-searched Fineract's `GET /accountingrules/{id}` response shape to settle it:
`debitAccounts`/`creditAccounts` in the **response** are read-only nested
`{id, name, glCode}` objects (display data for an existing rule), not the create/update
schema. Fineract's actual `AccountingRuleJsonInputParams` for a simple (non-multi-entry) rule
use the singular `debitAccountId`/`creditAccountId` Long fields — matching the
command-palette handler, not the dynModal one.

**Fix:** changed `actions/coa.js` to send singular `debitAccountId`/`creditAccountId`, and
fixed the edit-mode prefill to read `rule.debitAccounts[0].id` (the real response field) with
`.glAccountId` kept only as a defensive fallback.

## Gaps closed

### Provisioning Category
`ProvisioningCategoryApiResource` (`/v1/provisioningcategory`) and its three permissions
(`CREATE_PROVISIONCATEGORY`, `UPDATE_PROVISIONCATEGORY`, `DELETE_PROVISIONCATEGORY` — all
confirmed real in `fineract_permissions_raw.json`) had zero frontend references anywhere in
the codebase, confirmed by grep before starting. Added:
- `makeProvisioningCategoryAPI` in `js/api/accounting.js` (`list`/`create`/`update`/`delete`
  against `/provisioningcategory`), wired into `js/api/index.js` as
  `api.provisioningCategory`.
- A "Provisioning Categories" list/create/edit/delete section on the Provisioning tab
  (`pages/accounting/loaders/period.js`), gated on the three permissions above.
- The create/update modal (`openProvisioningCategoryModal` in
  `pages/accounting/actions/provisioning.js`).

**Not verified:** the create/update payload field names, assumed `categoryName` /
`categoryDescription` by analogy with Provisioning Criteria's `criteriaName`.
`ProvisioningCategoryApiResource` wasn't captured with request-body detail in
`fineract_api_raw.json`, so this couldn't be cross-checked against source — flagged inline in
`actions/provisioning.js` rather than presented as confirmed.

### Provisioning entries — two missing endpoints
`fineract_api_raw.json`'s `ProvisioningEntriesApiResource` lists `retrieveProviioningEntries`
(`GET /provisioningentries/entries`, distinct from the root-list endpoint already wired as
`api.provisioning.entries()`) and `retrieveProvisioningEntry`/`modifyProvisioningEntry`
(`GET`/`POST /provisioningentries/{entryId}`) with no client-side coverage. The
`RECREATE_PROVISIONENTRIES` permission (real, confirmed) also had no matching API method.

Added `entriesFiltered`, `getEntry`, and `recreateEntry` to `api.provisioning`. **Not wired to
any UI** — the query params for the filtered-entries endpoint and the exact `?command=`
value(s) `modifyProvisioningEntry` dispatches on weren't captured in the extraction, so this
is added as a flagged, unverified building block rather than a finished feature.

## Left alone, flagged rather than guessed

Provisioning Criteria's definition-row field names (`categoryName`, `minimumAgeDays`,
`maximumAgeDays`, `minBalancePercentage`, `provisioningPercentage`, `liabilityAccount`,
`expenseAccount` in `pages/accounting/actions/provisioning.js`'s `provRow`) are internally
consistent and plausible but weren't cross-checked against `ProvisioningCriteriaApiConstants`
source — no ground-truth body schema was available for this resource either. Left as-is
(pre-existing, not touched this pass) since rewriting without verification would trade one
unverified guess for another.

## Verified clean

- `node --check` on every file in `js/`: 0 failures.
- `npm test`: 4/4 suites pass — added `tests/accounting-fixes.test.js`, covering:
  - A permission-code sweep of every `can('...')` literal under `pages/accounting/**` against
    a 36-code whitelist extracted directly from `fineract_permissions_raw.json` (groupings
    `accounting` + `LOAN_PROVISIONING`) — zero invented codes.
  - Regressions for all three bugs above (payload field names / shapes via static source
    assertions, since these are DOM-modal flows not easily unit-tested in isolation).
  - `makeProvisioningCategoryAPI` hits the correct verbs/paths, using a fake `self` capturing
    calls (no DOM/network needed — it's a pure factory function).
  - `api/index.js` correctly imports and wires `provisioningCategory`.
- Grepped every `api.glAccounts.*` / `api.accountingRules.*` / `api.provisioning.*` /
  `api.provisioningCategory.*` call site in `pages/accounting/` against the methods actually
  defined in `api/accounting.js` — no dangling references.
- `module-integrity.test.js`: 916 exported functions across 296 files (up from 296 files pre-pass
  with the new `openProvisioningCategoryModal` and `deleteGLAccountConfirm` exports accounted
  for).

---
*(`fixlogs/FIXLOG-api-audit.md` has a pointer added at its item #8 closing out the Provisioning
Category backlog note; `fixlogs/FIXLOG-rate-entity.md`, `fixlogs/FIXLOG-bulk-import.md`, and
`fixlogs/FIXLOG-users-module.md` are unaffected by this pass.)*
