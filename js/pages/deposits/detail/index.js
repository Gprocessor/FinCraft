/* FinCraft · pages/deposits/detail/index.js — renderDetail — tab shell.
   Auto-split from the original monolithic pages/deposits/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../../utils.js';
import { exportDepositStatement, openDepositSimpleCmd, openDepositTxModal, openEditDepositModal, openPrematureCloseModal } from '../actions.js';
import { can } from '../shared.js';
import { loadClosureCalculator } from './closure.js';
import { loadDepositDocuments, loadDepositNotes } from './notes-docs.js';
import { loadDepositCharges, loadDepositTransactions } from './transactions.js';

export async function renderDetail(c, apiGroup, id, initialTab) {
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
      import('../../../router.js').then(r => r.navigate('deposits'));
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
        import('../../../router.js').then(r => r.navigate('deposits'));
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
