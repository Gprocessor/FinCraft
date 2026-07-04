/* FinCraft · pages/loans/detail/transactions.js — transactions, charges, and disbursement tab loaders.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { can } from '../shared.js';
import { confirm, openModal, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openAdjustLoanChargeModal, openAdjustTransactionModal, openApplyLoanChargeModal, openChargeRefundModal, openChargebackModal, openGoodwillModal, openPayLoanChargeModal, openTrancheEditorModal } from '../actions.js';

export async function loadLoanTransactions(c, loanId) {
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

export async function loadLoanCharges(c, loanId) {
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

export async function loadLoanDisbursements(c, loanId) {
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
