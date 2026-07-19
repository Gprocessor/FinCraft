/* FinCraft · pages/loans/detail/index.js — renderDetail — tab shell, orchestrates the loaders below.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { confirm, openModal, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../../utils.js';
import { openApproveModal, openApprovedAmountHistoryModal, openAssignOfficerModal, openChargeOffModal, openCloseLoanModal, openDisburseModal, openDisburseToSavingsModal, openForecloseModal, openModifyApprovedAmountModal, openModifyAvailableDisbursementAmountModal, openReageModal, openReamortizeModal, openRecoverPaymentModal, openSimpleLoanCmdModal, openWaiveInterestModal } from '../actions.js';
import { loadLoanCollateral, loadLoanEAO, loadLoanGuarantors, loadLoanOriginators } from './collateral-guarantors.js';
import { loadLoanBuyDown, loadLoanDelinquency, loadLoanReschedule } from './lifecycle.js';
import { loadLoanDocuments, loadLoanNotes } from './notes-docs.js';
import { loadOriginalSchedule, loadSchedule } from './schedule.js';
import { loadLoanCharges, loadLoanDisbursements, loadLoanTransactions } from './transactions.js';
import { enhanceScrollableTabs } from '../../../ui/scrollable-tabs.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function renderDetail(c, id, initialTab = 'overview') {
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
    // No dedicated permission code for these two actions is documented anywhere
    // I have access to (they're newer Fineract additions) — gated on UPDATE_LOAN,
    // a permission already confirmed to exist and used elsewhere on this page,
    // rather than inventing an unverified permission constant.
    const canModifyApprovedAmount = (status === 'Approved' || status === 'Active') && can('UPDATE_LOAN');
    const canModifyAvailableDisbursement = status === 'Active' && can('UPDATE_LOAN');

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
          ${canModifyApprovedAmount ? `<button class="btn-secondary" id="btn-mod-approved-amt"><i class="fa-solid fa-sack-dollar"></i> Modify Approved Amount</button>
          <button class="btn-ghost" id="btn-approved-amt-hist" title="Approved amount history"><i class="fa-solid fa-clock-rotate-left"></i></button>` : ''}
          ${canModifyAvailableDisbursement ? `<button class="btn-secondary" id="btn-mod-avail-disb"><i class="fa-solid fa-wallet"></i> Modify Available Disbursement</button>` : ''}
          ${canMarkFraud      ? `<button class="btn-danger"    id="btn-mark-fraud"><i class="fa-solid fa-triangle-exclamation"></i> Fraud</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="ln-tabs">
          <button class="tab" data-lntab="overview">Overview</button>
          <button class="tab" data-lntab="schedule">Schedule</button>
          <button class="tab" data-lntab="original">Original Schedule</button>
          ${can('READ_LOAN') ? `<button class="tab" data-lntab="transactions">Transactions</button>` : ''}
          ${can('READ_LOAN') ? `<button class="tab" data-lntab="charges">Charges</button>` : ''}
          <button class="tab" data-lntab="disbursements">Disbursements</button>
          <button class="tab" data-lntab="delinquency">Delinquency</button>
          ${can('READ_RESCHEDULELOAN') ? `<button class="tab" data-lntab="reschedule">Reschedule</button>` : ''}
          ${can('READ_COLLATERAL') ? `<button class="tab" data-lntab="collateral">Collateral</button>` : ''}
          ${can('READ_GUARANTOR') ? `<button class="tab" data-lntab="guarantors">Guarantors</button>` : ''}
          <button class="tab" data-lntab="buydown">Buy-down / Capitalized</button>
          ${can('READ_LOAN_ORIGINATOR') ? `<button class="tab" data-lntab="originators">Originators</button>` : ''}
          <button class="tab" data-lntab="eao">External Asset Owners</button>
          ${can('READ_LOANNOTE') ? `<button class="tab" data-lntab="notes">Notes</button>` : ''}
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
    enhanceScrollableTabs(c.querySelector('#ln-tabs'));
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
      import('../../../router.js').then(r => r.navigate('loans'));
    });

    // -------- Toolbar handlers --------
    c.querySelector('#btn-approve')?.addEventListener('click', () => openApproveModal(id));
    c.querySelector('#btn-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', message: 'Return this loan to pending state.', confirmText: 'Undo Approval' })) return;
      try { await api.loans.undoApproval(id); toast('success', 'Approval undone', `#${id}`); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
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
      try { await api.loans.undoDisbursal(id); toast('success', 'Disbursal undone', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    });
    c.querySelector('#btn-repay')?.addEventListener('click', () => {
      const modal = openModal('repaymentModal');
      if (modal) modal.dataset.loanId = id;
    });
    c.querySelector('#btn-waive-int')?.addEventListener('click', () => openWaiveInterestModal(id));
    c.querySelector('#btn-recover')?.addEventListener('click', () => openRecoverPaymentModal(id));
    c.querySelector('#btn-recover-guar')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Recover guarantees?', confirmText: 'Recover' })) return;
      try { await api.loans.recoverGuarantees(id); toast('success', 'Guarantees recovered', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
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
    c.querySelector('#btn-mod-approved-amt')?.addEventListener('click', () =>
      openModifyApprovedAmountModal(id, l.approvedPrincipal ?? l.summary?.principalDisbursed, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#btn-approved-amt-hist')?.addEventListener('click', () => openApprovedAmountHistoryModal(id));
    c.querySelector('#btn-mod-avail-disb')?.addEventListener('click', () =>
      openModifyAvailableDisbursementAmountModal(id, l.summary?.availableDisbursementAmount, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#btn-mark-fraud')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Toggle fraud flag?', message: 'This flags or unflags the loan as fraudulent.', danger: true, confirmText: 'Toggle' })) return;
      try { await api.loans.markAsFraud(id, { fraud: !l.fraud }); toast('warn', 'Fraud flag toggled', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load loan</b></div>
      <div class="text-muted mt-2">${escapeHtml(extractFineractError(e))}</div>
    </div></div>`;
  }
}
