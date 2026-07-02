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

---
Built by **Processor** Power Platform & MIS Division
