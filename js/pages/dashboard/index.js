/* FinCraft · pages/dashboard/index.js — render(): the dashboard page entry point.
   Filter bar, headline KPI cards (with period-over-period deltas via the daily snapshot
   mechanism in ./data.js), the chart bank (rendered via ./charts.js), Quick Actions, and
   Recent Activity. Split out of the former single dashboard.js — see js/pages/dashboard.js
   barrel + FRONTEND.md for the split rationale and known data-honesty notes for this page. */
import { api } from '../../api.js';
import { store } from '../../store.js';
import { fmt, num, escapeHtml, fmtDate } from '../../utils.js';
import { SPIN, KPI_SKELETON, KPIS, QUICK_ACTIONS, toJsDate } from './shared.js';
import {
  getHeadOfficeId, ensureSnapshotTable, loadSnapshotHistory, saveSnapshot, pickBaseline,
  analyzePAR, parseOfficeBreakdown, bucketMonthly, groupBy, summarizeStatusMix,
  sampleBalance, sampleList, sumFromSample, loadCashActivity, loadIncomeExpense, loadLoansByOfficer
} from './data.js';
import {
  renderTrendChart, renderProductDistChart, renderStatusMixChart, renderGrowthChart,
  renderIncomeExpenseChart, renderParChart, renderBranchChart, renderOfficerChart, renderCashFlowChart
} from './charts.js';

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
