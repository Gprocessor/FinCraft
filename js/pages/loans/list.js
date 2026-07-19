/* FinCraft · pages/loans/list.js — the list/table view for this entity.
   Auto-split from the original monolithic pages/loans.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { api } from '../../api.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../utils.js';
import { openModal, toast } from '../../ui.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Loans</h1>
        <div class="text-muted">Loan portfolio · all statuses</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_LOAN') ? `<button class="btn-primary" data-modal="newLoanModal"><i class="fa-solid fa-plus"></i> New Loan</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" id="ln-active">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending Approval</div><div class="kpi-value" id="ln-pending">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Overdue</div><div class="kpi-value" id="ln-overdue">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Records</div><div class="kpi-value" id="ln-total">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="lf-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
        <select id="lf-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="overpaid">Overpaid</option>
          <option value="closed">Closed</option>
        </select>
        <select id="lf-product" class="form-control"><option value="">All Products</option></select>
        <button class="btn-secondary" id="lf-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Client</th><th>Product</th>
          <th class="text-right">Principal</th><th class="text-right">Outstanding</th>
          <th>Disbursed</th><th>Status</th><th>Officer</th><th></th>
        </tr></thead>
        <tbody id="loans-rows">
          <tr><td colspan="9" class="empty-state-row">Loading loans…</td></tr>
        </tbody>
      </table>
      <div id="lf-pagination" class="pagination-bar"></div>
    </div>`;

  // Product filter
  api.loanProducts.list().then(products => {
    const sel = c.querySelector('#lf-product');
    (Array.isArray(products) ? products : []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allLoans = [], totalRecords = 0, currentOffset = 0, pageSize = DEFAULT_PAGE_SIZE;

  // Portfolio-wide KPI counts — independent of the current page/search, so they stay accurate
  // no matter how many pages the portfolio spans. Uses limit:1 requests purely to read
  // totalFilteredRecords (cheap — no record bodies are fetched), same technique as analytics.js.
  async function loadKpis() {
    const results = await Promise.allSettled([
      api.loans.list({ limit: 1, status: 'active' }),
      api.loans.list({ limit: 1, status: 'pending' }),
      api.loans.list({ limit: 1, status: 'approved' }),
      api.runReports.run('ActiveLoansInArrears', { genericResultSet: true })
    ]);
    const count = (r) => r.status === 'fulfilled' ? (r.value?.totalFilteredRecords ?? 0) : null;
    const activeCount  = count(results[0]);
    const pendingCount = count(results[1]);
    const approvedCount = count(results[2]);
    const arrearsCount = results[3].status === 'fulfilled' ? (results[3].value?.data?.length ?? null) : null;

    const activeEl = c.querySelector('#ln-active');
    const pendingEl = c.querySelector('#ln-pending');
    const overdueEl = c.querySelector('#ln-overdue');
    if (activeEl) activeEl.textContent = activeCount != null ? num(activeCount) : '—';
    if (pendingEl) pendingEl.textContent = (pendingCount != null && approvedCount != null) ? num(pendingCount + approvedCount) : '—';
    if (overdueEl) overdueEl.textContent = arrearsCount != null ? num(arrearsCount) : '—';
  }

  async function load(offset = 0) {
    c.querySelector('#loans-rows').innerHTML =
      '<tr><td colspan="9" class="empty-state-row">Loading…</td></tr>';
    try {
      const status   = c.querySelector('#lf-status')?.value;
      const productId = c.querySelector('#lf-product')?.value;
      const params = { limit: pageSize, offset };
      if (status)    params.status = status;
      if (productId) params.loanProductId = productId;

      const res = await api.loans.list(params);
      const raw = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? raw.length;

      let list = raw.map(l => ({
        id: l.id,
        accountNo: l.accountNo || `#${l.id}`,
        clientName: l.clientName || l.clientDisplayName || '—',
        product: l.loanProductName || l.productName || '—',
        principal: l.principal || l.approvedPrincipal || 0,
        outstanding: l.summary?.totalOutstanding ?? 0,
        totalOverdue: l.summary?.totalOverdue ?? 0,
        disbursedOn: l.timeline?.actualDisbursementDate || l.timeline?.expectedDisbursementDate,
        status: l.status?.value || '—',
        officer: l.loanOfficerName || '—',
        externalId: l.externalId || ''
      }));

      const q = c.querySelector('#lf-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(l =>
        l.accountNo.toLowerCase().includes(q) ||
        l.clientName.toLowerCase().includes(q) ||
        l.externalId.toLowerCase().includes(q)
      );

      allLoans = list;
      currentOffset = offset;

      c.querySelector('#ln-total').textContent = num(totalRecords);

      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#loans-rows').innerHTML =
        `<tr><td colspan="9" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
    }
  }

  function drawPagination() {
    renderPagination(c.querySelector('#lf-pagination'), {
      total: totalRecords, offset: currentOffset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; load(newOffset); }
    });
  }

  function draw(rows) {
    c.querySelector('#loans-rows').innerHTML = rows.map(l => `
      <tr>
        <td><a href="#" data-view-loan="${l.id}">${escapeHtml(l.accountNo)}</a></td>
        <td>${escapeHtml(l.clientName)}</td>
        <td>${escapeHtml(l.product)}</td>
        <td class="text-right">${fmt(l.principal)}</td>
        <td class="text-right">${fmt(l.outstanding)}</td>
        <td>${fmtDate(l.disbursedOn)}</td>
        <td>${sb(l.status)}</td>
        <td>${escapeHtml(l.officer)}</td>
        <td class="text-right">
          ${(l.status === 'Submitted and pending approval' && can('APPROVE_LOAN'))
            ? `<button class="btn-mini btn-success" data-loan-approve="${l.id}">Approve</button>` : ''}
          ${(l.status === 'Active' && can('REPAYMENT_LOAN'))
            ? `<button class="btn-mini" data-loan-repay="${l.id}">Repay</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="9" class="empty-state-row">No loans match</td></tr>';

    c.querySelectorAll('[data-view-loan]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('loans', { id: b.dataset.viewLoan }));
    }));
    c.querySelectorAll('[data-loan-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.loans.approve(b.dataset.loanApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Loan approved', `#${b.dataset.loanApprove}`);
        load(currentOffset);
        loadKpis();
      } catch (e) { toast('error', 'Approval failed', extractFineractError(e)); }
    }));
    c.querySelectorAll('[data-loan-repay]').forEach(b => b.addEventListener('click', () => {
      const modal = openModal('repaymentModal');
      if (modal) modal.dataset.loanId = b.dataset.loanRepay;
    }));
  }

  await Promise.all([load(), loadKpis()]);

  let t;
  c.querySelector('#lf-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#lf-status', '#lf-product'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#lf-export').addEventListener('click', () => {
    const rows = allLoans.map(l =>
      [l.accountNo, l.clientName, l.product, l.principal, l.outstanding, l.disbursedOn, l.status, l.officer].join(','));
    const csv = ['Account,Client,Product,Principal,Outstanding,Disbursed,Status,Officer', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'loans.csv'; a.click();
    toast('success', 'Exported', 'loans.csv downloaded');
  });
}
