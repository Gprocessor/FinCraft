import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · deposits.js — Full FD & RD lifecycle (permission-gated, tabbed) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

export async function render(c, params = {}) {
  // ?type=fd or ?type=rd in detail mode
  const apiGroup = params.type === 'rd' ? 'recurringDeposits' : 'fixedDeposits';
  if (params.view === 'detail' || params.id) return renderDetail(c, apiGroup, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW (FD + RD tabbed)
// ============================================================
async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Deposits</h1>
        <div class="text-muted">Fixed & Recurring Deposits</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_RECURRINGDEPOSITACCOUNT') ? `<button class="btn-secondary" data-modal="newRDModal"><i class="fa-solid fa-plus"></i> New RD</button>` : ''}
        ${can('CREATE_FIXEDDEPOSITACCOUNT')     ? `<button class="btn-primary" data-modal="newFDModal"><i class="fa-solid fa-plus"></i> New FD</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="dep-list-tabs">
        <button class="tab active" data-deptype="fd">Fixed Deposits</button>
        <button class="tab" data-deptype="rd">Recurring Deposits</button>
      </div>

      <!-- FD Panel -->
      <div class="tab-panel active" data-deppanel="fd">
        <div class="filter-bar">
          <input id="fd-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
          <select id="fd-status" class="form-control">
            <option value="">All Status</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="prematureClosed">Premature Closed</option>
          </select>
          <button class="btn-secondary" id="fd-export"><i class="fa-solid fa-download"></i> Export</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>Account</th><th>Client</th><th>Product</th>
            <th class="text-right">Principal</th><th>Maturity</th>
            <th class="text-right">Rate</th><th>Status</th><th></th>
          </tr></thead>
          <tbody id="fd-rows"><tr><td colspan="8" class="empty-state-row">Loading…</td></tr></tbody>
        </table>
      </div>

      <!-- RD Panel -->
      <div class="tab-panel" data-deppanel="rd" hidden>
        <div class="filter-bar">
          <input id="rd-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
          <select id="rd-status" class="form-control">
            <option value="">All Status</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          <button class="btn-secondary" id="rd-export"><i class="fa-solid fa-download"></i> Export</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>Account</th><th>Client</th><th>Product</th>
            <th class="text-right">Per Period</th><th>Maturity</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody id="rd-rows"><tr><td colspan="7" class="empty-state-row">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  // Tab switching
  c.querySelectorAll('[data-deptype]').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('[data-deptype]').forEach(t => t.classList.toggle('active', t === tab));
    c.querySelectorAll('[data-deppanel]').forEach(p => p.hidden = p.dataset.deppanel !== tab.dataset.deptype);
  }));

  let fdRows = [], rdRows = [];

  async function loadFD() {
    c.querySelector('#fd-rows').innerHTML = '<tr><td colspan="8" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#fd-status')?.value;
      if (status) params.status = status;
      const res = await api.fixedDeposits.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      const q = c.querySelector('#fd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q));
      fdRows = list;
      c.querySelector('#fd-rows').innerHTML = list.length ? list.map(d => {
        const isPending  = d.status?.value === 'Submitted and pending approval';
        const isApproved = d.status?.value === 'Approved';
        return `
          <tr>
            <td>${d.id}">${escapeHtml(d.accountNo || `#${d.id}`)}</a></td>
            <td>${escapeHtml(d.clientName || '—')}</td>
            <td>${escapeHtml(d.depositProductName || '—')}</td>
            <td class="text-right">${fmt(d.depositAmount || 0)}</td>
            <td>${fmtDate(d.maturityDate) || '—'}</td>
            <td class="text-right">${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</td>
            <td>${sb(d.status?.value || '—')}</td>
            <td class="text-right">
              ${isPending  && can('APPROVE_FIXEDDEPOSITACCOUNT')  ? `<button class="btn-mini btn-success" data-fd-approve="${d.id}">Approve</button>`  : ''}
              ${isApproved && can('ACTIVATE_FIXEDDEPOSITACCOUNT') ? `<button class="btn-mini btn-success" data-fd-activate="${d.id}">Activate</button>` : ''}
            </td>
          </tr>`;
      }).join('') : '<tr><td colspan="8" class="empty-state-row">No fixed deposits</td></tr>';

      c.querySelectorAll('[data-fd-approve]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.fixedDeposits.approve(b.dataset.fdApprove, {
            approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'FD approved', '#' + b.dataset.fdApprove);
          loadFD();
        } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
      }));
      c.querySelectorAll('[data-fd-activate]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.fixedDeposits.activate(b.dataset.fdActivate, {
            activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'FD activated', '#' + b.dataset.fdActivate);
          loadFD();
        } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
      }));
    } catch (e) {
      c.querySelector('#fd-rows').innerHTML = `<tr><td colspan="8" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  async function loadRD() {
    c.querySelector('#rd-rows').innerHTML = '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#rd-status')?.value;
      if (status) params.status = status;
      const res = await api.recurringDeposits.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      const q = c.querySelector('#rd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q));
      rdRows = list;
      c.querySelector('#rd-rows').innerHTML = list.length ? list.map(d => {
        const isPending  = d.status?.value === 'Submitted and pending approval';
        const isApproved = d.status?.value === 'Approved';
        return `
          <tr>
            <td>${d.id}">${escapeHtml(d.accountNo || `#${d.id}`)}</a></td>
            <td>${escapeHtml(d.clientName || '—')}</td>
            <td>${escapeHtml(d.depositProductName || '—')}</td>
            <td class="text-right">${fmt(d.mandatoryRecommendedDepositAmount || 0)}</td>
            <td>${fmtDate(d.maturityDate) || '—'}</td>
            <td>${sb(d.status?.value || '—')}</td>
            <td class="text-right">
              ${isPending  && can('APPROVE_RECURRINGDEPOSITACCOUNT')  ? `<button class="btn-mini btn-success" data-rd-approve="${d.id}">Approve</button>`  : ''}
              ${isApproved && can('ACTIVATE_RECURRINGDEPOSITACCOUNT') ? `<button class="btn-mini btn-success" data-rd-activate="${d.id}">Activate</button>` : ''}
            </td>
          </tr>`;
      }).join('') : '<tr><td colspan="7" class="empty-state-row">No recurring deposits</td></tr>';

      c.querySelectorAll('[data-rd-approve]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.recurringDeposits.approve(b.dataset.rdApprove, {
            approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'RD approved', '#' + b.dataset.rdApprove);
          loadRD();
        } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
      }));
      c.querySelectorAll('[data-rd-activate]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.recurringDeposits.activate(b.dataset.rdActivate, {
            activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'RD activated', '#' + b.dataset.rdActivate);
          loadRD();
        } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
      }));
    } catch (e) {
      c.querySelector('#rd-rows').innerHTML = `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  await Promise.all([loadFD(), loadRD()]);

  let ft, rt;
  c.querySelector('#fd-search').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(loadFD, 400); });
  c.querySelector('#fd-status').addEventListener('change', loadFD);
  c.querySelector('#rd-search').addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(loadRD, 400); });
  c.querySelector('#rd-status').addEventListener('change', loadRD);

  c.querySelector('#fd-export').addEventListener('click', () => {
    const rows = fdRows.map(d =>
      [d.accountNo, d.clientName, d.depositProductName, d.depositAmount, d.maturityDate, d.status?.value].join(','));
    const csv = ['Account,Client,Product,Principal,Maturity,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'fixed_deposits.csv'; a.click();
    toast('success', 'Exported', 'fixed_deposits.csv');
  });

  c.querySelector('#rd-export').addEventListener('click', () => {
    const rows = rdRows.map(d =>
      [d.accountNo, d.clientName, d.depositProductName, d.mandatoryRecommendedDepositAmount, d.maturityDate, d.status?.value].join(','));
    const csv = ['Account,Client,Product,Per Period,Maturity,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'recurring_deposits.csv'; a.click();
    toast('success', 'Exported', 'recurring_deposits.csv');
  });
}

// ============================================================
// DETAIL VIEW (shared FD + RD, tabbed)
// ============================================================
async function renderDetail(c, apiGroup, id, initialTab) {
  const isFD = apiGroup === 'fixedDeposits';
  const label = isFD ? 'Fixed Deposit' : 'Recurring Deposit';
  const permPrefix = isFD ? 'FIXEDDEPOSITACCOUNT' : 'RECURRINGDEPOSITACCOUNT';
  const apiObj = api[apiGroup];

  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading ${label.toLowerCase()}…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No account selected</div>'; return; }

  try {
    const d = await apiObj.get(id, { associations: 'all' });
    const status = d.status?.value || '';

    const isPending  = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive   = status === 'Active';
    const isMatured  = status === 'Matured';
    const isClosed   = status === 'Closed' || status === 'Premature Closed';

    const canEdit            = (isPending || isApproved) && can('UPDATE_' + permPrefix);
    const canApprove         = isPending  && can('APPROVE_' + permPrefix);
    const canUndoApproval    = isApproved && can('APPROVALUNDO_' + permPrefix);
    const canReject          = isPending  && can('REJECT_' + permPrefix);
    const canWithdrawApp     = isPending  && can('WITHDRAW_' + permPrefix);
    const canActivate        = isApproved && can('ACTIVATE_' + permPrefix);
    const canMakeDeposit     = !isFD && isActive && can('DEPOSIT_' + permPrefix);
    const canMakeWithdrawal  = !isFD && isActive && can('WITHDRAWAL_' + permPrefix);
    const canCalcInterest    = (isActive || isMatured) && can('CALCULATEINTEREST_' + permPrefix);
    const canPostInterest    = (isActive || isMatured) && can('POSTINTEREST_' + permPrefix);
    const canPremature       = isActive  && can('PREMATURECLOSE_' + permPrefix);
    const canCloseMatured    = isMatured && can('CLOSE_' + permPrefix);
    const canCloseRD         = !isFD && isActive && can('CLOSE_' + permPrefix);
    const canDelete          = isPending && can('DELETE_' + permPrefix);

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${label} #${escapeHtml(d.accountNo || id)}</h1>
          <div class="text-muted">
            ${d.clientId ? `${d.clientId}">${escapeHtml(d.clientName || '—')}</a>` : escapeHtml(d.clientName || '—')}
            · ${escapeHtml(d.depositProductName || '—')}
            · ${sb(status || '—')}
            ${d.externalId ? ` · ext: ${escapeHtml(d.externalId)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-deposits"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit            ? `<button class="btn-secondary" id="btn-dep-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canApprove         ? `<button class="btn-success"   id="btn-dep-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${canUndoApproval    ? `<button class="btn-warning"   id="btn-dep-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${canReject          ? `<button class="btn-warning"   id="btn-dep-reject"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdrawApp     ? `<button class="btn-secondary" id="btn-dep-withdraw-app"><i class="fa-solid fa-rotate-left"></i> Withdraw</button>` : ''}
          ${canActivate        ? `<button class="btn-success"   id="btn-dep-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canMakeDeposit     ? `<button class="btn-primary"   id="btn-dep-deposit"><i class="fa-solid fa-arrow-down"></i> Make Deposit</button>` : ''}
          ${canMakeWithdrawal  ? `<button class="btn-secondary" id="btn-dep-withdraw"><i class="fa-solid fa-arrow-up"></i> Withdraw</button>` : ''}
          ${canCalcInterest    ? `<button class="btn-secondary" id="btn-dep-calc"><i class="fa-solid fa-calculator"></i> Calc Interest</button>` : ''}
          ${canPostInterest    ? `<button class="btn-secondary" id="btn-dep-post"><i class="fa-solid fa-percent"></i> Post Interest</button>` : ''}
          ${canPremature       ? `<button class="btn-danger"    id="btn-dep-premature"><i class="fa-solid fa-clock"></i> Premature Close</button>` : ''}
          ${canCloseRD         ? `<button class="btn-danger"    id="btn-dep-rd-close"><i class="fa-solid fa-box-archive"></i> Close RD</button>` : ''}
          ${canCloseMatured    ? `<button class="btn-success"   id="btn-dep-close"><i class="fa-solid fa-circle-check"></i> Close (Matured)</button>` : ''}
          <button class="btn-secondary" id="btn-dep-export"><i class="fa-solid fa-download"></i> Statement</button>
          ${canDelete          ? `<button class="btn-danger"    id="btn-dep-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="dep-tabs">
          <button class="tab" data-deptab="overview">Overview</button>
          <button class="tab" data-deptab="transactions">Transactions</button>
          <button class="tab" data-deptab="charges">Charges</button>
          ${canPremature ? `<button class="tab" data-deptab="calculator">Closure Calculator</button>` : ''}
          ${can('READ_NOTE') ? `<button class="tab" data-deptab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-deptab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-deppanel="overview">
          <div class="grid-2">
            <div>
              <h3>Account Details</h3>
              <dl class="dl-grid">
                <dt>Status</dt><dd>${sb(status || '—')}</dd>
                <dt>Client</dt><dd>${escapeHtml(d.clientName || '—')}</dd>
                <dt>Product</dt><dd>${escapeHtml(d.depositProductName || '—')}</dd>
                <dt>Currency</dt><dd>${escapeHtml(d.currency?.code || '—')}</dd>
                <dt>${isFD ? 'Deposit Amount' : 'Deposit per Period'}</dt>
                <dd>${fmt(d.depositAmount ?? d.mandatoryRecommendedDepositAmount ?? 0)}</dd>
                <dt>Tenure</dt><dd>${d.depositPeriod || '—'} ${escapeHtml(d.depositPeriodFrequency?.value || '')}</dd>
                ${!isFD ? `<dt>Frequency</dt><dd>${d.recurringDepositFrequency || '—'} ${escapeHtml(d.recurringDepositFrequencyType?.value || '')}</dd>` : ''}
                <dt>Interest Rate</dt><dd>${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</dd>
                <dt>Compounding</dt><dd>${escapeHtml(d.interestCompoundingPeriodType?.value || '—')}</dd>
                <dt>Posting</dt><dd>${escapeHtml(d.interestPostingPeriodType?.value || '—')}</dd>
                <dt>External ID</dt><dd>${escapeHtml(d.externalId || '—')}</dd>
              </dl>
            </div>
            <div>
              <h3>Balances & Maturity</h3>
              <dl class="dl-grid">
                <dt>Account Balance</dt><dd class="text-right">${fmt(d.summary?.accountBalance ?? 0)}</dd>
                <dt>Total Deposits</dt><dd class="text-right">${fmt(d.summary?.totalDeposits ?? 0)}</dd>
                <dt>Total Withdrawals</dt><dd class="text-right">${fmt(d.summary?.totalWithdrawals ?? 0)}</dd>
                <dt>Interest Earned</dt><dd class="text-right">${fmt(d.summary?.totalInterestEarned ?? 0)}</dd>
                <dt>Interest Posted</dt><dd class="text-right">${fmt(d.summary?.totalInterestPosted ?? 0)}</dd>
                <dt>Maturity Amount</dt><dd class="text-right"><b>${fmt(d.maturityAmount || 0)}</b></dd>
                <dt>Maturity Date</dt><dd><b>${fmtDate(d.maturityDate) || '—'}</b></dd>
              </dl>
              <h3 class="mt-3">Timeline</h3>
              <dl class="dl-grid">
                <dt>Submitted</dt><dd>${fmtDate(d.timeline?.submittedOnDate) || '—'}</dd>
                <dt>Approved</dt><dd>${fmtDate(d.timeline?.approvedOnDate) || '—'}</dd>
                <dt>Activated</dt><dd>${fmtDate(d.timeline?.activatedOnDate) || '—'}</dd>
                <dt>Closed</dt><dd>${fmtDate(d.timeline?.closedOnDate) || '—'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <!-- Lazy panels -->
        <div class="tab-panel" data-deppanel="transactions" hidden><div id="dep-tx-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-deppanel="charges"      hidden><div id="dep-charges-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-deppanel="calculator"   hidden><div id="dep-calc-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-deppanel="notes"        hidden><div id="dep-notes-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-deppanel="documents"    hidden><div id="dep-docs-wrap"><div class="empty-state-row">Loading…</div></div></div>
      </div>`;

    // -------- Tab switching with deep-link --------
    const tabs = c.querySelectorAll('[data-deptab]');
    const panels = c.querySelectorAll('[data-deppanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      transactions: () => loadDepositTransactions(c, apiGroup, id),
      charges:      () => loadDepositCharges(c, apiGroup, id),
      calculator:   () => (typeof loadClosureCalculator === 'function') && loadClosureCalculator(c, apiGroup, id, d),
      notes:        () => loadDepositNotes(c, isFD ? 'fixeddepositaccounts' : 'recurringdepositaccounts', id),
      documents:    () => loadDepositDocuments(c, isFD ? 'fixeddepositaccounts' : 'recurringdepositaccounts', id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.deptab === name));
      panels.forEach(p => p.hidden = p.dataset.deppanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('type', isFD ? 'fd' : 'rd');
      params.set('tab', name);
      location.hash = `deposits?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.deptab)));
    switchTab(initialTab || 'overview');

    // -------- Back --------
    c.querySelector('#back-to-deposits').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('deposits'));
    });

    // -------- Toolbar handlers --------
    c.querySelector('#btn-dep-edit')?.addEventListener('click', () =>
      (typeof openEditDepositModal === 'function') && openEditDepositModal(apiObj, d, label));

    c.querySelector('#btn-dep-approve')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'approve', label: 'Approve ' + label, dateField: 'approvedOnDate'
    }));
    c.querySelector('#btn-dep-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', confirmText: 'Undo' })) return;
      try { await apiObj.undoApproval(id); toast('success', 'Approval undone', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-dep-reject')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'reject', label: 'Reject ' + label, dateField: 'rejectedOnDate'
    }));
    c.querySelector('#btn-dep-withdraw-app')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'withdrawApplication', label: 'Withdraw Application', dateField: 'withdrawnOnDate'
    }));
    c.querySelector('#btn-dep-activate')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'activate', label: 'Activate ' + label, dateField: 'activatedOnDate'
    }));

    // Money in/out (RD primarily)
    c.querySelector('#btn-dep-deposit')?.addEventListener('click', () => openDepositTxModal(apiObj, id, 'deposit', 'Make Deposit'));
    c.querySelector('#btn-dep-withdraw')?.addEventListener('click', () => openDepositTxModal(apiObj, id, 'withdrawal', 'Withdraw'));

    // Interest
    c.querySelector('#btn-dep-calc')?.addEventListener('click', async () => {
      try { await apiObj.calculateInterest(id); toast('success', 'Interest calculated', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-dep-post')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Post interest?', confirmText: 'Post' })) return;
      try { await apiObj.postInterest(id); toast('success', 'Interest posted', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });

    // Closures
    c.querySelector('#btn-dep-premature')?.addEventListener('click', () =>
      (typeof openPrematureCloseModal === 'function') && openPrematureCloseModal(apiObj, id, label));
    c.querySelector('#btn-dep-close')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'close', label: 'Close ' + label, dateField: 'closedOnDate'
    }));
    c.querySelector('#btn-dep-rd-close')?.addEventListener('click', () => openDepositSimpleCmd({
      apiObj, id, command: 'close', label: 'Close RD (before maturity)', dateField: 'closedOnDate', danger: true
    }));

    // Delete
    c.querySelector('#btn-dep-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete ' + label + ' #' + (d.accountNo || id) + '?',
        message: 'Only possible while in Submitted/Pending status.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await apiObj.delete(id);
        toast('success', 'Account deleted', '');
        import('../router.js').then(r => r.navigate('deposits'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

    // Export statement
    c.querySelector('#btn-dep-export')?.addEventListener('click', () => exportDepositStatement(d, isFD, id, apiObj));

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load ${label.toLowerCase()}</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// TRANSACTIONS TAB
// ============================================================
async function loadDepositTransactions(c, apiGroup, id) {
  const wrap = c.querySelector('#dep-tx-wrap');
  wrap.innerHTML = `
    <div class="filter-bar mb-2">
      <button class="btn-secondary" id="dep-tx-reload"><i class="fa-solid fa-rotate"></i> Refresh</button>
    </div>
    <div id="dep-tx-list"><div class="empty-state-row">Loading…</div></div>`;

  const apiObj = api[apiGroup];
  const permPrefix = apiGroup === 'fixedDeposits' ? 'FIXEDDEPOSITACCOUNT' : 'RECURRINGDEPOSITACCOUNT';

  async function reload() {
    const listEl = wrap.querySelector('#dep-tx-list');
    listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const res = await apiObj.transactions(id);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      list = [...list].reverse();

      listEl.innerHTML = list.length ? `
        <table class="table">
          <thead><tr>
            <th>#</th><th>Date</th><th>Type</th>
            <th class="text-right">Amount</th>
            <th class="text-right">Running Balance</th>
            <th>State</th><th></th>
          </tr></thead>
          <tbody>${list.map(t => {
            const d = Array.isArray(t.date) ? t.date.join('-') : t.date;
            const reversed = t.reversed || t.manuallyReversed;
            return `
              <tr class="${reversed ? 'text-muted' : ''}">
                <td>${t.id}</td>
                <td>${escapeHtml(String(d || '—'))}</td>
                <td>${escapeHtml(t.transactionType?.value || '—')}</td>
                <td class="text-right">${fmt(t.amount || 0)}</td>
                <td class="text-right">${fmt(t.runningBalance || 0)}</td>
                <td>${reversed ? sb('Reversed') : sb('Posted')}</td>
                <td class="text-right">
                  ${!reversed && can('ADJUSTTRANSACTION_' + permPrefix) ?
                    `<button class="btn-mini" data-adj-tx="${t.id}">Adjust</button>` : ''}
                  ${!reversed && can('UNDOTRANSACTION_' + permPrefix) ?
                    `<button class="btn-mini btn-warning" data-undo-tx="${t.id}">Undo</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No transactions yet</div>';

      listEl.querySelectorAll('[data-undo-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Undo transaction?', danger: true, confirmText: 'Undo' })) return;
        try { await apiObj.undoTransaction(id, b.dataset.undoTx); toast('success', 'Undone', ''); reload(); }
        catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
      }));
      listEl.querySelectorAll('[data-adj-tx]').forEach(b => b.addEventListener('click', () =>
        (typeof openAdjustDepositTxModal === 'function') && openAdjustDepositTxModal(apiObj, id, b.dataset.adjTx, reload)));
    } catch (e) {
      listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }

  wrap.querySelector('#dep-tx-reload').addEventListener('click', reload);
  reload();
}

// ============================================================
// CHARGES TAB (full CRUD)
// ============================================================
async function loadDepositCharges(c, apiGroup, id) {
  const wrap = c.querySelector('#dep-charges-wrap');
  const permPrefix = apiGroup === 'fixedDeposits' ? 'FIXEDDEPOSITACCOUNTCHARGE' : 'RECURRINGDEPOSITACCOUNTCHARGE';
  const apiObj = api[apiGroup];

  wrap.innerHTML = `
    ${can('CREATE_' + permPrefix) ? `
      <div class="section-header mb-2">
        <h3>Account Charges</h3>
        <button class="btn-primary btn-sm" id="dep-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>
      </div>` : '<h3>Account Charges</h3>'}
    <div id="dep-charges-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#dep-add-charge')?.addEventListener('click', () =>
    (typeof openApplyDepositChargeModal === 'function') && openApplyDepositChargeModal(apiObj, id, () => loadDepositCharges(c, apiGroup, id)));

  const listEl = wrap.querySelector('#dep-charges-list');
  try {
    const res = await apiObj.charges(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Charge</th><th>Timing</th><th>Due</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Paid</th>
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
            <td class="text-right">${fmt(ch.amountOutstanding || 0)}</td>
            <td>${sb(ch.paid ? 'Paid' : ch.waived ? 'Waived' : !ch.active ? 'Inactive' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.paid && !ch.waived && ch.active && can('PAY_' + permPrefix)
                ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.paid && !ch.waived && ch.active && can('WAIVE_' + permPrefix)
                ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${!ch.paid && ch.active && can('INACTIVATE_' + permPrefix)
                ? `<button class="btn-mini" data-inactivate-charge="${ch.id}">Inactivate</button>` : ''}
              ${can('DELETE_' + permPrefix)
                ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges on this account</div>';

    listEl.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      (typeof openPayDepositChargeModal === 'function') && openPayDepositChargeModal(apiObj, id, b.dataset.payCharge, () => loadDepositCharges(c, apiGroup, id))));
    listEl.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await apiObj.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Waived', ''); loadDepositCharges(c, apiGroup, id); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-inactivate-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Inactivate charge?', confirmText: 'Inactivate' })) return;
      try { await apiObj.inactivateCharge(id, b.dataset.inactivateCharge); toast('success', 'Inactivated', ''); loadDepositCharges(c, apiGroup, id); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await apiObj.deleteCharge(id, b.dataset.delCharge); toast('success', 'Deleted', ''); loadDepositCharges(c, apiGroup, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// NOTES TAB
// ============================================================
async function loadDepositNotes(c, entityType, id) {
  const wrap = c.querySelector('#dep-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="dep-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_NOTE') ? `
      <div class="mt-3">
        <textarea id="dep-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="dep-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>` : ''}`;

  wrap.querySelector('#dep-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#dep-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try { await api.notes.create(entityType, id, { note }); inp.value = ''; loadDepositNotes(c, entityType, id); toast('success', 'Note added', ''); }
    catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#dep-note-list');
  try {
    const notes = await api.notes.list(entityType, id);
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
async function loadDepositDocuments(c, entityType, id) {
  const wrap = c.querySelector('#dep-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="dep-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="dep-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#dep-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', ''); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload(entityType, id, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadDepositDocuments(c, entityType, id);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#dep-doc-list');
  try {
    const docs = await api.documents.list(entityType, id);
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
        const res = await api.documents.download(entityType, id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `${entityType}-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try { await api.documents.delete(entityType, id, b.dataset.docDel); toast('success', 'Deleted', ''); loadDepositDocuments(c, entityType, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// EXPORT STATEMENT
// ============================================================
async function exportDepositStatement(d, isFD, id, apiObj) {
  let txs = d.transactions || [];
  if (!txs.length) {
    try {
      const res = await apiObj.transactions(id);
      txs = Array.isArray(res) ? res : (res?.pageItems || []);
    } catch {}
  }
  if (!txs.length) { toast('warn', 'No transactions', 'Nothing to export'); return; }
  const rows = [['Date', 'Type', 'Amount', 'Running Balance']];
  txs.forEach(t => {
    const dt = Array.isArray(t.date) ? t.date.join('-') : (t.date || '');
    rows.push([dt, t.transactionType?.value || '', t.amount || 0, t.runningBalance || 0]);
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (isFD ? 'fd_' : 'rd_') + (d.accountNo || id) + '_statement.csv';
  a.click();
  toast('success', 'Statement exported', txs.length + ' transactions');
}

// ============================================================
// GENERIC SIMPLE COMMAND MODAL (defensive — no computed keys)
// ============================================================
function openDepositSimpleCmd({ apiObj, id, command, label, dateField, danger = false }) {
  const mid = 'dep-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="dcmd-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="dcmd-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="dcmd-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#dcmd-save').addEventListener('click', async () => {
    const date = el.querySelector('#dcmd-date').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }
    // Build payload without computed key syntax (defensive)
    const payload = {};
    payload[dateField] = date;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;
    const note = el.querySelector('#dcmd-note').value.trim();
    if (note) payload.note = note;
    try {
      // Map our command name to the apiObj method
      const methodMap = {
        approve: 'approve', activate: 'activate', reject: 'reject',
        withdrawApplication: 'withdrawApplication', close: 'close'
      };
      const m = methodMap[command];
      if (m && typeof apiObj[m] === 'function') {
        await apiObj[m](id, payload);
      } else {
        await apiObj.command(id, command, payload);
      }
      el.remove();
      toast('success', label + ' successful', '#' + id);
      location.reload();
    } catch (e) { toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// DEPOSIT TRANSACTION MODAL (deposit/withdrawal)
// ============================================================
function openDepositTxModal(apiObj, id, txType, label) {
  const mid = 'dep-tx-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="dtx-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="dtx-amount" class="form-control" required/></label>
          <label class="mt-2">Payment type
            <select id="dtx-pt" class="form-control"><option value="">— Cash —</option></select>
          </label>
          <label class="mt-2">Receipt number <input id="dtx-receipt" class="form-control"/></label>
          <label class="mt-2">Note <textarea id="dtx-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="dtx-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#dtx-pt');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.id; opt.textContent = pt.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#dtx-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#dtx-date').value;
    const transactionAmount = parseFloat(el.querySelector('#dtx-amount').value);
    if (isNaN(transactionAmount)) { toast('warn', 'Enter amount', ''); return; }
    const paymentTypeId = el.querySelector('#dtx-pt').value;
    const receiptNumber = el.querySelector('#dtx-receipt').value.trim();
    const note = el.querySelector('#dtx-note').value.trim();
    const payload = {
      transactionDate, transactionAmount,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (paymentTypeId) payload.paymentTypeId = parseInt(paymentTypeId);
    if (receiptNumber) payload.receiptNumber = receiptNumber;
    if (note) payload.note = note;
    try {
      if (txType === 'deposit')      await apiObj.deposit(id, payload);
      else                            await apiObj.withdrawal(id, payload);
      el.remove();
      toast('success', label + ' successful', fmt(transactionAmount));
      location.reload();
    } catch (e) { toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message); }
  });
}
// ============================================================
// EDIT DEPOSIT ACCOUNT MODAL (audit gap #2, #3)
// ============================================================
async function openEditDepositModal(apiObj, d, label) {
  const isFD = label.includes('Fixed');
  const mid = 'dep-edit-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit ${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Nominal annual interest rate (%)
              <input type="number" step="0.01" id="ed-rate" class="form-control" value="${d.nominalAnnualInterestRate ?? d.interestRate ?? ''}"/>
            </label>
            <label>${isFD ? 'Deposit amount' : 'Mandatory recommended deposit'}
              <input type="number" step="0.01" id="ed-amount" class="form-control"
                value="${d.depositAmount ?? d.mandatoryRecommendedDepositAmount ?? ''}"/>
            </label>
            <label>Deposit period
              <input type="number" id="ed-period" class="form-control" value="${d.depositPeriod ?? ''}"/>
            </label>
            <label>Period frequency
              <select id="ed-period-freq" class="form-control">
                <option value="">— No change —</option>
                <option value="0" ${d.depositPeriodFrequency?.id === 0 ? 'selected' : ''}>Days</option>
                <option value="1" ${d.depositPeriodFrequency?.id === 1 ? 'selected' : ''}>Weeks</option>
                <option value="2" ${d.depositPeriodFrequency?.id === 2 ? 'selected' : ''}>Months</option>
                <option value="3" ${d.depositPeriodFrequency?.id === 3 ? 'selected' : ''}>Years</option>
              </select>
            </label>
            <label>External ID
              <input id="ed-extid" class="form-control" value="${escapeHtml(d.externalId || '')}"/>
            </label>
            ${isFD ? `
              <label>Lock-in period
                <input type="number" id="ed-lockin" class="form-control" value="${d.lockinPeriodFrequency ?? ''}"/>
              </label>
            ` : `
              <label>Expected first deposit date
                <input type="date" id="ed-firstdep" class="form-control" value="${d.expectedFirstDepositOnDate ? (Array.isArray(d.expectedFirstDepositOnDate) ? d.expectedFirstDepositOnDate.join('-') : d.expectedFirstDepositOnDate) : ''}"/>
              </label>
            `}
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Editing only available before activation. Already-locked fields will be silently ignored.
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
    if (isFinite(rate)) payload.nominalAnnualInterestRate = rate;
    const amount = parseFloat(el.querySelector('#ed-amount').value);
    if (isFinite(amount)) {
      if (isFD) payload.depositAmount = amount;
      else      payload.mandatoryRecommendedDepositAmount = amount;
    }
    const period = parseInt(el.querySelector('#ed-period').value);
    if (isFinite(period)) payload.depositPeriod = period;
    const periodFreq = el.querySelector('#ed-period-freq').value;
    if (periodFreq !== '') payload.depositPeriodFrequencyId = parseInt(periodFreq);
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext) payload.externalId = ext;
    if (isFD) {
      const lockin = parseInt(el.querySelector('#ed-lockin').value);
      if (isFinite(lockin)) payload.lockinPeriodFrequency = lockin;
    } else {
      const fd = el.querySelector('#ed-firstdep').value;
      if (fd) payload.expectedFirstDepositOnDate = fd;
    }
    try {
      await apiObj.update(d.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      location.reload();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// PREMATURE CLOSURE CALCULATOR + MODAL (audit gap #1)
// ============================================================
async function loadClosureCalculator(c, apiGroup, id, d) {
  const wrap = c.querySelector('#dep-calc-wrap');
  wrap.innerHTML = `
    <h3>Premature Closure Calculator</h3>
    <div class="text-muted small mb-2">
      Calculate the interest payable + maturity amount as if the account were closed on the selected date,
      applying the product's pre-closure penalty interest rate.
    </div>
    <div class="filter-bar mb-3">
      <label>Closure date
        <input type="date" id="calc-date" class="form-control" value="${today()}"/>
      </label>
      <button class="btn-primary" id="calc-run"><i class="fa-solid fa-calculator"></i> Calculate</button>
    </div>
    <div id="calc-result"></div>`;

  const apiObj = api[apiGroup];

  wrap.querySelector('#calc-run').addEventListener('click', async () => {
    const calcDate = wrap.querySelector('#calc-date').value;
    const result = wrap.querySelector('#calc-result');
    result.innerHTML = '<div class="empty-state-row">Calculating…</div>';
    try {
      const tpl = await apiObj.prematureTemplate(id);
      // Fineract returns a "preMatureClosureTemplate" embedded in the response with computed amounts
      const closure = tpl.preMatureClosureTemplate || tpl;
      const maturityAmount = closure.maturityAmount ?? closure.totalPayable ?? 0;
      const interestRate   = closure.preClosurePenalApplicable
        ? (closure.adjustedInterestRate || closure.preClosurePenalInterest)
        : (d.nominalAnnualInterestRate || 0);
      const interestEarned = closure.interestPayable ?? closure.interestEarned ?? 0;

      result.innerHTML = `
        <div class="card-inset">
          <h4>Calculation Result — as of ${escapeHtml(calcDate)}</h4>
          <dl class="dl-grid">
            <dt>Effective interest rate</dt><dd>${num(interestRate)}%</dd>
            <dt>Interest payable</dt><dd class="text-right">${fmt(interestEarned)}</dd>
            <dt>Penalty applicable</dt><dd>${closure.preClosurePenalApplicable ? '<span class="badge b-warning">Yes</span>' : '<span class="badge b-success">No</span>'}</dd>
            <dt>Maturity amount on closure</dt><dd class="text-right"><b>${fmt(maturityAmount)}</b></dd>
            <dt>Original maturity amount</dt><dd class="text-right">${fmt(d.maturityAmount || 0)}</dd>
            <dt>Difference</dt><dd class="text-right"><b>${fmt((d.maturityAmount || 0) - maturityAmount)}</b></dd>
          </dl>
          ${can('PREMATURECLOSE_' + (apiGroup === 'fixedDeposits' ? 'FIXEDDEPOSITACCOUNT' : 'RECURRINGDEPOSITACCOUNT')) ? `
            <button class="btn-danger mt-3" id="calc-do-close">
              <i class="fa-solid fa-clock"></i> Close Account on ${escapeHtml(calcDate)}
            </button>
          ` : ''}
        </div>`;

      result.querySelector('#calc-do-close')?.addEventListener('click', () =>
        openPrematureCloseModal(apiObj, id, apiGroup === 'fixedDeposits' ? 'Fixed Deposit' : 'Recurring Deposit', calcDate));

    } catch (e) {
      result.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
        <div class="text-muted small mt-2">If the calculator endpoint isn't enabled on your tenant, you can still close the account via the toolbar.</div>`;
    }
  });
}

// Opens a confirmation modal to actually execute the premature close,
// optionally pre-filled with a date from the calculator.
async function openPrematureCloseModal(apiObj, id, label, prefilledDate) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}

  const mid = 'dep-prem-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Premature Close — ${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            This will close the account before maturity. The product's penalty interest rate (if configured) will apply.
          </div>
          <label>Closed on * <input type="date" id="pc-date" class="form-control" value="${prefilledDate || today()}" required/></label>
          <label class="mt-2">On-account closure type *
            <select id="pc-type" class="form-control" required>
              <option value="100">Withdraw deposit</option>
              <option value="200">Transfer to savings</option>
              <option value="300">Re-invest</option>
            </select>
          </label>
          <label class="mt-2">Target savings account ID (for transfer)
            <input type="number" id="pc-savings" class="form-control" placeholder="Required if type = Transfer"/>
          </label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">— Cash —</option>
              ${paymentTypes.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="pc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="pc-save">Premature Close</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const closedOnDate = el.querySelector('#pc-date').value;
    const onAccountClosureId = parseInt(el.querySelector('#pc-type').value);
    const savingsAccountId = el.querySelector('#pc-savings').value.trim();
    const paymentTypeId = el.querySelector('#pc-pt').value;
    const note = el.querySelector('#pc-note').value.trim();
    if (!closedOnDate) { toast('warn', 'Select a date', ''); return; }
    if (onAccountClosureId === 200 && !savingsAccountId) {
      toast('warn', 'Target savings required', 'Enter the savings account ID to transfer to');
      return;
    }
    const payload = {
      closedOnDate, onAccountClosureId,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (savingsAccountId) payload.toSavingsAccountId = parseInt(savingsAccountId);
    if (paymentTypeId)    payload.paymentTypeId = parseInt(paymentTypeId);
    if (note)             payload.note = note;
    try {
      await apiObj.premature(id, payload);
      el.remove();
      toast('success', 'Account closed prematurely', '');
      import('../router.js').then(r => r.navigate('deposits'));
    } catch (e) { toast('error', 'Premature close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPLY CHARGE MODAL
// ============================================================
async function openApplyDepositChargeModal(apiObj, id, onSuccess) {
  let charges = [];
  try {
    // For FD/RD, Fineract uses chargeAppliesTo: 5 (Savings) by default,
    // but products often filter via their own charge list. We use 5 = Savings.
    const r = await api.charges.list({ chargeAppliesTo: 5 });
    charges = Array.isArray(r) ? r : [];
    if (!charges.length) {
      // fallback: any charge
      const r2 = await api.charges.list({});
      charges = Array.isArray(r2) ? r2 : [];
    }
  } catch {}

  const mid = 'dep-applycharge-' + Date.now();
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
      await apiObj.addCharge(id, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// PAY CHARGE MODAL
// ============================================================
async function openPayDepositChargeModal(apiObj, id, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = 'dep-paycharge-' + Date.now();
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
    const payload = {
      amount, transactionDate,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (paymentTypeId) payload.paymentTypeId = parseInt(paymentTypeId);
    try {
      await apiObj.payCharge(id, chargeId, payload);
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ADJUST TRANSACTION MODAL
// ============================================================
function openAdjustDepositTxModal(apiObj, id, txId, onSuccess) {
  const mid = 'dep-adj-' + Date.now();
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
    const payload = {
      transactionDate: el.querySelector('#adj-date').value,
      transactionAmount: amt,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const note = el.querySelector('#adj-note').value.trim();
    if (note) payload.note = note;
    try {
      await apiObj.adjustTransaction(id, txId, payload);
      el.remove();
      toast('success', 'Transaction adjusted', '');
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', e.detail?.defaultUserMessage || e.message); }
  });
}