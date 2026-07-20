# Fix Log — Duplicate/Redundant API Calls

**Status: both bugs fixed (Checkpoint 15 below).**

Method: ran the repo's own `scan_double_calls.mjs` against the full `js/` tree,
then manually reviewed every hit to separate real bugs from same-text false
positives (mutually-exclusive `if/else` branches, or same call signature with
genuinely different params).

## Fixed (Checkpoint 15)

### 1. `js/modal-init.js` — payment-type & reschedule-reason dropdowns populated twice, race condition on final content

- `api.paymentTypes.list()` is called independently at two places:
  - ~line 82: fills `#je-paymenttype` and `#sv-dep-paymenttype` with a
    `— None —` placeholder.
  - ~line 223: a second, unrelated call fills `#sv-dep-paymenttype` (and
    `#rp-paymenttype`) with a `— Default —` placeholder.

  Both fire on modal init with no ordering between the two promises, so
  `#sv-dep-paymenttype`'s final placeholder text depends on which network
  call happens to resolve last. Also doubles the `paymentTypes` request on
  every modal init.

- The same duplication pattern exists for `#rs-reason-sel` (reschedule
  reasons): one block (~line 95) tries code ID 61, falling back to
  `api.codes.list()` by name match; a second, independent block (~line 243)
  tries `api.loans.rescheduleTemplate()` first, then *also* falls back to
  `api.codes.list()`. Same target dropdown, two overlapping strategies,
  redundant fetches.

**Suggested fix:** delete the second `paymentTypes.list()` block and the
second `rs-reason-sel` population block; merge the reschedule-reason logic
into the single existing call (try `rescheduleTemplate()` → code-ID 61 →
name-match fallback, in that order, once).

**Fix applied:** merged both duplicate pairs into one call each, run once:
- Payment types: the single remaining `api.paymentTypes.list()` call now populates
  all three dropdowns (`je-paymenttype`, `sv-dep-paymenttype`, `rp-paymenttype`)
  from one fetched list, using `— None —` for the journal-entry field and
  `— Default —` for the savings/repayment fields (preserving each field's original
  placeholder text). The second, independent fetch that only covered
  `sv-dep-paymenttype`/`rp-paymenttype` was removed.
- Reschedule reasons: the single remaining block now runs all three fallback layers
  in the suggested order — `rescheduleTemplate()` → `codes.values(61)` → name-match
  on `codes.list()` — where previously the first two layers lived in one block and
  the template-first layer lived in a separate, independent block that also raced
  the first one for the same `#rs-reason-sel` element.

### 2. `js/pages/dashboard.js` — Gross Portfolio and Outstanding KPIs each independently sample the same active-loan list

- Line ~388: `sampleBalance(l => api.loans.list({ limit: l, status: 'active', ...officeParam }), x => x.summary?.principalDisbursed)` for the Gross Portfolio KPI.
- Line ~403: the *same* `sampleBalance(l => api.loans.list({ limit: l, status: 'active', ...officeParam }), ...)` call, this time extracting `x.summary?.totalOutstanding`, used as a fallback when the PAR report doesn't return `totalOutstanding`.

When the fallback triggers, the dashboard re-paginates through the entire
active-loan sample a second time on every load, purely to read a different
field off the same records.

**Suggested fix:** hoist the sampled loan fetch above both KPI blocks, run
it once, and derive both `principalDisbursed` and `totalOutstanding` from
the single cached sample.

**Fix applied:** added `sampleList()`/`sumFromSample()` helpers alongside the
existing `sampleBalance()` — `sampleList()` fetches the raw record list once,
`sumFromSample()` sums whichever field a caller needs off an already-fetched
sample. A `getLoanSample()` closure (memoized, only fetches on first call)
now sits above both KPI blocks; Gross Portfolio and the Outstanding fallback
both call it and derive their respective field from the one shared list.
The Outstanding path still only fetches at all when the PAR report doesn't
already supply `totalOutstanding` — unchanged short-circuit behavior, just
no longer duplicating the fetch when it *does* need to fall back.

## Verification

- `node --check` across every `.js` file in the repo: 0 failures.
- `npm test`: 4/4 suites pass, no regressions.
- Re-ran `scan_double_calls.mjs` after the fix: no more hits in
  `js/modal-init.js` or `js/pages/dashboard.js`.

## Checked and ruled out (false positives from the scanner)

- `js/pages/loans/actions/closure.js` lines 61/64 — same `api.loans.command(id, command, payload)` text, but inside an `if (isTransaction) {...} else {...}` — only one branch ever executes per call.
- `js/pages/savings/list.js` lines 78/103 — same call-site text (`api.savings.list(params)`), but `params` differs: `loadKpis()` uses `{ limit: 10000 }` (unpaginated, whole-portfolio aggregate), `load(offset)` uses `{ limit: pageSize, offset }` (paginated table page). Two calls are intentional per the comment above `loadKpis()`.
