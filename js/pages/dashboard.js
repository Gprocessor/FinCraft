/* FinCraft · dashboard.js — Live Fineract API, no demo data, permission-aware.

   REDESIGN (this pass): matches the new mockup — a filter bar (Branch/Period/Product),
   8 headline KPI cards with real period-over-period deltas, and a bank of charts (loan
   portfolio & collection trend, product distribution, PAR ageing, customer growth,
   income vs expenses, branch performance, collection by loan officer, weekly cash flow).
   Quick Actions and Recent Activity from the previous dashboard are kept, appended below.

   ON THE "vs last period" DELTAS: Fineract has no built-in historical snapshot of these
   KPIs to diff against, so this page now WRITES one. Every load, it upserts today's row
   into a small registered datatable (`dashboard_daily_snapshot`, one-to-many on the head
   office) holding the day's headline numbers as a JSON blob. Deltas are computed against
   the most recent PRIOR day's row and labelled with that actual date ("vs Jul 13") rather
   than a vague "last period" — that's genuinely what's being compared. This means deltas
   are blank/"—" for the first day a branch runs this build, then start appearing once a
   second day's snapshot exists. If the signed-in user lacks permission to register/write
   datatables, this degrades silently to no deltas rather than erroring — the rest of the
   dashboard is unaffected. Deltas are only shown in the "All Branches" view: the snapshot
   stores unfiltered totals, so comparing them against a single branch's current filtered
   figure would be apples-to-oranges.

   ON DATA HONESTY for a few specific widgets (kept from the previous pass's principle —
   no fabricated numbers, ever):
     - "Amount Collected" and "Daily Cash Flow" are derived from journal-entry movements on
       whichever GL accounts are tagged as cash in Financial Activity Accounts (Accounting →
       Financial Activity Mappings). This is real double-entry cash-flow, but it's total cash
       inflow/outflow through those accounts, not exclusively "loan repayments" — labelled
       accordingly. If no cash GL accounts are configured, these show "Not configured" rather
       than a guess.
     - "Collection by Loan Officer" could not be built as a currency figure: there is no
       generic per-officer collected-amount report available across arbitrary Fineract
       deployments without assuming a custom stretchy report exists. It shows active LOAN
       COUNT per officer instead, labelled as such — a real number, just a different one
       than the mockup's currency bars.
     - "Customer Growth" plots the Total Customers figure from the same daily snapshot
       history used for the KPI deltas above (so it starts as a single point and builds up
       day by day), rather than a fabricated smooth historical curve.
     - Branch Performance reads office-level rows already present in the PortfolioAtRisk /
       "Portfolio at a glance" reports when the deployment returns per-office breakdowns; if
       a report only returns one aggregate row (no office dimension), the chart says so.

   Bugs fixed vs. the very first dashboard.js (kept from the prior pass, still true here):
     - Checker gating uses store.hasAnyCheckerPermission(), not a single CHECKER_SUPER_USER
       permission check that would lock out entity-level checkers.
     - Approximate/sampled figures get a visible "~" badge, never a bare trailing asterisk.
     - The Recent Activity (audit) call is gated on READ_AUDIT like every other widget. */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, escapeHtml, fmtDate } from '../utils.js';

const SPIN = `<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px"></i>`;
const KPI_SKELETON = `<span class="skeleton-bar" style="display:inline-block;height:26px;width:70px"></span>`;
const SNAPSHOT_TABLE = 'dashboard_daily_snapshot';
const PALETTE = ['#00c9b1', '#60a5fa', '#a78bfa', '#f87171', '#fbbf24', '#4ade80', '#f472b6', '#64748b'];

/** KPI card definitions — id / label / icon / accent colour (matches .stat-card's c-* accents). */
const KPIS = [
  { id: 'clients',     label: 'Total Customers',   icon: 'fa-users',                accent: 'teal'   },
  { id: 'newClients',  label: 'New This Month',    icon: 'fa-user-plus',            accent: 'green'  },
  { id: 'savings',     label: 'Total Savings',     icon: 'fa-piggy-bank',           accent: 'blue'   },
  { id: 'gross',       label: 'Loan Portfolio',    icon: 'fa-credit-card',          accent: 'purple' },
  { id: 'outstanding', label: 'Outstanding',       icon: 'fa-sack-dollar',          accent: 'amber'  },
  { id: 'collected',   label: 'Amount Collected',  icon: 'fa-money-bill-transfer',  accent: 'teal'   },
  { id: 'par',         label: 'Portfolio at Risk', icon: 'fa-triangle-exclamation', accent: 'red'    },
  { id: 'pending',     label: 'Pending Approvals', icon: 'fa-clock',                accent: 'blue'   }
];

/** Quick Actions — reuses the exact same modal ids as the topbar's global Quick Action
 *  button and each entity page's "New …" button, so behaviour stays identical everywhere. */
const QUICK_ACTIONS = [
  { perm: 'CREATE_CLIENT',          modal: 'newClientModal',    icon: 'fa-user-plus',           label: 'New Client' },
  { perm: 'CREATE_LOAN',            modal: 'newLoanModal',      icon: 'fa-hand-holding-dollar',  label: 'New Loan' },
  { perm: 'CREATE_SAVINGSACCOUNT',  modal: 'newSavingsModal',   icon: 'fa-piggy-bank',           label: 'New Savings' },
  { perm: 'REPAYMENT_LOAN',         modal: 'repaymentModal',    icon: 'fa-money-bill-transfer',  label: 'Repayment' },
  { perm: 'CREATE_ACCOUNTTRANSFER', modal: 'newTransferModal',  icon: 'fa-right-left',           label: 'Transfer' },
  { perm: 'CREATE_JOURNALENTRY',    modal: 'journalEntryModal', icon: 'fa-book',                 label: 'Journal Entry' },
  { checker: true,                  href: '#/tasks',            icon: 'fa-inbox',                label: 'Checker Inbox' },
  { perm: 'READ_REPORT',            href: '#/reports',          icon: 'fa-file-chart-column',    label: 'Reports' }
];

/** Fineract sometimes returns dates as [yyyy, mm, dd] arrays instead of ISO strings —
 *  same quirk handled by utils.js's fmtDate(), pulled out here as a plain Date for math. */
function toJsDate(d) {
  if (!d) return null;
  if (Array.isArray(d)) return new Date(d[0], d[1] - 1, d[2]);
  const dt = new Date(d);
  return isNaN(dt) ? null : dt;
}
const isoDay = d => d.toISOString().split('T')[0];

export async function render(c) {
  const auth = store.get('auth') || {};
  const canRead = (code) => store.hasPermission(code);

  const hasLoans      = canRead('READ_LOAN');
  const hasClients    = canRead('READ_CLIENT');
  const hasSavings    = canRead('READ_SAVINGSACCOUNT');
  const hasAudit      = canRead('READ_AUDIT');
  const hasOffices    = canRead('READ_OFFICE');
  const hasStaff      = canRead('READ_STAFF');
  const hasAccounting = canRead('READ_JOURNALENTRY') && canRead('READ_GLACCOUNT');

  const quickActions = QUICK_ACTIONS.filter(a => a.checker ? store.hasAnyCheckerPermission() : canRead(a.perm));
  const greeting = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const firstName = (auth.displayName || auth.username || '').split(/\s+/)[0] || '';

  c.innerHTML = `
    <div class="page-header mb-4">
      <div>
        <h1>Welcome back${firstName ? `, ${escapeHtml(firstName)}` : ''}</h1>
        <div class="text-muted">${escapeHtml(auth.roleName || 'User')}${auth.officeName ? ` · ${escapeHtml(auth.officeName)}` : ''} — ${escapeHtml(greeting)}</div>
      </div>
      <div class="page-actions">
        <span class="text-dim fz-11" id="dash-updated" style="align-self:center;margin-right:4px"></span>
        <button class="btn-ghost" id="dash-export" title="Export the KPI summary below as CSV">
          <i class="fa-solid fa-download"></i> Export
        </button>
        <button class="btn-ghost" id="dash-refresh">
          <i class="fa-solid fa-rotate-right"></i> Refresh
        </button>
        ${canRead('CREATE_CLIENT') ? `<button class="btn-primary" data-modal="newClientModal">
          <i class="fa-solid fa-plus"></i> New Client
        </button>` : ''}
      </div>
    </div>

    <div class="filter-bar">
      ${hasOffices ? `
      <select class="form-control" id="dash-f-office" style="max-width:200px">
        <option value="">All Branches</option>
      </select>` : ''}
      <select class="form-control" id="dash-f-period" style="max-width:170px">
        <option value="3">Last 3 months</option>
        <option value="6" selected>Last 6 months</option>
        <option value="12">Last 12 months</option>
      </select>
      ${hasLoans ? `
      <select class="form-control" id="dash-f-product" style="max-width:200px">
        <option value="">All Products</option>
      </select>` : ''}
      <span class="text-muted fz-11" style="margin-left:auto">Product filter applies to the product distribution chart only.</span>
    </div>

    <div class="stat-grid mb-4" id="dash-kpis">
      ${KPIS.map(k => `
        <div class="stat-card c-${k.accent}" id="dash-kpi-${k.id}">
          <div class="stat-icon c-${k.accent}"><i class="fa-solid ${k.icon}"></i></div>
          <div class="stat-value" data-role="value">${KPI_SKELETON}</div>
          <div class="stat-label">${k.label}</div>
          <div class="kpi-foot text-muted" data-role="foot">&nbsp;</div>
        </div>`).join('')}
    </div>

    ${quickActions.length ? `
    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Quick Actions</h3></div>
      <div class="card-body">
        <div class="hub-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          ${quickActions.map(a => a.href
            ? `<a class="hub-card" href="${a.href}">
                 <div class="hub-card-icon"><i class="fa-solid ${a.icon}"></i></div>
                 <div class="hub-card-label">${escapeHtml(a.label)}</div>
               </a>`
            : `<button type="button" class="hub-card" data-modal="${a.modal}">
                 <div class="hub-card-icon"><i class="fa-solid ${a.icon}"></i></div>
                 <div class="hub-card-label">${escapeHtml(a.label)}</div>
               </button>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="grid-2 mb-4">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Loan Portfolio &amp; Collection Trend</h3>
          <span class="text-muted fz-11">Disbursements: full history · Outstanding: from daily snapshots</span>
        </div>
        <div class="card-body" style="min-height:240px;position:relative">
          <canvas id="dash-trend-chart" height="240"></canvas>
          <div id="dash-trend-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title" id="dash-dist-title">Loan Product Distribution</h3></div>
        <div class="card-body" style="min-height:240px;position:relative">
          <canvas id="dash-dist-chart" height="240"></canvas>
          <div id="dash-dist-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="grid-2 mb-4">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Customer Growth</h3>
          <span class="text-muted fz-11">From daily snapshots — builds up over time</span>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-growth-chart" height="220"></canvas>
          <div id="dash-growth-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Income vs Expenses</h3>
          <span class="text-muted fz-11">From General Ledger journal entries</span>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-ie-chart" height="220"></canvas>
          <div id="dash-ie-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="grid-3 mb-4">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Portfolio at Risk — Ageing</h3>
          <span class="text-muted fz-11" id="dash-par-summary"></span>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-par-chart" height="220"></canvas>
          <div id="dash-par-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Branch Performance</h3></div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-branch-chart" height="220"></canvas>
          <div id="dash-branch-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Loans by Officer</h3>
          <span class="text-muted fz-11" title="No generic per-officer collected-amount report exists across Fineract deployments — this is active loan count, not currency">active loan count</span>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-officer-chart" height="220"></canvas>
          <div id="dash-officer-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header">
        <h3 class="card-title">Daily Cash Flow — This Week</h3>
        <span class="text-muted fz-11">Cash-tagged GL accounts (Accounting → Financial Activity Mappings)</span>
      </div>
      <div class="card-body" style="min-height:220px;position:relative">
        <canvas id="dash-cash-chart" height="220"></canvas>
        <div id="dash-cash-fallback" class="empty-state-row" style="display:none"></div>
      </div>
    </div>

    ${hasAudit ? `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Recent Activity</h3>
        <span class="text-muted fz-11">Last 10 audit events</span>
      </div>
      <div id="dash-audits"><div class="empty-state-row">${SPIN} Loading…</div></div>
    </div>` : ''}
  `;

  const kpiEl = (id, role) => c.querySelector(`#dash-kpi-${id} [data-role="${role}"]`);
  const setKpi = (id, value, foot) => {
    const v = kpiEl(id, 'value'); const f = kpiEl(id, 'foot');
    if (v) v.innerHTML = value;
    if (f) f.innerHTML = foot ?? '&nbsp;';
  };
  const approxBadge = () =>
    `<span class="badge b-warning" title="Estimated from a limited sample — the full total could not be summed in one request" style="font-size:9px;padding:1px 6px;margin-left:6px">~</span>`;

  /* ---- Filters: populate Branch / Product dropdowns, wire change handlers ---- */
  const officeSel = c.querySelector('#dash-f-office');
  const periodSel = c.querySelector('#dash-f-period');
  const productSel = c.querySelector('#dash-f-product');

  if (officeSel) {
    try {
      const offices = await api.offices.list();
      const list = Array.isArray(offices) ? offices : (offices?.pageItems || []);
      list.forEach(o => { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.name; officeSel.appendChild(opt); });
    } catch { /* branch filter just stays "All Branches" only */ }
  }
  if (productSel) {
    try {
      const products = await api.loanProducts.list();
      const list = Array.isArray(products) ? products : [];
      list.forEach(p => { const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name; productSel.appendChild(opt); });
    } catch { /* product filter just stays "All Products" only */ }
  }
  [officeSel, periodSel, productSel].forEach(sel => sel?.addEventListener('change', () => loadAll()));

  let lastSummary = {}; // populated by loadAll(), read by the Export button
  let headOfficeId = null;
  let snapshotHistory = [];
  let snapshotWritable = false;

  async function loadAll() {
    KPIS.forEach(k => setKpi(k.id, KPI_SKELETON, '&nbsp;'));

    const officeId = officeSel?.value || '';
    const months = parseInt(periodSel?.value || '6', 10);
    const productFilter = productSel?.value || '';
    const isAllBranches = !officeId;

    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - months);
    const fmt8 = d => d.toISOString().split('T')[0];
    const officeParam = officeId ? { officeId } : {};

    const guarded = (cond, fn) => cond ? fn().catch(() => null) : Promise.resolve(null);

    /* Ensure the snapshot datatable exists (idempotent, cheap after the first run) and
       pull its history — needed both for KPI deltas and the Customer Growth chart. */
    if (isAllBranches) {
      if (!headOfficeId) headOfficeId = await getHeadOfficeId();
      snapshotWritable = await ensureSnapshotTable();
      snapshotHistory = snapshotWritable ? await loadSnapshotHistory(headOfficeId) : [];
    }
    const baseline = isAllBranches ? pickBaseline(snapshotHistory) : null;

    const results = await Promise.allSettled([
      guarded(hasClients, () => api.clients.list({ limit: 1, status: 'active', ...officeParam })),                    // 0
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'active', ...officeParam })),                      // 1
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'pending', ...officeParam })),                     // 2
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'approved', ...officeParam })),                    // 3
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'closed', ...officeParam })),                      // 4
      guarded(hasSavings, () => api.savings.list({ limit: 1, status: 'active', ...officeParam })),                    // 5
      guarded(hasLoans,   () => api.runReports.run('PortfolioAtRisk', { genericResultSet: true, ...(officeId ? { R_officeId: officeId } : {}) })), // 6
      guarded(hasLoans,   () => api.runReports.run('ActiveLoansInArrears', { genericResultSet: true })),              // 7
      guarded(hasLoans,   () => api.runReports.run('TranDatewiseSummary', {
        startDate: fmt8(start), endDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en', genericResultSet: true })), // 8
      guarded(hasAudit,   () => api.audits.list({ limit: 10, orderBy: 'id', sortOrder: 'DESC', paged: true })),       // 9
      guarded(hasLoans,   () => api.loans.list({ limit: 200, status: 'active', orderBy: 'id', sortOrder: 'DESC', ...officeParam })), // 10 — sample for product distribution
      guarded(hasClients, () => api.clients.list({ limit: 200, status: 'active', orderBy: 'id', sortOrder: 'DESC', ...officeParam })) // 11 — sample for "new this month"
    ]);
    const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

    const activeClients  = val(0)?.totalFilteredRecords ?? null;
    const activeLoans    = val(1)?.totalFilteredRecords ?? null;
    const pendingLoans   = val(2)?.totalFilteredRecords ?? null;
    const approvedLoans  = val(3)?.totalFilteredRecords ?? null;
    const closedLoans    = val(4)?.totalFilteredRecords ?? null;
    const activeSavings  = val(5)?.totalFilteredRecords ?? null;
    const parReport       = val(6);
    const arrearsReport   = val(7);
    const tranReport      = val(8);
    const auditList       = val(9);
    const loanSample      = (() => { const r = val(10); return Array.isArray(r) ? r : (r?.pageItems || []); })();
    const clientSample    = (() => { const r = val(11); return Array.isArray(r) ? r : (r?.pageItems || []); })();

    const arrearsCount = arrearsReport?.data?.length ?? null;
    const parInfo = analyzePAR(parReport);

    /* ---- KPI: Total Customers ---- */
    if (hasClients) setKpi('clients', num(activeClients ?? '—'), deltaHtml(activeClients, 'clients', baseline));
    else setKpi('clients', '—', 'No permission');

    /* ---- KPI: New This Month ---- */
    let newClientsCount = null;
    if (hasClients) {
      const now = new Date();
      const inMonth = clientSample.filter(cl => {
        const d = toJsDate(cl.activationDate);
        return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      newClientsCount = inMonth.length;
      const capped = clientSample.length >= 200; // whole 200-row sample still in play — likely undercounting
      setKpi('newClients', num(newClientsCount) + (capped ? approxBadge() : ''), deltaHtml(newClientsCount, 'newClients', baseline));
    } else setKpi('newClients', '—', 'No permission');

    /* ---- KPI: Total Savings Balance ---- */
    let savingsAmount = null;
    if (hasSavings) {
      const savingsInfo = await loadSavingsBalance(officeId);
      savingsAmount = savingsInfo?.amount ?? null;
      if (savingsInfo) {
        setKpi('savings', fmt(savingsInfo.amount) + (savingsInfo.approx ? approxBadge() : ''), deltaHtml(savingsInfo.amount, 'savings', baseline, fmt));
      } else setKpi('savings', '—', 'Unavailable');
    } else setKpi('savings', '—', 'No permission');

    /* ---- Shared active-loan sample for the Gross Portfolio KPI and the Outstanding KPI's
     *      fallback path — fetched at most once per dashboard load instead of twice (see
     *      FIXLOG-duplicate-api-calls.md bug #2). Only actually hits the network if `hasLoans`
     *      and (later) if the PAR report doesn't already supply `totalOutstanding`. */
    let loanSampleRaw = null;
    let loanSampleFetched = false;
    const getLoanSample = async () => {
      if (!loanSampleFetched) {
        loanSampleFetched = true;
        loanSampleRaw = await sampleList(l => api.loans.list({ limit: l, status: 'active', ...officeParam }));
      }
      return loanSampleRaw;
    };

    /* ---- KPI: Loan Portfolio (gross principal disbursed, active loans) ---- */
    let grossPortfolio = null;
    if (hasLoans) {
      const raw = await getLoanSample();
      const sample = sumFromSample(raw, x => x.summary?.principalDisbursed);
      if (sample) {
        grossPortfolio = sample.capped ? (sample.sum / sample.sampleSize) * sample.total : sample.sum;
        setKpi('gross', fmt(grossPortfolio) + (sample.capped ? approxBadge() : ''),
          deltaHtml(grossPortfolio, 'gross', baseline, fmt));
      } else setKpi('gross', '—', 'Unavailable');
    } else setKpi('gross', '—', 'No permission');

    /* ---- KPI: Outstanding — report first, bounded sample as fallback ---- */
    let outstanding = null;
    if (hasLoans) {
      if (parInfo?.totalOutstanding != null) {
        outstanding = parInfo.totalOutstanding;
        setKpi('outstanding', fmt(outstanding), deltaHtml(outstanding, 'outstanding', baseline, fmt));
      } else {
        const raw = await getLoanSample();
        const sample = sumFromSample(raw, x => x.summary?.totalOutstanding);
        if (sample) {
          outstanding = sample.capped ? (sample.sum / sample.sampleSize) * sample.total : sample.sum;
          setKpi('outstanding', fmt(outstanding) + (sample.capped ? approxBadge() : ''), deltaHtml(outstanding, 'outstanding', baseline, fmt));
        } else setKpi('outstanding', '—', 'Unavailable');
      }
    } else setKpi('outstanding', '—', 'No permission');

    /* ---- KPI: Portfolio at Risk ---- */
    let parRatio = null;
    if (hasLoans) {
      if (parInfo?.parRatio != null) {
        parRatio = parInfo.parRatio;
        const delta = deltaHtml(parRatio, 'par', baseline, null, true);
        setKpi('par', `${parRatio.toFixed(2)}%`,
          `${fmt(parInfo.atRiskOutstanding)} at risk` + (arrearsCount != null ? ` · ${num(arrearsCount)} loans` : '') +
          (delta ? ` · ${delta}` : ''));
      } else if (arrearsCount != null && activeLoans) {
        parRatio = (arrearsCount / activeLoans) * 100;
        setKpi('par', `~${parRatio.toFixed(2)}%`, `${num(arrearsCount)} loans in arrears (estimate)`);
      } else setKpi('par', '—', 'Report unavailable');
    } else setKpi('par', '—', 'No permission');

    /* ---- KPI: Pending Approvals ---- */
    const pendingTotal = (pendingLoans != null && approvedLoans != null) ? pendingLoans + approvedLoans : null;
    if (hasLoans) setKpi('pending', num(pendingTotal ?? '—'), deltaHtml(pendingTotal, 'pending', baseline));
    else setKpi('pending', '—', 'No permission');

    /* ---- KPI: Amount Collected (cash inflow this month, from cash GL accounts) ---- */
    let cashActivity = null;
    if (hasAccounting) {
      const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
      cashActivity = await loadCashActivity(monthStart, end, officeId);
      if (cashActivity) {
        setKpi('collected', fmt(cashActivity.totalIn) + (cashActivity.capped ? approxBadge() : ''),
          deltaHtml(cashActivity.totalIn, 'collected', baseline, fmt));
      } else setKpi('collected', '—', 'Not configured');
    } else setKpi('collected', '—', 'No permission');

    /* ---- Save today's snapshot (unfiltered totals only) ---- */
    if (isAllBranches && snapshotWritable) {
      await saveSnapshot(headOfficeId, snapshotHistory, {
        clients: activeClients, newClients: newClientsCount, savings: savingsAmount, gross: grossPortfolio,
        outstanding, par: parRatio, pending: pendingTotal, collected: cashActivity?.totalIn ?? null
      });
    }

    /* ---- Chart: Loan Portfolio & Collection Trend (disbursements + snapshot-based outstanding) ---- */
    const trend = bucketMonthly(tranReport, months);
    await renderTrendChart(c, trend, snapshotHistory, months);

    /* ---- Chart: Product Distribution (or, if a product is selected, that product's status mix) ---- */
    const distTitle = c.querySelector('#dash-dist-title');
    if (productFilter) {
      if (distTitle) distTitle.textContent = `${productFilter} — Status Mix`;
      const filtered = loanSample.filter(l => l.loanProductName === productFilter);
      await renderStatusMixChart(c, filtered.length ? summarizeStatusMix(filtered) : null);
    } else {
      if (distTitle) distTitle.textContent = 'Loan Product Distribution';
      await renderProductDistChart(c, loanSample.length ? groupBy(loanSample, l => l.loanProductName || 'Unknown') : null);
    }

    /* ---- Chart: Customer Growth (from snapshot history) ---- */
    await renderGrowthChart(c, isAllBranches ? snapshotHistory : []);

    /* ---- Chart: Income vs Expenses ---- */
    if (hasAccounting) {
      const ie = await loadIncomeExpense(start, end, months, officeId);
      await renderIncomeExpenseChart(c, ie);
    } else await renderIncomeExpenseChart(c, null, 'No permission');

    /* ---- Chart: PAR aging ---- */
    await renderParChart(c, parInfo);
    const parSummaryEl = c.querySelector('#dash-par-summary');
    if (parSummaryEl) parSummaryEl.textContent = parInfo?.parRatio != null ? `PAR>30: ${parInfo.parRatio.toFixed(2)}%` : '';

    /* ---- Chart: Branch Performance ---- */
    if (hasOffices && hasLoans) {
      const branchLoans = parseOfficeBreakdown(parReport);
      const savingsReport = await api.runReports.run('Portfolio at a glance', { R_officeId: -1 }).catch(() => null);
      const branchSavings = parseOfficeBreakdown(savingsReport, /savings.*balance/i);
      await renderBranchChart(c, branchLoans, branchSavings);
    } else await renderBranchChart(c, null, null, 'No permission');

    /* ---- Chart: Loans by Officer ---- */
    if (hasStaff && hasLoans) {
      const officerData = await loadLoansByOfficer(officeId);
      await renderOfficerChart(c, officerData);
    } else await renderOfficerChart(c, null, 'No permission');

    /* ---- Chart: Daily Cash Flow — This Week ---- */
    if (hasAccounting) {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6);
      const weekly = await loadCashActivity(weekStart, end, officeId, true);
      await renderCashFlowChart(c, weekly);
    } else await renderCashFlowChart(c, null, 'No permission');

    /* ---- Recent activity ---- */
    if (hasAudit) {
      const auditEl = c.querySelector('#dash-audits');
      if (auditEl) {
        const list = Array.isArray(auditList) ? auditList : (auditList?.pageItems || []);
        auditEl.innerHTML = list.length
          ? `<ul class="activity-list">${list.map(a => `
              <li>
                <i class="fa-solid fa-clock-rotate-left"></i>
                <div>
                  <strong>${escapeHtml(a.actionName || '—')}</strong>
                  ${a.entityName ? ` <span class="text-muted">on ${escapeHtml(a.entityName)}</span>` : ''}
                  <div class="text-muted small">
                    ${escapeHtml(a.maker || a.madeBy || '—')}
                    ${a.madeOnDate ? ` · ${escapeHtml(fmtDate(a.madeOnDate))}` : ''}
                  </div>
                </div>
              </li>`).join('')}</ul>`
          : `<div class="empty-state-row">No recent activity</div>`;
      }
    }

    /* ---- Bookkeeping for the Export button + "as of" timestamp ---- */
    lastSummary = {
      'Total Customers': activeClients,
      'New This Month': newClientsCount,
      'Total Savings': savingsAmount,
      'Loan Portfolio': grossPortfolio,
      'Outstanding': outstanding,
      'Portfolio at Risk (%)': parRatio != null ? parRatio.toFixed(2) : null,
      'Pending Approvals': pendingTotal,
      'Amount Collected (this month)': cashActivity?.totalIn ?? null,
      'Active Loans': activeLoans,
      'Closed Loans': closedLoans
    };
    const updatedEl = c.querySelector('#dash-updated');
    if (updatedEl) updatedEl.textContent = `As of ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Kept separate from the main Promise.allSettled batch because it needs its own
   *  report-then-fallback chain. */
  async function loadSavingsBalance(officeId) {
    try {
      const r = await api.runReports.run('Portfolio at a glance', { R_officeId: officeId || -1 });
      const headers = r?.columnHeaders?.map(h => (h.columnName || '').toLowerCase()) || [];
      const idx = headers.findIndex(h => h.includes('savings') && h.includes('balance'));
      if (idx >= 0 && r.data?.length) {
        const amount = r.data.reduce((s, row) => s + (parseFloat(row.row?.[idx]) || 0), 0);
        return { amount, approx: false };
      }
    } catch {}
    const sample = await sampleBalance(l => api.savings.list({ limit: l, status: 'active', ...(officeId ? { officeId } : {}) }), x => x.summary?.accountBalance);
    return sample ? { amount: sample.capped ? (sample.sum / sample.sampleSize) * sample.total : sample.sum, approx: sample.capped } : null;
  }

  await loadAll();

  c.querySelector('#dash-refresh')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const icon = btn.querySelector('i');
    icon?.classList.add('fa-spin');
    loadAll().finally(() => { btn.disabled = false; icon?.classList.remove('fa-spin'); });
  });

  c.querySelector('#dash-export')?.addEventListener('click', () => {
    const rows = [['Metric', 'Value'], ...Object.entries(lastSummary).filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v == null ? '' : v])];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  /** Renders a "↑ 4.2% vs Jul 13" (or "↓") line, or null if there's no usable baseline.
   *  `formatter` (fmt/num) controls how the raw diff itself would be displayed if ever
   *  needed — currently only the percentage is shown, so it's accepted for symmetry with
   *  a possible future absolute-diff display but unused today. `isPercentPoint` treats the
   *  KPI's OWN value as already being a percentage (PAR), diffing in percentage points and
   *  flipping the up=good/down=good colour convention (more PAR is bad, not good). */
  function deltaHtml(current, key, baseline, formatter, isPercentPoint) {
    if (!baseline || current == null || !isFinite(current)) return '';
    const prev = baseline.metrics?.[key];
    if (prev == null || !isFinite(prev)) return '';
    const diff = isPercentPoint ? (current - prev) : (prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : (current > 0 ? 100 : 0));
    const up = diff >= 0;
    const goodDirectionIsUp = key !== 'par';
    const cls = (up === goodDirectionIsUp) ? 'text-success' : 'text-danger';
    const arrow = up ? '↑' : '↓';
    const label = isPercentPoint ? `${Math.abs(diff).toFixed(1)}pp` : `${Math.abs(diff).toFixed(1)}%`;
    return `<span class="${cls}">${arrow} ${label}</span> vs ${fmtDate(baseline.date)}`;
  }
}

/* ------------------------------------------------------------------- */
/* Daily snapshot mechanism — a registered one-to-many datatable on    */
/* the head office, storing one JSON-blob row per calendar day.        */
/* ------------------------------------------------------------------- */

async function getHeadOfficeId() {
  try {
    const offices = await api.offices.list();
    const list = Array.isArray(offices) ? offices : (offices?.pageItems || []);
    const root = list.find(o => !o.parentId) || list[0];
    return root?.id ?? 1;
  } catch { return 1; }
}

/** Registers the snapshot datatable if it doesn't already exist. Returns false (never
 *  throws) if the user lacks permission or the call fails for any other reason — callers
 *  treat that as "deltas unavailable this session", not an error. */
async function ensureSnapshotTable() {
  try {
    const tables = await api.dataTables.list();
    const exists = Array.isArray(tables) && tables.some(t => t.registeredTableName === SNAPSHOT_TABLE);
    if (exists) return true;
    await api.dataTables.create({
      datatableName: SNAPSHOT_TABLE,
      apptableName: 'm_office',
      multiRow: true,
      columns: [
        { name: 'snapshot_date', type: 'Date', mandatory: true },
        { name: 'metrics_json', type: 'Text', length: 4000, mandatory: true }
      ]
    });
    return true;
  } catch { return false; }
}

async function loadSnapshotHistory(officeId) {
  try {
    const rows = await api.dataTables.query(SNAPSHOT_TABLE, officeId);
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map(r => { try { return { id: r.id, date: r.snapshot_date, metrics: JSON.parse(r.metrics_json) }; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(toJsDate(a.date)) - new Date(toJsDate(b.date)));
  } catch { return []; }
}

/** Upserts today's row — updates it in place if the dashboard's already been loaded once
 *  today (so a 5pm refresh reflects the day's latest figures, not the 9am snapshot). */
async function saveSnapshot(officeId, history, metrics) {
  const todayStr = isoDay(new Date());
  const body = { snapshot_date: todayStr, metrics_json: JSON.stringify(metrics), dateFormat: 'yyyy-MM-dd', locale: 'en' };
  try {
    const todayRow = history.find(h => isoDay(toJsDate(h.date) || new Date(0)) === todayStr);
    if (todayRow) await api.dataTables.updateEntryOneToMany(SNAPSHOT_TABLE, officeId, todayRow.id, body);
    else await api.dataTables.createEntry(SNAPSHOT_TABLE, officeId, body);
  } catch { /* non-fatal — deltas just won't have today's baseline for next time */ }
}

/** Most recent snapshot strictly before today. */
function pickBaseline(history) {
  const todayStr = isoDay(new Date());
  const prior = history.filter(h => isoDay(toJsDate(h.date) || new Date(0)) < todayStr);
  return prior.length ? prior[prior.length - 1] : null;
}

/* ------------------------------------------------------------------- */
/* Report parsing — column-name matching, not fixed indices, because   */
/* Fineract's genericResultSet layout varies slightly by deployment.   */
/* ------------------------------------------------------------------- */

/** Parses a PortfolioAtRisk genericResultSet into:
 *    { totalOutstanding, atRiskOutstanding, parRatio, buckets: [{label, value}] }
 *  or null if the report didn't return a recognisable shape. */
function analyzePAR(parData) {
  if (!parData?.data?.length || !parData?.columnHeaders?.length) return null;
  const cols = parData.columnHeaders.map(h => h.columnName || '');
  const totalIdx = cols.findIndex(c => /total.*(outstanding|portfolio)|outstanding.*total/i.test(c));
  if (totalIdx < 0) return null;

  const firstRow = parData.data[0]?.row || [];
  const labelIdx = firstRow.findIndex((v, i) => i !== totalIdx && isNaN(parseFloat(v)));

  const bucketIdxs = cols.map((_, i) => i).filter(i => i !== totalIdx && i !== labelIdx);
  if (!bucketIdxs.length) return null;

  let totalOutstanding = 0;
  const bucketSums = bucketIdxs.map(() => 0);
  for (const row of parData.data) {
    const cells = row.row || [];
    const t = parseFloat(cells[totalIdx]);
    if (!isNaN(t)) totalOutstanding += t;
    bucketIdxs.forEach((idx, bi) => {
      const v = parseFloat(cells[idx]);
      if (!isNaN(v)) bucketSums[bi] += v;
    });
  }
  const buckets = bucketIdxs.map((idx, bi) => ({ label: cols[idx], value: bucketSums[bi] }));
  const atRisk = buckets.filter(b => !/current|not\s*overdue/i.test(b.label));
  const atRiskOutstanding = atRisk.reduce((s, b) => s + b.value, 0);
  const parRatio = totalOutstanding > 0 ? (atRiskOutstanding / totalOutstanding) * 100 : null;

  return { totalOutstanding, atRiskOutstanding, parRatio, buckets };
}

/** If a genericResultSet has a per-office label column (many stock Fineract reports do
 *  when run without a specific R_officeId), groups a value column by that label. Returns
 *  null if there's no more than one distinct label — i.e. the report only gave one
 *  aggregate row, not a real office breakdown. `valueColRegex` picks which numeric column
 *  to sum; defaults to the same "total outstanding" pattern analyzePAR uses. */
function parseOfficeBreakdown(reportData, valueColRegex = /total.*(outstanding|portfolio)|outstanding.*total/i) {
  if (!reportData?.data?.length || !reportData?.columnHeaders?.length) return null;
  const cols = reportData.columnHeaders.map(h => h.columnName || '');
  const valueIdx = cols.findIndex(c => valueColRegex.test(c));
  if (valueIdx < 0) return null;
  const firstRow = reportData.data[0]?.row || [];
  const labelIdx = firstRow.findIndex((v, i) => i !== valueIdx && isNaN(parseFloat(v)));
  if (labelIdx < 0) return null;

  const sums = new Map();
  for (const row of reportData.data) {
    const cells = row.row || [];
    const label = cells[labelIdx];
    const v = parseFloat(cells[valueIdx]);
    if (!label || isNaN(v)) continue;
    sums.set(label, (sums.get(label) || 0) + v);
  }
  if (sums.size <= 1) return null; // only one aggregate row — no real office dimension
  return [...sums.entries()].map(([label, value]) => ({ label, value }));
}

/** Buckets a TranDatewiseSummary genericResultSet into `months` trailing calendar months
 *  (oldest first), zero-filling months with no matching rows. Returns null only if the
 *  report shape wasn't recognisable at all. */
function bucketMonthly(tranData, months = 6) {
  if (!tranData?.data?.length || !tranData?.columnHeaders?.length) return null;
  const cols = tranData.columnHeaders.map(h => h.columnName || '');
  const dateIdx = cols.findIndex(c => /date/i.test(c));
  const amountIdx = cols.findIndex(c => /amount|disburse|total/i.test(c));
  if (amountIdx < 0) return null;

  const sums = new Map();
  for (const row of tranData.data) {
    const cells = row.row || [];
    const amt = parseFloat(cells[amountIdx]);
    if (isNaN(amt)) continue;
    const d = new Date(cells[dateIdx >= 0 ? dateIdx : 0]);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    sums.set(key, (sums.get(key) || 0) + amt);
  }

  const now = new Date();
  const labels = [], values = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
    values.push(sums.get(key) || 0);
  }
  return { labels, values };
}

/** Groups an array by a key function into [{label, value}] sorted descending. */
function groupBy(arr, keyFn) {
  const sums = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    sums.set(k, (sums.get(k) || 0) + 1);
  }
  return [...sums.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function summarizeStatusMix(loans) {
  const overdue = loans.filter(l => (l.summary?.totalOverdue || 0) > 0).length;
  const closed = loans.filter(l => l.status?.closed || /closed/i.test(l.status?.value || '')).length;
  const performing = Math.max(0, loans.length - overdue - closed);
  return { performing, overdue, closed };
}

/** Bounded-sample fallback for KPIs that ideally want a portfolio-wide sum but have no
 *  cheap aggregate endpoint to fall back on. `listFn` is called with the sample size so
 *  callers can reuse it for different limits if ever needed. */
async function sampleBalance(listFn, balancePath, cap = 100) {
  try {
    const r = await listFn(cap);
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    const sum = list.reduce((s, x) => s + (balancePath(x) || 0), 0);
    const total = r?.totalFilteredRecords ?? list.length;
    return { sum, sampleSize: list.length, total, capped: total > list.length };
  } catch { return null; }
}

/** Fetches a bounded sample's raw record list without summing any particular field yet — lets
 *  a caller derive more than one KPI (e.g. principalDisbursed AND totalOutstanding) from a
 *  single network round trip via `sumFromSample()` below, instead of re-fetching per field. */
async function sampleList(listFn, cap = 100) {
  try {
    const r = await listFn(cap);
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    const total = r?.totalFilteredRecords ?? list.length;
    return { list, total, capped: total > list.length };
  } catch { return null; }
}

/** Sums one field out of an already-fetched `sampleList()` result — the multi-KPI counterpart
 *  to `sampleBalance()`'s single-field fetch+sum. */
function sumFromSample(sample, balancePath) {
  if (!sample) return null;
  const sum = sample.list.reduce((s, x) => s + (balancePath(x) || 0), 0);
  return { sum, sampleSize: sample.list.length, total: sample.total, capped: sample.capped };
}

/** Loads all Financial-Activity accounts tagged as cash (name containing "Cash", covering
 *  Fineract's standard "Cash at Main Vault" / "Cash at Tellers" activity labels), then
 *  sums journal-entry movements on those GL accounts for the given date range. For an
 *  ASSET account, a DEBIT increases the balance (cash in), a CREDIT decreases it (cash
 *  out) — standard double-entry convention. Returns null if no cash accounts are
 *  configured. `daily`=true also returns a day-bucketed breakdown for the cash-flow chart. */
async function loadCashActivity(start, end, officeId, daily = false) {
  try {
    const activities = await api.financialActivityAccounts.list();
    const cashAccounts = (Array.isArray(activities) ? activities : []).filter(a => /cash/i.test(a.financialActivityName || ''));
    if (!cashAccounts.length) return null;
    const cashGlIds = new Set(cashAccounts.map(a => a.glAccountId));

    const fmt8 = d => d.toISOString().split('T')[0];
    const entries = await api.journalEntries.list({
      fromDate: fmt8(start), toDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en',
      limit: 1000, ...(officeId ? { officeId } : {})
    }).catch(() => null);
    const list = Array.isArray(entries) ? entries : (entries?.pageItems || []);
    const relevant = list.filter(e => cashGlIds.has(e.glAccountId));

    let totalIn = 0, totalOut = 0;
    const byDay = new Map();
    for (const e of relevant) {
      const amt = parseFloat(e.amount) || 0;
      const isDebit = /debit/i.test(e.entryType?.value || e.entryType?.code || '');
      if (isDebit) totalIn += amt; else totalOut += amt;
      if (daily) {
        const d = toJsDate(e.transactionDate);
        if (d) {
          const key = isoDay(d);
          const rec = byDay.get(key) || { in: 0, out: 0 };
          if (isDebit) rec.in += amt; else rec.out += amt;
          byDay.set(key, rec);
        }
      }
    }
    const capped = (entries?.totalFilteredRecords ?? list.length) > list.length;
    return { totalIn, totalOut, byDay, capped };
  } catch { return null; }
}

/** Sums INCOME vs EXPENSE GL account movements per trailing calendar month. Income
 *  accounts recognise revenue on CREDIT, expense accounts recognise cost on DEBIT —
 *  standard double-entry convention. */
async function loadIncomeExpense(start, end, months, officeId) {
  try {
    const accounts = await api.glAccounts.list();
    const list = Array.isArray(accounts) ? accounts : [];
    const incomeIds = new Set(list.filter(a => /income/i.test(a.type?.value || a.type?.code || '')).map(a => a.id));
    const expenseIds = new Set(list.filter(a => /expense/i.test(a.type?.value || a.type?.code || '')).map(a => a.id));
    if (!incomeIds.size && !expenseIds.size) return null;

    const fmt8 = d => d.toISOString().split('T')[0];
    const entries = await api.journalEntries.list({
      fromDate: fmt8(start), toDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en',
      limit: 1000, ...(officeId ? { officeId } : {})
    }).catch(() => null);
    const rows = Array.isArray(entries) ? entries : (entries?.pageItems || []);

    const now = new Date();
    const income = new Array(months).fill(0), expense = new Array(months).fill(0);
    const labels = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
    }
    for (const e of rows) {
      const d = toJsDate(e.transactionDate);
      if (!d) continue;
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      const i = months - 1 - monthsAgo;
      if (i < 0 || i >= months) continue;
      const amt = parseFloat(e.amount) || 0;
      const isCredit = /credit/i.test(e.entryType?.value || e.entryType?.code || '');
      if (incomeIds.has(e.glAccountId) && isCredit) income[i] += amt;
      if (expenseIds.has(e.glAccountId) && !isCredit) expense[i] += amt;
    }
    return { labels, income, expense, capped: (entries?.totalFilteredRecords ?? rows.length) > rows.length };
  } catch { return null; }
}

/** Active loan COUNT per loan officer (not a currency figure — see file header for why). */
async function loadLoansByOfficer(officeId) {
  try {
    const staff = await api.staff.list({ isLoanOfficer: true, ...(officeId ? { officeId } : {}) });
    const list = (Array.isArray(staff) ? staff : []).slice(0, 8); // cap chart to 8 bars
    const counts = await Promise.all(list.map(s =>
      api.loans.list({ limit: 1, status: 'active', loanOfficerId: s.id }).then(r => r?.totalFilteredRecords ?? 0).catch(() => null)
    ));
    return list.map((s, i) => ({ label: s.displayName || `Staff #${s.id}`, value: counts[i] })).filter(x => x.value != null);
  } catch { return null; }
}

/* ------------------------------------------------------------------- */
/* Chart.js — lazily loaded exactly once, same CDN entry analytics.js  */
/* already uses (already whitelisted in the app's CSP script-src).     */
/* ------------------------------------------------------------------- */
let chartJsPromise = null;
function loadChartJs() {
  if (window.Chart) return Promise.resolve(true);
  if (chartJsPromise) return chartJsPromise;
  chartJsPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return chartJsPromise;
}

const chartInstances = new WeakMap();
function destroyChart(canvas) {
  const existing = chartInstances.get(canvas);
  if (existing) { existing.destroy(); chartInstances.delete(canvas); }
}
function showFallback(canvas, fallbackEl, text) {
  if (canvas) canvas.style.display = 'none';
  if (fallbackEl) { fallbackEl.style.display = 'block'; fallbackEl.textContent = text; }
}
function showCanvas(canvas, fallbackEl) {
  canvas.style.display = 'block';
  if (fallbackEl) fallbackEl.style.display = 'none';
}

async function renderTrendChart(c, trend, snapshotHistory, months) {
  const canvas = c.querySelector('#dash-trend-chart');
  const fallback = c.querySelector('#dash-trend-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!trend && !snapshotHistory?.length) return showFallback(canvas, fallback, 'No disbursement or snapshot data available yet');

  destroyChart(canvas);
  showCanvas(canvas, fallback);

  const outstandingSeries = snapshotHistory.map(h => ({ x: fmtDate(h.date), y: h.metrics?.outstanding ?? null })).filter(p => p.y != null);

  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: trend?.labels || outstandingSeries.map(p => p.x),
      datasets: [
        ...(trend ? [{
          type: 'bar', label: 'Disbursed', data: trend.values,
          backgroundColor: 'rgba(0,201,177,0.55)', hoverBackgroundColor: '#00c9b1',
          borderRadius: 4, maxBarThickness: 42, yAxisID: 'y'
        }] : []),
        ...(outstandingSeries.length ? [{
          type: 'line', label: 'Outstanding (from snapshots)', data: outstandingSeries.map(p => p.y),
          borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', fill: true, tension: 0.3, yAxisID: 'y'
        }] : [])
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
  chartInstances.set(canvas, chart);
}

async function renderProductDistChart(c, grouped) {
  const canvas = c.querySelector('#dash-dist-chart');
  const fallback = c.querySelector('#dash-dist-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!grouped?.length) return showFallback(canvas, fallback, 'No loan data available to break down by product');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: grouped.map(g => g.label),
      datasets: [{ data: grouped.map(g => g.value), backgroundColor: grouped.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderStatusMixChart(c, mix) {
  const canvas = c.querySelector('#dash-dist-chart');
  const fallback = c.querySelector('#dash-dist-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!mix) return showFallback(canvas, fallback, 'No loans found for that product in the current sample');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Performing', 'Overdue', 'Closed'],
      datasets: [{ data: [mix.performing, mix.overdue, mix.closed], backgroundColor: ['#00c9b1', '#f87171', '#64748b'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderGrowthChart(c, history) {
  const canvas = c.querySelector('#dash-growth-chart');
  const fallback = c.querySelector('#dash-growth-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  const points = history.filter(h => h.metrics?.clients != null);
  if (points.length < 2) return showFallback(canvas, fallback, points.length === 1
    ? 'Only one day of snapshots so far — check back tomorrow for a trend line'
    : 'No snapshot history yet — this builds up day by day (switch to "All Branches" if filtered)');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const chart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => fmtDate(p.date)),
      datasets: [{ label: 'Total Customers', data: points.map(p => p.metrics.clients), borderColor: '#00c9b1', backgroundColor: 'rgba(0,201,177,0.15)', fill: true, tension: 0.3 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderIncomeExpenseChart(c, ie, reasonIfNull) {
  const canvas = c.querySelector('#dash-ie-chart');
  const fallback = c.querySelector('#dash-ie-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!ie) return showFallback(canvas, fallback, reasonIfNull || 'No income/expense GL accounts found, or no journal entries in range');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: ie.labels,
      datasets: [
        { label: 'Income', data: ie.income, backgroundColor: 'rgba(74,222,128,0.65)', borderRadius: 4, maxBarThickness: 28 },
        { label: 'Expenses', data: ie.expense, backgroundColor: 'rgba(248,113,113,0.65)', borderRadius: 4, maxBarThickness: 28 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderParChart(c, parInfo) {
  const canvas = c.querySelector('#dash-par-chart');
  const fallback = c.querySelector('#dash-par-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!parInfo?.buckets?.length) return showFallback(canvas, fallback, 'Portfolio at Risk report unavailable on this server');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const isCurrent = (label) => /current|not\s*overdue/i.test(label);
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: parInfo.buckets.map(b => b.label),
      datasets: [{
        label: 'Outstanding', data: parInfo.buckets.map(b => b.value),
        backgroundColor: parInfo.buckets.map(b => isCurrent(b.label) ? 'rgba(251,191,36,0.7)' : 'rgba(251,191,36,0.35)'),
        borderRadius: 4, maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } }
    }
  });
  chartInstances.set(canvas, chart);
}

async function renderBranchChart(c, loansByOffice, savingsByOffice, reasonIfNull) {
  const canvas = c.querySelector('#dash-branch-chart');
  const fallback = c.querySelector('#dash-branch-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!loansByOffice && !savingsByOffice) return showFallback(canvas, fallback, reasonIfNull || 'This report returned one aggregate row — no per-office breakdown available');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const labels = (loansByOffice || savingsByOffice).map(b => b.label);
  const loanMap = new Map((loansByOffice || []).map(b => [b.label, b.value]));
  const savingsMap = new Map((savingsByOffice || []).map(b => [b.label, b.value]));
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Loans', data: labels.map(l => loanMap.get(l) ?? 0), backgroundColor: 'rgba(96,165,250,0.7)', borderRadius: 4, maxBarThickness: 20 },
        { label: 'Savings', data: labels.map(l => savingsMap.get(l) ?? 0), backgroundColor: 'rgba(74,222,128,0.7)', borderRadius: 4, maxBarThickness: 20 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderOfficerChart(c, data, reasonIfNull) {
  const canvas = c.querySelector('#dash-officer-chart');
  const fallback = c.querySelector('#dash-officer-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!data?.length) return showFallback(canvas, fallback, reasonIfNull || 'No loan officers found');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{ label: 'Active Loans', data: data.map(d => d.value), backgroundColor: 'rgba(0,201,177,0.6)', borderRadius: 4, maxBarThickness: 24 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
  });
  chartInstances.set(canvas, chart);
}

async function renderCashFlowChart(c, weekly, reasonIfNull) {
  const canvas = c.querySelector('#dash-cash-chart');
  const fallback = c.querySelector('#dash-cash-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!weekly) return showFallback(canvas, fallback, reasonIfNull || 'No cash GL accounts configured — see Accounting → Financial Activity Mappings');

  destroyChart(canvas);
  showCanvas(canvas, fallback);
  const days = [];
  const end = new Date();
  for (let i = 6; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); days.push(d); }
  const labels = days.map(d => d.toLocaleDateString(undefined, { weekday: 'short' }));
  const cashIn = days.map(d => weekly.byDay.get(isoDay(d))?.in ?? 0);
  const cashOut = days.map(d => weekly.byDay.get(isoDay(d))?.out ?? 0);

  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Cash In', data: cashIn, backgroundColor: 'rgba(74,222,128,0.7)', borderRadius: 4, maxBarThickness: 28 },
        { label: 'Cash Out', data: cashOut, backgroundColor: 'rgba(248,113,113,0.7)', borderRadius: 4, maxBarThickness: 28 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
  chartInstances.set(canvas, chart);
}
