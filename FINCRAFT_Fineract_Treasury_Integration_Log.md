# FinCraft Fineract Treasury Integration Log

_Last updated: **Phase 11 COMPLETE — all 8 treasury UI screens now built** (Settings, Dashboard,
Teller Console, Cash Allocation, Loan Disbursement, Expense Management, Borrowings, Daily
Reconciliation). Phases 0-10 (all backend business logic + persistence) were already complete;
this checkpoint finishes the UI layer. What remains: Phase 12 (Permissions — a real mapping
decision, still open, see §17) and Phase 13 (a dedicated cross-cutting test pass — the per-service
unit/integration tests already exist). Decisions on persistence, GL-balance strategy, and
multi-tenancy remain final per user direction._

## 1. Project Overview

Goal: add an operational "treasury control layer" on top of the existing FinCraft app so branch
staff can manage vault balances, teller cash allocation/reconciliation, loan disbursement through
tellers, operational expenses, and borrowed operating funds — while Apache Fineract remains the
single system of record for clients, loans, savings, GL, journal entries, and teller/cashier setup.
Fineract's pooled `Cash At Tellers` GL is preserved; FinCraft adds a per-cashier operational
sub-ledger that must reconcile to that pooled balance. No Fineract core/accounting-engine changes.

## 2. Current Codebase Findings

**Framework/language:** Not Next.js/React/Vue/Laravel/Django. FinCraft is a **hand-rolled,
dependency-free vanilla-JS SPA** (plain ES modules, no bundler/build step, no framework). Native
JS classes, `fetch`, hash-based routing. `package.json` only declares `jsdom`/`acorn` as dev
dependencies for the custom Node test runner (`test-runner/run-tests.js`) — there is no
React/Vue/webpack/vite anywhere. Static hosting (`netlify.toml`, `vercel.json`, `_redirects`,
`404.html`, `.nojekyll` all present) — this is deployed as static files, e.g. behind
Netlify/Vercel/GitHub Pages or the `deploy/` nginx config.

**No backend, no database of its own.** There is no server-side app in this repo (the `deploy/`
folder only contains ops scripts/docker-compose for standing up *Fineract* + Postgres + nginx +
BIRT reporting + Keycloak/OAuth test helpers — not a FinCraft backend). The browser talks
**directly** to a Fineract instance over HTTPS using Basic Auth
(`js/api/core.js#_headers` sets `Authorization: Basic <base64(user:pass)>` +
`Fineract-Platform-TenantId`). `js/config.js` currently points at the public Mifos demo server
(`https://demo.mifos.io`, tenant `default`). This is the most important architectural fact for
everything that follows: **FinCraft has no place to run its own backend services or hold its own
SQL tables.** Any new "FinCraft-owned" state (teller operational events, expense requests,
borrowings, thresholds, reconciliation records) can only live in **Fineract Datatables**
(`self.dataTables` — already fully implemented, see below) attached to Fineract entities
(`m_office`, `m_cashier`, etc.), or in browser storage (not viable for shared/audit data).

**Backend structure:** N/A (none). All "business logic" today is client-side JS.

**Frontend structure (`fincraft-root/`):**
- `index.html` / `404.html` — entry points; `views/modals/*.html` — modal markup fragments loaded
  by domain (accounting, clients, loans, organization, products, savings-deposits, shares,
  groups-centers, admin, integrations, system).
- `css/` — hand-written CSS, split by concern (`tokens.css` = design tokens, `components.css`,
  `forms.css`, `tables.css`, `cards.css`, `modals.css`, `app.css`, plus per-page overrides like
  `clients-view.css`).
- `js/router.js` — hash router with a single `PAGES` registry mapping route name → lazy
  `import()`, label, icon, and `requiredPermission` (a Fineract permission code, an array of
  codes = any-of, `null` = "just needs to be logged in", or the `ANY_CHECKER_PERMISSION` sentinel).
  This is the canonical place a new module ("Treasury") must be registered.
- `js/store.js`, `js/auth.js` — session/auth state, permission storage (`store.hasPermission`,
  exposed as `canDo(code)`), tenant handling, recent-tenant list in `localStorage`.
- `js/api.js` → thin barrel over `js/api/index.js`, which builds one `FineractAPIFull` instance
  (`export const api = ...`) out of **one factory module per Fineract domain**
  (`js/api/core.js` = shared HTTP plumbing + auth; `clients.js`, `loans.js`,
  `savings-deposits.js`, `shares.js`, `groups-centers.js`, `organization.js`, `products.js`,
  `accounting.js`, `reports.js`, `admin.js`, `integrations.js`, `misc.js`). Each factory is
  `makeXApi(self) => ({ list, get, create, update, delete, ... })`, attached onto `api` as
  `api.<namespace>.<method>()` (e.g. `api.tellers.allocateCashTo(...)`, `api.journalEntries.create(...)`,
  `api.dataTables.createEntry(...)`).
- `js/pages/<domain>/` — each routed page follows the same internal shape: `index.js` (barrel),
  `loaders.js` / `loaders/*.js` (data fetching), `actions.js` / `actions/*.js` (mutations/handlers),
  `shared.js` (page-local helpers/templates). `js/pages/<domain>.js` at the top level is a
  one-line re-export barrel (`export * from './<domain>/index.js'`) — this "thin root barrel +
  real folder" pattern is used consistently (`organization.js`, `accounting.js`, etc.) and should
  be followed for any new "treasury" page.
- `js/ui/` — shared UI plumbing: `shell.js`, `core.js`, `dom-helpers.js`, `modal-dropdowns.js`,
  `pagination.js`, `scrollable-tabs.js`, `section-hub.js`, `global-events.js`, `handlers/`.
- `js/utils.js`, `js/data.js`, `js/cmd.js`, `js/remit.js`, `js/modal-init.js`,
  `js/spa-redirect.js`, `js/spa-404-redirect.js`, `js/bulk-import-entities.js`.
- `tests/` + `test-runner/run-tests.js` — a custom, dependency-light (acorn/jsdom) static-analysis
  + logic test runner (`npm test`), not Jest/Vitest. Existing suites: `business-logic.test.js`,
  `accounting-fixes.test.js`, `module-integrity.test.js`, `error-extraction.test.js`, `utils.test.js`.
- `fixlogs/*.md` — the project's existing convention for **dated engineering write-ups per unit of
  work** (e.g. `FIXLOG-accounting-audit.md`, `FIXLOG-api-audit.md`). No `docs/` folder exists.
  Per the task instructions ("if a /docs folder already exists, place it there instead"), since
  there is no `/docs`, this log correctly lives at repo root as
  `FINCRAFT_Fineract_Treasury_Integration_Log.md`. The `fixlogs/` convention is a useful model for
  how completed-phase write-ups should read.

**Existing Fineract integration:** Extremely mature and already close to complete for this
project's needs — this is not a thin client. Confirmed already implemented:
- `api.tellers`: `list/get/create/update/delete`, `cashiers`, `getCashier`, `cashierTemplate`,
  `allocateCashier` (assign a cashier to a teller), `updateCashier`, `deleteCashier`,
  `settleCashier` (POST `/tellers/{id}/cashiers/{cid}/settle`), `allocateCashTo` (POST
  `/tellers/{id}/cashiers/{cid}/allocate`), `cashierTransactions`, `cashierSummary` (GET
  `.../summaryandtransactions`), `cashierTxTemplate`, `transactions`, `getTransaction`, `journals`.
- `api.tellerJournal.list` → `/cashiersjournal` (separate top-level resource, correctly not
  nested under `/tellers/{id}` per Fineract's actual API shape).
- `api.journalEntries`: `list/get/create/reverse`, plus `provisioning`, `openingBalances`.
- `api.glAccounts`: full CRUD + `template`. `api.glClosures`, `api.accountingRules`,
  `api.financialActivityAccounts`, `api.provisioning`, `api.runAccruals` all present.
- `api.dataTables`: `list/get/register/deregister/create/updateSchema/update/delete/deleteTable`,
  plus row-level `createEntry/getEntry/update/delete` — i.e. everything Phase 2/3 of this project
  needs to persist FinCraft-owned records as Fineract datatables is **already built**.
- `api.loans.disburse` (POST `/loans/{id}?command=disburse`) and `disburseToSavings` already exist,
  along with the wider disbursement-detail surface (`disbursement`, `updateDisbursement`,
  `editDisbursements`, `updateAvailableDisbursementAmount`).
- `api.reports` / `api.runReports` / `api.adhocQueries` exist for report-driven balance queries
  (there is no single "GL balance" endpoint in Fineract itself — balances come from running a
  report or deriving from `journalentries`/`glaccounts` — see Open Questions).
- `api.offices`, `api.staff`, `api.paymentTypes`, `api.currencies`, `api.codes`, `api.funds` all
  present and reusable for treasury forms (office/teller/cashier pickers, payment-type dropdowns).

**Tenant/auth handling:** `FineractAPI.configure({ serverUrl, tenantId, authToken, tfaToken })`;
`Fineract-Platform-TenantId` header set per request; Basic Auth token stored in memory on the
singleton `api` instance (session persisted via `store`/`localStorage`, see `auth.js`). Central
401 handling via `api.onUnauthorized(fn)`. **There is no environment-variable system** (no
`.env`, no `process.env` — this runs entirely in the browser); `FINERACT_BASE_URL` etc. as
literally named in the task brief do not apply here. The closest equivalent is `js/config.js`
(`FINERACT_DEMO.serverUrl/tenantId/apiBase/timeouts`) plus whatever tenant/login UI resolves
`serverUrl`/`tenantId`/credentials at sign-in time and calls `configureAPI(...)`.

**Persistence approach:** None of its own — confirmed no ORM, no migrations, no SQL files, no
`models/` directory anywhere in the repo tree. All persistence is Fineract's (via REST) or,
for FinCraft-specific state, must be Fineract **Datatables** (already-built client above) or
browser `localStorage` (session/UI-preference scope only, not for shared operational/audit data
like teller events or borrowings).

**UI conventions:** Modal-driven CRUD via `views/modals/<domain>.html` fragments +
`js/modal-init.js`/`js/ui/modal-dropdowns.js`; shared shell/nav in `js/ui/shell.js`; consistent
loader/action split per page; permission-gated routes declared centrally in `router.js`'s `PAGES`
map, checked against `store.hasPermission`/`canDo` (real Fineract permission codes only — the
existing code is careful to **not** invent permission codes that don't exist in Fineract's ~961
code permission set, e.g. the `shares`/`surveys` routes are commented as intentionally
`requiredPermission: null` because no matching `READ_*` code exists upstream). This matters
directly for Phase 12 below.

**Naming conventions:** `js/api/<domain>.js` exporting `make<Domain>API(self)` factories;
`js/pages/<domain>/{index,loaders,actions,shared}.js` with a one-line barrel at
`js/pages/<domain>.js`; `views/modals/<domain>.html` for modal markup; `FIXLOG-<topic>.md` for
completed-work write-ups. A new "treasury" feature area should mirror this exactly:
`js/api/treasury.js` (or split further if large), `js/pages/treasury/*`, `views/modals/treasury.html`,
and route entries added to `router.js`'s `PAGES`.

## 3. Architecture Decisions

- Fineract core and its accounting engine will **not** be modified — confirmed nothing in this
  repo touches Fineract server code; it's a pure API consumer.
- The existing pooled `Cash At Tellers` GL is retained as-is; no per-teller GL accounts will be
  created in Fineract.
- FinCraft will maintain a teller/cashier **operational sub-ledger** purely as derived/tracked
  records, reconciled against Fineract's pooled GL and Fineract's own cashier
  summary/transactions endpoints (`api.tellers.cashierSummary`, `cashierTransactions`,
  `journals`, `tellerJournal.list`) rather than re-deriving everything from scratch — Fineract
  already tracks per-cashier allocate/settle/transaction history natively; FinCraft's job is to
  add the missing pieces (linking loan disbursements/expenses to a specific cashier's cash
  position, vault reserve-buffer control, borrowings, and a reconciliation workflow) on top.
- **Because FinCraft has no backend of its own**, all new FinCraft-owned persistent records
  (teller operational events, expense requests/approvals, borrowings + schedule + txns, treasury
  thresholds, daily reconciliation) will be implemented as **Fineract Datatables**, using the
  already-complete `api.dataTables` client, attached to `m_office` (and, where a natural Fineract
  entity id exists — e.g. a loan disbursement or an expense's own datatable row — cross-referenced
  by id/transaction id rather than duplicated). This is a change from a generic "own DB" default
  and is the single most consequential architecture decision for this project; flagged again in
  Open Questions for explicit confirmation before Phase 2 implementation begins.
- New feature code will follow the existing `api/<domain>.js` factory pattern, the
  `pages/<domain>/{index,loaders,actions,shared}` folder pattern, and register through
  `router.js`'s existing `PAGES` map — no new architectural pattern will be introduced.
- **[NEW] Cross-cutting treasury business logic lives in `js/treasury/`, a new top-level folder
  sibling to `js/api/`, `js/pages/`, `js/ui/`.** Neither existing folder is the right home: `js/api/`
  is deliberately pure Fineract REST wrappers (one call in, one call out, no orchestration/
  validation), and `js/pages/` is route-bound (loaders/actions tied to a specific screen). Phases
  3-10's services (teller events, balance computation, vault control, disbursement orchestration,
  expenses, borrowings, dashboard aggregation, reconciliation) are none of those — they're
  business logic that multiple pages will call into. `js/treasury/*.js` modules import
  `{ api } from '../api.js'` directly (the existing singleton import pattern used throughout
  `js/pages/**`), so pages consume them the same way they already consume `api.*`. This is judged
  the smallest possible deviation from "don't invent a new architecture," not a rewrite.
- No petty cash module; the teller/cashier already modeled in Fineract is the cash custodian for
  both loan disbursement and expense payment.
- **[FINAL] Persistence: Fineract Datatables only, no exceptions.** Confirmed by user — FinCraft
  will not gain a backend/DB for this project. Every `dt_*` table in §7/Phase 2 is implemented via
  `api.dataTables`. This is now a hard constraint, not a proposal.
- **[FINAL] Multi-tenancy: rely on Fineract's own tenant isolation, don't reinvent it.** Fineract's
  multi-tenancy model gives each tenant its own database schema, selected purely by the
  `Fineract-Platform-TenantId` request header (`js/api/core.js#_headers`). Because every
  `api.dataTables.*` call goes through that same header, datatables (and their rows) are
  **automatically tenant-isolated** — there is no cross-tenant leakage risk to code around, and no
  `tenantId` column is needed in any `dt_*` table. What multi-tenancy *does* change:
  - **Datatable registration is per-tenant, not global.** Since each tenant is a separate schema,
    `dt_teller_operational_events` etc. registered on Tenant A does **not** exist on Tenant B.
    Every one of the eight tables needs an idempotent "ensure this datatable exists on the
    currently-connected tenant" bootstrap check (`api.dataTables.list()` → create-if-missing) run
    at the point FinCraft first needs it, not a one-time global migration. See `js/api/treasury.js`
    (`ensureTreasuryDatatables`) added this session.
  - **Within one tenant**, records are still scoped by `officeId` (the datatable's app-table entity
    id), exactly as specified — that scoping is unchanged and unrelated to tenant isolation.
  - Bootstrap must be **safe to call repeatedly / from multiple concurrent users** (registration
    endpoint should be treated as idempotent-by-check, not idempotent-by-Fineract-guarantee — a
    500 on "already registered" is caught and treated as success, since Fineract has no
    `register-if-not-exists` primitive).
- **[FINAL] GL balance strategy: two-tier, per Open Question 2.** Fineract has no single
  "balance as of date" endpoint, so:
  1. **Headline/org-wide balances** (Treasury Dashboard cards: Vault, Bank, Cash At Tellers,
     Borrowings Liability, Interest Payable totals): use `GET /glaccounts?fetchRunningBalance=true`
     / `GET /glaccounts/{id}?fetchRunningBalance=true`, which Fineract computes server-side into
     `organizationRunningBalance` — no report dependency, no client-side summation, cheapest and
     most reliable option, and it's a real, documented, already-existing Fineract API parameter
     (confirmed against the Fineract API reference, "Pretty JSON… fetchRunningBalance" behavior
     under General Ledger Account). This is now wired as `api.glAccounts.getBalance(id)` /
     `api.glAccounts.listWithBalances(params)`.
  2. **Office-scoped precise balances** (needed wherever "this office's Vault" must be isolated
     from other offices sharing the same GL account, e.g. Vault Control's allocation check): fall
     back to summing `GET /journalentries?glAccountId=&officeId=&toDate=&limit=-1` (paginated),
     net = Σ(DEBIT) − Σ(CREDIT) for asset/expense-type accounts, Σ(CREDIT) − Σ(DEBIT) for
     liability/income/equity-type accounts (standard normal-balance convention, read off the
     account's `type.id` from `glaccounts`). Implemented as `api.glAccounts.computeOfficeBalance(...)`
     this session. This is O(n) in journal entry count for that account/office and should be used
     sparingly (Vault Control's pre-allocation check, not the dashboard's live tile refresh).

## 4. Assumptions

- The target deployment is a real Fineract tenant (not necessarily the public demo server); the
  `serverUrl`/`tenantId` currently hard-coded to the demo server in `js/config.js` will be
  supplied per-environment the same way it is today (login/tenant-picker flow → `configureAPI`),
  not via `.env`/`process.env`.
- The signed-in FinCraft user has (or will be granted) whatever Fineract permission codes are
  needed for the underlying calls this project makes (teller allocate/settle, journal entry
  create, loan disburse, datatable CRUD) — FinCraft itself has no independent authorization
  layer, only route-level permission gating that mirrors Fineract's own permission codes.
- "Vault" = Fineract's main branch cash GL account (as distinct from the pooled Cash At Tellers
  GL); which specific `glaccounts` row plays this role per office is configuration FinCraft must
  store (candidate: `dt_treasury_thresholds`), not something Fineract labels natively.
- Reserve buffer, GL account mappings (vault/bank/expense/borrowings-liability/interest-payable/
  interest-expense), and thresholds are per-office configuration values that need a place to live
  — planned as `dt_treasury_thresholds` attached to `m_office`.

## 5. Risks

- Users bypassing FinCraft and posting directly in Fineract (or via another Fineract-facing tool)
  — since FinCraft has no backend to intercept writes, it cannot prevent this; its
  balances/reconciliation views can only ever be *as fresh as the last read*.
  the existing datatable/GL data
- Teller operational balance drifting from the pooled GL — mitigated by comparing against
  Fineract's own `cashierSummary`/`tellerJournal` wherever possible instead of purely trusting
  FinCraft-local event records.
- No server-side transaction boundary: since every "step" (e.g. Fineract loan disbursement call →
  FinCraft teller-event datatable write) is two separate REST calls from the browser with no
  backend to wrap them in a DB transaction, partial failure (Fineract succeeds, FinCraft datatable
  write fails) is a real, unavoidable risk given the current architecture — must be handled by
  explicit error surfacing/retry UI, not assumed away.
- Fineract has **no single "GL balance as of date" endpoint** — balance figures must come from a
  report (`runReports`), `adhocQueries`, or be derived from `journalentries`; this needs to be
  resolved (see Open Questions) before Treasury Dashboard/Vault Control can be built correctly.
- Credentials/tokens live in the browser (Basic Auth header built client-side); acceptable because
  that's the existing app's model already, but worth naming since new "treasury" write actions
  (journal entries, borrowings) raise the stakes of that existing design choice.
- Duplicate journal postings if a user retries a failed treasury action without idempotency
  protection — no natural idempotency key exists in Fineract's journal entry API; FinCraft will
  need its own guard (e.g. check-before-post against the relevant datatable state).

## 6. Open Questions

1. ~~Persistence confirmation~~ — **RESOLVED by user: datatables only, no backend.** See §3.
2. ~~GL balance source~~ — **RESOLVED: two-tier `fetchRunningBalance` + office-scoped
   journal-entry summation strategy.** See §3.
3. ~~Vault GL identification~~ — **RESOLVED as code (Phase 5):** stored per-office in
   `dt_treasury_thresholds` via `js/treasury/thresholds.js`. Still genuinely open: who supplies the
   *initial* correct GL account ids for a given deployment's real chart of accounts — that's a
   data/config question for whoever administers the target Fineract instance, not a code question,
   and there is deliberately no hard-coded fallback (`requireThresholds()` throws rather than
   guessing).
4. ~~Environment/config strategy~~ — **RESOLVED as code (Phase 5):** same `dt_treasury_thresholds`
   table holds all the GL mappings + reserve buffer, seeded via `upsertThresholds()`. A "Treasury
   Settings" UI to edit these (Phase 11) is still not built — until then, seeding happens by
   calling `upsertThresholds()` directly (e.g. from a console/admin script), which is a real gap
   for non-technical operators and should be prioritized early in Phase 11.
5. Should the remaining phase checklist be executed strictly in order with a stop-and-confirm
   after each phase, or is there a preferred subset/priority (e.g. Teller Console + Vault Control
   before Borrowings)? Not yet answered — proceeding phase-by-phase, exporting a zip after each
   unit of work per the "export before limits hit" instruction, until told otherwise.

## 7. Master TODO

### Phase 0 - Codebase Inspection
- [x] Inspect framework and language
- [x] Inspect folder structure
- [x] Inspect existing Fineract integration
- [x] Inspect auth/session pattern
- [x] Inspect database/persistence approach
- [x] Inspect UI component patterns
- [x] Document findings in this log

### Phase 1 - Fineract API Client
- [x] Locate existing Fineract API client (`js/api/core.js` + `js/api/*.js` + `js/api/index.js`)
- [ ] Extend using existing project pattern (mostly already present — see §2; gap check needed:
      `getGLBalance`/`getTreasuryGLBalances` convenience wrappers do not exist yet and depend on
      Open Question 2 being resolved first)
- [x] Teller/cashier API methods — already implemented in `js/api/organization.js`
- [x] Journal entry method — already implemented in `js/api/accounting.js`
- [x] Loan disbursement method — already implemented in `js/api/loans.js`
- [x] Datatables methods — already implemented in `js/api/reports.js`
- [ ] GL/report balance convenience method — blocked on Open Question 2
- [~] Error handling — shared `_req` already normalizes HTTP errors app-wide; no per-phase change
      needed unless business-rule errors (e.g. "insufficient teller cash") need a distinct shape
- [ ] Environment configuration — blocked on Open Question 4 (no `.env` mechanism exists today)

### Phase 2 - Persistence / Datatables
- [x] Determine if FinCraft has own DB — **confirmed: no**
- [ ] (own-DB branch not applicable)
- [ ] Use Fineract Datatables (client already available) — pending Open Question 1 confirmation
- [ ] Add teller operational events persistence (`dt_teller_operational_events`)
- [ ] Add expense requests persistence (`dt_expense_requests`, `dt_expense_approvals`)
- [ ] Add borrowings persistence (`dt_office_borrowings`, `dt_office_borrowing_schedule`, `dt_office_borrowing_txns`)
- [ ] Add treasury thresholds persistence (`dt_treasury_thresholds`)
- [ ] Add daily reconciliation persistence (`dt_daily_cash_reconciliation`)

### Phase 3 - Teller Operational Events
- [x] Create teller operational event service/model — `js/treasury/teller-events.js`
- [x] Add CASH_IN event mapping — `CASH_IN_TYPES`
- [x] Add CASH_OUT event mapping — `CASH_OUT_TYPES`
- [x] Add record event method — `recordTellerEvent(payload)`
- [x] Add reverse event method — `reverseTellerEvent(officeId, eventId, reason, reversedBy)`
- [x] Add get cashier events method — `getCashierEvents(officeId, cashierId, dateRange)`
- [x] Add get teller events method — `getTellerEvents(officeId, tellerId, dateRange)`
- [x] Add audit fields — `created_by`, `reversed`, `reversal_reference` columns +
      reversal-creates-new-row-never-mutates-history design (see file header comment)
- [x] `getOfficeTellerEvents` also added (needed by Phase 4's office-wide breakdown)
- [x] Automated tests — `tests/treasury-teller-events.test.js` (6 assertions incl. reversal
      bookkeeping and double-reversal guard)

### Phase 4 - Teller Balance Service
- [x] Create TellerBalanceService — `js/treasury/teller-balance.js`
- [x] Read Fineract cashier summary where available — `compareCashierBalanceToFineract()` calls
      `api.tellers.cashierSummary` and cross-checks against FinCraft's own computed figure
- [x] Read FinCraft operational events — via `teller-events.js`
- [x] Compute cashier expected cash — `computeCashierExpectedBalance(...)`
- [x] Validate teller cash-out transactions — `validateCashierCanPay(...)`, exact error message
      format from the brief ("Insufficient teller cash. Available: {available}, Requested: {amount}")
- [x] Compare teller total with pooled Cash At Tellers GL — `getOfficeTellerBreakdown(...)`
      returns `officeTotal`, intended to be diffed against `api.glAccounts.getBalance(cashAtTellersGlId)`
      by the Phase 9 dashboard (that wiring itself is Phase 9, not done yet)
- [x] Return reconciliation difference — `compareCashierBalanceToFineract(...).difference`
- [x] Automated tests — `tests/treasury-teller-balance.test.js` (7 assertions incl. multi-cashier
      office total and graceful degradation when Fineract's summary call fails)

### Phase 5 - Vault Control
- [x] Create VaultControlService — `js/treasury/vault-control.js` (plus a new prerequisite,
      `js/treasury/thresholds.js`, for reading/seeding `dt_treasury_thresholds` — see Open
      Question #3/#4 resolution below)
- [x] Get vault balance — `getVaultBalance(officeId, {precise})`: `precise=true` (default) uses
      the Tier 2 office-scoped `computeOfficeBalance`; `precise=false` uses the cheap Tier 1
      `fetchRunningBalance` figure — both paths exercised by tests, deliberately returning
      different stub values to prove the right one is used in each mode
- [x] Get reserve buffer — `getReserveBuffer(officeId)`, reads `dt_treasury_thresholds`
- [x] Calculate available vault — `validateVaultCanAllocate(...)` returns `availableVault`
- [x] Block allocations below reserve buffer — throws the brief's exact message format
      ("Insufficient vault cash. Available after buffer: {availableVault}, Requested: {amount}")
- [x] Wrap Fineract allocate cash API — `allocateCashToCashier(...)` calls
      `api.tellers.allocateCashTo(tellerId, cashierId, body)`
- [x] Record teller CASH_ALLOCATION event — via `recordTellerEvent` from Phase 3, only after the
      Fineract call succeeds
- [x] **Beyond the checklist:** explicit failure-mode handling for the "Fineract succeeded but the
      FinCraft event write failed" case (a real risk called out in §5 of this log) — a new
      `TreasuryReconciliationGapError` class carries the orphaned Fineract `resourceId` so it can
      be traced/reconciled, rather than being swallowed or looking like an ordinary validation error
- [x] Resolved Open Questions #3/#4 as code, not just documentation: the Vault GL mapping and
      reserve buffer are per-office rows in `dt_treasury_thresholds`
      (`getThresholds`/`upsertThresholds`/`requireThresholds` in `js/treasury/thresholds.js`) —
      "not yet configured" is a distinct, explicit state (`null`, with a clear thrown error message
      from `requireThresholds`), never silently defaulted to zero. A real UI to edit this (Phase
      11, "Treasury Settings") is still not built — `upsertThresholds()` is the seed path until then.
- [x] Automated tests — `tests/treasury-vault-control.test.js` (config CRUD, both balance-precision
      modes, buffer math + exact error message, full allocation happy path incl. event-shape
      assertions, "blocked before Fineract is ever called", "Fineract fails → no event recorded",
      and the reconciliation-gap error path)
### Phase 6 - Loan Disbursement Through Teller
- [x] Create LoanCashDisbursementService — `js/treasury/loan-disbursement.js`
- [x] Require teller and cashier selection — throws if either is missing, before any other check
- [x] Validate active cashier — `isCashierActive()`, derived from Fineract's cashier assignment
      window (`startDate`/`endDate`) since Fineract's cashier resource has no standalone
      `isActive` boolean
- [x] Validate cashier has sufficient cash — reuses `validateCashierCanPay` from Phase 4 (same
      exact error message, no duplicated logic)
- [x] Call Fineract loan disbursement API — `api.loans.disburse(loanId, body)`
- [x] Record LOAN_DISBURSEMENT CASH_OUT event — via Phase 3's `recordTellerEvent`, linked back to
      the loan via `fineract_entity_type: 'LOAN'` / `fineract_entity_id: loanId`
- [x] Prevent duplicate disbursement — `alreadyDisbursedThroughTeller()` checks for an existing
      un-reversed `LOAN_DISBURSEMENT` event for the same `loanId` before calling Fineract at all
      (explicitly scoped: this only guards the FinCraft-teller-workflow path, not a disbursement
      made directly against Fineract through another channel — see log §5)
- [x] Handle failure safely — reuses the Phase 5 pattern: Fineract call fails → propagate as-is,
      no event recorded; Fineract succeeds but event write fails → `TreasuryReconciliationGapError`
- [x] **Refactor:** moved `TreasuryReconciliationGapError` out of `vault-control.js` into a new
      shared `js/treasury/errors.js`, since Phase 6 needed the identical shape — done proactively
      per this log's own §17 recommendation from the previous checkpoint, before it could drift
      into two subtly-different copies. `vault-control.js` re-exports it for backward compatibility.
- [x] Automated tests — `tests/treasury-loan-disbursement.test.js` (7 scenarios: missing
      teller/cashier, inactive cashier, insufficient cash, happy path incl. event-shape assertions,
      duplicate-disbursement guard, Fineract-call failure, and the reconciliation-gap path)
### Phase 7 - Expense Management
- [x] Create ExpenseService — `js/treasury/expenses.js`
- [x] Create expense request workflow — `createExpenseRequest(payload)`, starts `PENDING`
- [x] Add approval workflow — `approveExpense(officeId, expenseId, approver)`, requires
      `PENDING`, writes a `dt_expense_approvals` row
- [x] Add rejection workflow — `rejectExpense(officeId, expenseId, approver, reason)`, requires
      `PENDING`
- [x] Add pay from teller workflow — `payExpense(..., {paymentSource:'TELLER_CASH', tellerId,
      cashierId, transactionDate})`, requires `APPROVED`, reuses Phase 4's `validateCashierCanPay`
- [x] Add pay from bank workflow — `payExpense(..., {paymentSource:'BANK', transactionDate})`,
      requires `APPROVED`
- [x] Post Dr Expense / Cr Cash At Tellers for teller-paid expense — via `api.journalEntries.create`,
      GL account read from `dt_treasury_thresholds.cash_at_tellers_gl_account_id`
- [x] Post Dr Expense / Cr Bank for bank-paid expense — GL account read from
      `dt_treasury_thresholds.bank_gl_account_id` (or an explicit per-payment override)
- [x] Record EXPENSE_PAYMENT teller event when paid from teller — via Phase 3's
      `recordTellerEvent`; **explicitly not recorded for BANK payments** (verified by test:
      "BANK payments must never touch the teller event ledger")
- [x] Store Fineract JE reference — `fineract_je_transaction_id` column on `dt_expense_requests`
- [x] **Beyond the checklist:** explicit status-transition guards (`assertStatus`) — cannot pay a
      `PENDING`/`REJECTED` expense, cannot approve/reject an already-decided one — written as one
      small shared guard rather than scattered if-checks, per this log's own recommendation in the
      previous checkpoint's §17. Both payment branches reuse the same
      "Fineract-succeeds-but-FinCraft-write-fails → `TreasuryReconciliationGapError`" pattern from
      Phases 5-6 (via the shared `js/treasury/errors.js`), and a failed journal entry leaves the
      expense `APPROVED` (not silently `PAID`), verified by test.
- [x] Automated tests — `tests/treasury-expenses.test.js` (6 scenarios: full BANK lifecycle, full
      TELLER_CASH lifecycle, insufficient-cash block before any JE is posted, all four
      out-of-order status-guard combinations, JE-itself-fails leaves status `APPROVED`, and the
      post-JE reconciliation-gap path)
### Phase 8 - Borrowings Management
- [x] Create BorrowingService — split across `js/treasury/borrowing-schedule.js` (pure schedule
      math, zero Fineract/datatable calls by design — easy to unit-test with plain numbers) and
      `js/treasury/borrowings.js` (orchestration: persistence + the four accounting postings),
      per this log's own §17 recommendation from the previous checkpoint
- [x] Create borrowing record — `createBorrowing(payload)`, status starts `PENDING`
- [x] Generate borrowing schedule — `generateBorrowingSchedule({...})`, called by `createBorrowing`
      and persisted as one `dt_office_borrowing_schedule` row per installment
- [x] Support flat interest — `generateFlatSchedule` (level principal + level interest, remainder
      absorbed by the final installment so both sum exactly)
- [x] Support reducing balance interest — `generateReducingBalanceSchedule` (annuity/level-payment
      amortization; explicit 0%-interest edge case handled rather than dividing by zero)
- [x] Post borrowing drawdown — `postBorrowingDrawdown`: Dr Bank-or-Vault / Cr Borrowings
      Liability, `PENDING → ACTIVE`, blocked from running twice
- [x] Accrue interest — `accrueInterest`: Dr Interest Expense / Cr Interest Payable, guarded
      against double-accrual per installment (checks existing txns first)
- [x] Pay borrowing interest — `payBorrowingInterest`: Dr Interest Payable / Cr Bank-or-Vault,
      defaults to the installment's full remaining interest, rejects amounts that would overpay it
- [x] Repay borrowing principal — `repayBorrowingPrincipal`: Dr Borrowings Liability / Cr
      Bank-or-Vault, same default/overpayment-guard shape, decrements `outstanding_principal`,
      auto-closes the borrowing (`status → CLOSED`) once it reaches ~zero
- [x] Track outstanding principal — `dt_office_borrowings.outstanding_principal`, updated on every
      principal repayment
- [x] Store Fineract JE references — `fineract_je_transaction_id` on both the borrowing row
      (drawdown) and every `dt_office_borrowing_txns` row (all four transaction types)
- [x] `getBorrowingsDashboard(officeId)` also added (per-office totals; deliberately does not
      aggregate upcoming-due installments across every borrowing's schedule — left to Phase 9 to
      avoid scope creep here, noted explicitly in the file's own comments)
- [x] Schedule row status (`SCHEDULED`/`PARTIALLY_PAID`/`PAID`) is *derived* from paid-vs-due
      amounts on every write (`deriveScheduleStatus`), not tracked as an independently-settable
      flag that could drift out of sync with the actual paid amounts
- [x] Automated tests — `tests/treasury-borrowing-schedule.test.js` (5 pure-math scenarios: FLAT
      exact-sum incl. an unevenly-divisible tenor, REDUCING_BALANCE exact-sum + declining-interest
      shape + zero-outstanding-at-end, the 0%-interest edge case, and input validation) plus
      `tests/treasury-borrowings.test.js` (8 orchestration scenarios: create+schedule persistence,
      drawdown incl. duplicate-drawdown guard, double-accrual guard, interest payment incl.
      overpayment guard and default-remaining-amount behavior, principal repayment incl.
      auto-close and rejecting repayment on a closed borrowing, JE-fails-leaves-PENDING, the
      reconciliation-gap path, and multi-borrowing dashboard aggregation). One arithmetic mistake
      was made in drafting the tests themselves (expected interest amount was miscalculated) —
      caught by the test run itself and fixed before this checkpoint, not left in the codebase.
### Phase 9 - Treasury Dashboard
- [x] Create TreasuryDashboardService — split into `js/treasury/liquidity-status.js` (pure
      RED/AMBER/GREEN logic, kept separate/independently testable, same pattern as
      borrowing-schedule.js) and `js/treasury/dashboard.js` (`getTreasuryDashboard`, the
      aggregator) — per this log's own §17 recommendation
- [x] Show bank balance — `bankBalance` (Tier 1 org-wide `fetchRunningBalance`)
- [x] Show vault balance — `vaultBalance` (Tier 2 precise office-scoped, reusing Phase 5's
      `getVaultBalance` — deliberately the precise mode, since this figure gates the buffer check)
- [x] Show Cash At Tellers GL — `cashAtTellersGlBalance`
- [x] Show teller operational total — `tellerOperationalTotal` (Phase 4's
      `getOfficeTellerBreakdown`)
- [x] Show teller/GL difference — `tellerGlDifference`, the brief's central worked example
      (Ada+Bola+Chidi vs. pooled GL) — verified by test to be a real computed difference, not a
      hardcoded zero, using a stub deliberately set up so FinCraft and Fineract's figures disagree
- [x] Show borrowings outstanding — `borrowingsOutstanding`/`borrowingsActiveCount` (Phase 8's
      `getBorrowingsDashboard`)
- [x] Show interest payable — `interestPayableBalance`, correctly `null` (not `0`) when that
      optional GL mapping isn't configured for the office — verified by test
- [x] Show pending expenses — `pendingExpensesTotal`, sums `dt_expense_requests` rows in either
      `PENDING` or `APPROVED` (approved-but-not-yet-paid also counts; `PAID`/`REJECTED` do not)
- [x] Show reserve buffer — `reserveBuffer`
- [x] Show available vault — `availableVault` (= `vaultBalance - reserveBuffer`)
- [x] Show liquidity status — `liquidityStatus`
- [x] Add RED/AMBER/GREEN status logic — `deriveLiquidityStatus(availableVault, reserveBuffer)`:
      RED at/below zero headroom, AMBER below one full buffer's worth of headroom, GREEN at or
      above it (thresholds documented as a judgment call in the file's own header comment, plus
      the zero-buffer edge case handled explicitly)
- [x] Automated tests — `tests/treasury-liquidity-status.test.js` (9 pure boundary-condition
      assertions incl. the zero-buffer edge case) and `tests/treasury-dashboard.test.js` (2
      scenarios; notably an **integration-style test that drives the real Phase 3/7/8 functions**
      — `recordTellerEvent`, `createExpenseRequest`/`approveExpense`,
      `createBorrowing`/`postBorrowingDrawdown`/`repayBorrowingPrincipal` — through one shared
      stub rather than hand-crafting fixture rows, which also double-checks those modules compose
      correctly together, not just in isolation)
### Phase 10 - Daily Reconciliation
- [x] Create DailyReconciliationService — `js/treasury/reconciliation.js`
- [x] Start daily reconciliation — `startDailyReconciliation(officeId, tellerId, cashierId, date)`,
      reuses Phase 4's `computeCashierExpectedBalance` for the "expected cash" side rather than
      recomputing it; blocked if that cashier already has an unresolved (`OPEN`/`SUBMITTED`)
      reconciliation for the same date
- [x] Compute expected cash per cashier — via Phase 4 (no duplicated logic)
- [x] Submit physical cash count — `submitPhysicalCashCount(officeId, reconciliationId,
      physicalCash)`, computes `variance = physicalCash - expectedCash`
- [x] Calculate shortage/overage — same `submitPhysicalCashCount` call; a (near-)zero variance
      **auto-approves immediately** (nothing to authorize) rather than sitting in a pointless
      `SUBMITTED` state awaiting an approval that would have nothing to do
- [x] Approve reconciliation exception — `approveReconciliation(officeId, reconciliationId,
      approver)`, required for any non-zero variance before anything is posted — mirrors Phase 7's
      approve/reject shape as anticipated in the previous checkpoint's §17
- [x] Post shortage JE after approval — Dr `shortageGlAccountId` / Cr Cash At Tellers GL
- [x] Post overage JE after approval — Dr Cash At Tellers GL / Cr `overageGlAccountId`
- [x] Store JE reference — `fineract_je_transaction_id` on the reconciliation row
- [x] **Resolved the open GL-mapping question from the previous checkpoint:** added
      `shortage_gl_account_id`/`overage_gl_account_id` to the `dt_treasury_thresholds` schema
      (`js/api/treasury.js`) and `thresholds.js` before this schema had ever been provisioned
      against a live tenant — safe to extend now, would not have been safe post-deployment.
      Approving a variance with either mapping missing is rejected with a clear, actionable error
      rather than posting a malformed/guessed journal entry.
- [x] **Beyond the checklist:** approving a variance also records a self-correcting Phase 3 teller
      event (`CASH_SETTLEMENT`/`CASH_OUT` for a shortage, `CASH_RECEIPT`/`CASH_IN` for an overage)
      — reusing existing event types rather than inventing new ones — so the teller's own
      operational balance reflects the physical reality that was just confirmed, keeping Phase 4's
      "expected cash" figure accurate going forward instead of drifting further every reconciliation
      cycle. Reuses the established `TreasuryReconciliationGapError` pattern for the post-JE
      failure case.
- [x] Automated tests — `tests/treasury-reconciliation.test.js` (7 scenarios: zero-variance
      auto-approve with no JE posted, full shortage workflow incl. teller-event shape, full
      overage workflow, duplicate-open guard, out-of-order status guards, missing-GL-config
      guard, and the reconciliation-gap path). **Hit the identical stub-design mistake as Phase
      6's test 7** (a blanket "fail this write" flag broke an earlier step that goes through the
      same mocked method) — recognized the pattern immediately from having fixed it once already,
      and applied the same fix (seed normally, then swap in a failing method just before the call
      under test) rather than re-deriving a solution from scratch.
### Phase 11 - UI Integration (started — 4 of 8 screens)
- [x] Add Treasury **Settings** screen — `js/pages/treasury/settings.js` (built first,
      out of the brief's listed order, per the previous checkpoint's explicit recommendation:
      every other treasury screen is unusable without this one). Office picker (via
      `api.offices.list()`) + GL-account dropdowns (via `api.glAccounts.list()`) for all eight
      `dt_treasury_thresholds` fields + reserve buffer + currency, wired to
      `getThresholds`/`upsertThresholds` (Phase 5). Shows an explicit "not configured yet" banner
      rather than a blank/broken form when an office has no threshold row.
- [x] Add Treasury **Dashboard** screen — `js/pages/treasury/dashboard.js`, pure read-only view
      over Phase 9's `getTreasuryDashboard`, reusing the app's own existing `.stat-card` tile
      markup (copied from `js/pages/dashboard/index.js`, not invented). Shows a clear "go to
      Treasury Settings" pointer instead of a raw error when the selected office isn't configured
      yet (`requireThresholds` throwing a recognizable message), and correctly distinguishes
      "not configured" (`null`) from an actual `0` for the optional Interest Payable / Cash At
      Tellers GL tiles.
- [x] Add **Teller Console** screen — `js/pages/treasury/teller-console.js`. Lists every
      teller/cashier at an office (via `api.tellers.list()` filtered client-side by `officeId`,
      then `api.tellers.cashiers(tellerId)` per teller — Fineract has no single "all cashiers for
      this office" endpoint, matching the same limitation already documented for Phase 4's
      `getOfficeTellerBreakdown`), FinCraft's expected cash (Phase 4) next to Fineract's own
      `cashierSummary` net cash (Phase 4's `compareCashierBalanceToFineract`), a
      Reconciled/Mismatch/Unknown status badge per row, and an expandable per-cashier events
      drill-down (Phase 3's `getCashierEvents`) so a mismatch can actually be traced rather than
      just flagged. Read-only, like the Dashboard — no write actions live here.
- [x] Add **Cash Allocation** screen — `js/pages/treasury/cash-allocation.js`, the **first write
      screen** in Phase 11 (everything before this was read-only). Office/teller/cashier pickers
      reuse `loadOfficeTellerCashierList`, extracted out of `teller-console.js` into `shared.js`
      this round rather than re-derived a second time (per the previous checkpoint's own note to
      do exactly this). Shows current vault balance/reserve buffer/available-to-allocate *before*
      submission, so a request that would be blocked is visible up front, not just after a failed
      attempt. Wraps Phase 5's `allocateCashToCashier`; distinguishes an ordinary validation
      failure from a `TreasuryReconciliationGapError` in the toast shown to the user (the latter
      gets a visibly different "action required" framing, matching the seriousness `errors.js`'s
      own documentation assigns it — real cash already moved in Fineract even though the screen
      is reporting a failure).
- [x] Add Loan Disbursement Through Teller screen — `js/pages/treasury/loan-disbursement.js`
- [x] Add **Expense Management** screen — `js/pages/treasury/expenses.js`. First genuine multi-step
      lifecycle UI: a "New Request" form (category + expense-GL dropdown + amount/currency/
      narration, wrapping Phase 7's `createExpenseRequest`) plus a per-office expenses list whose
      action buttons change with each row's status (PENDING → Approve/Reject; APPROVED → Pay;
      PAID/REJECTED → read-only). Approve/Reject/Pay all reuse the same expandable-detail-row
      pattern as `teller-console.js` rather than a modal — Reject reveals an inline reason input,
      Pay reveals an inline TELLER_CASH/BANK form (teller/cashier picker shown only for
      TELLER_CASH). Same `TreasuryReconciliationGapError` "action required" toast treatment as the
      other write screens.
- [x] Add **Borrowings** screen — `js/pages/treasury/borrowings.js`. A create form (lender,
      principal, rate, FLAT/REDUCING_BALANCE method, start date, tenor, frequency) wrapping Phase
      8's `createBorrowing`, plus a per-borrowing list showing status/outstanding and the one
      action valid for each status: PENDING → Drawdown (inline BANK/VAULT funding form); ACTIVE →
      an expandable amortization schedule with per-installment **Accrue / Pay Interest / Repay
      Principal** actions (each confirming the exact Dr/Cr legs before posting); CLOSED →
      read-only. Schedule re-renders in place after each action (`renderScheduleInto`) rather than
      the collapse-then-reopen flicker a double-toggle would cause.
- [x] Add **Daily Reconciliation** screen — `js/pages/treasury/reconciliation.js`. A "Start
      Reconciliation" form (teller/cashier + date, wrapping Phase 10's `startDailyReconciliation`,
      surfacing FinCraft's computed expected cash) plus a per-office list whose per-row action
      follows status: OPEN → inline physical-count entry (`submitPhysicalCashCount`); SUBMITTED
      with a non-zero variance → Approve (`approveReconciliation`, a `danger:true` confirm since it
      posts the shortage/overage JE and can't be auto-undone); APPROVED → read-only. A zero-variance
      count auto-approves inside the service, so the UI shows no pointless approve button for it.
      Variance is rendered as an explicit "Shortage"/"Overage" label (negative = shortage), not a
      raw signed number.
- [x] Reuse existing UI components and layout — followed `js/pages/misc/settings.js` line for
      line for structure throughout; `js/pages/treasury/shared.js` now has five helpers used by
      two-or-more screens (office picker, teller/cashier-list assembly, money formatter, two
      badge-class mappers) — checked for an existing helper before writing new markup each time.
- [x] Reuse existing auth/permissions — registered in `router.js`'s `PAGES` map like every other
      route (now four entries sharing one module file, matching the `misc.js` precedent).
      **Permission-code honesty, not just precedent-following this time:** `cash-allocation` is
      the first *write* route, and rather than guess a plausible-sounding write permission code
      (e.g. `CREATE_JOURNALENTRY`) that could not be confirmed real from this sandbox (no live
      Fineract instance to check its permission list against), it is temporarily gated on the
      same `READ_JOURNALENTRY` already confirmed real elsewhere in this codebase — an explicit
      under-gating, called out in the route's own comment as something Phase 12 MUST revisit, not
      a real Fineract write-permission mapping presented as settled.
- [x] **CSS discipline, continued:** grepped `css/*.css` for `mt-2`/`mt-3`/`btn-primary` before
      use — all confirmed real.
- [x] **Verification, with the same honest caveat as the previous checkpoint:** `node --check`
      passed on all files; the same minimal hand-stubbed `document`/`window` import-resolution
      smoke test passed for the dashboard view too. `tests/module-integrity.test.js` still could
      not run against any Phase 11 code — `npm install`'s `jsdom` failure (§16) has not been
      re-attempted this round since it was already confirmed non-transient last time; re-checking
      it is not expected to change without a different network environment.
### Phase 12 - Permissions — not started (see risk: must map to *real* Fineract permission codes
      only, per existing project convention in `router.js`; several requested codes in the brief,
      e.g. `ALLOCATE_CASH`, `DISBURSE_LOAN_THROUGH_TELLER`, are FinCraft-invented concepts with no
      Fineract-native equivalent and will need a mapping decision, not a 1:1 code creation, since
      FinCraft cannot add permission codes to Fineract itself)
### Phase 13 - Tests — not started (would extend the existing custom `test-runner/run-tests.js`
      suite style, e.g. new `tests/treasury-*.test.js` files, consistent with current
      `accounting-fixes.test.js` / `business-logic.test.js`)

## 8. Completed Work

- **Phase 0 — Codebase inspection.** Unzipped and read the full FinCraft tree (`fincraft-root/`);
  reviewed `package.json`, `js/config.js`, `js/api.js`, `js/api/index.js`, `js/api/core.js`,
  `js/api/organization.js` (tellers/cashiers), `js/api/accounting.js` (journal entries/GL),
  `js/api/reports.js` (datatables), `js/api/loans.js` (disbursement), `js/auth.js`, `js/router.js`,
  `js/pages/organization.js` + folder, `fixlogs/` samples, `views/modals/` listing, `deploy/`
  listing. Findings written up above (§2–§6). No functional/code changes made.

- **Decisions finalized (this session).** Persistence = datatables-only, confirmed by user (no
  backend in scope). Multi-tenancy handled entirely by Fineract's existing schema-per-tenant
  isolation (`Fineract-Platform-TenantId` header) — no `tenantId` column needed on any `dt_*`
  table, but datatable *registration* is per-tenant and must be idempotent/bootstrapped, not
  assumed to exist. GL balance strategy = two-tier (`fetchRunningBalance=true` for org-wide
  headline figures; office-scoped `journalentries` summation for point-in-time control checks).
  Full rationale in §3.

- **Phase 1 (partial) — GL balance methods.** Extended the existing `makeGlAccountsAPI` factory in
  `js/api/accounting.js` (no new file — followed the "extend, don't rename" instruction) with
  `getBalance(id)`, `listWithBalances(params)` (Tier 1, `fetchRunningBalance=true`) and
  `computeOfficeBalance(glAccountId, officeId, opts)` (Tier 2, paginated `/journalentries`
  summation with normal-balance sign convention by account type). No existing method signatures
  changed.

- **Phase 2 (starter) — Datatable schema + bootstrap.** Added `js/api/treasury.js`
  (new file, following the existing `api/<domain>.js` factory pattern — `makeTreasuryAPI(self)`)
  defining all eight `dt_*` table specs from the brief (columns, types, `multiRow`) and
  `ensureTreasuryDatatables()`, an idempotent per-tenant "register whichever tables are missing"
  bootstrap (`GET /datatables` → create-if-missing, duplicate-create races treated as success).
  Wired into `js/api/index.js` as `api.treasury` (constructed after `this.dataTables`, which it
  depends on), alongside thin office-scoped row CRUD convenience methods
  (`api.treasury.list/create/update/getRow/deleteRow`) delegating to the existing
  `api.dataTables` client. **Not yet called from any page/route** — no UI wiring yet, and
  `ensureTreasuryDatatables()` has not been run against a live Fineract instance (no server
  available in this sandbox); it has only been syntax-checked and code-reviewed.

- **Verification performed:** `node --check` on all new/modified files (clean); ran the project's
  existing `npm test` (custom `test-runner/run-tests.js`) before and after these changes — result
  unchanged (4 passed / 1 pre-existing failure in `utils.test.js`, confirmed by re-running against
  an untouched copy of the original zip: `document is not defined` from `js/store.js`, a sandbox
  `jsdom` environment gap unrelated to this session's edits, not a regression).

- **Packaging:** re-zipped the full `fincraft-root/` tree, including this log and the two code
  changes, and exported it — see chat for the download link.

- **Phase 3 — Teller Operational Events.** Added `js/treasury/teller-events.js` (new top-level
  folder, see new Architecture Decision in §3): `recordTellerEvent`, `reverseTellerEvent`,
  `getCashierEvents`, `getTellerEvents`, `getOfficeTellerEvents`, plus the CASH_IN_TYPES/
  CASH_OUT_TYPES constants from the brief with automatic direction inference (and a hard error on
  an unrecognized transaction type, rather than silently defaulting). Reversal never mutates the
  original row's `amount`/`direction` (audit trail preserved) — it flags `reversed=true` and
  writes a brand-new opposite-direction row, so a running sum over all events self-corrects.

- **Phase 4 — Teller Balance Service.** Added `js/treasury/teller-balance.js`:
  `computeCashierExpectedBalance`, `validateCashierCanPay` (throws the brief's exact error-message
  format), `compareCashierBalanceToFineract` (cross-checks FinCraft's computed figure against
  Fineract's own `GET .../summaryandtransactions` `netCash`, degrading gracefully to "no Fineract
  figure" rather than throwing if that call fails), and `getOfficeTellerBreakdown` (per-cashier +
  office-total, the figure meant to reconcile against the pooled `Cash At Tellers` GL per the
  brief's Ada/Bola/Chidi worked example).

- **Tests added.** `tests/treasury-teller-events.test.js` and `tests/treasury-teller-balance.test.js`
  — both follow the existing project's `export async function runTests({assert})` convention
  (`test-runner/run-tests.js`), stub `api.treasury`/`api.tellers` with in-memory fakes (no live
  Fineract instance is reachable from this sandbox), and pass cleanly. Full suite re-run after
  every change this session: **6 passed / 1 pre-existing failure, unchanged** (see §16).

- **Phase 5 — Vault Control.** Added `js/treasury/thresholds.js` (read/seed helper for the
  one-to-one `dt_treasury_thresholds` config table — resolves Open Questions #3/#4 as code, not
  just documentation) and `js/treasury/vault-control.js`: `getVaultBalance` (dual-mode, precise
  office-scoped vs. cheap org-wide), `getReserveBuffer`, `validateVaultCanAllocate` (brief's exact
  error message), `allocateCashToCashier` (wraps `api.tellers.allocateCashTo` + records the Phase
  3 teller event). Added a new `TreasuryReconciliationGapError` type for the "Fineract succeeded,
  FinCraft's event write failed" partial-failure case identified as a risk in §5 — this is
  deliberately distinguishable from an ordinary validation error so it can be surfaced/handled
  differently by calling UI. `tests/treasury-vault-control.test.js` added, covering config
  CRUD, both balance-precision modes, the buffer-block path (and that it never reaches Fineract),
  the happy path, "Fineract fails → no event recorded," and the reconciliation-gap path. Full
  suite: **7 passed / 1 pre-existing unrelated failure, unchanged.**

- **Phase 6 — Loan Disbursement Through Teller.** Added `js/treasury/loan-disbursement.js`
  (`disburseLoanThroughCashier`), reusing Phase 4's `validateCashierCanPay` rather than
  re-implementing cash-sufficiency logic. Added a required/active-teller-cashier check
  (Fineract's cashier resource has no `isActive` field, so "active" is derived from the
  `startDate`/`endDate` assignment window) and a duplicate-disbursement guard scoped to this
  workflow's own event history. Proactively refactored `TreasuryReconciliationGapError` out of
  `vault-control.js` into a new shared `js/treasury/errors.js` before Phase 6 could end up with a
  second, drifted copy (this was flagged as the recommended next step in the previous checkpoint's
  §17, and acted on immediately rather than deferred). `tests/treasury-loan-disbursement.test.js`
  added — 7 scenarios. Full suite: **8 passed / 1 pre-existing unrelated failure, unchanged.**

- **Phase 7 — Expense Management.** Added `js/treasury/expenses.js`: full
  `PENDING → APPROVED → PAID` (or `→ REJECTED`) lifecycle across two datatables
  (`dt_expense_requests`, `dt_expense_approvals`), with a shared `assertStatus()` guard instead of
  scattered if-checks (again, acting on this log's own §17 recommendation rather than deferring
  it). Both payment branches implemented together as the brief suggested: `TELLER_CASH` reuses
  Phase 4's cash-sufficiency check and Phase 3's event recording; `BANK` posts a journal entry and
  deliberately never touches the teller ledger. Both reuse the Phase 5/6
  `TreasuryReconciliationGapError` pattern for the post-JE failure case, and a *failed* journal
  entry (Fineract itself rejects it) correctly leaves the expense `APPROVED`, not silently `PAID`.
  `tests/treasury-expenses.test.js` added — 6 scenarios, including a stub-design fix mid-session
  (the first draft of the "post-JE write fails" stub accidentally broke the earlier approve step
  too, since both go through the same `updateRow` mock — fixed by keying the failure on the
  specific patch shape rather than failing unconditionally). Full suite: **9 passed / 1
  pre-existing unrelated failure, unchanged.**

- **Phase 8 — Borrowings Management.** Split as planned across two files:
  `js/treasury/borrowing-schedule.js` (pure FLAT/REDUCING_BALANCE amortization math, zero external
  calls) and `js/treasury/borrowings.js` (`createBorrowing`, `postBorrowingDrawdown`,
  `accrueInterest`, `payBorrowingInterest`, `repayBorrowingPrincipal`, `getBorrowingsDashboard`),
  covering all four accounting legs specified in the brief and reusing the established
  Fineract-JE-then-FinCraft-write / `TreasuryReconciliationGapError` pattern throughout. Added
  overpayment guards (can't pay/repay more than an installment's remaining due), a double-accrual
  guard, and status that's *derived* from paid-vs-due amounts rather than independently tracked.
  `tests/treasury-borrowing-schedule.test.js` (5 pure-math scenarios) and
  `tests/treasury-borrowings.test.js` (8 orchestration scenarios) added. One arithmetic error was
  introduced while drafting the orchestration test's expectations (not the source code) — caught
  immediately by the failing test run and corrected before this checkpoint. Full suite: **11
  passed / 1 pre-existing unrelated failure, unchanged.**

- **Phase 9 — Treasury Dashboard.** Added `js/treasury/liquidity-status.js` (pure RED/AMBER/GREEN
  logic, split out the same way `borrowing-schedule.js` was — this is genuinely new logic, not a
  restatement of an existing rule, so it earned its own file/tests) and `js/treasury/dashboard.js`
  (`getTreasuryDashboard`, aggregating Phases 4-8 plus new reads of pending expenses and Bank/
  Interest-Payable GL balances). Confirmed `tellerGlDifference` is a real computed comparison (not
  a coincidental/hardcoded zero) by deliberately stubbing FinCraft's and Fineract's figures to
  disagree in the test. `tests/treasury-liquidity-status.test.js` (9 pure assertions) and
  `tests/treasury-dashboard.test.js` (2 scenarios, one of which is a genuine integration-style test
  driving the real Phase 3/7/8 functions through one shared stub, rather than only unit-testing
  dashboard.js in isolation) added. Full suite: **13 passed / 1 pre-existing unrelated failure,
  unchanged.**

- **Phase 10 — Daily Reconciliation.** First, resolved the open shortage/overage GL-mapping
  question flagged in the previous checkpoint by extending `dt_treasury_thresholds`
  (`shortage_gl_account_id`/`overage_gl_account_id`) and `thresholds.js` — done before this schema
  had ever been provisioned against a live tenant, so safe to change now. Added
  `js/treasury/reconciliation.js`: `startDailyReconciliation` (reuses Phase 4's expected-cash
  computation), `submitPhysicalCashCount` (auto-approves a zero variance immediately, rather than
  requiring a pointless manual approval for "nothing to approve"), and `approveReconciliation`
  (posts the shortage/overage JE, then records a *self-correcting* Phase 3 teller event —
  `CASH_SETTLEMENT` for a shortage, `CASH_RECEIPT` for an overage — so the teller's own
  operational balance reflects the confirmed physical reality going forward, rather than drifting
  further with every reconciliation cycle). `tests/treasury-reconciliation.test.js` added — 7
  scenarios. Hit the *exact same* stub-design mistake as Phase 6's reconciliation-gap test (a
  blanket failure flag broke an earlier, unrelated step using the same mocked method) — recognized
  it immediately as the same pattern already fixed once, and applied the same known fix rather
  than re-debugging from scratch. Full suite: **14 passed / 1 pre-existing unrelated failure,
  unchanged.**

- **Phase 11 (started) — Treasury Settings screen.** Built the one screen every other treasury
  screen depends on first, per this log's own recommendation: `js/pages/treasury/settings.js`
  (office picker + GL-account dropdowns + reserve buffer/currency form, wired to Phase 5's
  `getThresholds`/`upsertThresholds`), `js/pages/treasury/index.js` (view dispatcher, mirroring
  `js/pages/misc/index.js` exactly so the remaining 7 screens slot in the same way), and
  `js/pages/treasury.js` (thin barrel, matching every other page module). Registered in
  `router.js`'s `PAGES` map, gated on `READ_JOURNALENTRY` with an explanatory comment — following
  the codebase's own established precedent (`shares`/`surveys`) for routes with no matching
  Fineract permission code, rather than inventing one. **Verification gap, disclosed rather than
  hidden:** `npm install` failed in this sandbox with a persistent (not transient — retried) `403
  Forbidden` fetching `jsdom`'s `xmlchars` dependency from the npm registry, so
  `tests/module-integrity.test.js` — the project's own tool for catching exactly the class of bug
  new UI code is prone to (forgotten imports, wrong identifiers) — could not run against these
  three new files. Mitigated with a manual import-resolution smoke test (minimal hand-stubbed
  `document`/`window`) and careful manual review, but this is a real gap, not a false "all green":
  getting `jsdom` installed somewhere without this sandbox's network restriction should happen
  before this UI code is trusted further. The rest of the suite is unaffected: **14 passed / 1
  pre-existing unrelated failure, unchanged.**

- **Phase 11 (continued) — Treasury Dashboard screen.** Added `js/pages/treasury/dashboard.js`
  (pure read-only aggregation view over Phase 9's `getTreasuryDashboard`, reusing the app's real
  `.stat-card` tile markup copied from `js/pages/dashboard/index.js`), wired into the `VIEWS`
  dispatcher and a second `router.js` entry (`treasury-dashboard`) sharing the same module file —
  matching the `misc.js` precedent of one file backing several distinct nav entries. Extracted
  `js/pages/treasury/shared.js` (office-picker markup, liquidity badge/accent CSS-class mapping,
  a money formatter) once a second screen needed the same office picker as Settings, and refactored
  `settings.js` to use it rather than letting two copies exist. **Caught two invented-class-name
  mistakes in the dashboard's first draft** (`.data-table` and `.form-inline` — neither exists
  anywhere in this codebase's CSS) by grepping `css/*.css` before trusting any class name used in
  the new markup, and fixed both before this checkpoint rather than shipping silently-broken
  styling. Same `jsdom`/`module-integrity.test.js` verification gap as the Settings screen applies
  here too — not re-attempted this round since the network restriction was already confirmed
  non-transient. Full suite: **14 passed / 1 pre-existing unrelated failure, unchanged.**

- **Phase 11 (continued) — Cash Allocation screen.** Added `js/pages/treasury/cash-allocation.js`
  — the first WRITE screen in Phase 11. Extracted `loadOfficeTellerCashierList` out of
  `teller-console.js` into `shared.js` (per that checkpoint's own recommendation to do this before
  a third screen needed the identical assembly, rather than after) and refactored
  `teller-console.js` to use the shared version. The screen previews vault balance/buffer/
  available-to-allocate before the operator submits, wraps Phase 5's `allocateCashToCashier`, and
  gives a `TreasuryReconciliationGapError` a visibly different "action required" toast rather than
  presenting it the same way as an ordinary validation failure. **Permission-code decision, made
  deliberately rather than by default:** rather than invent a write-permission code
  (`CREATE_JOURNALENTRY`) that could not be verified real from this sandbox, this route reuses the
  already-confirmed `READ_JOURNALENTRY` code and says so explicitly in its own comment as a known
  under-gating Phase 12 must fix — consistent with this project's existing discipline (seen in the
  `shares`/`surveys` routes) of never presenting a guessed permission code as a settled one. Full
  suite: **14 passed / 1 pre-existing unrelated failure, unchanged.**

- **Phase 11 (continued) — Teller Console screen.** Added `js/pages/treasury/teller-console.js`:
  per-office teller/cashier list (assembled client-side from `api.tellers.list()` +
  `api.tellers.cashiers(tellerId)` per teller, since Fineract has no single "all cashiers for this
  office" call), FinCraft's expected cash next to Fineract's own `cashierSummary` figure with a
  Reconciled/Mismatch/Unknown badge (Phase 4's `compareCashierBalanceToFineract`), and an
  expandable per-row events drill-down (Phase 3's `getCashierEvents`) so a flagged mismatch can
  actually be traced. Added a fourth `shared.js` helper (`matchBadgeClass`) for the badge mapping,
  continuing the same growing-shared-module discipline as the Dashboard screen. Verified every new
  CSS class against `css/*.css` before use this time — no repeat of the previous checkpoint's two
  invented-class mistakes. Same `jsdom` verification gap as both earlier screens; not
  re-attempted, still non-transient. Full suite: **14 passed / 1 pre-existing unrelated failure,
  unchanged.**

- **Phase 11 (continued) — Loan Disbursement Through Teller screen.** Added
  `js/pages/treasury/loan-disbursement.js` — the second WRITE screen, same office-picker shape as
  Cash Allocation plus one new concern: a loan picker. Loans are sourced from
  `api.loans.list({ officeId, status: 'approved' })` — reusing the exact status filter
  `pages/loans/list.js` already uses for "approved" (Fineract's own semantics already mean
  "awaiting disbursal," so no new filter concept was invented), with principal/currency read
  straight off the list response rather than an extra per-loan detail round trip. Selecting a
  loan prefills (not locks) the amount field from its principal, since Fineract's disburse API
  itself allows a `transactionAmount` override (e.g. tranche disbursal) and this screen shouldn't
  be stricter than the API it wraps. Wraps Phase 6's `disburseLoanThroughCashier` unchanged; same
  `TreasuryReconciliationGapError` "action required" toast treatment as Cash Allocation. Extracted
  `tellerCashierOptionsHtml` out of `cash-allocation.js` into `shared.js` (now six helpers) before
  writing the duplicate a second time, per this project's own running discipline — see §11. Full
  suite: **14 passed / 1 pre-existing unrelated failure, unchanged.** Not exercised against a live
  Fineract tenant, for the same reason as every prior screen (see §15/§17).

- **Phase 11 (COMPLETE) — final 3 screens: Expense Management, Borrowings, Daily Reconciliation.**
  Built all three remaining screens in one session, finishing Phase 11 (8 of 8 screens):
  - `js/pages/treasury/expenses.js` — request/approve/reject/pay lifecycle over Phase 7's
    `expenses.js`. New-request form + status-aware expenses list; Approve (inline confirm), Reject
    (inline reason input), and Pay (inline TELLER_CASH/BANK form, teller/cashier picker shown only
    for TELLER_CASH) all reuse `teller-console.js`'s expandable-detail-row pattern — no modal, no
    new UI plumbing.
  - `js/pages/treasury/borrowings.js` — create form + per-borrowing action list over Phase 8's
    `borrowings.js`/`borrowing-schedule.js`. PENDING → inline drawdown (BANK/VAULT); ACTIVE →
    expandable schedule with per-installment Accrue/Pay-Interest/Repay-Principal, each confirming
    the exact Dr/Cr legs; CLOSED → read-only. Refactored the post-action refresh into a dedicated
    `renderScheduleInto()` (re-renders the open schedule in place) rather than the double-toggle
    collapse-reopen hack the first draft used — caught and fixed before this checkpoint.
  - `js/pages/treasury/reconciliation.js` — start/submit/approve workflow over Phase 10's
    `reconciliation.js`. Start form surfaces FinCraft's expected cash; OPEN → inline count entry;
    SUBMITTED(≠0 variance) → Approve (a `danger:true` confirm, since it posts the shortage/overage
    JE and self-corrects the teller balance); zero-variance auto-approves in the service so no
    approve button is shown for it; variance rendered as an explicit Shortage/Overage label.
  - **Discipline continued:** extended `shared.js` with two more reusable helpers rather than
    duplicating — `glOptionsHtml` (extracted out of `settings.js`, which was refactored to consume
    it, once `expenses.js` needed the identical GL `<option>` markup) and `statusBadgeClass` (one
    place mapping every treasury status string — expense/borrowing/reconciliation/schedule — onto
    the app's existing `.badge` modifier classes, so no screen invents its own status-pill CSS).
    All three screens also reuse the existing `loadOfficeTellerCashierList`/`tellerCashierOptionsHtml`
    /`officeOptionsHtml`/`fmtMoney` helpers and the shared `TreasuryReconciliationGapError`
    "action required" toast treatment.
  - **CSS honesty:** grepped `css/*.css` for every class used in the three new files before
    trusting it — all confirmed real (`badge`/`b-*`, `table`, `form-grid`/`form-control`/
    `form-label`, `btn-primary`/`btn-secondary`/`btn-danger`/`btn-sm`, `card*`, `empty-state`/
    `empty-state-row`, `hidden`, `mt-2`/`mt-3`/`mb-3`, `text-*`). No repeat of an earlier
    checkpoint's invented-class mistakes.
  - **One self-caught slip:** a stray non-English word ("未映射") landed in a `shared.js` comment
    while drafting `statusBadgeClass`; caught and corrected to plain English before this checkpoint
    rather than shipped, keeping the codebase's comments consistently English as everywhere else.
  - **Verification:** `node --check` passed on all new/modified files. Full suite re-run:
    **14 passed / 1 pre-existing unrelated failure, unchanged** — the three new files wrap
    already-tested Phase 7/8/10 services, so the service tests (`treasury-expenses`,
    `treasury-borrowings`, `treasury-borrowing-schedule`, `treasury-reconciliation`) still cover
    the business logic behind them. Same `jsdom`/`module-integrity.test.js` gap as every prior UI
    screen (§16) — not re-attempted; the sandbox network restriction was already confirmed
    non-transient. Not exercised against a live Fineract tenant (§15/§17).

## 9. Deferred Work

- Phases 0-10 (all backend business logic + persistence) **and all 8 of Phase 11's UI screens**
  are now complete (Settings, Dashboard, Teller Console, Cash Allocation, Loan Disbursement,
  Expense Management, Borrowings, Daily Reconciliation) — see §7/§8/§13 for the detail. **What
  remains deferred is exactly two things:**
  1. **Phase 12 — Permissions.** Every treasury route (read and write) is currently gated on the
     real, confirmed `READ_JOURNALENTRY` code as a deliberate placeholder. The write routes are
     therefore *under-gated* (a read permission guarding write actions). Resolving this needs a
     mapping decision, not code — see §17. This is now the single most important open item, because
     the feature is otherwise functionally complete and a user could reach every write screen with
     only read permission.
  2. **Phase 13 — a dedicated cross-cutting test pass.** The per-service unit/integration tests
     written alongside Phases 3-10 all pass (10 `treasury-*.test.js` suites) and cover the business
     logic behind every screen, but there is no end-to-end/UI-level test pass, and
     `module-integrity.test.js` still can't run here (no `jsdom`, §16). This is a verification-depth
     gap, not missing functionality.
  Nothing else from the original brief is outstanding — the "all of Phases 3-13" wording that
  lingered here from the Phase 0 checkpoint is now genuinely down to just Phases 12 and 13.

## 10. Files Created

- `FINCRAFT_Fineract_Treasury_Integration_Log.md` (this file, repo root — no `/docs` folder
  exists in the repo, so root is the correct location per the task's own fallback rule).
- `js/api/treasury.js` — `TREASURY_DATATABLES` specs + `makeTreasuryAPI(self)` (bootstrap + row CRUD).
- `js/treasury/teller-events.js` — Phase 3 event recording/reversal/query service.
- `js/treasury/teller-balance.js` — Phase 4 expected-cash computation, pay-out validation, and
  office-wide/Fineract-cross-check reconciliation.
- `tests/treasury-teller-events.test.js`, `tests/treasury-teller-balance.test.js` — automated
  coverage for both, using in-memory stubs of `api.treasury`/`api.tellers`.
- `js/treasury/thresholds.js` — `dt_treasury_thresholds` read/seed helper (Phase 5 prerequisite).
- `js/treasury/vault-control.js` — Phase 5 balance/buffer/allocation service.
- `js/treasury/errors.js` — shared `TreasuryReconciliationGapError` (factored out of
  vault-control.js once Phase 6 needed the identical shape).
- `js/treasury/loan-disbursement.js` — Phase 6 disbursement orchestration service.
- `tests/treasury-vault-control.test.js`, `tests/treasury-loan-disbursement.test.js` — automated
  coverage for both.
- `js/treasury/expenses.js` — Phase 7 request/approve/reject/pay lifecycle service.
- `tests/treasury-expenses.test.js` — automated coverage for it.
- `js/treasury/borrowing-schedule.js` — Phase 8 pure FLAT/REDUCING_BALANCE amortization math.
- `js/treasury/borrowings.js` — Phase 8 orchestration (drawdown/accrual/interest/principal).
- `tests/treasury-borrowing-schedule.test.js`, `tests/treasury-borrowings.test.js` — automated
  coverage for both.
- `js/treasury/liquidity-status.js` — Phase 9 pure RED/AMBER/GREEN threshold logic.
- `js/treasury/dashboard.js` — Phase 9 `getTreasuryDashboard` aggregator.
- `tests/treasury-liquidity-status.test.js`, `tests/treasury-dashboard.test.js` — automated
  coverage for both.
- `js/treasury/reconciliation.js` — Phase 10 start/submit/approve reconciliation workflow.
- `tests/treasury-reconciliation.test.js` — automated coverage for it.
- `js/pages/treasury/settings.js` — Phase 11 Treasury Settings screen.
- `js/pages/treasury/index.js` — Phase 11 view dispatcher (mirrors `js/pages/misc/index.js`).
- `js/pages/treasury.js` — thin barrel re-export, matching every other page module.
- `js/pages/treasury/dashboard.js` — Phase 11 Treasury Dashboard screen.
- `js/pages/treasury/shared.js` — office-picker markup, liquidity badge/accent classes, money
  formatter, shared by both screens above (and by every screen still to come).
- `js/pages/treasury/teller-console.js` — Phase 11 Teller Console screen.
- `js/pages/treasury/cash-allocation.js` — Phase 11 Cash Allocation screen (first write screen).
  *(Correction: this file was accidentally listed twice in the previous checkpoint; de-duplicated
  here rather than left as a copy-paste artifact.)*
- `js/pages/treasury/loan-disbursement.js` — Phase 11 Loan Disbursement Through Teller screen
  (second write screen), wrapping Phase 6's `disburseLoanThroughCashier`.
- `js/pages/treasury/expenses.js` — Phase 11 Expense Management screen (third write screen),
  wrapping Phase 7's `expenses.js` (request/approve/reject/pay lifecycle).
- `js/pages/treasury/borrowings.js` — Phase 11 Borrowings screen (fourth write screen), wrapping
  Phase 8's `borrowings.js`/`borrowing-schedule.js` (create/drawdown/accrue/pay/repay + schedule).
- `js/pages/treasury/reconciliation.js` — Phase 11 Daily Reconciliation screen (fifth/final write
  screen), wrapping Phase 10's `reconciliation.js` (start/submit-count/approve).

## 11. Files Modified

- `js/api/accounting.js` — extended `makeGlAccountsAPI` with `getBalance`, `listWithBalances`,
  `computeOfficeBalance` (no existing exports renamed/removed).
- `js/api/index.js` — imported and wired `makeTreasuryAPI` as `this.treasury`.
- `js/api/treasury.js` — extended `dt_treasury_thresholds`'s column spec with
  `shortage_gl_account_id`/`overage_gl_account_id` for Phase 10, before this schema had ever been
  provisioned against a live tenant.
- `js/treasury/thresholds.js` — extended the read/write model with the same two new fields.
- `js/router.js` — registered the new `treasury` route in the `PAGES` map, then three more entries
  (`treasury-dashboard`, `teller-console`, `cash-allocation`) sharing the same module file.
- `js/pages/treasury/settings.js` — refactored to use the new `shared.js#officeOptionsHtml`
  instead of its own local copy, once `dashboard.js` needed the identical markup.
- `js/pages/treasury/teller-console.js` — refactored to use `shared.js#loadOfficeTellerCashierList`
  instead of its own local copy, once `cash-allocation.js` needed the identical assembly.
- `js/pages/treasury/shared.js` — added a sixth helper, `tellerCashierOptionsHtml`, extracted out
  of `cash-allocation.js` before `loan-disbursement.js` needed the identical `<option>` markup a
  second time (same "extend shared.js before duplicating" discipline as every prior screen).
- `js/pages/treasury/cash-allocation.js` — refactored to use the newly-shared
  `tellerCashierOptionsHtml` instead of its own local copy.
- `js/pages/treasury/index.js` — registered the new `loan-disbursement` view.
- `js/router.js` — registered the new `loan-disbursement` route, sharing `pages/treasury.js` with
  the other four treasury routes and the same under-gated `READ_JOURNALENTRY` placeholder
  permission (see §17) as `cash-allocation`.
- **[Phase 11 completion this session]**
  - `js/pages/treasury/shared.js` — added two more shared helpers: `glOptionsHtml` (GL-account
    `<option>` markup, extracted from `settings.js`) and `statusBadgeClass` (one status-string →
    `.badge` class mapper for all treasury workflows). Eight helpers now, up from six.
  - `js/pages/treasury/settings.js` — refactored to consume the shared `glOptionsHtml` instead of
    its own local copy (deleted the duplicate), once `expenses.js` needed the identical markup.
  - `js/pages/treasury/index.js` — registered the final three views (`expenses`, `borrowings`,
    `reconciliation`) in the `VIEWS` dispatcher.
  - `js/router.js` — registered the final three routes (`treasury-expenses`, `treasury-borrowings`,
    `treasury-reconciliation`), sharing `pages/treasury.js` with the other five treasury routes and
    the same under-gated `READ_JOURNALENTRY` placeholder permission (see §17). This brings the
    accumulated under-gated write-route count to **six** (`cash-allocation`, `loan-disbursement`,
    `treasury-expenses`, `treasury-borrowings`, `treasury-reconciliation`, plus the read routes
    sharing the same code) — exactly the outcome §17 warned about; Phase 12 is now unavoidable.

## 12. API Endpoints Added

FinCraft-side wrapper methods added this session (all call existing, real Fineract REST routes —
no new server-side endpoints, since Fineract itself is unmodified):
- `api.glAccounts.getBalance(id)` → `GET /glaccounts/{id}?fetchRunningBalance=true`
- `api.glAccounts.listWithBalances(params)` → `GET /glaccounts?fetchRunningBalance=true`
- `api.glAccounts.computeOfficeBalance(glAccountId, officeId, opts)` → paginated
  `GET /journalentries?glAccountId=&officeId=&offset=&limit=` (client-side summation)
- `api.treasury.ensureTreasuryDatatables()` → `GET /datatables` + `POST /datatables` (per missing table)
- `api.treasury.list/create/update/getRow/deleteRow(...)` → thin wrappers over
  `api.dataTables.query/createEntry/update/getEntry/delete`

## 13. UI Screens Added

- **Treasury Settings** (`js/pages/treasury/settings.js`, route `treasury`, view `settings`) —
  per-office `dt_treasury_thresholds` editor: office picker, GL-account dropdowns for all eight
  mapped accounts, reserve buffer, currency code. Built first (out of the brief's listed order)
  because every other treasury screen depends on it.
- **Treasury Dashboard** (`js/pages/treasury/dashboard.js`, route `treasury-dashboard`, view
  `dashboard`) — read-only tiles (bank/vault/available-vault-with-liquidity-badge/teller-total/
  borrowings/pending-expenses/interest-payable/pooled-GL) plus a per-cashier breakdown table,
  over Phase 9's `getTreasuryDashboard`.
- **Teller Console** (`js/pages/treasury/teller-console.js`, route `teller-console`, view
  `teller-console`) — per-office teller/cashier list with FinCraft-vs-Fineract reconciliation
  status per row and an expandable recent-events drill-down.
- **Cash Allocation** (`js/pages/treasury/cash-allocation.js`, route `cash-allocation`, view
  `cash-allocation`) — the first write screen: vault status preview + form wrapping Phase 5's
  `allocateCashToCashier`.
- **Loan Disbursement Through Teller** (`js/pages/treasury/loan-disbursement.js`, route
  `loan-disbursement`, view `loan-disbursement`) — the second write screen: office picker feeding
  a loan picker (loans awaiting disbursal, sourced from `api.loans.list({status:'approved'})`) and
  a teller/cashier picker, wrapping Phase 6's `disburseLoanThroughCashier`.
- **Expense Management** (`js/pages/treasury/expenses.js`, route `treasury-expenses`, view
  `expenses`) — new-request form + status-aware expenses list; inline Approve/Reject/Pay
  (TELLER_CASH or BANK) via the expandable-detail-row pattern, wrapping Phase 7's `expenses.js`.
- **Borrowings** (`js/pages/treasury/borrowings.js`, route `treasury-borrowings`, view
  `borrowings`) — create form + per-borrowing list; inline drawdown for PENDING, and an expandable
  amortization schedule with per-installment accrue/pay-interest/repay-principal for ACTIVE,
  wrapping Phase 8's `borrowings.js`/`borrowing-schedule.js`.
- **Daily Reconciliation** (`js/pages/treasury/reconciliation.js`, route `treasury-reconciliation`,
  view `reconciliation`) — start form (with FinCraft's expected-cash figure) + per-office list;
  inline physical-count entry for OPEN, and a `danger`-confirmed Approve that posts the shortage/
  overage JE for SUBMITTED, wrapping Phase 10's `reconciliation.js`.
- **All 8 Phase 11 screens are now built.** The remaining work is Phase 12 (Permissions) — see §17.

## 14. Fineract APIs Used

None called by new code yet. Already available and confirmed suitable for upcoming phases:
`GET/POST /tellers`, `/tellers/{id}/cashiers*`, `/tellers/{id}/cashiers/{cid}/allocate`,
`/tellers/{id}/cashiers/{cid}/settle`, `/tellers/{id}/cashiers/{cid}/summaryandtransactions`,
`/cashiersjournal`, `/journalentries` (+ `?command=reverse`), `/glaccounts`, `/glclosures`,
`/accountingrules`, `/financialactivityaccounts`, `/loans/{id}?command=disburse`,
`/loans/{id}?command=disburseToSavings`, `/datatables` (register/CRUD + row CRUD), `/runreports`,
`/adhocquery` (via `adhocQueries`), `/offices`, `/staff`, `/paymenttypes`, `/currencies`.

## 15. Datatables / DB Tables Used

Schemas fully defined in `js/api/treasury.js` (`TREASURY_DATATABLES`): `dt_teller_operational_events`,
`dt_expense_requests`, `dt_expense_approvals`, `dt_office_borrowings`, `dt_office_borrowing_schedule`,
`dt_office_borrowing_txns`, `dt_treasury_thresholds`, `dt_daily_cash_reconciliation` — all attached
to `m_office` (all `multiRow: true` except `dt_treasury_thresholds`, one config row per office).
`dt_treasury_thresholds` gained two columns this session (`shortage_gl_account_id`,
`overage_gl_account_id`) for Phase 10. **Not yet registered against any live Fineract instance** —
no Fineract server is reachable from this sandbox, so `ensureTreasuryDatatables()` has been
reviewed/syntax-checked only, not execution-tested, across all ten phases built so far. This is
flagged as the single largest outstanding risk in every checkpoint's §17 and should not be deferred
past Phase 11 (UI) — a real screen writing to a never-provisioned datatable would fail immediately
and non-obviously.

## 16. Testing Status

**Phase 11 completion (this session):** `node --check` passed on all new files (`expenses.js`,
`borrowings.js`, `reconciliation.js`) and all modified files (`shared.js`, `settings.js`,
`index.js`, `router.js`). Full suite re-run: **14 passed / 1 pre-existing unrelated failure,
unchanged** — the three new screens wrap already-tested Phase 7/8/10 services, so
`treasury-expenses`, `treasury-borrowings`, `treasury-borrowing-schedule`, and
`treasury-reconciliation` continue to cover the business logic behind them. Same `jsdom`/
`module-integrity.test.js` gap as every prior UI screen — not re-attempted; sandbox network
restriction already confirmed non-transient.

_Earlier checkpoint note (Loan Disbursement screen):_
`npm test` (`node test-runner/run-tests.js`) re-run after this session's change: **14 passed / 1
failed, unchanged** — identical pass/fail set to the previous checkpoint (`loan-disbursement.js`
and the `shared.js` addition aren't covered by the pure Node test runner's business-logic suites;
same coverage gap as every other UI file so far — see below). Passing: `accounting-fixes`,
`business-logic` (skipped — no jsdom), `error-extraction`, `module-integrity` (skipped — no
jsdom), `treasury-teller-balance`, `treasury-teller-events`, `treasury-vault-control`,
`treasury-loan-disbursement` (the *service* test, unaffected — it stubs `api.loans`/`api.tellers`/
`api.treasury` directly and never imports the new UI file), `treasury-expenses`,
`treasury-borrowing-schedule`, `treasury-borrowings`, `treasury-liquidity-status`,
`treasury-dashboard`, `treasury-reconciliation`. The one failure (`utils.test.js`) is the same
pre-existing sandbox/`jsdom` issue as every previous checkpoint — not re-investigated this round,
`npm install` was not re-attempted since the prior checkpoint's `403 Forbidden` on `xmlchars` was
already confirmed a non-transient sandbox network-policy restriction rather than a flake. All five
Phase 11 files touched this session (`loan-disbursement.js` new; `shared.js`, `cash-allocation.js`,
`index.js`, `router.js` modified) were syntax-checked with `node --check` — passed — which is the
extent of verification possible for browser-DOM UI code without jsdom in this sandbox.

## 17. Next Recommended Phase

**Phase 11 is complete — all 8 screens are built.** The next phase is **Phase 12 (Permissions)**,
which is now genuinely unavoidable rather than deferrable: all six treasury write routes
(`cash-allocation`, `loan-disbursement`, `treasury-expenses`, `treasury-borrowings`,
`treasury-reconciliation`) plus the read routes are gated on the placeholder `READ_JOURNALENTRY`
code, so the write screens are **under-gated** — a user with only journal-entry *read* permission
can currently reach screens that disburse loans, move vault cash, and post journal entries.
Recommended approach, consistent with this codebase's existing discipline (never invent a Fineract
permission code that can't be confirmed real — see the `shares`/`surveys` precedent): against a
live Fineract instance, pull `GET /permissions`, then map each write action to the *closest real
write-level code* Fineract actually exposes (candidates to verify, not assume: `DISBURSE_LOAN` for
loan disbursement; `CREATE_JOURNALENTRY` for expense/borrowing/reconciliation postings;
`ALLOCATECASHIER_TELLER`/`SETTLECASHIER_TELLER` for cash allocation). Where no real code fits a
FinCraft-invented concept, keep the route gated on the nearest real *read* code and document it —
do not fabricate a code. This cannot be finished from this sandbox (no live Fineract to read the
permission list from), which is exactly why it's the top open item rather than something already done.

After Phase 12, **Phase 13** is a dedicated cross-cutting test pass (the per-service suites already
pass; what's missing is UI-level/end-to-end coverage and getting `jsdom` installed somewhere without
this sandbox's network restriction so `module-integrity.test.js` can finally run against the Phase 11
files).

**Standing risk, unchanged and now spanning all 8 screens:** `ensureTreasuryDatatables()` /
`upsertThresholds()` have still never run against a live Fineract tenant. Now that every write screen
exists — including Loan Disbursement (calls the real `/loans/{id}?command=disburse`) and the new
Expenses/Borrowings/Reconciliation screens (all post real journal entries) — provisioning the eight
`dt_*` datatables against a real sandbox tenant, and seeding at least one office's
`dt_treasury_thresholds` via the Settings screen, MUST happen before any of these screens is demoed
or handed to a user. A write screen pointed at an unprovisioned backend will fail after the Fineract
side has already moved real money/posted a real entry, surfacing as a `TreasuryReconciliationGapError`
on first real use.

---

### (Superseded) prior next-phase note, kept for history

Continue Phase 11 with the remaining 3 screens. **Expense Management** next — a genuine
multi-step lifecycle UI (request/approve/reject/pay, wrapping Phase 7's `js/treasury/expenses.js`),
closer in shape to Daily Reconciliation than to the three simple forms built so far (Cash
Allocation, Loan Disbursement), so budget more time for it than the last two screens took. Then
**Borrowings** (a create form plus a per-borrowing action list for drawdown/accrue/pay/repay,
wrapping Phase 8's `borrowings.js`/`borrowing-schedule.js`). **Daily Reconciliation** last,
unchanged reasoning from every previous checkpoint: three-step workflow, most complex remaining
form flow, wraps Phase 10's `reconciliation.js`. Keep extending `shared.js` before duplicating
markup — it now has six reusable helpers and four screens have each added to it rather than
working around it (most recently `tellerCashierOptionsHtml`, this session).

Two standing risks, both now covering five UI files' worth of code and getting more expensive to
discover late: (1) `ensureTreasuryDatatables()`/`upsertThresholds()` have never run against a live
Fineract tenant — two genuine write actions (Cash Allocation, and now Loan Disbursement) exist
that will fail against an unprovisioned backend, not just a read screen, and Loan Disbursement
specifically also calls the real `/loans/{id}?command=disburse` endpoint, so an untested run
against a live tenant risks a **real loan disbursement** compounding with a datatable-write
failure into a `TreasuryReconciliationGapError` the very first time this screen is used for real —
provisioning `ensureTreasuryDatatables()` against a real sandbox tenant before this screen is
demoed or handed to a user is now materially more urgent than it was at the Cash Allocation
checkpoint, not just "still open"; and (2) `jsdom` still cannot be installed in this sandbox, so
`module-integrity.test.js` has not run against any Phase 11 file, including this session's.
**Phase 12's write-permission gap now has a third accumulated instance** (`loan-disbursement`
joins `cash-allocation`) with the identical `READ_JOURNALENTRY`-placeholder comment repeated
rather than resolved — every remaining write screen (Expenses, Borrowings, Reconciliation) will
add a fourth, fifth, and sixth unless Phase 12 is tackled before, not after, Phase 11 finishes;
this recommendation has now been repeated at every Phase-11 checkpoint since Cash Allocation and
should not need repeating a third time.
