/* FinCraft · loans.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, showEntityDetail, openModal } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Loans</h1><div class="page-subtitle">Loan portfolio · all statuses</div></div>
      <button class="btn-primary" data-modal="newLoanModal"><i class="fa-solid fa-plus"></i> New Loan</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active</div><div class="value" id="ln-active">—</div></div>
      <div class="stat-card c-warn"><div class="label">Pending Approval</div><div class="value" id="ln-pending">—</div></div>
      <div class="stat-card c-danger"><div class="label">Overdue</div><div class="value" id="ln-overdue">—</div></div>
      <div class="stat-card c-info"><div class="label">Total Records</div><div class="value" id="ln-total">—</div></div>
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control" id="lf-search" placeholder="Search by account or client…" />
        <select class="form-control" id="lf-status">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="approvalPending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="overpaid">Overpaid</option>
          <option value="closedObligationsMet">Closed</option>
        </select>
        <select class="form-control" id="lf-product"><option value="">All Products</option></select>
        <span style="flex:1"></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Principal</th><th>Outstanding</th><th>Disbursed</th><th>Status</th><th>Officer</th><th></th></tr></thead>
        <tbody id="loans-rows"><tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading loans…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  // Load products for filter
  api.loanProducts.list().then(products => {
    const sel = c.querySelector('#lf-product');
    (Array.isArray(products) ? products : []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  async function loadLoans() {
    c.querySelector('#loans-rows').innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#lf-status')?.value;
      const productId = c.querySelector('#lf-product')?.value;
      if (status) params.status = status;
      if (productId) params.loanProductId = productId;

      const res = await api.loans.list(params);
      const raw = Array.isArray(res) ? res : (res?.pageItems || []);
      let list = raw.map(l => ({
        id: l.id, accountNo: l.accountNo || `#${l.id}`,
        clientName: l.clientName || l.clientDisplayName || '—',
        product: l.loanProductName || l.productName || '—',
        principal: l.principal || l.approvedPrincipal || 0,
        outstanding: l.summary?.totalOutstanding ?? 0,
        totalOverdue: l.summary?.totalOverdue ?? 0,
        disbursedOn: l.timeline?.actualDisbursementDate || l.timeline?.expectedDisbursementDate,
        status: l.status?.value || '—',
        officer: l.loanOfficerName || '—'
      }));

      const q = c.querySelector('#lf-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(l => l.accountNo.toLowerCase().includes(q) || l.clientName.toLowerCase().includes(q));

      c.querySelector('#ln-total').textContent   = num(res?.totalFilteredRecords ?? list.length);
      c.querySelector('#ln-active').textContent  = num(list.filter(l => l.status === 'Active').length);
      c.querySelector('#ln-pending').textContent = num(list.filter(l => ['Submitted and pending approval', 'Approved'].includes(l.status)).length);
      // NOTE: Fineract's basic /loans list doesn't return a per-loan "next installment due"
      // date (that needs a separate repaymentSchedule association call per loan). Overdue
      // status is determined from summary.totalOverdue instead, which Fineract does provide —
      // far more accurate than comparing disbursement date to today (which would flag almost
      // every disbursed active loan as overdue, regardless of actual payment status).
      c.querySelector('#ln-overdue').textContent = num(list.filter(l => l.totalOverdue > 0).length);

      c.querySelector('#loans-rows').innerHTML = list.map(l => `
        <tr data-id="${l.id}">
          <td class="mono">${escapeHtml(l.accountNo)}</td>
          <td>${escapeHtml(l.clientName)}</td>
          <td>${escapeHtml(l.product)}</td>
          <td class="mono">${fmt(l.principal)}</td>
          <td class="mono">${fmt(l.outstanding)}</td>
          <td>${fmtDate(l.disbursedOn)}</td>
          <td>${sb(l.status)}</td>
          <td>${escapeHtml(l.officer)}</td>
          <td>
            <button class="btn-ghost btn-sm" data-loan-approve="${l.id}" title="Approve" style="${l.status==='Submitted and pending approval'?'':'display:none'}">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="btn-ghost btn-sm" data-loan-repay="${l.id}" title="Repayment" style="${l.status==='Active'?'':'display:none'}">
              <i class="fa-solid fa-money-bill"></i>
            </button>
            <button class="btn-ghost btn-sm" data-loan-view="${l.id}" title="View"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>`).join('')
        || '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-hand-holding-dollar"></i><div>No loans match</div></div></td></tr>';

      c.querySelectorAll('[data-loan-view]').forEach(b => b.addEventListener('click', () => viewLoan(b.dataset.loanView, loadLoans)));
      c.querySelectorAll('[data-loan-approve]').forEach(b => b.addEventListener('click', async () => {
        const today = new Date().toISOString().split('T')[0];
        try {
          await api.loans.approve(b.dataset.loanApprove, { approvedOnDate: today, dateFormat: 'yyyy-MM-dd', locale: 'en' });
          toast('success', 'Loan approved', `#${b.dataset.loanApprove}`);
          loadLoans();
        } catch (e) { toast('error', 'Approval failed', e.message); }
      }));
      c.querySelectorAll('[data-loan-repay]').forEach(b => b.addEventListener('click', () => {
        const modal = openModal('repaymentModal');
        if (modal) modal.dataset.loanId = b.dataset.loanRepay;
      }));
    } catch (e) {
      c.querySelector('#loans-rows').innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || 'Failed to load loans')}</div></div></td></tr>`;
    }
  }

  await loadLoans();
  let t; c.querySelector('#lf-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadLoans, 400); });
  c.querySelector('#lf-status').addEventListener('change', loadLoans);
  c.querySelector('#lf-product').addEventListener('change', loadLoans);
}

// Fineract: GET /loans/{id}?associations=all returns summary, repaymentSchedule, transactions
function viewLoan(id, onChange) {
  showEntityDetail({
    title: `Loan #${id}`,
    fetchFn: () => api.loans.get(id, 'all'),
    renderBody: (l) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Client</span><span class="info-value">${escapeHtml(l.clientName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Product</span><span class="info-value">${escapeHtml(l.loanProductName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(l.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(l.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">Principal</span><span class="info-value mono">${fmt(l.principal || 0)}</span></div>
        <div class="info-item"><span class="info-label">Outstanding</span><span class="info-value mono">${fmt(l.summary?.totalOutstanding || 0)}</span></div>
        <div class="info-item"><span class="info-label">Total Overdue</span><span class="info-value mono">${fmt(l.summary?.totalOverdue || 0)}</span></div>
        <div class="info-item"><span class="info-label">Interest Rate</span><span class="info-value">${num(l.interestRatePerPeriod || 0)}%</span></div>
      </div>
      <h4 class="mt-4 mb-2">Repayment Schedule</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Due Date</th><th>Principal Due</th><th>Interest Due</th><th>Paid?</th></tr></thead>
        <tbody>${(l.repaymentSchedule?.periods || []).filter(p => p.period).slice(0, 12).map(p => `<tr><td>${fmtDate(p.dueDate)||'—'}</td><td class="mono">${fmt(p.principalDue||0)}</td><td class="mono">${fmt(p.interestDue||0)}</td><td>${p.complete ? '<span class="badge b-success">Paid</span>' : '<span class="badge b-warn">Due</span>'}</td></tr>`).join('')
          || '<tr><td colspan="4" class="text-center text-muted" style="padding:14px">No schedule available</td></tr>'}</tbody>
      </table></div>
      <div class="mt-4 flex gap-2" id="edm-loan-actions"></div>`,
    onMount: (bodyEl, l) => {
      const actions = bodyEl.querySelector('#edm-loan-actions');
      if (l.status?.value === 'Active') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary btn-sm';
        btn.innerHTML = '<i class="fa-solid fa-money-bill"></i> Make Repayment';
        btn.addEventListener('click', () => {
          const modal = openModal('repaymentModal');
          if (modal) modal.dataset.loanId = l.id;
        });
        actions.appendChild(btn);
      }
    }
  });
}
