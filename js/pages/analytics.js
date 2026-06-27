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
        <div id="an-chart-wrap" style="min-height:160px;display:flex;align-items:center;justify-content:center">
          <i class="fa-solid fa-circle-notch fa-spin text-muted"></i>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Office-level Summary</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Office</th><th>Active Loans</th><th>Outstanding</th><th>Overdue</th></tr></thead>
          <tbody id="an-office-tbl"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Loan Officers</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Officer</th><th>Office</th><th>Active?</th></tr></thead>
          <tbody id="an-officers"><tr><td colspan="3"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Loan Products</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Product</th><th>Short Name</th><th>Rate</th><th>Principal</th></tr></thead>
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
    api.loanProducts.list()                                                            // 9
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

  // NPL ratio — from ActiveLoansInArrears report
  const nplData = val(5);
  const nplEl   = c.querySelector('#an-npl');
  if (nplData?.data?.length) {
    const total    = val(1)?.totalFilteredRecords || 1;
    const arrears  = nplData.data.length;
    if (nplEl) nplEl.textContent = `${((arrears / total) * 100).toFixed(2)}%`;
  } else if (nplEl) warn('an-npl');

  // Disbursements chart — simple bar chart using canvas
  const tranData = val(6);
  const chartWrap = c.querySelector('#an-chart-wrap');
  if (tranData?.data?.length && chartWrap) {
    renderMiniChart(chartWrap, tranData);
  } else if (chartWrap) {
    chartWrap.innerHTML = '<div class="text-muted" style="font-size:13px">No disbursement data available for the last 90 days</div>';
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

function renderMiniChart(wrap, tranData) {
  const cols = (tranData.columnHeaders || []).map(h => h.columnName);
  const rows = tranData.data || [];
  // Find date col and amount col
  const dateIdx   = cols.findIndex(c => /date/i.test(c));
  const amountIdx = cols.findIndex(c => /amount|disburse|total/i.test(c));
  if (amountIdx < 0) { wrap.innerHTML = '<div class="text-muted" style="font-size:13px">Data shape not recognised</div>'; return; }

  const points = rows.map(r => ({
    label: String(r.row?.[dateIdx >= 0 ? dateIdx : 0] || ''),
    value: parseFloat(r.row?.[amountIdx] || 0)
  })).filter(p => !isNaN(p.value));

  if (!points.length) { wrap.innerHTML = '<div class="text-muted" style="font-size:13px">No data points</div>'; return; }

  const max   = Math.max(...points.map(p => p.value), 1);
  const W     = 100 / points.length;
  const bars  = points.map(p => {
    const h = Math.max(4, Math.round((p.value / max) * 100));
    return `<div title="${p.label}: ${p.value}" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;cursor:default">
      <div style="width:80%;background:var(--color-accent-primary,#4f8ef7);border-radius:3px 3px 0 0;height:${h}px"></div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="width:100%;padding:8px 0 0">
      <div style="display:flex;align-items:flex-end;height:120px;gap:1px;overflow:hidden">${bars}</div>
      <div class="text-muted" style="font-size:11px;text-align:center;margin-top:4px">Last 90 days · ${points.length} data points</div>
    </div>`;
}
