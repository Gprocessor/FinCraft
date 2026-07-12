# Fix Log — Standalone Rate Entity

**Status: closed.** This closes the "the standalone `Rate` entity ... entirely unimplemented"
item noted as **not touched** in `fixlogs/FIXLOG-api-audit.md`'s Backlog section — that note
flagged the feature as a net-new gap (zero frontend surface at all), not a bug. This is a
feature addition, not a bug fix, so it's kept in its own log rather than appended to the audit
log, same reasoning as `fixlogs/FIXLOG-bulk-import.md`.

Scope: `js/api/products.js` (new `makeRatesAPI`), `js/api/index.js` (wiring), new file
`js/pages/products/actions/rates.js` (`openRateModal`), `js/pages/products/actions/index.js`
(barrel export), `js/pages/products/index.js` (new loader on the Products hub).

## What was added

`RateApiResource` (`/v1/rates`) had no frontend surface at all prior to this pass. Added as
loader #7 on the Products hub, next to Floating Rate — a related but distinct concept:
Floating Rate is a time-boxed lending base rate with rate periods (`js/pages/products/actions/loan-products.js`);
`Rate` is the simpler named-percentage entity attached elsewhere in Fineract to
products/charges.

Wired to the confirmed real routes (per `fineract_api_raw.json`):
- `GET /v1/rates` — list
- `GET /v1/rates/{id}` — get one
- `POST /v1/rates` — create
- `PUT /v1/rates/{id}` — update

No `delete()` — `RateApiResource` has no DELETE method in Fineract, and there's no
`DELETE_RATE` permission in `fineract_permissions_raw.json` either (same shape as Floating
Rate, which has the identical no-delete situation).

Permission checks use `CREATE_RATE`/`UPDATE_RATE`, both present in the raw permissions
extraction. Note: `READ_RATE`'s `action` field is mislabeled `CREATE` in that extraction (a
quirk of the source data, not something this pass touches), but the permission *code* string
is what the UI's `can()` check matches against, not that metadata field, so it's unaffected.

## Not confirmed

The exact request-body schema for `Rate` — used `name` / `percentage` / `active`, based on the
entity's general shape elsewhere in Fineract. The raw API map (`fineract_api_raw.json`) has
routes only, no request-body schemas, so this couldn't be verified against source. Same caveat
as bug #6 in `fixlogs/FIXLOG-api-audit.md`. If the real schema differs, the modal in
`js/pages/products/actions/rates.js` is the only place to update.

## Verified clean

- `node --check` on all 5 touched/new files: 0 failures.
- `npm test`: 3/3 suites pass (`module-integrity.test.js` now reports 897 exported functions
  across 296 files, up from 893/295 before this change — the new `rates.js` file accounts for
  the difference).
- Grepped for pre-existing references to `api.rates`/`openRateModal` before adding: none found,
  confirming this was genuinely unimplemented rather than a dead/broken existing wire-up.
- Loader key renumbering in `js/pages/products/index.js` (Rate inserted at #7, Tax and
  Delinquency Bucket shifted to #8/#9) double-checked for no duplicate `key` values and no
  stale `reload(n)` references left pointing at the old indices.

---
*(fixlogs/FIXLOG-api-audit.md, fixlogs/FIXLOG-bulk-import.md, and fixlogs/FIXLOG-users-module.md
are unaffected by this pass — different scope, kept separate; fixlogs/FIXLOG-api-audit.md's
Backlog section has a pointer added here.)*
