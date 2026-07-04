/* FinCraft · analytics.js — Live API KPI Dashboard */
import { api } from '../api.js';
import { fmt, num, escapeHtml } from '../utils.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Analytics</h1><div class="page-subtitle">Key performance indicators — live from Fineract</div></div>
      <button class="btn-ghost" id="an-refresh"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
    </div>

    <div class="stat-grid" id="an-kpis">
      ${['an-clients','an-loans','an-savings','an-tasks','an-par30','an-npl'].map((id,i) => `
        <div class="stat-card ${i===4?'c-warn':i===5?'c-danger':''}">
          <div class="label">${['Active Clients','Active Loans','Active Savings','Pending Tasks','PAR 30','NPL Ratio'][i]}</div>
          <div class="value" id="${id}"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:18px"></i></div>
        </div>`).join('')}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Disbursements (90 days)</h3></div>
        <div id="an-chart-wrap" style="min-height:200px;position:relative">
          <canvas id="an-disbursement-chart" height="200"></canvas>
          <div id="an-chart-fallback" class="text-muted" style="font-size:13px;display:none"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Portfolio Composition</h3></div>
        <div id="an-composition-wrap" style="min-height:200px;position:relative">
          <canvas id="an-composition-chart" height="200"></canvas>
          <div id="an-composition-fallback" class="text-muted" style="font-size:13px;display:none"></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Office-level Summary</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Office</th><th>Active Loans</th><th>Outstanding</th><th>Overdue</th></tr></thead>
          <tbody id="an-office-tbl"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Loan Officers</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Officer</th><th>Office</th><th>Active?</th></tr></thead>
          <tbody id="an-officers"><tr><td colspan="3"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Loan Products</h3></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Short Name</th><th>Rate</th><th>Principal</th></tr></thead>
        <tbody id="an-products"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  await loadAll(c);
  c.querySelector('#an-refresh').addEventListener('click', () => loadAll(c));
}

async function loadAll(c) {
  // Reset spinners on refresh
  ['an-clients','an-loans','an-savings','an-tasks','an-par30','an-npl'].forEach(id => {
    const el = c.querySelector(`#${id}`);
    if (el) el.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:18px"></i>';
  });

  // Build 90-day range for disbursements
  const endDate   = new Date();
  const startDate = new Date(); startDate.setDate(startDate.getDate() - 90);
  const fmt8 = d => d.toISOString().split('T')[0];

  const results = await Promise.allSettled([
    api.clients.list({ limit: 1, status: 'active' }),                                 // 0
    api.loans.list({ limit: 1, status: 'active' }),                                    // 1
    api.savings.list({ limit: 1, status: 'active' }),                                  // 2
    api.makerchecker.list({ limit: 1 }),                                               // 3
    api.runReports.run('PortfolioAtRisk',    { genericResultSet: true }).catch(()=>null), // 4
    api.runReports.run('ActiveLoansInArrears',{ genericResultSet: true }).catch(()=>null), // 5
    api.runReports.run('TranDatewiseSummary',
      { startDate: fmt8(startDate), endDate: fmt8(endDate),
        dateFormat: 'yyyy-MM-dd', locale: 'en', genericResultSet: true }).catch(()=>null), // 6
    api.runReports.run('OfficeWiseSummary', { genericResultSet: true }).catch(()=>null),   // 7
    api.staff.list({ isLoanOfficer: true }),                                           // 8
    api.loanProducts.list(),                                                           // 9
    api.loans.list({ limit: 1, status: 'closed' }).catch(() => null)                    // 10
  ]);

  const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
  const warn = (elId) => {
    const el = c.querySelector(`#${elId}`);
    if (el) el.innerHTML = '<span class="badge b-warn" title="Failed to load">—</span>';
  };

  // Simple counts
  [['an-clients',0],['an-loans',1],['an-savings',2],['an-tasks',3]].forEach(([id,i]) => {
    const v = val(i);
    const el = c.querySelector(`#${id}`);
    if (!el) return;
    if (v !== null) el.textContent = num(v?.totalFilteredRecords ?? '—');
    else warn(id);
  });

  // PAR 30 — from PortfolioAtRisk report (look for PAR 30 row)
  const parData = val(4);
  const parEl   = c.querySelector('#an-par30');
  if (parData?.data?.length) {
    const parRow = parData.data.find(r => String(r.row?.[0] || '').includes('30')) || parData.data[0];
    const parPct = parRow?.row?.[1] ?? parRow?.row?.[0];
    if (parEl) parEl.textContent = parPct != null ? `${parseFloat(parPct).toFixed(2)}%` : '—';
  } else if (parEl) warn('an-par30');

  // NPL ratio — regulatory formula: outstanding-at-risk PRINCIPAL / total outstanding PRINCIPAL.
  // Previously this divided arrears LOAN COUNT by active LOAN COUNT, which is wrong by orders
  // of magnitude. We now parse principal amounts out of the PortfolioAtRisk report using
  // column-name matching (Fineract's PAR report layout varies slightly by deployment/version),
  // and only fall back to the old count-based approximation if that fails.
  const nplEl = c.querySelector('#an-npl');
  const nplFromPrincipal = computeNplFromPar(parData);
  if (nplFromPrincipal != null) {
    if (nplEl) nplEl.textContent = `${nplFromPrincipal.toFixed(2)}%`;
  } else {
    const nplData = val(5);
    if (nplData?.data?.length) {
      const total   = val(1)?.totalFilteredRecords || 1;
      const arrears = nplData.data.length;
      // Labelled as an estimate since it's count-based, not principal-based, and only used
      // when the PAR report didn't expose amount columns we could parse.
      if (nplEl) nplEl.textContent = `~${((arrears / total) * 100).toFixed(2)}%`;
    } else if (nplEl) warn('an-npl');
  }

  // Disbursements chart — Chart.js line chart (was a CSS-only bar chart)
  const tranData = val(6);
  const chartCanvas = c.querySelector('#an-disbursement-chart');
  const chartFallback = c.querySelector('#an-chart-fallback');
  const chartJsOk = await loadChartJs().catch(() => false);
  if (tranData?.data?.length && chartCanvas && chartJsOk) {
    renderDisbursementChart(chartCanvas, tranData);
  } else if (chartCanvas) {
    chartCanvas.style.display = 'none';
    if (chartFallback) {
      chartFallback.style.display = 'block';
      chartFallback.textContent = chartJsOk
        ? 'No disbursement data available for the last 90 days'
        : 'Chart library failed to load — check your connection';
    }
  }

  // Portfolio composition — Performing / Overdue / Closed, using counts already fetched above.
  const compCanvas = c.querySelector('#an-composition-chart');
  const compFallback = c.querySelector('#an-composition-fallback');
  const activeCount  = val(1)?.totalFilteredRecords;
  const arrearsCount = val(5)?.data?.length;
  const closedCount  = val(10)?.totalFilteredRecords;
  const performingCount = (activeCount != null && arrearsCount != null) ? Math.max(0, activeCount - arrearsCount) : null;
  if (compCanvas && chartJsOk && performingCount != null) {
    renderCompositionChart(compCanvas, {
      performing: performingCount,
      overdue: arrearsCount || 0,
      closed: closedCount || 0
    });
  } else if (compCanvas) {
    compCanvas.style.display = 'none';
    if (compFallback) {
      compFallback.style.display = 'block';
      compFallback.textContent = chartJsOk
        ? 'Not enough data to render portfolio composition'
        : 'Chart library failed to load — check your connection';
    }
  }

  // Office summary table
  const officeData = val(7);
  const officeTbl  = c.querySelector('#an-office-tbl');
  if (officeTbl) {
    if (officeData?.data?.length) {
      const cols = officeData.columnHeaders || [];
      officeTbl.innerHTML = officeData.data.map(r =>
        `<tr>${(r.row || []).slice(0, 4).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`
      ).join('');
    } else {
      officeTbl.innerHTML = '<tr><td colspan="4" class="text-muted">No data available <span class="badge b-warn" title="Report may not exist on this server">!</span></td></tr>';
    }
  }

  // Loan officers
  const staffResult = val(8);
  const staffList   = Array.isArray(staffResult) ? staffResult : (staffResult?.pageItems || []);
  const offEl = c.querySelector('#an-officers');
  if (offEl) {
    offEl.innerHTML = staffList.length
      ? staffList.map(s => `<tr><td>${escapeHtml(s.displayName)}</td><td>${escapeHtml(s.officeName || '—')}</td><td>${s.isActive ? '<span class="badge b-success">Active</span>' : '<span class="badge">Inactive</span>'}</td></tr>`).join('')
      : '<tr><td colspan="3"><div class="empty-state"><i class="fa-solid fa-user-tie"></i><div>No loan officers found</div></div></td></tr>';
  }

  // Loan products
  const prodList = Array.isArray(val(9)) ? val(9) : [];
  const prodEl   = c.querySelector('#an-products');
  if (prodEl) {
    prodEl.innerHTML = prodList.length
      ? prodList.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="mono">${escapeHtml(p.shortName || '—')}</td><td class="mono">${p.interestRatePerPeriod || 0}%</td><td class="mono">${fmt(p.principal || 0)}</td></tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-cube"></i><div>No loan products found</div></div></td></tr>';
  }
}

/**
 * Parse the PortfolioAtRisk genericResultSet to compute a principal-based NPL ratio:
 *   (sum of overdue/at-risk principal columns) / (sum of total outstanding principal column)
 * Fineract's PAR report layout differs slightly across versions/deployments, so columns are
 * matched by name rather than fixed index. Returns null (triggering the count-based fallback)
 * if no recognisable "total outstanding" column is found.
 */
function computeNplFromPar(parData) {
  if (!parData?.data?.length || !parData?.columnHeaders?.length) return null;
  const cols = parData.columnHeaders.map(h => h.columnName || '');

  const totalIdx = cols.findIndex(c => /total.*(outstanding|portfolio)|outstanding.*total/i.test(c));
  if (totalIdx < 0) return null; // Can't find the denominator — bail to the fallback estimate.

  // "At risk" columns: anything that looks like an overdue/arrears bucket (e.g. "1 - 30 Days",
  // "31 - 60 Days", "> 90 Days"), explicitly excluding "current"/"not overdue" and the total column.
  const atRiskIdxs = cols
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) =>
      i !== totalIdx &&
      /\d+\s*-\s*\d+|>\s*\d+|overdue|arrears|days/i.test(c) &&
      !/current|not\s*overdue|total/i.test(c))
    .map(({ i }) => i);

  if (!atRiskIdxs.length) return null;

  let totalOutstanding = 0;
  let atRiskOutstanding = 0;
  for (const row of parData.data) {
    const cells = row.row || [];
    const rowTotal = parseFloat(cells[totalIdx]);
    if (!isNaN(rowTotal)) totalOutstanding += rowTotal;
    for (const idx of atRiskIdxs) {
      const v = parseFloat(cells[idx]);
      if (!isNaN(v)) atRiskOutstanding += v;
    }
  }

  if (totalOutstanding <= 0) return null;
  return (atRiskOutstanding / totalOutstanding) * 100;
}

let chartJsPromise = null;
/** Lazily load Chart.js from cdnjs (already permitted by the CSP script-src) the first time
 *  the analytics page needs it, rather than loading it on every page of the app. */
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

// Track chart instances per canvas so Refresh doesn't leak or collide with a previous render.
const chartInstances = new WeakMap();
function destroyChart(canvas) {
  const existing = chartInstances.get(canvas);
  if (existing) { existing.destroy(); chartInstances.delete(canvas); }
}

function renderDisbursementChart(canvas, tranData) {
  destroyChart(canvas);
  canvas.style.display = 'block';
  const fallback = canvas.parentElement.querySelector('#an-chart-fallback');
  if (fallback) fallback.style.display = 'none';

  const cols = (tranData.columnHeaders || []).map(h => h.columnName);
  const rows = tranData.data || [];
  const dateIdx   = cols.findIndex(c => /date/i.test(c));
  const amountIdx = cols.findIndex(c => /amount|disburse|total/i.test(c));
  if (amountIdx < 0) {
    canvas.style.display = 'none';
    if (fallback) { fallback.style.display = 'block'; fallback.textContent = 'Data shape not recognised'; }
    return;
  }

  const points = rows.map(r => ({
    label: String(r.row?.[dateIdx >= 0 ? dateIdx : 0] || ''),
    value: parseFloat(r.row?.[amountIdx] || 0)
  })).filter(p => !isNaN(p.value));

  if (!points.length) {
    canvas.style.display = 'none';
    if (fallback) { fallback.style.display = 'block'; fallback.textContent = 'No data points'; }
    return;
  }

  const chart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.label),
      datasets: [{
        label: 'Disbursed',
        data: points.map(p => p.value),
        borderColor: '#00c9b1',
        backgroundColor: 'rgba(0,201,177,0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: points.length <= 20, ticks: { maxRotation: 0 } },
        y: { beginAtZero: true }
      }
    }
  });
  chartInstances.set(canvas, chart);
}

function renderCompositionChart(canvas, { performing, overdue, closed }) {
  destroyChart(canvas);
  canvas.style.display = 'block';
  const fallback = canvas.parentElement.querySelector('#an-composition-fallback');
  if (fallback) fallback.style.display = 'none';

  const chart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Performing', 'Overdue', 'Closed'],
      datasets: [{
        data: [performing, overdue, closed],
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
