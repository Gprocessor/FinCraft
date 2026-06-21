/* FinCraft · analytics.js — Live API */
import { api } from '../api.js';
import { fmt, num, escapeHtml } from '../utils.js';
import { bars } from '../utils.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Analytics</h1><div class="page-subtitle">Key performance indicators — live from Fineract</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active Clients</div><div class="value" id="an-clients">—</div></div>
      <div class="stat-card c-info"><div class="label">Active Loans</div><div class="value" id="an-loans">—</div></div>
      <div class="stat-card"><div class="label">Active Savings</div><div class="value" id="an-savings">—</div></div>
      <div class="stat-card c-warn"><div class="label">Pending Tasks</div><div class="value" id="an-tasks">—</div></div>
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
        <div class="card-header"><h3 class="card-title">Offices</h3></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Office</th><th>Opened</th><th>Hierarchy</th></tr></thead>
          <tbody id="an-offices"><tr><td colspan="3"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
        </table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3 class="card-title">Loan Products in Use</h3></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Short Name</th><th>Rate</th><th>Principal</th></tr></thead>
        <tbody id="an-products"><tr><td colspan="4"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  const [cl, ln, sv, tasks, staff, offices, products] = await Promise.all([
    api.clients.list({ limit: 1, status: 'active' }).catch(() => null),
    api.loans.list({ limit: 1, status: 'active' }).catch(() => null),
    api.savings.list({ limit: 1, status: 'active' }).catch(() => null),
    api.makerchecker.list({ limit: 1 }).catch(() => null),
    api.staff.list({ isLoanOfficer: true }).catch(() => []),
    api.offices.list().catch(() => []),
    api.loanProducts.list().catch(() => [])
  ]);

  c.querySelector('#an-clients').textContent = num(cl?.totalFilteredRecords ?? '—');
  c.querySelector('#an-loans').textContent   = num(ln?.totalFilteredRecords ?? '—');
  c.querySelector('#an-savings').textContent = num(sv?.totalFilteredRecords ?? '—');
  c.querySelector('#an-tasks').textContent   = num(tasks?.totalFilteredRecords ?? '—');

  const staffList = Array.isArray(staff) ? staff : (staff?.pageItems || []);
  c.querySelector('#an-officers').innerHTML = staffList.length
    ? staffList.map(s => `<tr><td>${escapeHtml(s.displayName)}</td><td>${escapeHtml(s.officeName || '—')}</td><td>${s.isActive ? '<span class="badge b-success">Active</span>' : '<span class="badge">Inactive</span>'}</td></tr>`).join('')
    : '<tr><td colspan="3"><div class="empty-state"><i class="fa-solid fa-user-tie"></i><div>No loan officers found</div></div></td></tr>';

  const offList = Array.isArray(offices) ? offices : [];
  c.querySelector('#an-offices').innerHTML = offList.length
    ? offList.map(o => `<tr><td>${escapeHtml(o.name)}</td><td>${o.openingDate ? (Array.isArray(o.openingDate) ? o.openingDate.join('-') : o.openingDate) : '—'}</td><td class="mono">${escapeHtml(o.hierarchy || '.')}</td></tr>`).join('')
    : '<tr><td colspan="3"><div class="empty-state"><i class="fa-solid fa-building"></i><div>No offices found</div></div></td></tr>';

  const prodList = Array.isArray(products) ? products : [];
  c.querySelector('#an-products').innerHTML = prodList.length
    ? prodList.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="mono">${escapeHtml(p.shortName || '—')}</td><td class="mono">${p.interestRatePerPeriod || 0}%</td><td class="mono">${fmt(p.principal || 0)}</td></tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-cube"></i><div>No loan products found</div></div></td></tr>';
}
