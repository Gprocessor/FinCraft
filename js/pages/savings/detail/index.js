/* FinCraft · pages/savings/detail/index.js — renderDetail — tab shell.
   Auto-split from the original monolithic pages/savings/detail.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, openModal, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../../utils.js';
import { exportStatement, openAnnualFeesModal, openApproveSavingsModal, openEditSavingsModal, openHoldModal, openPostInterestAsOnModal, openSavingsAssignStaffModal, openSavingsCloseModal, openSavingsSimpleCmd, openSavingsTransactionModal } from '../actions.js';
import { can } from '../shared.js';
import { loadSavingsDocuments, loadSavingsNotes } from './notes-docs.js';
import { loadSavingsSI } from './si.js';
import { loadOnHoldFunds, loadSavingsCharges, loadSavingsTransactions } from './transactions.js';
import { enhanceScrollableTabs } from '../../../ui/scrollable-tabs.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function renderDetail(c, id, initialTab = 'overview') {
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
    const canAssignStaff    = isActive   && (can('UPDATESAVINGSOFFICER_SAVINGSACCOUNT') || can('REMOVESAVINGSOFFICER_SAVINGSACCOUNT'));
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
          ${can('READ_ACCOUNTTRANSFER') ? `<button class="tab" data-svtab="si">Standing Instructions</button>` : ''}
          <button class="tab" data-svtab="onhold">On-hold Funds</button>
          ${can('READ_SAVINGNOTE') ? `<button class="tab" data-svtab="notes">Notes</button>` : ''}
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
    enhanceScrollableTabs(c.querySelector('#sv-tabs'));
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
      import('../../../router.js').then(r => r.navigate('savings'));
    });

    // -------- Toolbar (lifecycle) --------
    c.querySelector('#btn-sv-edit')?.addEventListener('click', () =>
      (typeof openEditSavingsModal === 'function') && openEditSavingsModal(s));
    c.querySelector('#btn-sv-approve')?.addEventListener('click', () =>
      (typeof openApproveSavingsModal === 'function') && openApproveSavingsModal(id));
    c.querySelector('#btn-sv-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', confirmText: 'Undo Approval' })) return;
      try { await api.savings.undoApproval(id); toast('success', 'Approval undone', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
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
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
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
        try { await api.savings[method](id); toast('success', successMsg, ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
        catch (e) { toast('error', 'Failed', extractFineractError(e)); }
      });
    });

    // -------- Toolbar (interest / fees / staff) --------
    c.querySelector('#btn-sv-calc-int')?.addEventListener('click', async () => {
      try { await api.savings.calculateInterest(id); toast('success', 'Interest calculated', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    });
    c.querySelector('#btn-sv-post-int')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Post interest today?', confirmText: 'Post' })) return;
      try { await api.savings.postInterest(id); toast('success', 'Interest posted', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
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
        import('../../../router.js').then(r => r.navigate('savings'));
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    });
    c.querySelector('#btn-sv-export')?.addEventListener('click', () => exportStatement(s, id));

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load account</b></div>
      <div class="text-muted mt-2">${escapeHtml(extractFineractError(e))}</div>
    </div></div>`;
  }
}
