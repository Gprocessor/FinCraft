/* FinCraft · dashboard.js — Live Fineract API, no demo data, permission-aware.
   Redesign (this pass): the old dashboard leaned on "Recent Clients" / "Pending Tasks" /
   "Recent Loans" tables and flat KPI tiles — more of a browsable record list than a
   glance-able banking dashboard. This version is portfolio-first: six headline KPIs
   (clients, loans, gross outstanding portfolio, PAR>30, savings balance, disbursed this
   month), a 6-month disbursement trend, a portfolio composition breakdown, a real
   Portfolio-at-Risk aging chart, a Quick Actions launcher (replaces the old "Pending
   Tasks" list with something actionable), and a single Recent Activity audit feed.

   Bugs fixed vs. the previous dashboard.js while rebuilding this page:
     - Checker-related gating used `canRead('CHECKER_SUPER_USER')`, which (per store.js's
       own hasAnyCheckerPermission() comment) locks out any user who only holds a specific
       entity `..._CHECKER` permission rather than the global super-user one. Now uses
       store.hasAnyCheckerPermission(), same as the router's own Checker Inbox gate.
     - The savings-balance sampling fallback silently appended a bare " *" onto the
       formatted currency string with no explanation anywhere in the UI. Approximate
       figures now get a visible, titled "~" badge instead of a mystery asterisk.
     - The Recent Activity (audit) call fired unconditionally regardless of whether the
       user actually holds READ_AUDIT, generating a guaranteed 403 for anyone without it.
       Now gated like every other widget on this page.
     - No KPI on this page fabricates a "+12% this month"-style delta — this app has no
       historical snapshot to compare against, so a fake trend arrow would just be a lie
       wearing a chart icon. Where we don't have a real comparison, we simply don't show one. */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, escapeHtml } from '../utils.js';

const SPIN = `<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px"></i>`;
const KPI_SKELETON = `<span class="skeleton-bar" style="display:inline-block;height:26px;width:70px"></span>`;

/** KPI card definitions — id / label / icon / accent colour (matches .stat-card's c-* accents). */
const KPIS = [
  { id: 'clients',  label: 'Active Clients',        icon: 'fa-users',                    accent: 'teal'   },
  { id: 'loans',    label: 'Active Loans',          icon: 'fa-hand-holding-dollar',       accent: 'blue'   },
  { id: 'gross',    label: 'Gross Loan Portfolio',  icon: 'fa-sack-dollar',               accent: 'amber'  },
  { id: 'par',      label: 'Portfolio at Risk >30d',icon: 'fa-triangle-exclamation',      accent: 'red'    },
  { id: 'savings',  label: 'Total Savings Balance', icon: 'fa-piggy-bank',                accent: 'green'  },
  { id: 'disb',     label: 'Disbursed This Month',  icon: 'fa-money-bill-trend-up',       accent: 'purple' }
];

/** Quick Actions — reuses the exact same modal ids as the topbar's global Quick Action
 *  button and each entity page's "New …" button, so behaviour stays identical everywhere;
 *  this is just a bigger, more discoverable, permission-filtered entry point for them. */
const QUICK_ACTIONS = [
  { perm: 'CREATE_CLIENT',         modal: 'newClientModal',   icon: 'fa-user-plus',            label: 'New Client' },
  { perm: 'CREATE_LOAN',           modal: 'newLoanModal',     icon: 'fa-hand-holding-dollar',  label: 'New Loan' },
  { perm: 'CREATE_SAVINGSACCOUNT', modal: 'newSavingsModal',  icon: 'fa-piggy-bank',           label: 'New Savings' },
  { perm: 'REPAYMENT_LOAN',        modal: 'repaymentModal',   icon: 'fa-money-bill-transfer',  label: 'Repayment' },
  { perm: 'CREATE_ACCOUNTTRANSFER',modal: 'newTransferModal', icon: 'fa-right-left',           label: 'Transfer' },
  { perm: 'CREATE_JOURNALENTRY',   modal: 'journalEntryModal',icon: 'fa-book',                 label: 'Journal Entry' },
  { checker: true,                 href: '#/tasks',           icon: 'fa-inbox',                label: 'Checker Inbox' },
  { perm: 'READ_REPORT',           href: '#/reports',         icon: 'fa-file-chart-column',    label: 'Reports' }
];

export async function render(c) {
  const auth = store.get('auth') || {};
  const canRead = (code) => store.hasPermission(code);

  const hasLoans   = canRead('READ_LOAN');
  const hasClients = canRead('READ_CLIENT');
  const hasSavings = canRead('READ_SAVINGSACCOUNT');
  const hasAudit   = canRead('READ_AUDIT');

  const quickActions = QUICK_ACTIONS.filter(a => a.checker ? store.hasAnyCheckerPermission() : canRead(a.perm));

  const greeting = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  c.innerHTML = `
    <div class="page-header mb-4">
      <div>
        <h1>Dashboard</h1>
        <div class="text-muted">${escapeHtml(greeting)}${auth.officeName ? ` · ${escapeHtml(auth.officeName)}` : ''}</div>
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

    <div class="stat-grid mb-4" id="dash-kpis">
      ${KPIS.map(k => `
        <div class="stat-card c-${k.accent}" id="dash-kpi-${k.id}">
          <div class="stat-icon c-${k.accent}"><i class="fa-solid ${k.icon}"></i></div>
          <div class="stat-value" data-role="value">${KPI_SKELETON}</div>
          <div class="stat-label">${k.label}</div>
          <div class="kpi-foot text-muted" data-role="foot">&nbsp;</div>
        </div>`).join('')}
    </div>

    <div class="grid-2 mb-4">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Disbursements — Last 6 Months</h3>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-disb-chart" height="220"></canvas>
          <div id="dash-disb-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Portfolio Composition</h3>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-comp-chart" height="220"></canvas>
          <div id="dash-comp-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Portfolio at Risk — Aging</h3>
          <span class="text-muted fz-11" id="dash-par-summary"></span>
        </div>
        <div class="card-body" style="min-height:220px;position:relative">
          <canvas id="dash-par-chart" height="220"></canvas>
          <div id="dash-par-fallback" class="empty-state-row" style="display:none"></div>
        </div>
      </div>

      ${quickActions.length ? `
      <div class="card">
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
      </div>` : `<div class="card"><div class="card-body"><div class="empty-state-row">No quick actions available for your role</div></div></div>`}
    </div>

    ${hasAudit ? `
    <div class="card mt-4">
      <div class="card-header">
        <h3 class="card-title">Recent Activity</h3>
        <span class="text-muted fz-11">Last 10 audit events</span>
      </div>
      <div id="dash-audits"><div class="empty-state-row">${SPIN} Loading…</div></div>
    </div>` : ''}
  `;

  const kpiEl = (id, role) => c.querySelector(`#dash-kpi-${id} [data-role="${role}"]`);
  // NOTE: value uses innerHTML (not textContent) because the approx-badge fallback below
  // needs to inject a small <span> next to the figure — every value passed in is our own
  // fmt()/num() output or a literal, never raw user/server text, so this stays safe.
  const setKpi = (id, value, foot) => {
    const v = kpiEl(id, 'value'); const f = kpiEl(id, 'foot');
    if (v) v.innerHTML = value;
    if (f) f.innerHTML = foot ?? '&nbsp;';
  };
  const approxBadge = () =>
    `<span class="badge b-warning" title="Estimated from a limited sample — the full total could not be summed in one request" style="font-size:9px;padding:1px 6px;margin-left:6px">~</span>`;

  let lastSummary = {}; // populated by loadAll(), read by the Export button

  async function loadAll() {
    KPIS.forEach(k => setKpi(k.id, KPI_SKELETON, '&nbsp;'));

    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - 6);
    const fmt8 = d => d.toISOString().split('T')[0];

    const guarded = (cond, fn) => cond ? fn().catch(() => null) : Promise.resolve(null);

    const results = await Promise.allSettled([
      guarded(hasClients, () => api.clients.list({ limit: 1, status: 'active' })),                       // 0
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'active' })),                          // 1
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'pending' })),                         // 2
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'approved' })),                        // 3
      guarded(hasLoans,   () => api.loans.list({ limit: 1, status: 'closed' })),                          // 4
      guarded(hasSavings, () => api.savings.list({ limit: 1, status: 'active' })),                        // 5
      guarded(hasLoans,   () => api.runReports.run('PortfolioAtRisk', { genericResultSet: true })),       // 6
      guarded(hasLoans,   () => api.runReports.run('ActiveLoansInArrears', { genericResultSet: true })),  // 7
      guarded(hasLoans,   () => api.runReports.run('TranDatewiseSummary', {
        startDate: fmt8(start), endDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en', genericResultSet: true })), // 8
      guarded(hasAudit,   () => api.audits.list({ limit: 10, orderBy: 'id', sortOrder: 'DESC', paged: true })) // 9
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

    const arrearsCount = arrearsReport?.data?.length ?? null;
    const parInfo = analyzePAR(parReport);

    /* ---- KPI: Active Clients ---- */
    if (hasClients) setKpi('clients', num(activeClients ?? '—'));
    else setKpi('clients', '—', 'No permission');

    /* ---- KPI: Active Loans (+ pending/approved footer) ---- */
    if (hasLoans) {
      setKpi('loans', num(activeLoans ?? '—'),
        (pendingLoans != null && approvedLoans != null)
          ? `${num(pendingLoans + approvedLoans)} pending approval`
          : '&nbsp;');
    } else setKpi('loans', '—', 'No permission');

    /* ---- KPI: Gross Loan Portfolio — report first, bounded sample as fallback ---- */
    if (hasLoans) {
      if (parInfo?.totalOutstanding != null) {
        const avg = activeLoans ? parInfo.totalOutstanding / activeLoans : null;
        setKpi('gross', fmt(parInfo.totalOutstanding),
          avg != null ? `Avg ${fmt(avg)} / loan` : '&nbsp;');
      } else {
        const sample = await sampleBalance(api.loans.list, x => x.summary?.totalOutstanding);
        if (sample) {
          setKpi('gross', fmt(sample.sum) + (sample.capped ? approxBadge() : ''),
            sample.capped ? `Sampled ${sample.sampleSize} of ${num(sample.total)} loans` : '&nbsp;');
        } else setKpi('gross', '—', 'Unavailable');
      }
    } else setKpi('gross', '—', 'No permission');

    /* ---- KPI: Portfolio at Risk >30d ---- */
    if (hasLoans) {
      if (parInfo?.parRatio != null) {
        setKpi('par', `${parInfo.parRatio.toFixed(2)}%`,
          `${fmt(parInfo.atRiskOutstanding)} at risk` +
          (arrearsCount != null ? ` · ${num(arrearsCount)} loans` : ''));
      } else if (arrearsCount != null && activeLoans) {
        // Fallback: count-based estimate only, clearly labelled as such (never presented as the real ratio).
        setKpi('par', `~${((arrearsCount / activeLoans) * 100).toFixed(2)}%`, `${num(arrearsCount)} loans in arrears (estimate)`);
      } else setKpi('par', '—', 'Report unavailable');
    } else setKpi('par', '—', 'No permission');

    /* ---- KPI: Total Savings Balance — report first, bounded sample as fallback ---- */
    if (hasSavings) {
      const savingsInfo = await loadSavingsBalance();
      if (savingsInfo) {
        setKpi('savings', fmt(savingsInfo.amount) + (savingsInfo.approx ? approxBadge() : ''),
          activeSavings != null ? `${num(activeSavings)} active accounts` : '&nbsp;');
      } else setKpi('savings', '—', activeSavings != null ? `${num(activeSavings)} active accounts` : 'Unavailable');
    } else setKpi('savings', '—', 'No permission');

    /* ---- KPI: Disbursed This Month (reuses the same report as the trend chart) ---- */
    const trend = bucketMonthly(tranReport, 6);
    if (hasLoans && trend) setKpi('disb', fmt(trend.values[trend.values.length - 1]));
    else setKpi('disb', '—', hasLoans ? 'Report unavailable' : 'No permission');

    /* ---- Chart: Disbursement trend ---- */
    await renderDisbursementChart(c, trend);

    /* ---- Chart: Portfolio composition ---- */
    const performing = (activeLoans != null && arrearsCount != null) ? Math.max(0, activeLoans - arrearsCount) : null;
    await renderCompositionChart(c, performing != null ? { performing, overdue: arrearsCount, closed: closedLoans ?? 0 } : null);

    /* ---- Chart: PAR aging + summary line ---- */
    await renderParChart(c, parInfo);
    const parSummaryEl = c.querySelector('#dash-par-summary');
    if (parSummaryEl) {
      parSummaryEl.textContent = parInfo?.parRatio != null
        ? `PAR>30: ${parInfo.parRatio.toFixed(2)}%`
        : '';
    }

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
                    ${a.madeOnDate ? ` · ${escapeHtml(a.madeOnDate)}` : ''}
                  </div>
                </div>
              </li>`).join('')}</ul>`
          : `<div class="empty-state-row">No recent activity</div>`;
      }
    }

    /* ---- Bookkeeping for the Export button + "as of" timestamp ---- */
    lastSummary = {
      'Active Clients': activeClients,
      'Active Loans': activeLoans,
      'Pending Approval': (pendingLoans != null && approvedLoans != null) ? pendingLoans + approvedLoans : null,
      'Gross Loan Portfolio': parInfo?.totalOutstanding ?? null,
      'Portfolio at Risk >30d (%)': parInfo?.parRatio != null ? parInfo.parRatio.toFixed(2) : null,
      'Amount at Risk': parInfo?.atRiskOutstanding ?? null,
      'Active Savings Accounts': activeSavings,
      'Disbursed This Month': trend ? trend.values[trend.values.length - 1] : null,
      'Closed Loans': closedLoans
    };
    const updatedEl = c.querySelector('#dash-updated');
    if (updatedEl) updatedEl.textContent = `As of ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Kept separate from the main Promise.allSettled batch because it needs its own
   *  report-then-fallback chain (mirrors the old dashboard's proven approach for this
   *  KPI, cleaned up to avoid the bare " *" bug — see file header). */
  async function loadSavingsBalance() {
    try {
      const r = await api.runReports.run('Portfolio at a glance', { R_officeId: -1 });
      const headers = r?.columnHeaders?.map(h => (h.columnName || '').toLowerCase()) || [];
      const idx = headers.findIndex(h => h.includes('savings') && h.includes('balance'));
      if (idx >= 0 && r.data?.length) {
        const amount = r.data.reduce((s, row) => s + (parseFloat(row.row?.[idx]) || 0), 0);
        return { amount, approx: false };
      }
    } catch {}
    const sample = await sampleBalance(api.savings.list, x => x.summary?.accountBalance);
    return sample ? { amount: sample.sum, approx: sample.capped } : null;
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
}

/* ------------------------------------------------------------------- */
/* Report parsing — column-name matching, not fixed indices, because   */
/* Fineract's genericResultSet layout varies slightly by deployment    */
/* (same reasoning as analytics.js::computeNplFromPar).                */
/* ------------------------------------------------------------------- */

/**
 * Parses a PortfolioAtRisk genericResultSet into:
 *   { totalOutstanding, atRiskOutstanding, parRatio, buckets: [{label, value}] }
 * or null if the report didn't return a recognisable shape (caller falls back gracefully).
 */
function analyzePAR(parData) {
  if (!parData?.data?.length || !parData?.columnHeaders?.length) return null;
  const cols = parData.columnHeaders.map(h => h.columnName || '');
  const totalIdx = cols.findIndex(c => /total.*(outstanding|portfolio)|outstanding.*total/i.test(c));
  if (totalIdx < 0) return null;

  // The dimension/label column (e.g. "Office") isn't always index 0, so detect it by
  // finding the first non-numeric cell in the first data row rather than assuming a position.
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

/** Buckets a TranDatewiseSummary genericResultSet into `months` trailing calendar months
 *  (oldest first), zero-filling months with no matching rows so gaps are visible rather
 *  than silently missing. Returns null only if the report shape wasn't recognisable at all. */
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

/** Bounded-sample fallback for KPIs that ideally want a portfolio-wide sum but have no
 *  cheap aggregate endpoint to fall back on. Always reports whether it was capped so the
 *  caller can be honest about it in the UI instead of presenting a partial sum as exact. */
async function sampleBalance(listFn, balancePath, cap = 100) {
  try {
    const r = await listFn({ limit: cap, status: 'active', orderBy: 'id', sortOrder: 'DESC' });
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    const sum = list.reduce((s, x) => s + (balancePath(x) || 0), 0);
    const total = r?.totalFilteredRecords ?? list.length;
    return { sum, sampleSize: list.length, total, capped: total > list.length };
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

async function renderDisbursementChart(c, trend) {
  const canvas = c.querySelector('#dash-disb-chart');
  const fallback = c.querySelector('#dash-disb-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!trend) return showFallback(canvas, fallback, 'No disbursement data available');

  destroyChart(canvas);
  canvas.style.display = 'block';
  if (fallback) fallback.style.display = 'none';
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: trend.labels,
      datasets: [{
        label: 'Disbursed',
        data: trend.values,
        backgroundColor: 'rgba(0,201,177,0.55)',
        hoverBackgroundColor: '#00c9b1',
        borderRadius: 4,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  chartInstances.set(canvas, chart);
}

async function renderCompositionChart(c, comp) {
  const canvas = c.querySelector('#dash-comp-chart');
  const fallback = c.querySelector('#dash-comp-fallback');
  if (!canvas) return;
  const ok = await loadChartJs().catch(() => false);
  if (!ok) return showFallback(canvas, fallback, 'Chart library failed to load — check your connection');
  if (!comp) return showFallback(canvas, fallback, 'Not enough data to render portfolio composition');

  destroyChart(canvas);
  canvas.style.display = 'block';
  if (fallback) fallback.style.display = 'none';
  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Performing', 'Overdue', 'Closed'],
      datasets: [{
        data: [comp.performing, comp.overdue, comp.closed],
        backgroundColor: ['#00c9b1', '#f87171', '#64748b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
    }
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
  canvas.style.display = 'block';
  if (fallback) fallback.style.display = 'none';
  const isCurrent = (label) => /current|not\s*overdue/i.test(label);
  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: parInfo.buckets.map(b => b.label),
      datasets: [{
        label: 'Outstanding',
        data: parInfo.buckets.map(b => b.value),
        backgroundColor: parInfo.buckets.map(b => isCurrent(b.label) ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'),
        borderRadius: 4,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  chartInstances.set(canvas, chart);
}
