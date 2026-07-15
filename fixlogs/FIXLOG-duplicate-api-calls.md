# Fix Log — Duplicate/Redundant API Calls

**Status: open — found by `scan_double_calls.mjs`, not yet fixed.**

Method: ran the repo's own `scan_double_calls.mjs` against the full `js/` tree,
then manually reviewed every hit to separate real bugs from same-text false
positives (mutually-exclusive `if/else` branches, or same call signature with
genuinely different params).

## Bugs found (open)

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

### 2. `js/pages/dashboard.js` — Gross Portfolio and Outstanding KPIs each independently sample the same active-loan list

- Line ~388: `sampleBalance(l => api.loans.list({ limit: l, status: 'active', ...officeParam }), x => x.summary?.principalDisbursed)` for the Gross Portfolio KPI.
- Line ~403: the *same* `sampleBalance(l => api.loans.list({ limit: l, status: 'active', ...officeParam }), ...)` call, this time extracting `x.summary?.totalOutstanding`, used as a fallback when the PAR report doesn't return `totalOutstanding`.

When the fallback triggers, the dashboard re-paginates through the entire
active-loan sample a second time on every load, purely to read a different
field off the same records.

**Suggested fix:** hoist the sampled loan fetch above both KPI blocks, run
it once, and derive both `principalDisbursed` and `totalOutstanding` from
the single cached sample.

## Checked and ruled out (false positives from the scanner)

- `js/pages/loans/actions/closure.js` lines 61/64 — same `api.loans.command(id, command, payload)` text, but inside an `if (isTransaction) {...} else {...}` — only one branch ever executes per call.
- `js/pages/savings/list.js` lines 78/103 — same call-site text (`api.savings.list(params)`), but `params` differs: `loadKpis()` uses `{ limit: 10000 }` (unpaginated, whole-portfolio aggregate), `load(offset)` uses `{ limit: pageSize, offset }` (paginated table page). Two calls are intentional per the comment above `loadKpis()`.
