import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · savings.js — Full savings lifecycle (permission-gated, tabbed) */
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
        <h1>Savings</h1>
        <div class="text-muted">Savings accounts portfolio</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_SAVINGSACCOUNT') ? `<button class="btn-primary" data-modal="newSavingsModal"><i class="fa-solid fa-plus"></i> New Savings</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Total Accounts</div><div class="kpi-value" id="sv-count">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Balance</div><div class="kpi-value" id="sv-balance">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Balance</div><div class="kpi-value" id="sv-avg">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Records</div><div class="kpi-value" id="sv-total">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="sv-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
        <select id="sv-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="closed">Closed</option>
        </select>
        <select id="sv-product" class="form-control"><option value="">All Products</option></select>
        <button class="btn-secondary" id="sv-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Client</th><th>Product</th>
          <th class="text-right">Balance</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="sv-rows">
          <tr><td colspan="6" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="sv-pagination" class="pagination-bar"></div>
    </div>`;

  api.savingsProducts.list().then(p => {
    const sel = c.querySelector('#sv-product');
    (Array.isArray(p) ? p : []).forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id; opt.textContent = prod.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allAccounts = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  async function load(offset = 0) {
    c.querySelector('#sv-rows').innerHTML =
      '<tr><td colspan="6" class="empty-state-row">Loading…</td></tr>';
    try {
      const status = c.querySelector('#sv-status')?.value;
      const prod   = c.querySelector('#sv-product')?.value;
      const params = { limit: PAGE_SIZE, offset };
      if (status) params.status = status;
      if (prod)   params.productId = prod;

      const res = await api.savings.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;

      const q = c.querySelector('#sv-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(s =>
        (s.accountNo || '').toLowerCase().includes(q) ||
        (s.clientName || '').toLowerCase().includes(q));

      const total = list.reduce((sum, a) => sum + (a.summary?.accountBalance || 0), 0);
      allAccounts = list;
      currentOffset = offset;

      c.querySelector('#sv-count').textContent   = num(list.length);
      c.querySelector('#sv-total').textContent   = num(totalRecords);
      c.querySelector('#sv-balance').textContent = fmt(total);
      c.querySelector('#sv-avg').textContent     = fmt(list.length ? total / list.length : 0);

      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#sv-rows').innerHTML =
        `<tr><td colspan="6" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#sv-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="sv-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="sv-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#sv-prev')?.addEventListener('click', () => load(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#sv-next')?.addEventListener('click', () => load(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#sv-rows').innerHTML = rows.map(s => {
      const status     = s.status?.value || '—';
      const isPending  = status === 'Submitted and pending approval';
      const isApproved = status === 'Approved';
      const isActive   = status === 'Active';
      return `
        <tr>
          <td>${s.id}">${escapeHtml(s.accountNo || `#${s.id}`)}</a></td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.savingsProductName || '—')}</td>
          <td class="text-right">${fmt(s.summary?.accountBalance ?? 0)}</td>
          <td>${sb(status)}</td>
          <td class="text-right">
            ${isPending  && can('APPROVE_SAVINGSACCOUNT')  ? `<button class="btn-mini btn-success" data-sv-approve="${s.id}">Approve</button>`  : ''}
            ${isApproved && can('ACTIVATE_SAVINGSACCOUNT') ? `<button class="btn-mini btn-success" data-sv-activate="${s.id}">Activate</button>` : ''}
            ${isActive   && can('DEPOSIT_SAVINGSACCOUNT')  ? `<button class="btn-mini" data-sv-deposit="${s.id}">Deposit</button>` : ''}
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state-row">No accounts found</td></tr>';

    c.querySelectorAll('[data-sv-deposit]').forEach(b => b.addEventListener('click', () => {
      const modal = openModal('savingsDepositModal');
      if (modal) modal.dataset.accountId = b.dataset.svDeposit;
    }));
    c.querySelectorAll('[data-sv-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.savings.approve(b.dataset.svApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Account approved', `#${b.dataset.svApprove}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-sv-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.savings.activate(b.dataset.svActivate, {
          activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Account activated', `#${b.dataset.svActivate}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#sv-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#sv-status', '#sv-product'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#sv-export').addEventListener('click', () => {
    const rows = allAccounts.map(s =>
      [s.accountNo, s.clientName, s.savingsProductName, s.summary?.accountBalance ?? 0, s.status?.value].join(','));
    const csv = ['Account,Client,Product,Balance,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'savings.csv'; a.click();
    toast('success', 'Exported', 'savings.csv downloaded');
  });
}

// ============================================================
// DETAIL VIEW (tabbed, permission-gated)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No account selected</div>'; return; }

  try {
    const s = await api.savings.get(id, { associations: 'all' });
    const status = s.status?.value || '';
    const sub = s.subStatus?.value || '';

    const isPending  = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive   = status === 'Active';
    const isClosed   = status === 'Closed';
    const isBlocked  = sub === 'Block' || sub === 'BlockDebit' || sub === 'BlockCredit';
    const isDepBlocked  = sub === 'BlockCredit' || sub === 'Block';
    const isWdrBlocked  = sub === 'BlockDebit'  || sub === 'Block';

    // Permission-gated toolbar flags
    const canApprove        = isPending  && can('APPROVE_SAVINGSACCOUNT');
    const canUndoApproval   = isApproved && can('APPROVALUNDO_SAVINGSACCOUNT');
    const canReject         = isPending  && can('REJECT_SAVINGSACCOUNT');
    const canWithdrawApp    = isPending  && can('WITHDRAW_SAVINGSACCOUNT');
    const canActivate       = isApproved && can('ACTIVATE_SAVINGSACCOUNT');
    const canDeposit        = isActive   && can('DEPOSIT_SAVINGSACCOUNT');
    const canWithdraw       = isActive   && can('WITHDRAWAL_SAVINGSACCOUNT');
    const canHold           = isActive   && can('HOLDAMOUNT_SAVINGSACCOUNT');
    const canBlock          = isActive   && can('BLOCK_SAVINGSACCOUNT');
    const canClose          = isActive   && can('CLOSE_SAVINGSACCOUNT');
    const canPostInterest   = isActive   && can('POSTINTEREST_SAVINGSACCOUNT');
    const canCalcInterest   = isActive   && can('CALCULATEINTEREST_SAVINGSACCOUNT');
    const canApplyAnnualFee = isActive   && can('APPLYANNUALFEE_SAVINGSACCOUNT');
    const canAssignStaff    = isActive   && can('ASSIGNSTAFF_SAVINGSACCOUNT');
    const canEdit           = (isPending || isApproved) && can('UPDATE_SAVINGSACCOUNT');
    const canDelete         = (isPending || status === 'Rejected') && can('DELETE_SAVINGSACCOUNT');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>Savings #${escapeHtml(s.accountNo || id)}</h1>
          <div class="text-muted">
            ${s.clientId ? `${s.clientId}">${escapeHtml(s.clientName || '—')}</a>` : escapeHtml(s.clientName || s.groupName || '—')}
            · ${escapeHtml(s.savingsProductName || '—')}
            · ${sb(status || '—')}
            ${sub ? ` · sub: ${sb(sub)}` : ''}
            ${s.externalId ? ` · ext: ${escapeHtml(s.externalId)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-savings"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit             ? `<button class="btn-secondary" id="btn-sv-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canApprove          ? `<button class="btn-success"   id="btn-sv-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${canUndoApproval     ? `<button class="btn-warning"   id="btn-sv-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${canReject           ? `<button class="btn-warning"   id="btn-sv-reject"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdrawApp      ? `<button class="btn-secondary" id="btn-sv-withdraw-app"><i class="fa-solid fa-rotate-left"></i> Withdraw</button>` : ''}
          ${canActivate         ? `<button class="btn-success"   id="btn-sv-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canDeposit          ? `<button class="btn-primary"   id="btn-sv-deposit"><i class="fa-solid fa-arrow-down"></i> Deposit</button>` : ''}
          ${canWithdraw         ? `<button class="btn-primary"   id="btn-sv-withdraw"><i class="fa-solid fa-arrow-up"></i> Withdraw</button>` : ''}
          ${canHold             ? `<button class="btn-secondary" id="btn-sv-hold"><i class="fa-solid fa-lock"></i> Hold Amount</button>` : ''}
          ${canBlock && !isBlocked ? `<button class="btn-secondary" id="btn-sv-block"><i class="fa-solid fa-ban"></i> Block</button>` : ''}
          ${canBlock &&  isBlocked && sub === 'Block' ? `<button class="btn-secondary" id="btn-sv-unblock"><i class="fa-solid fa-unlock"></i> Unblock</button>` : ''}
          ${canBlock && !isDepBlocked ? `<button class="btn-secondary" id="btn-sv-block-dep"><i class="fa-solid fa-arrow-down"></i><i class="fa-solid fa-ban"></i> Block Deposit</button>` : ''}
          ${canBlock &&  isDepBlocked ? `<button class="btn-secondary" id="btn-sv-unblock-dep"><i class="fa-solid fa-unlock"></i> Unblock Deposit</button>` : ''}
          ${canBlock && !isWdrBlocked ? `<button class="btn-secondary" id="btn-sv-block-wd"><i class="fa-solid fa-arrow-up"></i><i class="fa-solid fa-ban"></i> Block Withdrawal</button>` : ''}
          ${canBlock &&  isWdrBlocked ? `<button class="btn-secondary" id="btn-sv-unblock-wd"><i class="fa-solid fa-unlock"></i> Unblock Withdrawal</button>` : ''}
          ${canCalcInterest     ? `<button class="btn-secondary" id="btn-sv-calc-int"><i class="fa-solid fa-calculator"></i> Calc Interest</button>` : ''}
          ${canPostInterest     ? `<button class="btn-secondary" id="btn-sv-post-int"><i class="fa-solid fa-percent"></i> Post Interest</button>` : ''}
          ${canPostInterest     ? `<button class="btn-secondary" id="btn-sv-post-int-asof"><i class="fa-solid fa-calendar-day"></i> Post Interest As-On</button>` : ''}
          ${canApplyAnnualFee   ? `<button class="btn-secondary" id="btn-sv-annual-fee"><i class="fa-solid fa-money-bill-wave"></i> Apply Annual Fees</button>` : ''}
          ${canAssignStaff      ? `<button class="btn-secondary" id="btn-sv-assign-staff"><i class="fa-solid fa-user-tag"></i> Staff</button>` : ''}
          <button class="btn-secondary" id="btn-sv-export"><i class="fa-solid fa-download"></i> Statement</button>
          ${canClose            ? `<button class="btn-danger"    id="btn-sv-close"><i class="fa-solid fa-box-archive"></i> Close</button>` : ''}
          ${canDelete           ? `<button class="btn-danger"    id="btn-sv-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="sv-tabs">
          <button class="tab" data-svtab="overview">Overview</button>
          <button class="tab" data-svtab="transactions">Transactions</button>
          <button class="tab" data-svtab="charges">Charges</button>
          ${can('READ_STANDINGINSTRUCTION') ? `<button class="tab" data-svtab="si">Standing Instructions</button>` : ''}
          <button class="tab" data-svtab="onhold">On-hold Funds</button>
          ${can('READ_NOTE') ? `<button class="tab" data-svtab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-svtab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-svpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Account Details</h3>
              <dl class="dl-grid">
                <dt>Status</dt><dd>${sb(status || '—')}</dd>
                <dt>Sub-status</dt><dd>${sb(sub || 'None')}</dd>
                <dt>Officer</dt><dd>${escapeHtml(s.fieldOfficerName || s.savingsOfficerName || 'Unassigned')}</dd>
                <dt>Product</dt><dd>${escapeHtml(s.savingsProductName || '—')}</dd>
                <dt>Currency</dt><dd>${escapeHtml(s.currency?.code || '—')}</dd>
                <dt>Nominal Rate</dt><dd>${num(s.nominalAnnualInterestRate || 0)}%</dd>
                <dt>Compounding</dt><dd>${escapeHtml(s.interestCompoundingPeriodType?.value || '—')}</dd>
                <dt>Posting</dt><dd>${escapeHtml(s.interestPostingPeriodType?.value || '—')}</dd>
                <dt>External ID</dt><dd>${escapeHtml(s.externalId || '—')}</dd>
              </dl>
            </div>
            <div>
              <h3>Balances</h3>
              <dl class="dl-grid">
                <dt>Account Balance</dt><dd class="text-right">${fmt(s.summary?.accountBalance ?? 0)}</dd>
                <dt>Available</dt><dd class="text-right">${fmt(s.summary?.availableBalance ?? 0)}</dd>
                <dt>On Hold</dt><dd class="text-right">${fmt(s.summary?.onHoldFunds ?? 0)}</dd>
                <dt>Total Deposits</dt><dd class="text-right">${fmt(s.summary?.totalDeposits ?? 0)}</dd>
                <dt>Total Withdrawals</dt><dd class="text-right">${fmt(s.summary?.totalWithdrawals ?? 0)}</dd>
                <dt>Total Interest Earned</dt><dd class="text-right">${fmt(s.summary?.totalInterestEarned ?? 0)}</dd>
                <dt>Total Interest Posted</dt><dd class="text-right">${fmt(s.summary?.totalInterestPosted ?? 0)}</dd>
                <dt>Total Fees</dt><dd class="text-right">${fmt(s.summary?.totalFeeCharge ?? 0)}</dd>
              </dl>
              <h3 class="mt-3">Timeline</h3>
              <dl class="dl-grid">
                <dt>Submitted</dt><dd>${fmtDate(s.timeline?.submittedOnDate) || '—'}</dd>
                <dt>Approved</dt><dd>${fmtDate(s.timeline?.approvedOnDate) || '—'}</dd>
                <dt>Activated</dt><dd>${fmtDate(s.timeline?.activatedOnDate) || '—'}</dd>
                <dt>Closed</dt><dd>${fmtDate(s.timeline?.closedOnDate) || '—'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <!-- Lazy-load panels -->
        <div class="tab-panel" data-svpanel="transactions" hidden><div id="sv-tx-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-svpanel="charges"      hidden><div id="sv-charges-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-svpanel="si"           hidden><div id="sv-si-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-svpanel="onhold"       hidden><div id="sv-onhold-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-svpanel="notes"        hidden><div id="sv-notes-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-svpanel="documents"    hidden><div id="sv-docs-wrap"><div class="empty-state-row">Loading…</div></div></div>
      </div>`;

    // -------- Tab switching with deep-link --------
    const tabs = c.querySelectorAll('[data-svtab]');
    const panels = c.querySelectorAll('[data-svpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      transactions: () => loadSavingsTransactions(c, id),
      charges:      () => loadSavingsCharges(c, id, s),
      si:           () => (typeof loadSavingsSI === 'function') && loadSavingsSI(c, id, s),
      onhold:       () => (typeof loadOnHoldFunds === 'function') && loadOnHoldFunds(c, id),
      notes:        () => loadSavingsNotes(c, id),
      documents:    () => loadSavingsDocuments(c, id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.svtab === name));
      panels.forEach(p => p.hidden = p.dataset.svpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `savings?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.svtab)));
    switchTab(initialTab || 'overview');

    // -------- Back --------
    c.querySelector('#back-to-savings').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('savings'));
    });

    // -------- Toolbar (lifecycle) --------
    c.querySelector('#btn-sv-edit')?.addEventListener('click', () =>
      (typeof openEditSavingsModal === 'function') && openEditSavingsModal(s));
    c.querySelector('#btn-sv-approve')?.addEventListener('click', () =>
      (typeof openApproveSavingsModal === 'function') && openApproveSavingsModal(id));
    c.querySelector('#btn-sv-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', confirmText: 'Undo Approval' })) return;
      try { await api.savings.undoApproval(id); toast('success', 'Approval undone', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-sv-reject')?.addEventListener('click', () =>
      openSavingsSimpleCmd({ id, command: 'reject', label: 'Reject Application', dateField: 'rejectedOnDate' }));
    c.querySelector('#btn-sv-withdraw-app')?.addEventListener('click', () =>
      openSavingsSimpleCmd({ id, command: 'withdrawnByApplicant', label: 'Withdraw Application', dateField: 'withdrawnOnDate' }));
    c.querySelector('#btn-sv-activate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate account?', confirmText: 'Activate' })) return;
      try {
        await api.savings.activate(id, { activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Account activated', `#${id}`);
        location.reload();
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });

    // -------- Toolbar (transactions) --------
    c.querySelector('#btn-sv-deposit')?.addEventListener('click', () => {
      const modal = openModal('savingsDepositModal');
      if (modal) modal.dataset.accountId = id;
    });
    c.querySelector('#btn-sv-withdraw')?.addEventListener('click', () =>
      openSavingsTransactionModal({ id, type: 'withdrawal', label: 'Withdraw' }));
    c.querySelector('#btn-sv-hold')?.addEventListener('click', () => openHoldModal(id));

    // -------- Toolbar (block / unblock) --------
    const blockBtns = [
      ['#btn-sv-block',         'block',         'Account blocked'],
      ['#btn-sv-unblock',       'unblock',       'Account unblocked'],
      ['#btn-sv-block-dep',     'blockCredit',   'Deposits blocked'],
      ['#btn-sv-unblock-dep',   'unblockCredit', 'Deposits unblocked'],
      ['#btn-sv-block-wd',      'blockDebit',    'Withdrawals blocked'],
      ['#btn-sv-unblock-wd',    'unblockDebit',  'Withdrawals unblocked']
    ];
    blockBtns.forEach(([sel, method, successMsg]) => {
      c.querySelector(sel)?.addEventListener('click', async () => {
        if (!await confirm({ title: 'Confirm action?', confirmText: 'Confirm' })) return;
        try { await api.savings[method](id); toast('success', successMsg, ''); location.reload(); }
        catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
      });
    });

    // -------- Toolbar (interest / fees / staff) --------
    c.querySelector('#btn-sv-calc-int')?.addEventListener('click', async () => {
      try { await api.savings.calculateInterest(id); toast('success', 'Interest calculated', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-sv-post-int')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Post interest today?', confirmText: 'Post' })) return;
      try { await api.savings.postInterest(id); toast('success', 'Interest posted', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-sv-post-int-asof')?.addEventListener('click', () =>
      (typeof openPostInterestAsOnModal === 'function') && openPostInterestAsOnModal(id));
    c.querySelector('#btn-sv-annual-fee')?.addEventListener('click', () =>
      (typeof openAnnualFeesModal === 'function') && openAnnualFeesModal(id));
    c.querySelector('#btn-sv-assign-staff')?.addEventListener('click', () =>
      (typeof openSavingsAssignStaffModal === 'function') && openSavingsAssignStaffModal(id, s));

    // -------- Toolbar (close / delete / export) --------
    c.querySelector('#btn-sv-close')?.addEventListener('click', () => openSavingsCloseModal(id));
    c.querySelector('#btn-sv-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: `Permanently delete account #${s.accountNo || id}?`,
        message: 'This cannot be undone.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.savings.delete(id);
        toast('success', 'Account deleted', `#${id}`);
        import('../router.js').then(r => r.navigate('savings'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-sv-export')?.addEventListener('click', () => exportStatement(s, id));

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load account</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// TRANSACTIONS TAB (with adjust/undo per row)
// ============================================================
async function loadSavingsTransactions(c, id) {
  const wrap = c.querySelector('#sv-tx-wrap');
  wrap.innerHTML = `
    <div class="filter-bar mb-2">
      <select id="sv-tx-filter" class="form-control">
        <option value="">All transaction types</option>
        <option value="deposit">Deposit</option>
        <option value="withdrawal">Withdrawal</option>
        <option value="interest">Interest Posting</option>
        <option value="charge">Fee/Charge</option>
        <option value="hold">Hold/Release</option>
      </select>
      <button class="btn-secondary" id="sv-tx-reload"><i class="fa-solid fa-rotate"></i> Refresh</button>
    </div>
    <div id="sv-tx-list"><div class="empty-state-row">Loading…</div></div>`;

  async function reload() {
    const listEl = wrap.querySelector('#sv-tx-list');
    listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const res = await api.savings.transactions(id);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      const f = wrap.querySelector('#sv-tx-filter').value;
      if (f) list = list.filter(t => (t.transactionType?.value || '').toLowerCase().includes(f));
      list = [...list].reverse();

      listEl.innerHTML = list.length ? `
        <table class="table">
          <thead><tr>
            <th>#</th><th>Date</th><th>Type</th>
            <th class="text-right">Amount</th>
            <th class="text-right">Running Balance</th>
            <th>Receipt</th><th>State</th><th></th>
          </tr></thead>
          <tbody>${list.map(t => {
            const d = Array.isArray(t.date) ? t.date.join('-') : t.date;
            const reversed = t.reversed || t.manuallyReversed;
            return `
              <tr class="${reversed ? 'text-muted' : ''}">
                <td>${t.id}</td>
                <td>${escapeHtml(d || '—')}</td>
                <td>${escapeHtml(t.transactionType?.value || '—')}</td>
                <td class="text-right">${fmt(t.amount || 0)}</td>
                <td class="text-right">${fmt(t.runningBalance || 0)}</td>
                <td>${escapeHtml(t.paymentDetail?.receiptNumber || '—')}</td>
                <td>${reversed ? sb('Reversed') : sb('Posted')}</td>
                <td class="text-right">
                  ${!reversed && can('ADJUSTTRANSACTION_SAVINGSACCOUNT') ?
                    `<button class="btn-mini" data-adj-tx="${t.id}">Adjust</button>` : ''}
                  ${!reversed && can('UNDOTRANSACTION_SAVINGSACCOUNT') ?
                    `<button class="btn-mini btn-warning" data-undo-tx="${t.id}">Undo</button>` : ''}
                  ${t.transactionType?.value === 'Amount on Hold' && can('RELEASEAMOUNT_SAVINGSACCOUNT') ?
                    `<button class="btn-mini btn-success" data-release-tx="${t.id}">Release</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No transactions match</div>';

      listEl.querySelectorAll('[data-undo-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Undo transaction?', message: 'Reverses the posting; balances restored.', danger: true, confirmText: 'Undo' })) return;
        try { await api.savings.undoTransaction(id, b.dataset.undoTx); toast('success', 'Transaction undone', ''); reload(); }
        catch (e) { toast('error', 'Undo failed', e.detail?.defaultUserMessage || e.message); }
      }));
      listEl.querySelectorAll('[data-adj-tx]').forEach(b => b.addEventListener('click', () =>
        (typeof openAdjustSavingsTxModal === 'function') && openAdjustSavingsTxModal(id, b.dataset.adjTx, reload)));
      listEl.querySelectorAll('[data-release-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Release held amount?', confirmText: 'Release' })) return;
        try { await api.savings.releaseAmount(id, b.dataset.releaseTx); toast('success', 'Amount released', ''); reload(); }
        catch (e) { toast('error', 'Release failed', e.detail?.defaultUserMessage || e.message); }
      }));
    } catch (e) {
      listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }

  wrap.querySelector('#sv-tx-filter').addEventListener('change', reload);
  wrap.querySelector('#sv-tx-reload').addEventListener('click', reload);
  reload();
}

// ============================================================
// CHARGES TAB (with apply/pay/waive/inactivate/delete)
// ============================================================
async function loadSavingsCharges(c, id, savings) {
  const wrap = c.querySelector('#sv-charges-wrap');
  wrap.innerHTML = `
    ${can('CREATE_SAVINGSACCOUNTCHARGE') ? `
      <div class="section-header mb-2">
        <h3>Account Charges</h3>
        <button class="btn-primary btn-sm" id="sv-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>
      </div>` : '<h3>Account Charges</h3>'}
    <div id="sv-charges-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#sv-add-charge')?.addEventListener('click', () =>
    (typeof openApplySavingsChargeModal === 'function') && openApplySavingsChargeModal(id, () => loadSavingsCharges(c, id, savings)));

  const listEl = wrap.querySelector('#sv-charges-list');
  try {
    const res = await api.savings.charges(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Charge</th><th>Timing</th><th>Due Date</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Paid</th>
          <th class="text-right">Waived</th>
          <th class="text-right">Outstanding</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(ch => `
          <tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td>${escapeHtml(ch.chargeTimeType?.value || '—')}</td>
            <td>${fmtDate(ch.dueDate)}</td>
            <td class="text-right">${fmt(ch.amount || 0)}</td>
            <td class="text-right">${fmt(ch.amountPaid || 0)}</td>
            <td class="text-right">${fmt(ch.amountWaived || 0)}</td>
            <td class="text-right">${fmt(ch.amountOutstanding || 0)}</td>
            <td>${sb(ch.paid ? 'Paid' : ch.waived ? 'Waived' : !ch.active ? 'Inactive' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.paid && !ch.waived && ch.active && can('PAY_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.paid && !ch.waived && ch.active && can('WAIVE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${!ch.paid && ch.active && can('INACTIVATE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini" data-inactivate-charge="${ch.id}">Inactivate</button>` : ''}
              ${can('DELETE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges on this account</div>';

    listEl.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      (typeof openPaySavingsChargeModal === 'function') && openPaySavingsChargeModal(id, b.dataset.payCharge, () => loadSavingsCharges(c, id, savings))));
    listEl.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await api.savings.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Waived', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-inactivate-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Inactivate charge?', confirmText: 'Inactivate' })) return;
      try { await api.savings.inactivateCharge(id, b.dataset.inactivateCharge); toast('success', 'Inactivated', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.savings.deleteCharge(id, b.dataset.delCharge); toast('success', 'Deleted', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// NOTES TAB
// ============================================================
async function loadSavingsNotes(c, id) {
  const wrap = c.querySelector('#sv-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="sv-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_NOTE') ? `
      <div class="mt-3">
        <textarea id="sv-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="sv-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>` : ''}`;

  wrap.querySelector('#sv-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#sv-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try { await api.notes.create('savings', id, { note }); inp.value = ''; loadSavingsNotes(c, id); toast('success', 'Note added', ''); }
    catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#sv-note-list');
  try {
    const notes = await api.notes.list('savings', id);
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
async function loadSavingsDocuments(c, id) {
  const wrap = c.querySelector('#sv-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="sv-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="sv-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#sv-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file'); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload('savingsaccounts', id, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadSavingsDocuments(c, id);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#sv-doc-list');
  try {
    const docs = await api.documents.list('savingsaccounts', id);
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
        const res = await api.documents.download('savingsaccounts', id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `savings-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.documents.delete('savingsaccounts', id, b.dataset.docDel);
        toast('success', 'Deleted', '');
        loadSavingsDocuments(c, id);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// EXPORT STATEMENT
// ============================================================
async function exportStatement(s, id) {
  let txs = s.transactions || [];
  if (!txs.length) {
    try {
      const res = await api.savings.transactions(id);
      txs = Array.isArray(res) ? res : (res?.pageItems || []);
    } catch {}
  }
  if (!txs.length) { toast('warn', 'No transactions', 'Nothing to export'); return; }
  const rows = [['Date', 'Type', 'Amount', 'Running Balance', 'Receipt No']];
  txs.forEach(t => {
    const d = Array.isArray(t.date) ? t.date.join('-') : (t.date || '');
    rows.push([d, t.transactionType?.value || '', t.amount || 0, t.runningBalance || 0, t.paymentDetail?.receiptNumber || '']);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `savings_${s.accountNo || id}_statement.csv`;
  a.click();
  toast('success', 'Statement exported', `${txs.length} transactions`);
}

// ============================================================
// TOOLBAR MODALS (kept from old file, lightly refactored)
// ============================================================
function openSavingsSimpleCmd({ id, command, label, dateField }) {
  // Default the date field name based on the command
  if (!dateField) {
    if (command === 'reject') dateField = 'rejectedOnDate';
    else if (command === 'withdrawnByApplicant') dateField = 'withdrawnOnDate';
    else dateField = 'transactionDate';
  }

  const mid = 'sv-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="svc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="svc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="svc-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  el.querySelector('#svc-save').addEventListener('click', async () => {
    // Build the payload without computed properties — works around the chat bracket issue
    const payload = {};
    payload[dateField] = el.querySelector('#svc-date').value;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;

    const note = el.querySelector('#svc-note').value.trim();
    if (note) payload.note = note;

    try {
      await api.savings.command(id, command, payload);
      el.remove();
      toast('success', label + ' successful', '#' + id);
      location.reload();
    } catch (e) {
      toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

function openSavingsTransactionModal({ id, type, label }) {
  const mid = `sv-tx-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="svtx-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="svtx-amount" class="form-control" required/></label>
          <label class="mt-2">Payment type
            <select id="svtx-paytype" class="form-control"><option value="">— Cash —</option></select>
          </label>
          <label class="mt-2">Receipt number <input id="svtx-receipt" class="form-control"/></label>
          <label class="mt-2">Note <textarea id="svtx-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="svtx-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#svtx-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.id; opt.textContent = pt.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#svtx-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#svtx-date').value;
    const transactionAmount = parseFloat(el.querySelector('#svtx-amount').value);
    if (isNaN(transactionAmount)) { toast('warn', 'Enter amount', ''); return; }
    const paymentTypeId = el.querySelector('#svtx-paytype').value;
    const receiptNumber = el.querySelector('#svtx-receipt').value.trim();
    const note = el.querySelector('#svtx-note').value.trim();
    const payload = {
      transactionDate, transactionAmount,
      dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) }),
      ...(receiptNumber && { receiptNumber }),
      ...(note && { note })
    };
    try {
      if (type === 'deposit')    await api.savings.deposit(id, payload);
      else                       await api.savings.withdrawal(id, payload);
      el.remove();
      toast('success', `${label} successful`, fmt(transactionAmount));
      location.reload();
    } catch (e) { toast('error', `${label} failed`, e.detail?.defaultUserMessage || e.message); }
  });
}

function openHoldModal(id) {
  const mid = `sv-hold-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Hold Amount</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount to hold * <input type="number" step="0.01" id="hold-amount" class="form-control" required/></label>
          <label class="mt-2">Reason <textarea id="hold-reason" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="hold-save">Hold Amount</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#hold-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#hold-amount').value);
    const reason = el.querySelector('#hold-reason').value.trim();
    if (isNaN(amount)) { toast('warn', 'Enter an amount', ''); return; }
    try {
      await api.savings.holdAmount(id, {
        transactionAmount: amount,
        transactionDate: today(),
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(reason && { reasonForBlock: reason })
      });
      el.remove();
      toast('success', 'Amount held', fmt(amount));
      location.reload();
    } catch (e) { toast('error', 'Hold failed', e.detail?.defaultUserMessage || e.message); }
  });
}

function openSavingsCloseModal(id) {
  const mid = `sv-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="svclose-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Payment type
            <select id="svclose-paytype" class="form-control"><option value="">— Cash —</option></select>
          </label>
          <label class="mt-2">Note <textarea id="svclose-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="svclose-save">Close Account</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#svclose-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.id; opt.textContent = pt.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#svclose-save').addEventListener('click', async () => {
    const closedOnDate = el.querySelector('#svclose-date').value;
    const paymentTypeId = el.querySelector('#svclose-paytype').value;
    const note = el.querySelector('#svclose-note').value.trim();
    try {
      await api.savings.close(id, {
        closedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) }),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Account closed', `#${id}`);
      import('../router.js').then(r => r.navigate('savings'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// EDIT SAVINGS ACCOUNT MODAL (audit gap #5)
// ============================================================
async function openEditSavingsModal(s) {
  const mid = `sv-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Nominal annual interest rate
              <input type="number" step="0.01" id="ed-rate" class="form-control" value="${s.nominalAnnualInterestRate ?? ''}"/>
            </label>
            <label>Min required opening balance
              <input type="number" step="0.01" id="ed-min-open" class="form-control" value="${s.minRequiredOpeningBalance ?? ''}"/>
            </label>
            <label>Withdrawal fee for transfers
              <select id="ed-wfee" class="form-control">
                <option value="">— No change —</option>
                <option value="true"  ${s.withdrawalFeeForTransfers ? 'selected' : ''}>Yes</option>
                <option value="false" ${s.withdrawalFeeForTransfers === false ? 'selected' : ''}>No</option>
              </select>
            </label>
            <label>External ID <input id="ed-extid" class="form-control" value="${escapeHtml(s.externalId || '')}"/></label>
            <label class="full">Sub-account note <textarea id="ed-note" class="form-control" rows="2"></textarea></label>
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Most fields locked once activated. Edit only available pre-activation.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ed-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ed-save').addEventListener('click', async () => {
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
    const rate = parseFloat(el.querySelector('#ed-rate').value);
    if (isFinite(rate))   payload.nominalAnnualInterestRate = rate;
    const minOpen = parseFloat(el.querySelector('#ed-min-open').value);
    if (isFinite(minOpen)) payload.minRequiredOpeningBalance = minOpen;
    const wfee = el.querySelector('#ed-wfee').value;
    if (wfee !== '')      payload.withdrawalFeeForTransfers = wfee === 'true';
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext)              payload.externalId = ext;
    const note = el.querySelector('#ed-note').value.trim();
    if (note)             payload.note = note;
    try {
      await api.savings.update(s.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      location.reload();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPROVE SAVINGS MODAL (rich, vs. one-click button)
// ============================================================
function openApproveSavingsModal(id) {
  const mid = `sv-app-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Approve Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Approved on * <input type="date" id="ap-date" class="form-control" value="${today()}" required/></label>
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
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const note = el.querySelector('#ap-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.savings.approve(id, payload);
      el.remove();
      toast('success', 'Account approved', `#${id}`);
      location.reload();
    } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// POST INTEREST AS-ON MODAL (audit gap #2)
// ============================================================
function openPostInterestAsOnModal(id) {
  const mid = `sv-pi-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Post Interest As-On</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">Post accrued interest as of a specific historical date (used for back-dated postings).</p>
          <label>Transaction date * <input type="date" id="pi-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pi-save">Post Interest</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pi-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#pi-date').value;
    if (!transactionDate) { toast('warn', 'Select a date', ''); return; }
    try {
      await api.savings.postInterestAsOn(id, transactionDate);
      el.remove();
      toast('success', 'Interest posted as-on', transactionDate);
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPLY ANNUAL FEES MODAL (audit gap #1)
// ============================================================
function openAnnualFeesModal(id) {
  const mid = `sv-af-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Annual Fees</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">Apply all annual fee charges configured on this account that are due as of the selected date.</p>
          <label>Effective date * <input type="date" id="af-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="af-save">Apply Fees</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#af-save').addEventListener('click', async () => {
    try {
      await api.savings.applyAnnualFees(id, {
        transactionDate: el.querySelector('#af-date').value,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Annual fees applied', '');
      location.reload();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ASSIGN / UNASSIGN STAFF MODAL (audit gap #3)
// ============================================================
async function openSavingsAssignStaffModal(id, s) {
  let staffList = [];
  try {
    const r = await api.staff.list({ officeId: s.officeId || s.clientOfficeId, isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}

  const currentId = s.fieldOfficerId || s.savingsOfficerId || null;
  const currentName = s.fieldOfficerName || s.savingsOfficerName || '';
  const hasStaff = !!currentId;
  const mid = `sv-as-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${hasStaff ? 'Reassign / Unassign Staff' : 'Assign Staff'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${hasStaff ? `<p class="text-muted">Currently assigned to <b>${escapeHtml(currentName)}</b>.</p>` : ''}
          <label>Staff
            <select id="as-staff" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(st => `<option value="${st.id}" ${st.id === currentId ? 'selected' : ''}>${escapeHtml(st.displayName)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Effective date * <input type="date" id="as-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="as-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#as-save').addEventListener('click', async () => {
    const staffId = el.querySelector('#as-staff').value;
    const dateVal = el.querySelector('#as-date').value;
    try {
      if (staffId) {
        await api.savings.assignStaff(id, {
          toSavingsOfficerId: parseInt(staffId),
          assignmentDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      } else {
        await api.savings.unassignStaff(id, {
          unassignedDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      }
      el.remove();
      toast('success', 'Staff updated', '');
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ADJUST TRANSACTION MODAL
// ============================================================
function openAdjustSavingsTxModal(id, txId, onSuccess) {
  const mid = `sv-adj-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Adjust Transaction #${txId}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>New transaction date * <input type="date" id="adj-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">New amount * <input type="number" step="0.01" id="adj-amount" class="form-control" required/></label>
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
      await api.savings.adjustTransaction(id, txId, {
        transactionDate: el.querySelector('#adj-date').value,
        transactionAmount: amt,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(el.querySelector('#adj-note').value.trim() && { note: el.querySelector('#adj-note').value.trim() })
      });
      el.remove();
      toast('success', 'Transaction adjusted', '');
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPLY / PAY CHARGE MODALS (audit gap #6, #7)
// ============================================================
async function openApplySavingsChargeModal(id, onSuccess) {
  let charges = [];
  try {
    // chargeAppliesTo: 2 = Savings charges in Fineract
    const r = await api.charges.list({ chargeAppliesTo: 2 });
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `sv-applycharge-${Date.now()}`;
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
      await api.savings.addCharge(id, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openPaySavingsChargeModal(id, chargeId, onSuccess) {
  const mid = `sv-paycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
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
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.savings.payCharge(id, chargeId, {
        amount, transactionDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// STANDING INSTRUCTIONS TAB
// ============================================================
async function loadSavingsSI(c, id, savings) {
  const wrap = c.querySelector('#sv-si-wrap');
  wrap.innerHTML = `
    <div class="section-header mb-2">
      <h3>Standing Instructions</h3>
    </div>
    <div class="text-muted small mb-2">
      Recurring transfers that have this savings account as the source or destination.
    </div>
    <div id="sv-si-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sv-si-list');
  try {
    // Fineract doesn't filter SI by savings account directly — pull all for the client and filter
    const clientId = savings.clientId;
    if (!clientId) {
      listEl.innerHTML = '<div class="empty-state-row">Standing instructions only available on client-owned accounts</div>';
      return;
    }
    const res = await api.standingInstructions.list({ clientId, limit: 200 });
    const all = Array.isArray(res) ? res : (res?.pageItems || []);
    const list = all.filter(si =>
      si.fromAccount?.id === parseInt(id) ||
      si.toAccount?.id === parseInt(id) ||
      si.fromAccount?.accountNo === savings.accountNo ||
      si.toAccount?.accountNo === savings.accountNo);

    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>From</th><th>To</th>
          <th class="text-right">Amount</th>
          <th>Type</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${escapeHtml(si.transferType?.value || si.instructionType?.value || '—')}</td>
            <td>${sb(si.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DELETE_STANDINGINSTRUCTION')
                ? `<button class="btn-mini btn-danger" data-del-si="${si.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions for this account</div>';

    listEl.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete standing instruction?', danger: true, confirmText: 'Delete' })) return;
      try { await api.standingInstructions.delete(b.dataset.delSi); toast('success', 'Deleted', ''); loadSavingsSI(c, id, savings); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ============================================================
// ON-HOLD FUNDS TAB
// ============================================================
async function loadOnHoldFunds(c, id) {
  const wrap = c.querySelector('#sv-onhold-wrap');
  wrap.innerHTML = `
    <h3>On-hold Fund Transactions</h3>
    <div class="text-muted small mb-2">
      Funds held as collateral (e.g. by linked loan guarantees) or for compliance reasons.
    </div>
    <div id="sv-onhold-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sv-onhold-list');
  try {
    const res = await api.savings.onHoldTransactions(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Date</th><th>Transaction Type</th>
          <th class="text-right">Amount</th>
          <th>Reason</th><th>Released On</th>
        </tr></thead>
        <tbody>${list.map(h => `
          <tr>
            <td>${fmtDate(h.transactionDate) || '—'}</td>
            <td>${escapeHtml(h.transactionType?.value || '—')}</td>
            <td class="text-right">${fmt(h.amount || h.transactionAmount || 0)}</td>
            <td>${escapeHtml(h.reasonForBlock || h.reason || '—')}</td>
            <td>${fmtDate(h.releasedOnDate) || (h.released ? sb('Released') : sb('Active'))}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No on-hold transactions</div>';
  } catch {
    listEl.innerHTML = '<div class="empty-state-row text-muted">On-hold fund tracking not enabled for this account</div>';
  }
}