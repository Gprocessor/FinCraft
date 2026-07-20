# Fix Log — Analytics Rebuild + "Buttons Not Working" Investigation

## 1. Analytics page rebuilt — no longer a re-hash of the Dashboard

**File:** `js/pages/analytics.js` (full rewrite, template + logic both inline in this file as before)

**Why:** once the Dashboard chart bug was fixed (see `FIXLOG-create-activate-linkage.md` §5),
side-by-side comparison showed Analytics was mostly duplicating it with staler, less complete
versions of the same numbers:

| Old Analytics section | Duplicated by Dashboard's… |
|---|---|
| Active Clients / Active Loans / Active Savings / Pending Tasks KPIs | stat-grid cards |
| PAR 30 / NPL Ratio KPIs | "Portfolio at Risk" card + "Portfolio at Risk — Ageing" chart |
| Disbursements (90d) chart | "Loan Portfolio & Collection Trend" chart |
| Portfolio Composition (Performing/Overdue/Closed) chart | `renderStatusMixChart` on the same `#dash-dist-chart` canvas as product distribution |
| Office-level Summary table | "Branch Performance" chart |
| Loan Officers table (name/office/active) | "Loans by Officer" chart (same underlying counts, just as a directory instead of a chart) |

Only the Loan Products reference table wasn't duplicated anywhere.

**What replaced it — three things that answer "why", not "what":**

1. **KPI strip (4 tiles, none dashboard duplicates):** NPL Ratio, PAR 30 (kept — genuinely
   useful and not surfaced as a plain number on the Dashboard), **Loan Closure Rate**
   (`closed / (closed + active)` — a cheap attrition proxy the Dashboard doesn't compute), and
   **Avg Loans / Active Client** (portfolio-depth / repeat-borrowing signal).

2. **Delinquency Aging Breakdown** — a new bar chart. Reuses the same `PortfolioAtRisk` report
   already being fetched for the PAR/NPL KPIs (no extra API call), but a new
   `computeAgingBuckets()` parses *every* aging-bucket column (Current, 1-30, 31-60, >90, …)
   instead of collapsing the report into one ratio — same column-name-matching approach as the
   existing `computeNplFromPar()`, since Fineract's PAR report layout isn't fixed across
   deployments. Falls back to a plain message if fewer than 2 recognisable bucket columns exist.

3. **Arrears by Loan Officer** — a new ranked table, replacing the old plain "Loan Officers"
   directory (name/office/active-or-not, which added nothing beyond what a staff list already
   shows). New `computeArrearsByOfficer()` groups the existing `ActiveLoansInArrears` report
   (also already being fetched, no extra call) by a detected loan-officer column, sums a
   detected overdue-amount column when one exists, and ranks by exposure — turning a report that
   was previously used only to get `.data.length` (a count) into an actual risk breakdown.
   Degrades gracefully (distinct messages for "report empty", "report failed", and "report
   loaded but no recognisable officer column on this server") rather than guessing.

4. **Loan Product Mix — Rate & Exposure** — kept the existing rate/principal reference table,
   enriched with a real **active-loan count per product** via
   `api.loans.list({ status: 'active', loanProductId })` (confirmed real filter param — already
   used elsewhere in `js/pages/loans/list.js`). Capped to the first 12 products to bound the
   extra network calls, with a "+N more not shown" row if there are more.

**Verification:** rendered the new page against realistic mocked report shapes (multi-bucket PAR
report, multi-officer arrears report, a product list) — all four KPIs, the aging chart's bucket
extraction, the officer ranking/grouping, and the per-product active-loan enrichment all computed
correctly. `node --check` passed. Full test suite (with `jsdom` installed so `module-integrity`
actually runs instead of skipping) passed 4/4 — 954 exported functions across 301 files, up from
952/301 before this change, 0 leaked reference errors.

**Not removed, in case anyone's linking to it directly:** the route itself
(`analytics` → `js/pages/analytics.js`, `READ_REPORT` permission) is unchanged in `router.js` —
only the page's own content changed.

## 2. "New Client (and others) not working" — investigated, not reproduced

Reported right after the previous checkpoint (create⇒approve/activate chaining, group/center
linkage, client center/group cascade, dashboard chart fix). Investigated thoroughly but could
**not reproduce a broken button** with this code:

- `node --check` on every file touched this session and last — all clean.
- Direct `import()` of `js/ui/handlers/index.js`, `js/ui/global-events.js`, `js/modal-init.js`,
  `js/ui/modal-dropdowns.js` in a jsdom environment — all resolve and execute with no thrown
  errors.
- Full test suite run with `jsdom` actually installed (previous checkpoints had it silently
  skipping — see "process note" below) — `module-integrity.test.js` calls every exported
  function with stub args in a mocked DOM specifically to catch "forgot to import X" /
  "reassigned a let owned by another file" bugs. 4/4 passed, 0 leaked reference errors.
- **Full click-path reproduction:** built a jsdom document with the real concatenated
  `views/modals/*.html` (same order `shell.js` uses), wired the real `core.js` +
  `global-events.js` + `modal-init.js`, dispatched `fc:modals-loaded`, then dispatched real
  `click` events on `[data-modal="newClientModal"]`, `newGroupModal`, `newCenterModal`, and
  `newSavingsModal` triggers. All four modals opened (`.open` class added) with no errors.

**Two real (if narrower) issues found and fixed along the way, in case either was the actual
cause or a contributing factor:**

- **`service-worker.js`** — cache bumped `v10 → v11`. This app already uses a network-first
  fetch strategy specifically because of a past stale-cache incident (see the existing comment
  in that file), but this session touched enough files (chart loader, four create-handler
  chains, group/center/client modal markup and wiring) that forcing the activate-phase cache
  cleanup is worth doing regardless of whether it was the actual cause here.
- **`js/ui/modal-dropdowns.js`** — the Group form's Center dropdown (now mandatory — see
  `FIXLOG-create-activate-linkage.md` §3) would previously sit silently empty with no
  explanation for any org that hasn't created a Center yet, effectively blocking Group creation
  entirely with no visible reason why. Now shows "No centers found — create one first" in that
  case instead of an empty required `<select>`.

**Still needed to close this out for certain:** the actual browser console error (DevTools →
Console tab) at the moment the button fails, since every static and simulated check available
without a live browser session came back clean.

## Process note: `jsdom` wasn't actually installed in earlier checkpoints
`package.json` lists `jsdom` as a devDependency, but it was never installed in this sandbox until
this checkpoint — every prior test run in this conversation's history silently skipped
`business-logic.test.js` and `module-integrity.test.js` ("jsdom not installed — run `npm install`
first. Skipping.") and reported "3/3 passing" without actually running two of the four tests.
Ran `npm install` this checkpoint; all four tests now genuinely execute. Worth keeping installed
(or running `npm install` before trusting a "tests passing" claim) going forward — a real,
running `module-integrity` check is exactly the kind of net that would have caught an import bug
if one existed.
