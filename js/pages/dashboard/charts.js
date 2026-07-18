/* FinCraft · pages/dashboard/charts.js — Chart.js loader and all renderXChart() functions
   for the dashboard's chart bank. Split out of the former single dashboard.js (see
   js/pages/dashboard.js barrel + FRONTEND.md). */
import { fmtDate } from '../../utils.js';
import { PALETTE, isoDay } from './shared.js';

let chartJsPromise = null;

export function loadChartJs() {
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
export function destroyChart(canvas) {
  const existing = chartInstances.get(canvas);
  if (existing) { existing.destroy(); chartInstances.delete(canvas); }
}
export function showFallback(canvas, fallbackEl, text) {
  if (canvas) canvas.style.display = 'none';
  if (fallbackEl) { fallbackEl.style.display = 'block'; fallbackEl.textContent = text; }
}
export function showCanvas(canvas, fallbackEl) {
  canvas.style.display = 'block';
  if (fallbackEl) fallbackEl.style.display = 'none';
}

export async function renderTrendChart(c, trend, snapshotHistory, months) {
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

export async function renderProductDistChart(c, grouped) {
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

export async function renderStatusMixChart(c, mix) {
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

export async function renderGrowthChart(c, history) {
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

export async function renderIncomeExpenseChart(c, ie, reasonIfNull) {
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

export async function renderParChart(c, parInfo) {
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

export async function renderBranchChart(c, loansByOffice, savingsByOffice, reasonIfNull) {
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

export async function renderOfficerChart(c, data, reasonIfNull) {
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

export async function renderCashFlowChart(c, weekly, reasonIfNull) {
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
