/* FinCraft · analytics.js — risk & drill-down intelligence, deliberately NOT a re-hash of the
   Dashboard's headline KPIs/charts (Total Customers, Total Savings, Loan Portfolio, Portfolio
   Distribution, Branch Performance, Loans by Officer already live there — see
   fixlogs/FIXLOG-analytics-rebuild.md for the full before/after and why each old section here
   was cut). This page now answers "why", not "what": aging/delinquency breakdown, which loan
   officers are actually carrying the arrears, and which products carry real volume vs. are
   just sitting in the catalog. */
import { api } from '../api.js';
import { fmt, num, escapeHtml } from '../utils.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Analytics</h1><div class="page-subtitle">Risk & drill-down — deeper cuts of the numbers already on your Dashboard, not a repeat of them</div></div>
      <button class="btn-ghost" id="an-refresh"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
    </div>

    <div class="stat-grid" id="an-kpis">
      ${['an-npl','an-par30','an-closure','an-avgloans'].map((id,i) => `
        <div class="stat-card ${i===0?'c-danger':i===1?'c-warn':''}">
          <div class="label">${['NPL Ratio','PAR 30','Loan Closure Rate','Avg Loans / Active Client'][i]}</div>
          <div class="value" id="${id}"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:18px"></i></div>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Delinquency Aging Breakdown</h3>
        <span class="text-muted" style="font-size:12px">Outstanding by days overdue — from the PortfolioAtRisk report</span></div>
      <div id="an-aging-wrap" style="min-height:220px;position:relative">
        <canvas id="an-aging-chart" height="220"></canvas>
        <div id="an-aging-fallback" class="text-muted" style="font-size:13px;display:none"></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Arrears by Loan Officer</h3>
          <span class="text-muted" style="font-size:12px">Ranked by exposure, not volume</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>Loan Officer</th><th>Loans in Arrears</th><th>Overdue Amount</th></tr></thead>
          <tbody id="an-officer-risk"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Loan Product Mix — Rate &amp; Exposure</h3>
          <span class="text-muted" style="font-size:12px">Which products actually carry volume</span></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Product</th><th>Rate</th><th>Principal</th><th>Active Loans</th></tr></thead>
          <tbody id="an-products"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
    </div>
  </div>`;

  await loadAll(c);
  c.querySelector('#an-refresh').addEventListener('click', () => loadAll(c));
}

async function loadAll(c) {
  // Reset spinners on refresh
  ['an-npl','an-par30','an-closure','an-avgloans'].forEach(id => {
    const el = c.querySelector(`#${id}`);
    if (el) el.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:18px"></i>';
  });

  const results = await Promise.allSettled([
    api.clients.list({ limit: 1, status: 'active' }),                                     // 0
    api.loans.list({ limit: 1, status: 'active' }),                                        // 1
    api.loans.list({ limit: 1, status: 'closed' }),                                        // 2
    api.runReports.run('PortfolioAtRisk',     { genericResultSet: true }).catch(() => null),// 3
    api.runReports.run('ActiveLoansInArrears',{ genericResultSet: true }).catch(() => null),// 4
    api.staff.list({ isLoanOfficer: true }),                                                // 5
    api.loanProducts.list()                                                                 // 6
  ]);

  const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
  const warn = (elId) => {
    const el = c.querySelector(`#${elId}`);
    if (el) el.innerHTML = '<span class="badge b-warn" title="Failed to load">—</span>';
  };

  const activeClients = val(0)?.totalFilteredRecords ?? null;
  const activeLoans   = val(1)?.totalFilteredRecords ?? null;
  const closedLoans   = val(2)?.totalFilteredRecords ?? null;
  const parData       = val(3);
  const nplData       = val(4);

  // ---- KPI: NPL Ratio (principal-weighted, falls back to a count-based estimate) ----
  const nplEl = c.querySelector('#an-npl');
  const nplFromPrincipal = computeNplFromPar(parData);
  if (nplFromPrincipal != null) {
    if (nplEl) nplEl.textContent = `${nplFromPrincipal.toFixed(2)}%`;
  } else if (nplData?.data?.length && activeLoans) {
    // Labelled with a leading ~ since it's count-based, not principal-based — only used when
    // the PAR report didn't expose amount columns we could parse.
    if (nplEl) nplEl.textContent = `~${((nplData.data.length / activeLoans) * 100).toFixed(2)}%`;
  } else if (nplEl) warn('an-npl');

  // ---- KPI: PAR 30 — from PortfolioAtRisk report (look for the "30" row) ----
  const parEl = c.querySelector('#an-par30');
  if (parData?.data?.length) {
    const parRow = parData.data.find(r => String(r.row?.[0] || '').includes('30')) || parData.data[0];
    const parPct = parRow?.row?.[1] ?? parRow?.row?.[0];
    if (parEl) parEl.textContent = parPct != null ? `${parseFloat(parPct).toFixed(2)}%` : '—';
  } else if (parEl) warn('an-par30');

  // ---- KPI: Loan Closure Rate — closed / (closed + active). A cheap attrition proxy: a rising
  // trend here alongside flat "New This Month" on the Dashboard is an early portfolio-shrinkage
  // signal that neither of the Dashboard's own cards surfaces on its own. ----
  const closureEl = c.querySelector('#an-closure');
  if (activeLoans != null && closedLoans != null && (activeLoans + closedLoans) > 0) {
    if (closureEl) closureEl.textContent = `${((closedLoans / (activeLoans + closedLoans)) * 100).toFixed(1)}%`;
  } else if (closureEl) warn('an-closure');

  // ---- KPI: Avg Loans per Active Client — portfolio depth (cross-selling / repeat-borrowing
  // signal), distinct from the Dashboard's separate raw client and loan counts. ----
  const avgEl = c.querySelector('#an-avgloans');
  if (activeLoans != null && activeClients) {
    if (avgEl) avgEl.textContent = (activeLoans / activeClients).toFixed(2);
  } else if (avgEl) warn('an-avgloans');

  // ---- Delinquency Aging Breakdown chart — reuses the PortfolioAtRisk report already
  // fetched above (no extra API call), but plots every aging bucket instead of collapsing
  // it into a single ratio. ----
  const agingCanvas   = c.querySelector('#an-aging-chart');
  const agingFallback = c.querySelector('#an-aging-fallback');
  const chartJsOk = await loadChartJs().catch(() => false);
  const aging = computeAgingBuckets(parData);
  if (aging && agingCanvas && chartJsOk) {
    renderAgingChart(agingCanvas, aging);
  } else if (agingCanvas) {
    agingCanvas.style.display = 'none';
    if (agingFallback) {
      agingFallback.style.display = 'block';
      agingFallback.textContent = !chartJsOk
        ? 'Chart library failed to load — check your connection'
        : 'PortfolioAtRisk report unavailable or its column layout wasn\u2019t recognised on this server';
    }
  }

  // ---- Arrears by Loan Officer — turns the ActiveLoansInArrears report (already used
  // elsewhere just for a count) into an actual per-officer breakdown, ranked by exposure. ----
  const officerRiskEl = c.querySelector('#an-officer-risk');
  const arrearsByOfficer = computeArrearsByOfficer(nplData);
  if (officerRiskEl) {
    if (arrearsByOfficer?.rows.length) {
      officerRiskEl.innerHTML = arrearsByOfficer.rows.slice(0, 15).map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.officer)}</td>
          <td>${num(r.count)}</td>
          <td>${arrearsByOfficer.hasAmount ? fmt(r.amount) : '<span class="text-muted">—</span>'}</td>
        </tr>`).join('');
    } else if (nplData?.data?.length) {
      // Report loaded fine, just doesn't have a recognisable officer column on this deployment
      officerRiskEl.innerHTML = '<tr><td colspan="4" class="text-muted">This server\u2019s ActiveLoansInArrears report doesn\u2019t expose a loan-officer column <span class="badge b-warn" title="Report layout not recognised">!</span></td></tr>';
    } else if (nplData?.data?.length === 0) {
      officerRiskEl.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-face-smile"></i><div>No loans currently in arrears</div></div></td></tr>';
    } else {
      officerRiskEl.innerHTML = '<tr><td colspan="4" class="text-muted">No data available <span class="badge b-warn" title="Report may not exist on this server">!</span></td></tr>';
    }
  }

  // ---- Loan Product Mix — the existing rate/principal reference list, enriched with a real
  // active-loan count per product so it tells you which products carry volume, not just what's
  // configured. Capped to the first 12 products to bound the extra network calls. ----
  const prodList = Array.isArray(val(6)) ? val(6) : [];
  const prodEl   = c.querySelector('#an-products');
  if (prodEl) {
    if (prodList.length) {
      const topProducts = prodList.slice(0, 12);
      const counts = await Promise.all(topProducts.map(p =>
        api.loans.list({ limit: 1, status: 'active', loanProductId: p.id })
          .then(r => r?.totalFilteredRecords ?? null)
          .catch(() => null)
      ));
      prodEl.innerHTML = topProducts.map((p, i) => `
        <tr>
          <td>${escapeHtml(p.name)}<div class="text-muted mono" style="font-size:11px">${escapeHtml(p.shortName || '—')}</div></td>
          <td class="mono">${p.interestRatePerPeriod || 0}%</td>
          <td class="mono">${fmt(p.principal || 0)}</td>
          <td class="mono">${counts[i] != null ? num(counts[i]) : '<span class="badge b-warn" title="Failed to load">—</span>'}</td>
        </tr>`).join('') +
        (prodList.length > 12 ? `<tr><td colspan="4" class="text-muted" style="font-size:12px">+ ${prodList.length - 12} more product(s) not shown</td></tr>` : '');
    } else {
      prodEl.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-cube"></i><div>No loan products found</div></div></td></tr>';
    }
  }
}

/**
 * Parse the PortfolioAtRisk genericResultSet to compute a principal-based NPL ratio:
 *   (sum of overdue/at-risk principal columns) / (sum of total outstanding principal column)
 * Fineract's PAR report layout differs slightly across versions/deployments, so columns are
 * matched by name rather than fixed index. Returns null (triggering the count-based fallback)
 * if no recognisable "total outstanding" column is found.
 */
export function computeNplFromPar(parData) {
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

/**
 * Parse the PortfolioAtRisk genericResultSet into one bucket per aging column (Current,
 * "1 - 30 Days", "31 - 60 Days", "> 90 Days", etc.) instead of collapsing it into a single
 * ratio — same column-name-matching approach as computeNplFromPar, since Fineract's PAR report
 * layout varies by deployment/version. Returns null if fewer than 2 recognisable bucket columns
 * are found (not enough to draw a meaningful breakdown).
 */
export function computeAgingBuckets(parData) {
  if (!parData?.data?.length || !parData?.columnHeaders?.length) return null;
  const cols = parData.columnHeaders.map(h => h.columnName || '');

  const bucketIdxs = cols
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => /\d+\s*-\s*\d+|>\s*\d+|current|overdue|arrears|not\s*overdue/i.test(c) && !/total/i.test(c))
    .map(({ i }) => i);

  if (bucketIdxs.length < 2) return null;

  const sums = bucketIdxs.map(() => 0);
  for (const row of parData.data) {
    const cells = row.row || [];
    bucketIdxs.forEach((idx, bi) => {
      const v = parseFloat(cells[idx]);
      if (!isNaN(v)) sums[bi] += v;
    });
  }

  return { labels: bucketIdxs.map(idx => cols[idx]), values: sums };
}

/**
 * Group the ActiveLoansInArrears genericResultSet by loan officer, summing an overdue-amount
 * column when one is identifiable and always counting rows (loans) per officer. Column names
 * are matched the same way as the other two report parsers above. Returns null if no
 * loan-officer column can be found (report layout not recognised on this deployment) — the
 * caller then falls back to a plain "not available" message rather than guessing.
 */
export function computeArrearsByOfficer(nplData) {
  if (!nplData?.data?.length || !nplData?.columnHeaders?.length) return null;
  const cols = nplData.columnHeaders.map(h => h.columnName || '');

  const officerIdx = cols.findIndex(c => /loan\s*officer|officer\s*name/i.test(c));
  if (officerIdx < 0) return null;
  const amountIdx = cols.findIndex(c => /overdue|arrears|principal.*od|amount.*od|total.*od/i.test(c));

  const groups = new Map();
  for (const row of nplData.data) {
    const cells = row.row || [];
    const officer = String(cells[officerIdx] ?? '').trim() || 'Unassigned';
    const amt = amountIdx >= 0 ? parseFloat(cells[amountIdx]) : NaN;
    const g = groups.get(officer) || { count: 0, amount: 0 };
    g.count += 1;
    if (!isNaN(amt)) g.amount += amt;
    groups.set(officer, g);
  }

  const rows = [...groups.entries()].map(([officer, g]) => ({ officer, count: g.count, amount: g.amount }));
  const hasAmount = amountIdx >= 0;
  rows.sort((a, b) => (hasAmount ? b.amount - a.amount : b.count - a.count));
  return { rows, hasAmount };
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

function renderAgingChart(canvas, { labels, values }) {
  destroyChart(canvas);
  canvas.style.display = 'block';
  const fallback = canvas.parentElement.querySelector('#an-aging-fallback');
  if (fallback) fallback.style.display = 'none';

  // Colour the "Current"/"not overdue" bucket differently from the actual arrears buckets so
  // the chart reads as a risk gradient, not a uniform bar set.
  const colors = labels.map(l => /current|not\s*overdue/i.test(l) ? '#00c9b1' : '#f87171');

  const chart = new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Outstanding', data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  chartInstances.set(canvas, chart);
}
