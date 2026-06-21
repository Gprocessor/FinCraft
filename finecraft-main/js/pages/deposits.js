/* FinCraft · deposits.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, showEntityDetail } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Deposits</h1><div class="page-subtitle">Fixed & Recurring Deposits</div></div>
      <div class="page-actions">
        <button class="btn-ghost" data-modal="newRDModal"><i class="fa-solid fa-plus"></i> New RD</button>
        <button class="btn-primary" data-modal="newFDModal"><i class="fa-solid fa-plus"></i> New FD</button>
      </div>
    </div>
    <div class="card">
      <div class="tabs">
        <button class="tab active" data-tab="fd-pane">Fixed Deposits</button>
        <button class="tab" data-tab="rd-pane">Recurring Deposits</button>
      </div>
      <div id="fd-pane" class="tab-panel active">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Principal</th><th>Maturity</th><th>Status</th><th></th></tr></thead>
          <tbody id="fd-rows"><tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>
      <div id="rd-pane" class="tab-panel">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Deposit/period</th><th>Maturity</th><th>Status</th><th></th></tr></thead>
          <tbody id="rd-rows"><tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>
    </div>
  </div>`;

  const [fdRes, rdRes] = await Promise.all([
    api.fixedDeposits.list({ limit: 100 }).catch(() => null),
    api.recurringDeposits.list({ limit: 100 }).catch(() => null)
  ]);

  const fdList = Array.isArray(fdRes) ? fdRes : (fdRes?.pageItems || []);
  c.querySelector('#fd-rows').innerHTML = fdList.length
    ? fdList.map(d => `<tr>
        <td class="mono">${escapeHtml(d.accountNo || `#${d.id}`)}</td>
        <td>${escapeHtml(d.clientName || '—')}</td>
        <td>${escapeHtml(d.depositProductName || '—')}</td>
        <td class="mono">${fmt(d.depositAmount || 0)}</td>
        <td>${fmtDate(d.maturityDate)}</td>
        <td>${sb(d.status?.value || '—')}</td>
        <td><button class="btn-ghost btn-sm" data-fd-view="${d.id}" title="View"><i class="fa-solid fa-eye"></i></button></td></tr>`).join('')
    : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-vault"></i><div>No fixed deposits found</div></div></td></tr>';

  const rdList = Array.isArray(rdRes) ? rdRes : (rdRes?.pageItems || []);
  c.querySelector('#rd-rows').innerHTML = rdList.length
    ? rdList.map(d => `<tr>
        <td class="mono">${escapeHtml(d.accountNo || `#${d.id}`)}</td>
        <td>${escapeHtml(d.clientName || '—')}</td>
        <td>${escapeHtml(d.depositProductName || '—')}</td>
        <td class="mono">${fmt(d.mandatoryRecommendedDepositAmount || 0)}/period</td>
        <td>${fmtDate(d.maturityDate)}</td>
        <td>${sb(d.status?.value || '—')}</td>
        <td><button class="btn-ghost btn-sm" data-rd-view="${d.id}" title="View"><i class="fa-solid fa-eye"></i></button></td></tr>`).join('')
    : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-vault"></i><div>No recurring deposits found</div></div></td></tr>';

  c.querySelectorAll('[data-fd-view]').forEach(b => b.addEventListener('click', () => viewDeposit('fixedDeposits', b.dataset.fdView, 'Fixed Deposit')));
  c.querySelectorAll('[data-rd-view]').forEach(b => b.addEventListener('click', () => viewDeposit('recurringDeposits', b.dataset.rdView, 'Recurring Deposit')));
}

// Fineract: GET /{fixed|recurring}depositaccounts/{id}?associations=all returns
// summary, charges and the full deposit term/maturity config
function viewDeposit(apiGroup, id, label) {
  showEntityDetail({
    title: `${label} #${id}`,
    fetchFn: () => api[apiGroup].get(id, { associations: 'all' }),
    renderBody: (d) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Client</span><span class="info-value">${escapeHtml(d.clientName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Product</span><span class="info-value">${escapeHtml(d.depositProductName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(d.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(d.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">Submitted On</span><span class="info-value">${fmtDate(d.timeline?.submittedOnDate) || '—'}</span></div>
        <div class="info-item"><span class="info-label">Maturity Date</span><span class="info-value">${fmtDate(d.maturityDate) || '—'}</span></div>
        <div class="info-item"><span class="info-label">Deposit Amount</span><span class="info-value mono">${fmt(d.depositAmount ?? d.mandatoryRecommendedDepositAmount ?? 0)}</span></div>
        <div class="info-item"><span class="info-label">Maturity Amount</span><span class="info-value mono">${fmt(d.maturityAmount || 0)}</span></div>
        <div class="info-item"><span class="info-label">Interest Rate</span><span class="info-value">${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</span></div>
      </div>`
  });
}
