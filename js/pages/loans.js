import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · loans.js — Full loan lifecycle (permission-gated, tabbed) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
async function renderList(c) {
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

  let allLoans = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  async function load(offset = 0) {
    c.querySelector('#loans-rows').innerHTML =
      '<tr><td colspan="9" class="empty-state-row">Loading…</td></tr>';
    try {
      const status   = c.querySelector('#lf-status')?.value;
      const productId = c.querySelector('#lf-product')?.value;
      const params = { limit: PAGE_SIZE, offset };
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

      c.querySelector('#ln-total').textContent   = num(totalRecords);
      c.querySelector('#ln-active').textContent  = num(list.filter(l => l.status === 'Active').length);
      c.querySelector('#ln-pending').textContent = num(list.filter(l => ['Submitted and pending approval', 'Approved'].includes(l.status)).length);
      c.querySelector('#ln-overdue').textContent = num(list.filter(l => l.totalOverdue > 0).length);

      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#loans-rows').innerHTML =
        `<tr><td colspan="9" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#lf-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="lf-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="lf-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#lf-prev')?.addEventListener('click', () => load(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#lf-next')?.addEventListener('click', () => load(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#loans-rows').innerHTML = rows.map(l => `
      <tr>
        <td>${l.id}">${escapeHtml(l.accountNo)}</a></td>
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

    c.querySelectorAll('[data-loan-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.loans.approve(b.dataset.loanApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Loan approved', `#${b.dataset.loanApprove}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-loan-repay]').forEach(b => b.addEventListener('click', () => {
      const modal = openModal('repaymentModal');
      if (modal) modal.dataset.loanId = b.dataset.loanRepay;
    }));
  }

  await load();

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

// ============================================================
// DETAIL VIEW (tabbed, permission-gated)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading loan…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No loan selected</div>'; return; }

  try {
    const l = await api.loans.get(id, 'all');
    const status = l.status?.value || '';

    // Status-aware command availability
    const canApprove        = status === 'Submitted and pending approval' && can('APPROVE_LOAN');
    const canUndoApproval   = status === 'Approved' && can('APPROVALUNDO_LOAN');
    const canReject         = status === 'Submitted and pending approval' && can('REJECT_LOAN');
    const canWithdraw       = status === 'Submitted and pending approval' && can('WITHDRAW_LOAN');
    const canDisburse       = status === 'Approved' && can('DISBURSE_LOAN');
    const canDisburseSavings= status === 'Approved' && can('DISBURSETOSAVINGS_LOAN');
    const canUndoDisburse   = status === 'Active' && !(l.summary?.totalRepayment > 0) && can('DISBURSALUNDO_LOAN');
    const canRepay          = status === 'Active' && can('REPAYMENT_LOAN');
    const canWaiveInt       = status === 'Active' && can('WAIVEINTERESTPORTION_LOAN');
    const canWriteOff       = status === 'Active' && can('WRITEOFF_LOAN');
    const canClose          = status === 'Active' && can('CLOSE_LOAN');
    const canForeclose      = status === 'Active' && can('FORECLOSURE_LOAN');
    const canReschedule     = status === 'Active' && can('CREATE_RESCHEDULELOAN');
    const canChargeOff      = status === 'Active' && can('CHARGEOFF_LOAN');
    const canRecover        = status === 'Active' && can('RECOVERYPAYMENT_LOAN');
    const canReAge          = status === 'Active' && can('REAGE_LOAN');
    const canReAmortize     = status === 'Active' && can('REAMORTIZE_LOAN');
    const canAssignOfficer  = can('UPDATELOANOFFICER_LOAN');
    const canMarkFraud      = can('UPDATE_LOAN');
    const canRecoverGuar    = status === 'Active' && can('RECOVERGUARANTEES_LOAN');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>Loan #${escapeHtml(l.accountNo || id)}</h1>
          <div class="text-muted">
            ${l.clientId ? `${l.clientId}">${escapeHtml(l.clientName || '—')}</a>` : escapeHtml(l.clientName || l.groupName || '—')}
            · ${escapeHtml(l.loanProductName || '—')}
            · ${sb(status || '—')}
            ${l.externalId ? ` · ext: ${escapeHtml(l.externalId)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-loans"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canApprove        ? `<button class="btn-success"   id="btn-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${canUndoApproval   ? `<button class="btn-warning"   id="btn-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${canReject         ? `<button class="btn-warning"   id="btn-reject"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdraw       ? `<button class="btn-secondary" id="btn-withdraw"><i class="fa-solid fa-rotate-left"></i> Withdraw</button>` : ''}
          ${canDisburse       ? `<button class="btn-primary"   id="btn-disburse"><i class="fa-solid fa-money-bill-transfer"></i> Disburse</button>` : ''}
          ${canDisburseSavings? `<button class="btn-secondary" id="btn-disburse-savings"><i class="fa-solid fa-piggy-bank"></i> Disburse to Savings</button>` : ''}
          ${canUndoDisburse   ? `<button class="btn-warning"   id="btn-undo-disburse"><i class="fa-solid fa-rotate-left"></i> Undo Disbursal</button>` : ''}
          ${canRepay          ? `<button class="btn-primary"   id="btn-repay"><i class="fa-solid fa-coins"></i> Repay</button>` : ''}
          ${canWaiveInt       ? `<button class="btn-secondary" id="btn-waive-int"><i class="fa-solid fa-percent"></i> Waive Interest</button>` : ''}
          ${canRecover        ? `<button class="btn-secondary" id="btn-recover"><i class="fa-solid fa-arrow-rotate-left"></i> Recover Payment</button>` : ''}
          ${canRecoverGuar    ? `<button class="btn-secondary" id="btn-recover-guar"><i class="fa-solid fa-shield"></i> Recover Guarantees</button>` : ''}
          ${canReAge          ? `<button class="btn-secondary" id="btn-reage"><i class="fa-solid fa-calendar-day"></i> Re-age</button>` : ''}
          ${canReAmortize     ? `<button class="btn-secondary" id="btn-reamortize"><i class="fa-solid fa-calculator"></i> Re-amortize</button>` : ''}
          ${canWriteOff       ? `<button class="btn-danger"    id="btn-writeoff"><i class="fa-solid fa-eraser"></i> Write Off</button>` : ''}
          ${canChargeOff      ? `<button class="btn-danger"    id="btn-chargeoff"><i class="fa-solid fa-file-pen"></i> Charge Off</button>` : ''}
          ${canForeclose      ? `<button class="btn-danger"    id="btn-foreclose"><i class="fa-solid fa-circle-xmark"></i> Foreclose</button>` : ''}
          ${canClose          ? `<button class="btn-secondary" id="btn-close-loan"><i class="fa-solid fa-box-archive"></i> Close</button>` : ''}
          ${canReschedule     ? `<button class="btn-secondary" id="btn-reschedule"><i class="fa-solid fa-calendar-plus"></i> Reschedule</button>` : ''}
          ${canAssignOfficer  ? `<button class="btn-secondary" id="btn-assign-officer"><i class="fa-solid fa-user-tag"></i> Officer</button>` : ''}
          ${canMarkFraud      ? `<button class="btn-danger"    id="btn-mark-fraud"><i class="fa-solid fa-triangle-exclamation"></i> Fraud</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="ln-tabs">
          <button class="tab" data-lntab="overview">Overview</button>
          <button class="tab" data-lntab="schedule">Schedule</button>
          <button class="tab" data-lntab="original">Original Schedule</button>
          ${can('READ_LOANTRANSACTION') ? `<button class="tab" data-lntab="transactions">Transactions</button>` : ''}
          ${can('READ_LOANCHARGE') ? `<button class="tab" data-lntab="charges">Charges</button>` : ''}
          <button class="tab" data-lntab="disbursements">Disbursements</button>
          <button class="tab" data-lntab="delinquency">Delinquency</button>
          ${can('READ_RESCHEDULELOAN') ? `<button class="tab" data-lntab="reschedule">Reschedule</button>` : ''}
          ${can('READ_COLLATERAL') ? `<button class="tab" data-lntab="collateral">Collateral</button>` : ''}
          ${can('READ_GUARANTOR') ? `<button class="tab" data-lntab="guarantors">Guarantors</button>` : ''}
          <button class="tab" data-lntab="buydown">Buy-down / Capitalized</button>
          ${can('READ_LOANORIGINATOR') ? `<button class="tab" data-lntab="originators">Originators</button>` : ''}
          <button class="tab" data-lntab="eao">External Asset Owners</button>
          ${can('READ_NOTE') ? `<button class="tab" data-lntab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-lntab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-lnpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Loan Details</h3>
              <dl class="dl-grid">
                <dt>Status</dt><dd>${sb(status || '—')}</dd>
                <dt>Officer</dt><dd>${escapeHtml(l.loanOfficerName || 'Unassigned')}</dd>
                <dt>Product</dt><dd>${escapeHtml(l.loanProductName || '—')}</dd>
                <dt>Principal</dt><dd>${fmt(l.principal || 0)}</dd>
                <dt>Approved</dt><dd>${fmt(l.approvedPrincipal || 0)}</dd>
                <dt>Disbursed</dt><dd>${fmt(l.netDisbursalAmount ?? l.principalDisbursed ?? 0)}</dd>
                <dt>Interest Rate</dt><dd>${num(l.interestRatePerPeriod || 0)}% (${escapeHtml(l.interestRateFrequencyType?.value || '—')})</dd>
                <dt>Term</dt><dd>${l.termFrequency || '—'} ${escapeHtml(l.termPeriodFrequencyType?.value || '')}</dd>
                <dt>Repayments</dt><dd>${l.numberOfRepayments || '—'} × every ${l.repaymentEvery || '—'} ${escapeHtml(l.repaymentFrequencyType?.value || '')}</dd>
                <dt>External ID</dt><dd>${escapeHtml(l.externalId || '—')}</dd>
              </dl>
            </div>
            <div>
              <h3>Balances</h3>
              <dl class="dl-grid">
                <dt>Outstanding</dt><dd class="text-right">${fmt(l.summary?.totalOutstanding || 0)}</dd>
                <dt>Principal Outstanding</dt><dd class="text-right">${fmt(l.summary?.principalOutstanding || 0)}</dd>
                <dt>Interest Outstanding</dt><dd class="text-right">${fmt(l.summary?.interestOutstanding || 0)}</dd>
                <dt>Overdue</dt><dd class="text-right">${fmt(l.summary?.totalOverdue || 0)}</dd>
                <dt>Total Repaid</dt><dd class="text-right">${fmt(l.summary?.totalRepayment || 0)}</dd>
                <dt>Total Waived</dt><dd class="text-right">${fmt(l.summary?.totalWaived || 0)}</dd>
                <dt>Total Written Off</dt><dd class="text-right">${fmt(l.summary?.totalWrittenOff || 0)}</dd>
              </dl>
              <h3 class="mt-3">Timeline</h3>
              <dl class="dl-grid">
                <dt>Submitted</dt><dd>${fmtDate(l.timeline?.submittedOnDate) || '—'}</dd>
                <dt>Approved</dt><dd>${fmtDate(l.timeline?.approvedOnDate) || '—'}</dd>
                <dt>Disbursed</dt><dd>${fmtDate(l.timeline?.actualDisbursementDate) || '—'}</dd>
                <dt>Expected Maturity</dt><dd>${fmtDate(l.timeline?.expectedMaturityDate) || '—'}</dd>
                <dt>Closed</dt><dd>${fmtDate(l.timeline?.closedOnDate) || '—'}</dd>
              </dl>
              ${l.delinquent?.delinquentDate ? `
                <div class="msg-banner b-warning mt-3">
                  <b>Delinquent</b> since ${fmtDate(l.delinquent.delinquentDate)} ·
                  range: ${escapeHtml(l.delinquencyRange?.classification || '—')}
                </div>` : ''}
            </div>
          </div>
        </div>

        <!-- Schedule -->
        <div class="tab-panel" data-lnpanel="schedule" hidden>
          <div id="ln-schedule"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Original Schedule -->
        <div class="tab-panel" data-lnpanel="original" hidden>
          <div id="ln-original-schedule"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Placeholders for Installments 2 & 3 (will be filled by lazy loaders) -->
        <div class="tab-panel" data-lnpanel="transactions"  hidden><div id="ln-tx-list"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="charges"       hidden><div id="ln-charges-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="disbursements" hidden><div id="ln-disb-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="delinquency"   hidden><div id="ln-delq-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="reschedule"    hidden><div id="ln-rs-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="collateral"    hidden><div id="ln-coll-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="guarantors"    hidden><div id="ln-guar-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="buydown"       hidden><div id="ln-bd-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="originators"   hidden><div id="ln-orig-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="eao"           hidden><div id="ln-eao-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="notes"         hidden><div id="ln-notes-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-lnpanel="documents"     hidden><div id="ln-docs-wrap"><div class="empty-state-row">Loading…</div></div></div>
      </div>`;

    // -------- Tab switching with deep-link --------
    const tabs = c.querySelectorAll('[data-lntab]');
    const panels = c.querySelectorAll('[data-lnpanel]');
    const lazyLoaded = {};
    // Lazy loaders — populated by installments 2 & 3.
    // Empty stubs here keep tab switching safe before the rest is appended.
    const lazyLoaders = {
      schedule:     () => loadSchedule(c, id),
      original:     () => loadOriginalSchedule(c, id),
      transactions: () => (typeof loadLoanTransactions === 'function') && loadLoanTransactions(c, id),
      charges:      () => (typeof loadLoanCharges       === 'function') && loadLoanCharges(c, id),
      disbursements:() => (typeof loadLoanDisbursements === 'function') && loadLoanDisbursements(c, id),
      delinquency:  () => (typeof loadLoanDelinquency   === 'function') && loadLoanDelinquency(c, id),
      reschedule:   () => (typeof loadLoanReschedule    === 'function') && loadLoanReschedule(c, id),
      collateral:   () => (typeof loadLoanCollateral    === 'function') && loadLoanCollateral(c, id),
      guarantors:   () => (typeof loadLoanGuarantors    === 'function') && loadLoanGuarantors(c, id),
      buydown:      () => (typeof loadLoanBuyDown       === 'function') && loadLoanBuyDown(c, id),
      originators:  () => (typeof loadLoanOriginators   === 'function') && loadLoanOriginators(c, id),
      eao:          () => (typeof loadLoanEAO           === 'function') && loadLoanEAO(c, id),
      notes:        () => (typeof loadLoanNotes         === 'function') && loadLoanNotes(c, id),
      documents:    () => (typeof loadLoanDocuments     === 'function') && loadLoanDocuments(c, id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.lntab === name));
      panels.forEach(p => p.hidden = p.dataset.lnpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `loans?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.lntab)));
    switchTab(initialTab || 'overview');

    // -------- Back --------
    c.querySelector('#back-to-loans').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('loans'));
    });

    // -------- Toolbar handlers --------
    c.querySelector('#btn-approve')?.addEventListener('click', () => openApproveModal(id));
    c.querySelector('#btn-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', message: 'Return this loan to pending state.', confirmText: 'Undo Approval' })) return;
      try { await api.loans.undoApproval(id); toast('success', 'Approval undone', `#${id}`); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-reject')?.addEventListener('click', () => openSimpleLoanCmdModal({
      id, command: 'reject', label: 'Reject Loan', dateField: 'rejectedOnDate'
    }));
    c.querySelector('#btn-withdraw')?.addEventListener('click', () => openSimpleLoanCmdModal({
      id, command: 'withdrawnByApplicant', label: 'Withdrawn by Applicant', dateField: 'withdrawnOnDate'
    }));
    c.querySelector('#btn-disburse')?.addEventListener('click', () => openDisburseModal(id));
    c.querySelector('#btn-disburse-savings')?.addEventListener('click', () => openDisburseToSavingsModal(id));
    c.querySelector('#btn-undo-disburse')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo disbursal?', message: 'Loan returns to Approved status.', danger: true, confirmText: 'Undo' })) return;
      try { await api.loans.undoDisbursal(id); toast('success', 'Disbursal undone', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-repay')?.addEventListener('click', () => {
      const modal = openModal('repaymentModal');
      if (modal) modal.dataset.loanId = id;
    });
    c.querySelector('#btn-waive-int')?.addEventListener('click', () => openWaiveInterestModal(id));
    c.querySelector('#btn-recover')?.addEventListener('click', () => openRecoverPaymentModal(id));
    c.querySelector('#btn-recover-guar')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Recover guarantees?', confirmText: 'Recover' })) return;
      try { await api.loans.recoverGuarantees(id); toast('success', 'Guarantees recovered', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-reage')?.addEventListener('click', () => openReageModal(id));
    c.querySelector('#btn-reamortize')?.addEventListener('click', () => openReamortizeModal(id));
    c.querySelector('#btn-writeoff')?.addEventListener('click', () => {
      const modal = openModal('writeOffModal');
      if (modal) modal.dataset.loanId = id;
    });
    c.querySelector('#btn-chargeoff')?.addEventListener('click', () => openChargeOffModal(id));
    c.querySelector('#btn-foreclose')?.addEventListener('click', () => openForecloseModal(id));
    c.querySelector('#btn-close-loan')?.addEventListener('click', () => openCloseLoanModal(id));
    c.querySelector('#btn-reschedule')?.addEventListener('click', () => {
      const modal = openModal('rescheduleModal');
      if (modal) {
        modal.dataset.loanId = id;
        const hidden = document.getElementById('rs-loanid');
        if (hidden) hidden.value = id;
      }
    });
    c.querySelector('#btn-assign-officer')?.addEventListener('click', () => openAssignOfficerModal(id, l.loanOfficerName));
    c.querySelector('#btn-mark-fraud')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Toggle fraud flag?', message: 'This flags or unflags the loan as fraudulent.', danger: true, confirmText: 'Toggle' })) return;
      try { await api.loans.markAsFraud(id, { fraud: !l.fraud }); toast('warn', 'Fraud flag toggled', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load loan</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// SCHEDULE TABS
// ============================================================
async function loadSchedule(c, id) {
  const wrap = c.querySelector('#ln-schedule');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const r = await api.loans.schedule(id);
    renderScheduleTable(wrap, r.repaymentSchedule);
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

async function loadOriginalSchedule(c, id) {
  const wrap = c.querySelector('#ln-original-schedule');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const r = await api.loans.originalSchedule(id);
    const sched = r.originalSchedule || r.repaymentSchedule;
    if (!sched) {
      wrap.innerHTML = '<div class="empty-state-row">No original schedule recorded (loan has not been modified)</div>';
      return;
    }
    renderScheduleTable(wrap, sched, true);
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

function renderScheduleTable(wrap, sched, isOriginal = false) {
  const periods = (sched?.periods || []).filter(p => p.period);
  if (!periods.length) { wrap.innerHTML = '<div class="empty-state-row">No schedule</div>'; return; }
  const totals = {
    principal: periods.reduce((s, p) => s + (p.principalDue || 0), 0),
    interest:  periods.reduce((s, p) => s + (p.interestDue || 0), 0),
    fees:      periods.reduce((s, p) => s + (p.feeChargesDue || 0), 0),
    penalty:   periods.reduce((s, p) => s + (p.penaltyChargesDue || 0), 0),
    due:       periods.reduce((s, p) => s + (p.totalDueForPeriod || 0), 0),
    paid:      periods.reduce((s, p) => s + (p.totalPaidForPeriod || 0), 0)
  };
  wrap.innerHTML = `
    ${isOriginal ? '<div class="msg-banner b-info mb-2"><b>Original schedule</b> — terms before any rescheduling.</div>' : ''}
    <table class="table table-compact">
      <thead><tr>
        <th>#</th><th>Due Date</th>
        <th class="text-right">Principal</th><th class="text-right">Interest</th>
        <th class="text-right">Fees</th><th class="text-right">Penalty</th>
        <th class="text-right">Total Due</th><th class="text-right">Paid</th>
        <th class="text-right">Outstanding</th><th>Status</th>
      </tr></thead>
      <tbody>${periods.map(p => `
        <tr class="${p.complete ? 'paid-row' : p.daysOverdue > 0 ? 'overdue-row' : ''}">
          <td>${p.period}</td>
          <td>${fmtDate(p.dueDate) || '—'}</td>
          <td class="text-right">${fmt(p.principalDue || 0)}</td>
          <td class="text-right">${fmt(p.interestDue || 0)}</td>
          <td class="text-right">${fmt(p.feeChargesDue || 0)}</td>
          <td class="text-right">${fmt(p.penaltyChargesDue || 0)}</td>
          <td class="text-right"><b>${fmt(p.totalDueForPeriod || 0)}</b></td>
          <td class="text-right">${fmt(p.totalPaidForPeriod || 0)}</td>
          <td class="text-right">${fmt(p.totalOutstandingForPeriod || 0)}</td>
          <td>${p.complete ? sb('Paid') : (p.daysOverdue > 0 ? sb('Overdue') : sb('Due'))}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <th colspan="2">Totals</th>
        <th class="text-right">${fmt(totals.principal)}</th>
        <th class="text-right">${fmt(totals.interest)}</th>
        <th class="text-right">${fmt(totals.fees)}</th>
        <th class="text-right">${fmt(totals.penalty)}</th>
        <th class="text-right">${fmt(totals.due)}</th>
        <th class="text-right">${fmt(totals.paid)}</th>
        <th colspan="2"></th>
      </tr></tfoot>
    </table>`;
}

// ============================================================
// TOOLBAR MODALS
// ============================================================
async function openApproveModal(id) {
  let tpl = {};
  try { tpl = await api.loans.approvalTemplate(id); } catch {}
  const mid = `ln-app-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Approve Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Approved on * <input type="date" id="ap-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Approved amount * <input type="number" step="0.01" id="ap-amount" class="form-control" value="${tpl.approvalAmount ?? ''}" required/></label>
          <label class="mt-2">Expected disbursement date <input type="date" id="ap-disb" class="form-control" value="${tpl.expectedDisbursementDate || today()}"/></label>
          <label class="mt-2">Note <textarea id="ap-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-success" id="ap-save">Approve</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ap-save').addEventListener('click', async () => {
    const payload = {
      approvedOnDate: el.querySelector('#ap-date').value,
      approvedLoanAmount: parseFloat(el.querySelector('#ap-amount').value),
      expectedDisbursementDate: el.querySelector('#ap-disb').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const note = el.querySelector('#ap-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.loans.approve(id, payload);
      el.remove();
      toast('success', 'Loan approved', `#${id}`);
      location.reload();
    } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openDisburseModal(id) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `ln-disb-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Disburse Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Disbursement date * <input type="date" id="d-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Transaction amount (override) <input type="number" step="0.01" id="d-amount" class="form-control"/></label>
          <label class="mt-2">Payment type
            <select id="d-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="d-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="d-save">Disburse</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#d-save').addEventListener('click', async () => {
    const payload = {
      actualDisbursementDate: el.querySelector('#d-date').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const amt = parseFloat(el.querySelector('#d-amount').value);
    if (!isNaN(amt)) payload.transactionAmount = amt;
    const pt  = el.querySelector('#d-pt').value;
    if (pt) payload.paymentTypeId = parseInt(pt);
    const note= el.querySelector('#d-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.loans.disburse(id, payload);
      el.remove();
      toast('success', 'Loan disbursed', `#${id}`);
      location.reload();
    } catch (e) { toast('error', 'Disburse failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openDisburseToSavingsModal(id) {
  openSimpleLoanCmdModal({
    id, command: 'disburseToSavings', label: 'Disburse to Savings', dateField: 'actualDisbursementDate'
  });
}

function openWaiveInterestModal(id) {
  const mid = `ln-waive-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Waive Interest</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="wi-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount to waive * <input type="number" step="0.01" id="wi-amount" class="form-control" required/></label>
          <label class="mt-2">Note <textarea id="wi-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="wi-save">Waive Interest</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#wi-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#wi-date').value;
    const transactionAmount = parseFloat(el.querySelector('#wi-amount').value);
    if (isNaN(transactionAmount)) { toast('warn', 'Enter amount', ''); return; }
    const note = el.querySelector('#wi-note').value.trim();
    try {
      await api.loans.waiveInterest(id, {
        transactionDate, transactionAmount,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Interest waived', `${transactionAmount}`);
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

function openRecoverPaymentModal(id) {
  openSimpleLoanCmdModal({
    id, command: 'recoverypayment', label: 'Recover Repayment',
    dateField: 'transactionDate', isTransaction: true, amountRequired: true
  });
}
function openReageModal(id) {
  openSimpleLoanCmdModal({ id, command: 'reAge', label: 'Re-age Loan', dateField: 'transactionDate' });
}
function openReamortizeModal(id) {
  openSimpleLoanCmdModal({ id, command: 'reAmortize', label: 'Re-amortize Loan', dateField: 'transactionDate' });
}
function openChargeOffModal(id) {
  openSimpleLoanCmdModal({ id, command: 'chargeOff', label: 'Charge Off Loan', dateField: 'transactionDate' });
}
function openForecloseModal(id) {
  openSimpleLoanCmdModal({ id, command: 'foreclosure', label: 'Foreclose Loan', dateField: 'transactionDate' });
}
function openCloseLoanModal(id) {
  openSimpleLoanCmdModal({ id, command: 'close', label: 'Close Loan', dateField: 'transactionDate' });
}

/** Generic small modal used for command actions that just need date + optional note + amount. */
function openSimpleLoanCmdModal({ id, command, label, dateField = 'transactionDate', isTransaction = false, amountRequired = false }) {
  const mid = `lncmd-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="cmd-date" class="form-control" value="${today()}" required/></label>
          ${amountRequired ? `<label class="mt-2">Amount * <input type="number" step="0.01" id="cmd-amount" class="form-control" required/></label>` : ''}
          <label class="mt-2">Note <textarea id="cmd-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="cmd-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cmd-save').addEventListener('click', async () => {
 const payload = {
      [dateField]: el.querySelector('#cmd-date').value,
      dateFormat: DATE_FORMAT,
      locale: LOCALE
    };
    if (amountRequired) {
      const amt = parseFloat(el.querySelector('#cmd-amount').value);
      if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
      payload.transactionAmount = amt;
    }
    const note = el.querySelector('#cmd-note').value.trim();
    if (note) payload.note = note;
    try {
      if (isTransaction) {
        // Transaction-style endpoint: /loans/{id}/transactions?command=…
 const apiMethodMap = { recoverypayment: 'recoverPayment' };
const methodName = apiMethodMap[command];
if (methodName && typeof api.loans[methodName] === 'function') {
  await api.loans[methodName](id, payload);
} else {
  await api.loans.command(id, command, payload);
}
      } else {
        await api.loans.command(id, command, payload);
      }
      el.remove();
      toast('success', `${label} successful`, `Loan #${id}`);
      location.reload();
    } catch (e) { toast('error', `${label} failed`, e.detail?.defaultUserMessage || e.message); }
  });
}

async function openAssignOfficerModal(loanId, currentOfficer) {
  let staffList = [];
  try {
    const r = await api.staff.list({ isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `ln-officer-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Assign Loan Officer</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted">Current officer: <b>${escapeHtml(currentOfficer || 'Unassigned')}</b></p>
          <label>New loan officer
            <select id="ao-officer" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Assignment date * <input type="date" id="ao-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ao-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ao-save').addEventListener('click', async () => {
    const officerId = el.querySelector('#ao-officer').value;
    const dateVal = el.querySelector('#ao-date').value;
    try {
      if (officerId) {
        await api.loans.assignOfficer(loanId, {
          toLoanOfficerId: parseInt(officerId),
          assignmentDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      } else {
        await api.loans.removeOfficer(loanId, {
          unassignedDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      }
      el.remove();
      toast('success', 'Officer updated', '');
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// TRANSACTIONS TAB
// ============================================================
async function loadLoanTransactions(c, loanId) {
  const wrap = c.querySelector('#ln-tx-list');
  wrap.innerHTML = `
    <div class="filter-bar mb-2">
      <select id="tx-type-filter" class="form-control">
        <option value="">All transaction types</option>
        <option value="repayment">Repayment</option>
        <option value="disbursement">Disbursement</option>
        <option value="accrual">Accrual</option>
        <option value="waiver">Waiver</option>
        <option value="writeoff">Write-off</option>
        <option value="chargeback">Chargeback</option>
        <option value="refund">Refund</option>
      </select>
      <button class="btn-secondary" id="tx-reload"><i class="fa-solid fa-rotate"></i> Refresh</button>
      ${can('REPAYMENT_LOAN') ? `<button class="btn-primary" id="tx-add-repay"><i class="fa-solid fa-coins"></i> Repayment</button>` : ''}
      ${can('GOODWILLCREDIT_LOAN') ? `<button class="btn-secondary" id="tx-goodwill"><i class="fa-solid fa-gift"></i> Goodwill Credit</button>` : ''}
      ${can('CHARGEREFUND_LOAN') ? `<button class="btn-secondary" id="tx-charge-refund"><i class="fa-solid fa-rotate-left"></i> Charge Refund</button>` : ''}
    </div>
    <div id="tx-table-wrap"><div class="empty-state-row">Loading…</div></div>`;

  async function reload() {
    const tableWrap = wrap.querySelector('#tx-table-wrap');
    tableWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const res = await api.loans.transactions(loanId);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      const typeFilter = wrap.querySelector('#tx-type-filter').value;
      if (typeFilter) {
        list = list.filter(tx => (tx.type?.value || '').toLowerCase().includes(typeFilter));
      }
      if (!list.length) {
        tableWrap.innerHTML = '<div class="empty-state-row">No transactions match</div>';
        return;
      }
      tableWrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>#</th><th>Date</th><th>Type</th>
            <th class="text-right">Amount</th>
            <th class="text-right">Principal</th>
            <th class="text-right">Interest</th>
            <th class="text-right">Fees</th>
            <th class="text-right">Penalty</th>
            <th class="text-right">Balance</th>
            <th>State</th><th></th>
          </tr></thead>
          <tbody>${list.map(tx => {
            const reversed = tx.manuallyReversed || tx.reversed;
            const accrual  = (tx.type?.value || '').toLowerCase() === 'accrual';
            return `
              <tr class="${reversed ? 'text-muted' : ''}">
                <td>${tx.id}</td>
                <td>${fmtDate(tx.date) || '—'}</td>
                <td>${escapeHtml(tx.type?.value || '—')}</td>
                <td class="text-right">${fmt(tx.amount || 0)}</td>
                <td class="text-right">${fmt(tx.principalPortion || 0)}</td>
                <td class="text-right">${fmt(tx.interestPortion || 0)}</td>
                <td class="text-right">${fmt(tx.feeChargesPortion || 0)}</td>
                <td class="text-right">${fmt(tx.penaltyChargesPortion || 0)}</td>
                <td class="text-right">${fmt(tx.outstandingLoanBalance || 0)}</td>
                <td>${reversed ? sb('Reversed') : sb('Posted')}</td>
                <td class="text-right">
                  ${!reversed && !accrual && can('ADJUST_LOAN') ?
                    `<button class="btn-mini" data-adjust-tx="${tx.id}" title="Adjust">Adjust</button>` : ''}
                  ${!reversed && !accrual && can('UNDO_LOANTRANSACTION') ?
                    `<button class="btn-mini btn-warning" data-reverse-tx="${tx.id}" title="Reverse">Reverse</button>` : ''}
                  ${(tx.type?.value || '').toLowerCase() === 'repayment' && can('CHARGEBACK_LOANTRANSACTION') ?
                    `<button class="btn-mini btn-warning" data-chargeback-tx="${tx.id}" title="Chargeback">Chargeback</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>`;

      // Per-row handlers
      tableWrap.querySelectorAll('[data-reverse-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({
          title: `Reverse transaction #${b.dataset.reverseTx}?`,
          message: 'This restores the loan balances to before this transaction.',
          danger: true, confirmText: 'Reverse'
        })) return;
        try {
          await api.loans.reverseTransaction(loanId, b.dataset.reverseTx, {
            transactionDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'Transaction reversed', `#${b.dataset.reverseTx}`);
          reload();
        } catch (e) { toast('error', 'Reversal failed', e.detail?.defaultUserMessage || e.message); }
      }));
      tableWrap.querySelectorAll('[data-adjust-tx]').forEach(b => b.addEventListener('click', () =>
        openAdjustTransactionModal(loanId, b.dataset.adjustTx, reload)));
      tableWrap.querySelectorAll('[data-chargeback-tx]').forEach(b => b.addEventListener('click', () =>
        openChargebackModal(loanId, b.dataset.chargebackTx, reload)));
    } catch (e) {
      tableWrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }

  wrap.querySelector('#tx-type-filter').addEventListener('change', reload);
  wrap.querySelector('#tx-reload').addEventListener('click', reload);
  wrap.querySelector('#tx-add-repay')?.addEventListener('click', () => {
    const m = openModal('repaymentModal');
    if (m) m.dataset.loanId = loanId;
  });
  wrap.querySelector('#tx-goodwill')?.addEventListener('click', () => openGoodwillModal(loanId, reload));
  wrap.querySelector('#tx-charge-refund')?.addEventListener('click', () => openChargeRefundModal(loanId, reload));

  reload();
}

async function openAdjustTransactionModal(loanId, txId, onSuccess) {
  const mid = `tx-adjust-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Adjust Transaction #${txId}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>New transaction date * <input type="date" id="adj-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">New transaction amount * <input type="number" step="0.01" id="adj-amount" class="form-control" required/></label>
          <label class="mt-2">Note <textarea id="adj-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="adj-save">Adjust</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#adj-save').addEventListener('click', async () => {
    const amt = parseFloat(el.querySelector('#adj-amount').value);
    if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.loans.adjustTransaction(loanId, txId, {
        transactionDate: el.querySelector('#adj-date').value,
        transactionAmount: amt,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(el.querySelector('#adj-note').value.trim() && { note: el.querySelector('#adj-note').value.trim() })
      });
      el.remove();
      toast('success', 'Transaction adjusted', `#${txId}`);
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openChargebackModal(loanId, txId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `tx-cb-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Chargeback Transaction #${txId}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction amount * <input type="number" step="0.01" id="cb-amount" class="form-control" required/></label>
          <label class="mt-2">Payment type
            <select id="cb-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="cb-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="cb-save">Post Chargeback</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cb-save').addEventListener('click', async () => {
    const amt = parseFloat(el.querySelector('#cb-amount').value);
    if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
    const pt = el.querySelector('#cb-pt').value;
    const note = el.querySelector('#cb-note').value.trim();
    try {
      await api.loans.chargebackTx(loanId, txId, {
        transactionAmount: amt,
        locale: LOCALE,
        ...(pt && { paymentTypeId: parseInt(pt) }),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Chargeback posted', `#${txId}`);
      onSuccess();
    } catch (e) { toast('error', 'Chargeback failed', e.detail?.defaultUserMessage || e.message); }
  });
}

function openGoodwillModal(loanId, onSuccess) {
  openSimpleTxModal({
    loanId, label: 'Goodwill Credit',
    apiCall: (body) => api.loans.goodwillCredit(loanId, body),
    onSuccess
  });
}
function openChargeRefundModal(loanId, onSuccess) {
  openSimpleTxModal({
    loanId, label: 'Charge Refund',
    apiCall: (body) => api.loans.chargeRefund(loanId, body),
    onSuccess
  });
}

function openSimpleTxModal({ loanId, label, apiCall, onSuccess }) {
  const mid = `tx-simple-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="st-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="st-amount" class="form-control" required/></label>
          <label class="mt-2">Note <textarea id="st-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="st-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#st-save').addEventListener('click', async () => {
    const amt = parseFloat(el.querySelector('#st-amount').value);
    if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
    const note = el.querySelector('#st-note').value.trim();
    try {
      await apiCall({
        transactionDate: el.querySelector('#st-date').value,
        transactionAmount: amt,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', `${label} posted`, '');
      onSuccess();
    } catch (e) { toast('error', `${label} failed`, e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// CHARGES TAB
// ============================================================
async function loadLoanCharges(c, loanId) {
  const wrap = c.querySelector('#ln-charges-wrap');
  wrap.innerHTML = `
    ${can('CREATE_LOANCHARGE') ? `
      <div class="section-header mb-2">
        <h3>Loan Charges</h3>
        <button class="btn-primary btn-sm" id="ln-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>
      </div>` : '<h3>Loan Charges</h3>'}
    <div id="ln-charges-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-charge')?.addEventListener('click', () =>
    openApplyLoanChargeModal(loanId, () => loadLoanCharges(c, loanId)));

  const listEl = wrap.querySelector('#ln-charges-list');
  try {
    const charges = await api.loans.listCharges(loanId);
    const list = Array.isArray(charges) ? charges : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Charge</th><th>Timing</th>
          <th class="text-right">Amount</th><th class="text-right">Due</th>
          <th class="text-right">Paid</th><th class="text-right">Waived</th>
          <th class="text-right">Outstanding</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(ch => `
          <tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td>${escapeHtml(ch.chargeTimeType?.value || '—')}</td>
            <td class="text-right">${fmt(ch.amount || 0)}</td>
            <td class="text-right">${fmt(ch.amountDue || ch.amountOrPercentage || 0)}</td>
            <td class="text-right">${fmt(ch.amountPaid || 0)}</td>
            <td class="text-right">${fmt(ch.amountWaived || 0)}</td>
            <td class="text-right">${fmt(ch.amountOutstanding || 0)}</td>
            <td>${sb(ch.paid ? 'Paid' : ch.waived ? 'Waived' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.paid && !ch.waived && can('PAY_LOANCHARGE') ?
                `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.paid && !ch.waived && can('WAIVE_LOANCHARGE') ?
                `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${can('UPDATE_LOANCHARGE') ?
                `<button class="btn-mini" data-adjust-charge="${ch.id}">Adjust</button>` : ''}
              ${can('DELETE_LOANCHARGE') ?
                `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges on this loan</div>';

    listEl.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await api.loans.waiveCharge(loanId, b.dataset.waiveCharge); toast('success', 'Charge waived', ''); loadLoanCharges(c, loanId); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      openPayLoanChargeModal(loanId, b.dataset.payCharge, () => loadLoanCharges(c, loanId))));
    listEl.querySelectorAll('[data-adjust-charge]').forEach(b => b.addEventListener('click', () =>
      openAdjustLoanChargeModal(loanId, b.dataset.adjustCharge, () => loadLoanCharges(c, loanId))));
    listEl.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.loans.deleteCharge(loanId, b.dataset.delCharge); toast('success', 'Charge deleted', ''); loadLoanCharges(c, loanId); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openApplyLoanChargeModal(loanId, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 1 }); // 1 = Loan charges
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `ln-applycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Charge *
            <select id="ac-charge" class="form-control" required>
              <option value="">Select charge…</option>
              ${charges.map(ch => `<option value="${ch.id}" data-amount="${ch.amount}">${escapeHtml(ch.name)} (${fmt(ch.amount)})</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="ac-amount" class="form-control" required/></label>
          <label class="mt-2">Due date <input type="date" id="ac-due" class="form-control" value="${today()}"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ac-save">Apply</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ac-charge').addEventListener('change', (e) => {
    el.querySelector('#ac-amount').value = e.target.selectedOptions[0]?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    const dueDate = el.querySelector('#ac-due').value;
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields', ''); return; }
    try {
      await api.loans.addCharge(loanId, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openPayLoanChargeModal(loanId, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `ln-paycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pc-save">Pay</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#pc-amount').value);
    const transactionDate = el.querySelector('#pc-date').value;
    const paymentTypeId = el.querySelector('#pc-pt').value;
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.loans.payCharge(loanId, chargeId, {
        amount, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openAdjustLoanChargeModal(loanId, chargeId, onSuccess) {
  const mid = `ln-adjcharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Adjust Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Adjustment amount * <input type="number" step="0.01" id="aj-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="aj-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Note <textarea id="aj-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="aj-save">Adjust</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#aj-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#aj-amount').value);
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.loans.chargeAdjustment(loanId, chargeId, {
        amount,
        transactionDate: el.querySelector('#aj-date').value,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(el.querySelector('#aj-note').value.trim() && { note: el.querySelector('#aj-note').value.trim() })
      });
      el.remove();
      toast('success', 'Charge adjusted', '');
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// DISBURSEMENTS / TRANCHES TAB
// ============================================================
async function loadLoanDisbursements(c, loanId) {
  const wrap = c.querySelector('#ln-disb-wrap');
  wrap.innerHTML = `
    ${can('UPDATE_DISBURSEMENT') ? `
      <div class="section-header mb-2">
        <h3>Tranches / Disbursements</h3>
        <button class="btn-primary btn-sm" id="ln-add-tranche"><i class="fa-solid fa-plus"></i> Add Tranche</button>
      </div>` : '<h3>Tranches / Disbursements</h3>'}
    <div id="ln-disb-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-tranche')?.addEventListener('click', () =>
    openTrancheEditorModal(loanId, null, () => loadLoanDisbursements(c, loanId)));

  const listEl = wrap.querySelector('#ln-disb-list');
  try {
    let list = [];
    try {
      const r = await api.loans.disbursements(loanId);
      list = Array.isArray(r) ? r : [];
    } catch {
      // Some loans don't expose disbursements endpoint — fall back to embedded data
      const l = await api.loans.get(loanId, 'disbursementDetails');
      list = l.disbursementDetails || [];
    }
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th>
          <th>Expected Disbursement</th>
          <th>Actual Disbursement</th>
          <th class="text-right">Principal</th>
          <th class="text-right">Net Disbursed</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map((d, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${fmtDate(d.expectedDisbursementDate) || '—'}</td>
            <td>${fmtDate(d.actualDisbursementDate) || '—'}</td>
            <td class="text-right">${fmt(d.principal || 0)}</td>
            <td class="text-right">${fmt(d.netDisbursalAmount || 0)}</td>
            <td>${d.actualDisbursementDate ? sb('Disbursed') : sb('Pending')}</td>
            <td class="text-right">
              ${!d.actualDisbursementDate && can('UPDATE_DISBURSEMENT') ?
                `<button class="btn-mini" data-edit-tranche="${d.id}">Edit</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="text-muted mt-2 small">
        <i class="fa-solid fa-circle-info"></i> Tranches let multi-disbursement loans release principal in stages.
      </div>` : '<div class="empty-state-row">No tranche schedule (single-disbursement loan)</div>';

    listEl.querySelectorAll('[data-edit-tranche]').forEach(b => b.addEventListener('click', () => {
      const disb = list.find(d => String(d.id) === b.dataset.editTranche);
      openTrancheEditorModal(loanId, disb, () => loadLoanDisbursements(c, loanId));
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

async function openTrancheEditorModal(loanId, existing, onSuccess) {
  const isEdit = !!existing;
  const mid = `ln-tranche-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Tranche</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Expected disbursement date * <input type="date" id="tr-date" class="form-control" value="${existing?.expectedDisbursementDate || today()}" required/></label>
          <label class="mt-2">Principal * <input type="number" step="0.01" id="tr-principal" class="form-control" value="${existing?.principal || ''}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tr-save">${isEdit ? 'Save Changes' : 'Add Tranche'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tr-save').addEventListener('click', async () => {
    const payload = {
      expectedDisbursementDate: el.querySelector('#tr-date').value,
      principal: parseFloat(el.querySelector('#tr-principal').value),
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (isNaN(payload.principal)) { toast('warn', 'Enter principal', ''); return; }
    try {
      if (isEdit) await api.loans.updateDisbursement(loanId, existing.id, payload);
      else        await api.loans.addDisbursement(loanId, { disbursementData: [payload] });
      el.remove();
      toast('success', isEdit ? 'Tranche updated' : 'Tranche added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// DELINQUENCY TAB
// ============================================================
async function loadLoanDelinquency(c, loanId) {
  const wrap = c.querySelector('#ln-delq-wrap');
  wrap.innerHTML = `
    <div class="grid-2">
      <div>
        <h3>Current Delinquency</h3>
        <div id="ln-delq-current"><div class="empty-state-row">Loading…</div></div>
      </div>
      <div>
        <div class="section-header">
          <h3>Delinquency Actions</h3>
          ${can('CREATE_DELINQUENCY_ACTION') ? `<button class="btn-primary btn-sm" id="ln-add-delq"><i class="fa-solid fa-plus"></i> Pause / Resume</button>` : ''}
        </div>
        <div id="ln-delq-actions"><div class="empty-state-row">Loading…</div></div>
      </div>
    </div>
    <h3 class="mt-4">Delinquency Tag History</h3>
    <div id="ln-delq-tags"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-delq')?.addEventListener('click', () =>
    openDelinquencyActionModal(loanId, () => loadLoanDelinquency(c, loanId)));

  // Current delinquency snapshot (from loan detail)
  const cur = wrap.querySelector('#ln-delq-current');
  try {
    const l = await api.loans.get(loanId, 'delinquent');
    cur.innerHTML = `
      <dl class="dl-grid">
        <dt>Range</dt><dd>${escapeHtml(l.delinquencyRange?.classification || '—')}</dd>
        <dt>Bucket</dt><dd>${escapeHtml(l.delinquentBucket?.name || '—')}</dd>
        <dt>Delinquent since</dt><dd>${fmtDate(l.delinquent?.delinquentDate) || '—'}</dd>
        <dt>Days overdue</dt><dd>${l.delinquent?.delinquentDays ?? '—'}</dd>
        <dt>Past due interest</dt><dd class="text-right">${fmt(l.delinquent?.delinquentInterest || 0)}</dd>
        <dt>Past due principal</dt><dd class="text-right">${fmt(l.delinquent?.delinquentPrincipal || 0)}</dd>
      </dl>`;
  } catch (e) { cur.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }

  // Delinquency actions (pause/resume)
  const actEl = wrap.querySelector('#ln-delq-actions');
  try {
    const res = await api.loans.delinquency(loanId);
    const list = Array.isArray(res) ? res : (res?.delinquencyActions || []);
    actEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr><th>Action</th><th>Start</th><th>End</th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>${escapeHtml(a.action || '—')}</td>
            <td>${fmtDate(a.startDate) || '—'}</td>
            <td>${fmtDate(a.endDate) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No delinquency actions</div>';
  } catch (e) { actEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }

  // Tag history
  const tagsEl = wrap.querySelector('#ln-delq-tags');
  try {
    const tags = await api.loans.delinquencyTags(loanId);
    const list = Array.isArray(tags) ? tags : [];
    tagsEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr><th>Classification</th><th>Range</th><th>Added On</th><th>Lifted On</th></tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td>${escapeHtml(t.classification || t.delinquencyRange?.classification || '—')}</td>
            <td>${t.minimumAgeDays ?? '—'} - ${t.maximumAgeDays ?? '—'} days</td>
            <td>${fmtDate(t.addedOnDate) || '—'}</td>
            <td>${fmtDate(t.liftedOnDate) || (t.liftedOnDate === null ? '<span class="text-muted">Active</span>' : '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No tag history</div>';
  } catch { tagsEl.innerHTML = '<div class="empty-state-row text-muted">Tag history not available for this loan</div>'; }
}

async function openDelinquencyActionModal(loanId, onSuccess) {
  const mid = `ln-delq-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Delinquency Action</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Action *
            <select id="da-action" class="form-control" required>
              <option value="PAUSE">Pause Delinquency</option>
              <option value="RESUME">Resume Delinquency</option>
            </select>
          </label>
          <label class="mt-2">Start date * <input type="date" id="da-start" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">End date <input type="date" id="da-end" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="da-save">Submit</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#da-save').addEventListener('click', async () => {
    const payload = {
      action: el.querySelector('#da-action').value,
      startDate: el.querySelector('#da-start').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const endDate = el.querySelector('#da-end').value;
    if (endDate) payload.endDate = endDate;
    try {
      await api.loans.addDelinquencyAction(loanId, payload);
      el.remove();
      toast('success', 'Delinquency action posted', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// RESCHEDULE TAB
// ============================================================
async function loadLoanReschedule(c, loanId) {
  const wrap = c.querySelector('#ln-rs-wrap');
  wrap.innerHTML = `
    ${can('CREATE_RESCHEDULELOAN') ? `
      <div class="section-header mb-2">
        <h3>Reschedule Requests</h3>
        <button class="btn-primary btn-sm" id="ln-new-rs"><i class="fa-solid fa-calendar-plus"></i> New Request</button>
      </div>` : '<h3>Reschedule Requests</h3>'}
    <div id="ln-rs-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-new-rs')?.addEventListener('click', () => {
    const modal = openModal('rescheduleModal');
    if (modal) {
      modal.dataset.loanId = loanId;
      const hidden = document.getElementById('rs-loanid');
      if (hidden) hidden.value = loanId;
    }
  });

  const listEl = wrap.querySelector('#ln-rs-list');
  try {
    const res = await api.loans.rescheduleRequests(loanId);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Submitted</th><th>From Date</th><th>Adjusted Due</th>
          <th>Reason</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${fmtDate(r.timeline?.submittedOnDate) || '—'}</td>
            <td>${fmtDate(r.rescheduleFromDate) || '—'}</td>
            <td>${fmtDate(r.adjustedDueDate) || '—'}</td>
            <td>${escapeHtml(r.rescheduleReasonCodeValue?.name || r.rescheduleReasonComment || '—')}</td>
            <td>${sb(r.statusEnum?.value || (r.approved ? 'Approved' : r.rejected ? 'Rejected' : 'Pending'))}</td>
            <td class="text-right">
              ${!r.approved && !r.rejected && can('APPROVE_RESCHEDULELOAN') ?
                `<button class="btn-mini btn-success" data-rs-approve="${r.id}">Approve</button>` : ''}
              ${!r.approved && !r.rejected && can('REJECT_RESCHEDULELOAN') ?
                `<button class="btn-mini btn-warning" data-rs-reject="${r.id}">Reject</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No reschedule requests</div>';

    listEl.querySelectorAll('[data-rs-approve]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Approve reschedule request?', confirmText: 'Approve' })) return;
      try {
        await api.loans.approveReschedule(b.dataset.rsApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Reschedule approved', `#${b.dataset.rsApprove}`);
        loadLoanReschedule(c, loanId);
      } catch (e) { toast('error', 'Approve failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-rs-reject]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reject reschedule request?', confirmText: 'Reject', danger: true })) return;
      try {
        await api.loans.rejectReschedule(b.dataset.rsReject, {
          rejectedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Reschedule rejected', `#${b.dataset.rsReject}`);
        loadLoanReschedule(c, loanId);
      } catch (e) { toast('error', 'Reject failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

// ============================================================
// COLLATERAL TAB
// ============================================================
async function loadLoanCollateral(c, loanId) {
  const wrap = c.querySelector('#ln-coll-wrap');
  wrap.innerHTML = `
    ${can('CREATE_COLLATERAL') ? `
      <div class="section-header mb-2">
        <h3>Loan Collateral</h3>
        <button class="btn-primary btn-sm" id="ln-add-collateral"><i class="fa-solid fa-plus"></i> Add Collateral</button>
      </div>` : '<h3>Loan Collateral</h3>'}
    <div id="ln-coll-list"><div class="empty-state-row">Loading…</div></div>`;

  // Need clientId to load the client's collateral pool — pull from cached loan
  let clientId = null;
  try {
    const l = await api.loans.get(loanId, 'all');
    clientId = l.clientId;
  } catch {}

  wrap.querySelector('#ln-add-collateral')?.addEventListener('click', () =>
    openAddLoanCollateralModal(loanId, clientId, () => loadLoanCollateral(c, loanId)));

  const listEl = wrap.querySelector('#ln-coll-list');
  try {
    const res = await api.loans.listCollaterals(loanId);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Type</th><th>Description</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Value</th>
          <th class="text-right">Pledged Value</th>
          <th></th>
        </tr></thead>
        <tbody>${list.map(col => `
          <tr>
            <td>${escapeHtml(col.collateralType?.name || col.type || col.collateralName || '—')}</td>
            <td>${escapeHtml(col.description || '—')}</td>
            <td class="text-right">${fmt(col.quantity || 0)}</td>
            <td class="text-right">${fmt(col.value || col.basePrice || 0)}</td>
            <td class="text-right">${fmt(col.pctToBase ? (col.value * col.pctToBase / 100) : 0)}</td>
            <td class="text-right">
              ${can('DELETE_COLLATERAL') ? `<button class="btn-mini btn-danger" data-del-col="${col.id}">Remove</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="text-muted mt-2 small">
        <i class="fa-solid fa-circle-info"></i> Collateral is drawn from the client's pre-registered collateral pool.
      </div>` : '<div class="empty-state-row">No collateral pledged for this loan</div>';

    listEl.querySelectorAll('[data-del-col]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove collateral?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.loans.deleteCollateral(loanId, b.dataset.delCol);
        toast('success', 'Collateral removed', '');
        loadLoanCollateral(c, loanId);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddLoanCollateralModal(loanId, clientId, onSuccess) {
  // Try to fetch client's pre-registered collateral pool
  let clientCollaterals = [];
  if (clientId) {
    try {
      const r = await api.clients.collateral?.(clientId) || await api._g?.(`/clients/${clientId}/collaterals`);
      clientCollaterals = Array.isArray(r) ? r : (r?.pageItems || []);
    } catch {}
  }

  const mid = `ln-col-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Collateral to Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${clientCollaterals.length ? `
            <label>Client Collateral *
              <select id="col-pick" class="form-control" required>
                <option value="">Select from client's collateral pool…</option>
                ${clientCollaterals.map(cc => `<option value="${cc.id}" data-qty="${cc.quantity || 1}">
                  ${escapeHtml(cc.collateral?.name || cc.name || '—')} · base ${fmt(cc.basePrice || 0)}
                </option>`).join('')}
              </select>
            </label>
            <label class="mt-2">Quantity to pledge * <input type="number" step="0.01" id="col-qty" class="form-control" required/></label>
          ` : `
            <div class="msg-banner b-warning mb-2">
              No collateral registered on the client yet. Add collateral on the client first, then return here.
            </div>
            <label>Description (legacy field) * <input id="col-desc" class="form-control"/></label>
            <label class="mt-2">Value (legacy field) <input type="number" step="0.01" id="col-value" class="form-control"/></label>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="col-save">Add</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#col-save').addEventListener('click', async () => {
    let payload;
    if (clientCollaterals.length) {
      const clientCollateralId = el.querySelector('#col-pick').value;
      const quantity = parseFloat(el.querySelector('#col-qty').value);
      if (!clientCollateralId || isNaN(quantity)) { toast('warn', 'Select and enter quantity', ''); return; }
      payload = { clientCollateralId: parseInt(clientCollateralId), quantity, locale: LOCALE };
    } else {
      const description = el.querySelector('#col-desc')?.value.trim();
      const value = parseFloat(el.querySelector('#col-value')?.value);
      if (!description) { toast('warn', 'Enter description', ''); return; }
      payload = { description, ...(isFinite(value) && { value }), locale: LOCALE };
    }
    try {
      await api.loans.addCollateral(loanId, payload);
      el.remove();
      toast('success', 'Collateral added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// GUARANTORS TAB
// ============================================================
async function loadLoanGuarantors(c, loanId) {
  const wrap = c.querySelector('#ln-guar-wrap');
  wrap.innerHTML = `
    ${can('CREATE_GUARANTOR') ? `
      <div class="section-header mb-2">
        <h3>Guarantors</h3>
        <button class="btn-primary btn-sm" id="ln-add-guarantor"><i class="fa-solid fa-user-plus"></i> Add Guarantor</button>
      </div>` : '<h3>Guarantors</h3>'}
    <div id="ln-guar-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-guarantor')?.addEventListener('click', () =>
    openAddGuarantorModal(loanId, () => loadLoanGuarantors(c, loanId)));

  const listEl = wrap.querySelector('#ln-guar-list');
  try {
    const res = await api.loans.guarantors(loanId);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Type</th>
          <th class="text-right">Amount</th>
          <th>Mobile</th><th></th>
        </tr></thead>
        <tbody>${list.map(g => {
          const name = g.clientName || g.entityDisplayName ||
            [g.firstname, g.lastname].filter(Boolean).join(' ') || '—';
          return `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(g.guarantorType?.value || '—')}</td>
              <td class="text-right">${fmt(g.amount || 0)}</td>
              <td>${escapeHtml(g.mobileNumber || '—')}</td>
              <td class="text-right">
                ${can('DELETE_GUARANTOR') ? `<button class="btn-mini btn-danger" data-del-guar="${g.id}">Remove</button>` : ''}
              </td>
            </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No guarantors on file</div>';

    listEl.querySelectorAll('[data-del-guar]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove guarantor?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.loans.deleteGuarantor(loanId, b.dataset.delGuar);
        toast('success', 'Guarantor removed', '');
        loadLoanGuarantors(c, loanId);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddGuarantorModal(loanId, onSuccess) {
  // Pull guarantor type options + on-hold savings template if available
  let tpl = {};
  try { tpl = await api.loans.guarantorTemplate(loanId); } catch {}
  const guarantorTypeOptions = tpl?.guarantorTypeOptions || [
    { id: 1, name: 'Customer' },
    { id: 2, name: 'Staff' },
    { id: 3, name: 'External' }
  ];

  const mid = `ln-guar-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Add Guarantor</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Guarantor type *
            <select id="gar-type" class="form-control">
              ${guarantorTypeOptions.map(o => `<option value="${o.id}">${escapeHtml(o.name || o.value)}</option>`).join('')}
            </select>
          </label>

          <div id="gar-client-wrap" class="mt-3">
            <label>Search existing client
              <input id="gar-client-search" class="form-control" placeholder="Type to search…" autocomplete="off"/>
            </label>
            <input type="hidden" id="gar-client-id"/>
            <div id="gar-client-results" class="search-results-inline mt-1" style="display:none"></div>
          </div>

          <div id="gar-external-wrap" class="mt-3" style="display:none">
            <div class="form-grid">
              <label>First name * <input id="gar-fname" class="form-control"/></label>
              <label>Last name * <input id="gar-lname" class="form-control"/></label>
              <label>Mobile <input id="gar-mobile" class="form-control"/></label>
              <label>Address <input id="gar-address" class="form-control"/></label>
            </div>
          </div>

          <label class="mt-3">Amount guaranteed <input type="number" step="0.01" id="gar-amount" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="gar-save">Add Guarantor</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  // Toggle client vs external on guarantor type change
  el.querySelector('#gar-type').addEventListener('change', (e) => {
    const isExternal = parseInt(e.target.value) === 3;
    el.querySelector('#gar-client-wrap').style.display = isExternal ? 'none' : '';
    el.querySelector('#gar-external-wrap').style.display = isExternal ? '' : 'none';
  });

  // Client search autocomplete
  const searchEl = el.querySelector('#gar-client-search');
  const resultsEl = el.querySelector('#gar-client-results');
  const clientIdEl = el.querySelector('#gar-client-id');
  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = searchEl.value.trim();
    if (q.length < 2) { resultsEl.style.display = 'none'; return; }
    debounce = setTimeout(async () => {
      try {
        const res = await api.clients.list({ displayName: q, limit: 8 });
        const rows = Array.isArray(res) ? res : (res?.pageItems || []);
        resultsEl.innerHTML = rows.length ? rows.map(cl => `
          <button class="search-result" data-pick-id="${cl.id}" data-pick-name="${escapeHtml(cl.displayName)}">
            <div class="avatar">${ini(cl.displayName)}</div>
            <div>
              <strong>${escapeHtml(cl.displayName)}</strong>
              <div class="text-muted small">#${escapeHtml(cl.accountNo || cl.id)}</div>
            </div>
          </button>`).join('') : '<div class="search-empty">No results</div>';
        resultsEl.style.display = 'block';
        resultsEl.querySelectorAll('[data-pick-id]').forEach(b => b.addEventListener('click', () => {
          clientIdEl.value = b.dataset.pickId;
          searchEl.value = b.dataset.pickName;
          resultsEl.style.display = 'none';
        }));
      } catch {}
    }, 300);
  });

  el.querySelector('#gar-save').addEventListener('click', async () => {
    const typeVal = parseInt(el.querySelector('#gar-type').value);
    const amount = parseFloat(el.querySelector('#gar-amount').value);
    const payload = {
      guarantorTypeId: typeVal,
      ...(isFinite(amount) && { amount })
    };
    if (typeVal !== 3) {
      const cid = clientIdEl.value;
      if (!cid) { toast('warn', 'Search and select a client', ''); return; }
      payload.entityId = parseInt(cid);
    } else {
      const fname = el.querySelector('#gar-fname').value.trim();
      const lname = el.querySelector('#gar-lname').value.trim();
      if (!fname || !lname) { toast('warn', 'Enter first and last name', ''); return; }
      payload.firstname = fname;
      payload.lastname = lname;
      const mobile = el.querySelector('#gar-mobile').value.trim();
      if (mobile) payload.mobileNumber = mobile;
      const addr = el.querySelector('#gar-address').value.trim();
      if (addr) payload.addressLine1 = addr;
    }
    try {
      await api.loans.addGuarantor(loanId, payload);
      el.remove();
      toast('success', 'Guarantor added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// BUY-DOWN FEES / CAPITALIZED INCOME TAB
// ============================================================
async function loadLoanBuyDown(c, loanId) {
  const wrap = c.querySelector('#ln-bd-wrap');
  wrap.innerHTML = `
    <div class="grid-2">
      <div>
        <h3>Buy-down Fees</h3>
        <div class="text-muted small mb-2">
          Buy-down fees discount the borrower's effective interest rate, amortised across the loan term.
        </div>
        <div id="ln-bd-list"><div class="empty-state-row">Loading…</div></div>
      </div>
      <div>
        <h3>Capitalized Income</h3>
        <div class="text-muted small mb-2">
          Capitalized income lines are recognised over time on progressive loan products.
        </div>
        <div id="ln-ci-list"><div class="empty-state-row">Loading…</div></div>
      </div>
    </div>
    <h3 class="mt-4">Deferred Income</h3>
    <div id="ln-di-list"><div class="empty-state-row">Loading…</div></div>`;

  // Buy-down fees
  const bdEl = wrap.querySelector('#ln-bd-list');
  try {
    const r = await api.loans.buyDownFees(loanId);
    const list = Array.isArray(r) ? r : (r?.buyDownFees || r?.pageItems || []);
    bdEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Tx Date</th><th class="text-right">Amount</th>
          <th class="text-right">Amortised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(b => `
          <tr>
            <td>${fmtDate(b.transactionDate || b.date) || '—'}</td>
            <td class="text-right">${fmt(b.amount || 0)}</td>
            <td class="text-right">${fmt(b.amortisedAmount || b.amortized || 0)}</td>
            <td class="text-right">${fmt(b.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No buy-down fees recorded</div>';
  } catch {
    bdEl.innerHTML = '<div class="empty-state-row text-muted">Buy-down fees not enabled for this loan product</div>';
  }

  // Capitalized income
  const ciEl = wrap.querySelector('#ln-ci-list');
  try {
    const r = await api.loans.capitalizedIncomes(loanId);
    const list = Array.isArray(r) ? r : (r?.capitalizedIncomes || r?.pageItems || []);
    ciEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Tx Date</th><th class="text-right">Amount</th>
          <th class="text-right">Recognised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(i => `
          <tr>
            <td>${fmtDate(i.transactionDate || i.date) || '—'}</td>
            <td class="text-right">${fmt(i.amount || 0)}</td>
            <td class="text-right">${fmt(i.recognisedAmount || i.amortisedAmount || 0)}</td>
            <td class="text-right">${fmt(i.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No capitalized income</div>';
  } catch {
    ciEl.innerHTML = '<div class="empty-state-row text-muted">Capitalized income not enabled for this loan product</div>';
  }

  // Deferred income
  const diEl = wrap.querySelector('#ln-di-list');
  try {
    const r = await api.loans.deferredIncome(loanId);
    const list = Array.isArray(r) ? r : (r?.deferredIncomes || r?.pageItems || []);
    diEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Date</th><th class="text-right">Amount</th>
          <th class="text-right">Recognised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${fmtDate(d.date || d.transactionDate) || '—'}</td>
            <td class="text-right">${fmt(d.amount || 0)}</td>
            <td class="text-right">${fmt(d.recognisedAmount || 0)}</td>
            <td class="text-right">${fmt(d.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No deferred income</div>';
  } catch { diEl.innerHTML = '<div class="empty-state-row text-muted">Deferred income not available</div>'; }
}

// ============================================================
// ORIGINATORS TAB
// ============================================================
async function loadLoanOriginators(c, loanId) {
  const wrap = c.querySelector('#ln-orig-wrap');
  wrap.innerHTML = `
    ${can('CREATE_LOANORIGINATOR') ? `
      <div class="section-header mb-2">
        <h3>Loan Originators</h3>
        <button class="btn-primary btn-sm" id="ln-attach-orig"><i class="fa-solid fa-plus"></i> Attach Originator</button>
      </div>` : '<h3>Loan Originators</h3>'}
    <div class="text-muted small mb-2">
      Originators identify the entity that originally underwrote the loan — used for assignment, securitization, and reporting.
    </div>
    <div id="ln-orig-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-attach-orig')?.addEventListener('click', () =>
    openAttachOriginatorModal(loanId, () => loadLoanOriginators(c, loanId)));

  const listEl = wrap.querySelector('#ln-orig-list');
  try {
    const r = await api.loans.originators(loanId);
    const list = Array.isArray(r) ? r : (r?.originators || r?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Type</th>
          <th>External ID</th><th>Attached On</th><th></th>
        </tr></thead>
        <tbody>${list.map(o => `
          <tr>
            <td>${escapeHtml(o.name || o.originatorName || '—')}</td>
            <td>${escapeHtml(o.type?.value || o.originatorType || '—')}</td>
            <td>${escapeHtml(o.externalId || '—')}</td>
            <td>${fmtDate(o.attachedOn || o.createdOn) || '—'}</td>
            <td class="text-right">
              ${can('DELETE_LOANORIGINATOR') ? `<button class="btn-mini btn-danger" data-detach-orig="${o.originatorId || o.id}">Detach</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No originators attached to this loan</div>';

    listEl.querySelectorAll('[data-detach-orig]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Detach originator?', danger: true, confirmText: 'Detach' })) return;
      try {
        await api.loans.detachOriginator(loanId, b.dataset.detachOrig);
        toast('success', 'Originator detached', '');
        loadLoanOriginators(c, loanId);
      } catch (e) { toast('error', 'Detach failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch {
    listEl.innerHTML = '<div class="empty-state-row text-muted">Originators feature not available on this tenant</div>';
  }
}

async function openAttachOriginatorModal(loanId, onSuccess) {
  let originators = [];
  try {
    const r = await api.loanOriginators.list({ limit: 200 });
    originators = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `ln-attorig-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Attach Originator</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${originators.length ? `
            <label>Originator *
              <select id="ao-pick" class="form-control" required>
                <option value="">Select originator…</option>
                ${originators.map(o => `<option value="${o.id}">${escapeHtml(o.name || o.displayName || '—')}</option>`).join('')}
              </select>
            </label>
            <label class="mt-2">Attachment date <input type="date" id="ao-date" class="form-control" value="${today()}"/></label>
            <label class="mt-2">Note <textarea id="ao-note" class="form-control" rows="2"></textarea></label>
          ` : `
            <div class="msg-banner b-warning">
              No originators registered. Create one in Organization → Loan Originators first.
            </div>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          ${originators.length ? `<button class="btn-primary" id="ao-save">Attach</button>` : ''}
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ao-save')?.addEventListener('click', async () => {
    const originatorId = el.querySelector('#ao-pick').value;
    if (!originatorId) { toast('warn', 'Select an originator', ''); return; }
    const payload = {
      dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(el.querySelector('#ao-date').value && { attachedOn: el.querySelector('#ao-date').value }),
      ...(el.querySelector('#ao-note').value.trim() && { note: el.querySelector('#ao-note').value.trim() })
    };
    try {
      await api.loans.attachOriginator(loanId, originatorId, payload);
      el.remove();
      toast('success', 'Originator attached', '');
      onSuccess();
    } catch (e) { toast('error', 'Attach failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// EXTERNAL ASSET OWNERS TAB
// ============================================================
async function loadLoanEAO(c, loanId) {
  const wrap = c.querySelector('#ln-eao-wrap');
  wrap.innerHTML = `
    <div class="section-header mb-2">
      <h3>External Asset Owner Transfers</h3>
      <div>
        ${can('CREATE_EXTERNAL_ASSET_OWNER_TRANSFER') ? `<button class="btn-primary btn-sm" id="ln-eao-transfer"><i class="fa-solid fa-arrow-right-from-bracket"></i> Transfer to Owner</button>` : ''}
        ${can('CREATE_EXTERNAL_ASSET_OWNER_TRANSFER') ? `<button class="btn-secondary btn-sm" id="ln-eao-buyback"><i class="fa-solid fa-arrow-right-to-bracket"></i> Buy-back</button>` : ''}
      </div>
    </div>
    <div class="text-muted small mb-2">
      Securitization records — track loans that have been sold to external asset owners and later bought back.
    </div>
    <div id="ln-eao-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-eao-transfer')?.addEventListener('click', () =>
    openEAOTransferModal(loanId, 'transfer', () => loadLoanEAO(c, loanId)));
  wrap.querySelector('#ln-eao-buyback')?.addEventListener('click', () =>
    openEAOTransferModal(loanId, 'buyback', () => loadLoanEAO(c, loanId)));

  const listEl = wrap.querySelector('#ln-eao-list');
  try {
    const r = await api.loans.eaoList(loanId);
    const list = Array.isArray(r) ? r : (r?.transfers || r?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Transfer ID</th><th>Owner</th>
          <th>Effective Date</th><th>Status</th>
          <th class="text-right">Transfer Amount</th>
          <th>Type</th>
        </tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td>${escapeHtml(t.transferExternalId || t.id || '—')}</td>
            <td>${escapeHtml(t.owner?.name || t.externalAssetOwner?.name || '—')}</td>
            <td>${fmtDate(t.effectiveFrom || t.transferDate) || '—'}</td>
            <td>${sb(t.status?.value || t.status || '—')}</td>
            <td class="text-right">${fmt(t.purchasePriceRatio ? (t.totalPrincipalOutstanding * t.purchasePriceRatio) : t.amount || 0)}</td>
            <td>${escapeHtml(t.transferType || (t.buyBackDate ? 'Buy-back' : 'Transfer'))}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No external asset owner transfers</div>';
  } catch {
    listEl.innerHTML = '<div class="empty-state-row text-muted">External Asset Owners feature not enabled on this tenant</div>';
  }
}

async function openEAOTransferModal(loanId, mode, onSuccess) {
  let owners = [];
  try {
    const r = await api.externalAssetOwners.list({ limit: 200 });
    owners = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}

  const isBuyback = mode === 'buyback';
  const mid = `ln-eao-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isBuyback ? 'Buy-back Loan' : 'Transfer to External Asset Owner'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${!isBuyback ? `
            <label>External Asset Owner *
              <select id="eao-owner" class="form-control" required>
                <option value="">Select owner…</option>
                ${owners.map(o => `<option value="${o.externalId || o.id}">${escapeHtml(o.name || o.displayName || '—')}</option>`).join('')}
              </select>
            </label>
          ` : ''}
          <label class="mt-2">Settlement date * <input type="date" id="eao-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Purchase price ratio (0.0 - 1.0) <input type="number" step="0.0001" min="0" max="1" id="eao-ratio" class="form-control" value="1.0"/></label>
          <label class="mt-2">Transfer external ID
            <input id="eao-extid" class="form-control" placeholder="Auto-generated if blank"/>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="eao-save">${isBuyback ? 'Buy-back' : 'Transfer'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#eao-save').addEventListener('click', async () => {
    const settlementDate = el.querySelector('#eao-date').value;
    const ratio = parseFloat(el.querySelector('#eao-ratio').value);
    const extId = el.querySelector('#eao-extid')?.value.trim();
    const payload = {
      settlementDate, dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(isFinite(ratio) && { purchasePriceRatio: ratio }),
      ...(extId && { transferExternalId: extId })
    };
    if (!isBuyback) {
      const owner = el.querySelector('#eao-owner').value;
      if (!owner) { toast('warn', 'Select an owner', ''); return; }
      payload.ownerExternalId = owner;
    }
    try {
      if (isBuyback) await api.loans.eaoBuyBack(loanId, payload);
      else           await api.loans.eaoTransfer(loanId, payload);
      el.remove();
      toast('success', isBuyback ? 'Buy-back recorded' : 'Transfer initiated', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// NOTES TAB
// ============================================================
async function loadLoanNotes(c, loanId) {
  const wrap = c.querySelector('#ln-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="ln-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_NOTE') ? `
      <div class="mt-3">
        <textarea id="ln-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="ln-note-save"><i class="fa-solid fa-plus"></i> Add Note</button>
      </div>` : ''}`;

  wrap.querySelector('#ln-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#ln-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try {
      await api.notes.create('loans', loanId, { note });
      inp.value = '';
      loadLoanNotes(c, loanId);
      toast('success', 'Note added', '');
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#ln-note-list');
  try {
    const notes = await api.notes.list('loans', loanId);
    const list = Array.isArray(notes) ? notes : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Note</th><th>By</th><th>Date</th></tr></thead>
        <tbody>${list.map(n => `
          <tr>
            <td>${escapeHtml(n.note || '—')}</td>
            <td>${escapeHtml(n.createdByUsername || '—')}</td>
            <td>${fmtDate(n.createdOn) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No notes yet</div>';
  } catch { listEl.innerHTML = '<div class="text-error">Could not load notes</div>'; }
}

// ============================================================
// DOCUMENTS TAB
// ============================================================
async function loadLoanDocuments(c, loanId) {
  const wrap = c.querySelector('#ln-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="ln-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="ln-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#ln-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file'); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload('loans', loanId, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadLoanDocuments(c, loanId);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#ln-doc-list');
  try {
    const docs = await api.documents.list('loans', loanId);
    const list = Array.isArray(docs) ? docs : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Description</th><th>Type</th><th></th></tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${escapeHtml(d.name || '—')}</td>
            <td>${escapeHtml(d.description || '—')}</td>
            <td>${escapeHtml(d.type || d.fileName?.split('.').pop() || '—')}</td>
            <td class="text-right">
              <button class="btn-mini" data-doc-dl="${d.id}">Download</button>
              ${can('DELETE_DOCUMENT') ? `<button class="btn-mini btn-danger" data-doc-del="${d.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No documents yet</div>';

    listEl.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.documents.download('loans', loanId, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `loan-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.documents.delete('loans', loanId, b.dataset.docDel);
        toast('success', 'Document deleted', '');
        loadLoanDocuments(c, loanId);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}