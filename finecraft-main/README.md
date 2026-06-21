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

---
Built by **Processor** Power Platform & MIS Division
