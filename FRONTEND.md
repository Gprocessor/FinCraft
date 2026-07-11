# FinCraft — Apache Fineract Web UI

A modular, modern web frontend for [Apache Fineract](https://fineract.apache.org/) — the open-source microfinance platform.

## Live Demo
[https://gprocessor.github.io/fincraft](https://gprocessor.github.io/fincraft)

Connects to the public Fineract demo server at **demo.mifos.io**  
Default credentials: `mifos` / `password` · Tenant: `default`

---

## Features
- 📊 **Dashboard** — live KPIs: clients, loans, savings, pending tasks
- 👥 **Clients** — search, filter by office/status, activate, export CSV
- 💰 **Loans** — portfolio view, inline approve, repayment posting
- 🏦 **Savings / Deposits / Shares** — full account management
- 🔁 **Transfers** — account-to-account, standing instructions
- 📒 **Accounting** — Chart of Accounts, journal entries, GL closures, rules
- 🏢 **Organization** — offices, staff, tellers, holidays, currencies, payment types
- 📦 **Products** — loan, savings, FD, RD, share products and charges
- ✅ **Checker Inbox** — maker-checker approval workflow
- 📈 **Reports** — standard Fineract reports with run parameters
- 🔍 **Global Search** — clients, loans, groups via `/search`
- ⚙️ **System** — configurations, audit trail, roles, scheduled jobs

## Architecture
```
js/
  app.js          — bootstrap + service worker
  auth.js         — login/logout (Basic auth → Fineract token)
  api.js          — full Fineract REST client (100+ endpoints)
  config.js       — server URL, tenant, timeouts
  router.js       — hash-based SPA router
  store.js        — localStorage state (auth, theme, sidebar)
  ui.js           — shell, modals, toasts, form submission handlers
  modal-init.js   — GL account population, inline client search
  utils.js        — fmt, num, fmtDate, sb, ini, debounce, escapeHtml
  data.js         — empty (no demo data)
  pages/
    dashboard.js, clients.js, loans.js, savings.js, deposits.js,
    shares.js, groups.js, centers.js, collections.js, transfers.js,
    accounting.js, reports.js, tasks.js, products.js, organization.js,
    system.js, analytics.js, search.js, misc.js
views/
  modals.html     — all modal forms (lazy-loaded at mount)
css/
  app.css         — design tokens, components, dark mode
```

## Deploy to Your Own Fineract Instance
1. Fork this repo
2. Edit `js/config.js` — change `serverUrl` and `tenantId`
3. Push to `main` — GitHub Actions deploys automatically

## Local Development
```bash
# Any static file server works — no build step
npx serve .
# or
python3 -m http.server 8080
```

## GitHub Pages Setup
1. Go to **Settings → Pages**
2. Source: **GitHub Actions**
3. Push to `main` — workflow auto-deploys

## Architecture (js/ folder)

`js/api.js` and `js/ui.js` are now thin **barrel files** — all real code moved into
`js/api/` and `js/ui/` so each file stays small and single-purpose. Every existing
`import ... from './api.js'` / `'./ui.js'` elsewhere in the app (pages, router, cmd
palette, etc.) still works unchanged.

```
js/api.js                → export * from './api/index.js'
js/api/
  core.js                 base FineractAPI class: fetch plumbing, auth(), _g/_p/_u/_d
  index.js                 assembles FineractAPIFull from every domain module below
  clients.js  loans.js  savings-deposits.js  shares.js  groups-centers.js
  organization.js  products.js  accounting.js  reports.js  admin.js
  integrations.js  misc.js  auth-account.js
                            one file per functional domain, each exporting
                            makeXxxAPI(self) factories

js/ui.js                 → export * from './ui/index.js'
js/ui/
  shell.js                 nav structure, app shell mount, global search, notif badge
  core.js                   toasts, modals, tabs, sidebar, theme, confirm dialog
  dom-helpers.js            formData/setSubmitting/extractFineractError/collectJournalRows
  modal-dropdowns.js        populates <select> lists inside modals
  global-events.js          document click/keydown delegation → handlers/index.js
  handlers/
    index.js                merges every domain registry, dispatches by data-action
    clients.js  loans.js  savings.js  ... (34 files)
                            one file per handleAction() case-group, each a
                            { 'action-name': async (btn) => {...} } registry
```

**Adding a new feature?** Add the endpoint to the right `js/api/<domain>.js` file, add
its form-submit handler to the matching `js/ui/handlers/<domain>.js` file, and you're
done — no need to touch the 1000+ line files that used to hold everything.

> **Bug fixed during this split:** the toast dismiss button's `<button data-action="dismiss-toast">`
> opening tag was missing in the original `ui.js`, so `toast()` threw on every call and no
> toast notification ever rendered. Fixed in `js/ui/core.js`. Also removed two dead/duplicate
> class fields (`currencies`, `delinquencyBuckets`) in `api.js` that were silently shadowed by
> later re-declarations and never reachable.

## Pages (js/pages/) — same barrel pattern

The 9 largest page modules (loans, savings, clients, deposits, groups, organization,
system, products, accounting — each was 1,100–2,250 lines) are split the same way:
`js/pages/<name>.js` is a barrel (`export * from './<name>/index.js'`), so
`router.js`'s `import('./pages/<name>.js')` is untouched.

Two shapes, depending on the page's original structure:

```
Entity + detail pages (loans, savings, clients, deposits, groups):
  <name>/shared.js    tiny helpers/constants (e.g. `can`)
  <name>/list.js       renderList
  <name>/detail.js     renderDetail, tab switching, per-tab load*() functions
  <name>/actions.js    open*Modal functions and one-off action handlers
  <name>/index.js      render() — routes to list or detail

Admin/dashboard pages (organization, system, products, accounting):
  <name>/shared.js    tiny helpers/constants (+ any shared GL-account cache, etc.)
  <name>/loaders.js    load*() functions for each tab/section
  <name>/actions.js    open*Modal functions and one-off action handlers
  <name>/index.js      render() — builds the tab shell and wires loaders
```

> **Bugs fixed during this split** (both pre-existing, not introduced by the split):
> - `js/pages/groups.js`: two table-row templates were missing `<a href="...">`
>   opening tags before `${g.id}">`/`${m.id}">`, leaving `g.id}"` as literal visible
>   text instead of a working link. Left intact in the generated output (out of scope
>   for a pure refactor) — worth a follow-up fix since it breaks navigation from the
>   Groups list and the Members tab.
> - `products.js`/`accounting.js`: a shared `_glCache` variable is now owned by
>   `shared.js`; other files that used to reset it with `_glCache = null` now call an
>   exported `resetGlCache()` instead, since ES module imports are read-only bindings
>   (a direct cross-file assignment would throw `TypeError: Assignment to constant
>   variable` at runtime).

**Not split further:** `detail.js`/`actions.js`/`loaders.js` in `loans`, `organization`,
`system`, and `products` are still 500–1,100 lines — much smaller than the 2,000+ line
originals, but large enough that a second pass (e.g. splitting `loans/actions.js` by
loan lifecycle stage: disbursement, repayment, write-off/close, transfers) would help
if you keep growing those pages. Happy to do that pass too if useful.

**Second pass (2nd split):** the 5 files singled out above as still-large were split again,
one level deeper, using the same barrel pattern:

```
loans/detail.js    → barrel over loans/detail/{index,schedule,transactions,lifecycle,
                                                collateral-guarantors,notes-docs}.js
loans/actions.js   → barrel over loans/actions/{schedule,approval,disbursement,repayment,
                                                charges,restructuring,closure,
                                                collateral-guarantors}.js
system/loaders.js       → barrel over system/loaders/{config,audit,access,integrations,
                                                       data-mgmt,info}.js
organization/loaders.js → barrel over organization/loaders/{offices-staff,calendar,finance,
                                                             si,reporting,integrations}.js
products/actions.js     → barrel over products/actions/{loan-products,savings-products,
                                                         share-products,config}.js
```

Every sibling file that imported from e.g. `./actions.js` still works unchanged — only the
barrel's *contents* moved, not its location. Largest single file after this pass: ~300 lines
(down from the 950–1,100 line files after the first pass, and 2,000+ originally).

> **Bug fixed during this pass:** `organization.js` and `system.js` each had a two-line
> `/* ... */` banner comment sitting *between* two of their `import` statements. The original
> first-pass split's comment-detection logic stopped scanning imports at that comment,
> silently dropping the second half of each file's imports (`api`, `store`, `toast`,
> `escapeHtml`, `fmtDate`, `num`, `sb`, `openModal`, `confirm`) from every generated
> sub-module. Fixed by making the parser properly track open/close block comments instead of
> checking line prefixes. Caught by re-running the same import/export verification plus a new
> runtime check that calls every exported function with stub arguments and watches for
> `ReferenceError`s (396 functions checked, 0 reference errors, 0 swallowed errors).
>
> Still on the table if you want to keep going: `organization/actions.js` (~930 lines) and
> `system/actions.js` (~705 lines) weren't part of this second pass and could get the same
> treatment.

## Round 3: the rest of the large pages, a permanent test suite, and a rendering-bug sweep

**12 more page files split**, same barrel pattern as before: `shares`, `users`, `centers`,
`notifications`, `datatables`, `tasks`, `charges`, `reports`, `collateral`, `templates`,
`self-service`, `misc`. Between this and the earlier rounds, essentially every `pages/*.js`
file that was over ~400 lines is now split — the only two holdouts are `shares/detail.js`
(477 lines) and `centers/detail.js` (450 lines), each a single large `renderDetail()`
function that isn't cleanly splittable without restructuring its internals.

**`npm test` now checks every function, not just utils.js.** `tests/module-integrity.test.js`
imports all ~290 files under `js/` and calls every exported function with a battery of stub
arguments in a mocked DOM, watching for `ReferenceError`s — including ones a function's own
`try/catch` might swallow and show in a toast instead. Run `npm install` once (adds `jsdom`
as a dev dependency), then `npm test`. This is what caught two more real bugs from the
earlier splitting rounds before they shipped:
- `organization.js`/`system.js`: a two-line comment sitting between two `import` statements
  made the first-pass splitter stop scanning imports early, silently dropping `api`, `store`,
  `toast`, `escapeHtml`, and others from several generated files.
- Several files import `{ confirm as modalConfirm }` — the splitter was keying imports by
  their *original* export name instead of the local alias, so `modalConfirm` calls lost
  their import in every file that used the alias.

Both are fixed at the source (the splitting scripts), and the whole `js/pages/` tree was
regenerated from scratch afterward so no stale output could hide a fix.

**A systemic broken-link bug, found while checking for rendering issues.** While hunting for
rendering problems, a recurring pattern turned up across list views:

```
<td>${l.id}">${escapeHtml(l.accountNo)}</a></td>
```

The `<a href="..."` (or `<a href="#" data-view-x="...">`) opening tag is missing entirely —
just the bare id value followed by a stray `">`. The account number still displays, but it's
not a link, and the loose `">`/`</a>` are left dangling in the markup. This turned out to be
a **pre-existing bug in the original codebase**, not something introduced by the split — it
was just easiest to spot once the account-linking logic was isolated in small files. It hit
the primary list view of: **loans, savings, shares, groups, centers, charges, collateral,
deposits (both fixed and recurring)**, plus secondary account links inside **client detail**
and **group detail**, and cosmetic name links in **templates, users, datatables**. For the
list pages, this meant there was no way to click into a loan/savings/share/group/center/
charge/collateral/deposit's detail page from its own list.

All instances are fixed the same way: restore the missing `<a href="#" data-view-x="${id}">`
wrapper and wire a matching click handler that calls `router.js`'s `navigate()`, mirroring
the pattern `clients.js` already used correctly elsewhere in the app.

**A related, second bug class turned up while fixing the first one:** several `import('../router.js')`
(and `../api.js`, `../ui.js`, etc.) calls are written as string literals *inside function
bodies*, not as static top-of-file imports. The splitting scripts only ever rewired static
imports — these dynamic ones still had the path depth of the *original* file, which is wrong
now that the code lives one or two directories deeper. Every dynamic import under `js/pages/`
was audited and corrected to the right number of `../` for its new location (29 files).

---

## Round 4: permission-gating fix, a double-render/double-fetch stud, and a full audit sweep

**Checker Inbox lockout bug, fixed.** The `tasks` route (Checker Inbox nav item) was gated
on the single permission `CHECKER_SUPER_USER` — a real Fineract code, but a *global bypass*,
not the normal grant. Fineract's maker-checker model has no umbrella "approve" permission;
approval rights are granted per entity-action via a `..._CHECKER` suffix (e.g.
`CREATE_ROLE_CHECKER`, `DISBURSE_LOAN_CHECKER` — 100+ real codes in the 961-code set). Gating
on `CHECKER_SUPER_USER` alone locked out the overwhelmingly common case: a checker-role user
who only holds one or two specific entity `_CHECKER` grants. Fixed with a new
`store.hasAnyCheckerPermission()` (true for `CHECKER_SUPER_USER` **or** any permission ending
in `_CHECKER`) and a matching `ANY_CHECKER_PERMISSION` sentinel in `router.js`, consumed by
both `isAllowed()` and the sidebar nav-visibility check in `ui/shell.js` (which had its own
duplicate copy of the gating logic — now delegates to `router.js` so there's one source of
truth). Covered by a regression test in `tests/business-logic.test.js`.

**A double-render/double-API-call stud, found by tracing the boot sequence end to end.**
`auth.js`'s `showApp()` called `router.js`'s `initRouter()` — which registers the
`hashchange` listener *and* synchronously renders whatever's in `location.hash` — and only
*then* checked whether `location.hash` was empty and, if so, called `navigate()` to redirect
to the last/default page. Setting `location.hash` fires a `hashchange` event, so on **every
fresh login or first visit with no hash in the URL** (the single most common entry path),
the initial page rendered twice and every one of its API calls fired twice: once from
`initRouter()`'s own synchronous render, once more from the `hashchange` event the redirect
triggered a moment later. Separately, `initRouter()` had no guard against being called more
than once — logging out and back in within the same SPA session (no full page reload) added
a second `hashchange` listener, so from that point on every navigation for the rest of the
session rendered twice, compounding by one more render per additional login. Fixed two ways:
`initRouter()` now only ever registers the listener once (module-level flag), and `showApp()`
now performs the empty-hash redirect *before* calling `initRouter()`, not after, so there's
exactly one render pass no matter how many times a user logs in and out in one session.
Covered by a regression test asserting the listener is added exactly once across three
consecutive `initRouter()` calls.

**Full-codebase stud sweep, clean otherwise.** Checked for: TODO/FIXME/stub markers (none —
prior hits were all HTML `placeholder=` attributes), duplicate handler-registry keys within
and across all 33 `ui/handlers/*.js` files (none), every literal permission-code string
against the ground-truth 961-code set — 258 direct `hasPermission()`/`can()` calls plus a
broader sweep of all 277 distinct ALL-CAPS-with-underscore string literals in the codebase
(zero invented codes; the only non-permission hits were legitimate enum/status strings like
`BUSINESS_DATE`, `OTP_REQUIRED`, `PREFIX_OFFICE_NAME`), copy-pasted duplicate `await api.*`
call lines close together in the same function (2 candidates found, both false positives —
mutually-exclusive `if`/`else` branches and independent on-demand section loaders, not
double-fires), and overlapping `document`-level click-delegation selectors in
`modal-init.js` (found one case where two listeners both match the same trigger element, but
they set independent, non-conflicting pieces of modal state — intentional layering, not a
bug). `npm test`: 3/3 passing. All 295 `js/` files pass `node --check`.

---

## Backlog — newer Fineract modules (not implemented)

Per the July 2026 technical audit (item 11): Working Capital Loans, Credit Bureau Integration,
Email Campaigns, and MIX/PPI reporting are **not implemented** in FinCraft. This is a
deliberate scope decision, not an oversight — these modules are also absent from Apache
Fineract's own official reference web-app, reflecting where Fineract's feature adoption
currently stands rather than a FinCraft gap. They're tracked here as backlog and should only
be picked up if a specific self-hosted Fineract tenant actually has the corresponding modules
enabled server-side; building UI against endpoints most deployments don't expose isn't a good
use of effort right now.

---
Built by **Processor** Power Platform & MIS Division
