/* FinCraft · pages/savings/detail/transactions.js — transactions, charges, and on-hold funds tab loaders.
   Auto-split from the original monolithic pages/savings/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openAdjustSavingsTxModal, openApplySavingsChargeModal, openEditSavingsChargeModal, openPaySavingsChargeModal, openSavingsTransactionDetailModal } from '../actions.js';
import { can } from '../shared.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadSavingsTransactions(c, id) {
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
                  <button class="btn-mini" data-view-tx="${t.id}">View</button>
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

      listEl.querySelectorAll('[data-view-tx]').forEach(b => b.addEventListener('click', () =>
        openSavingsTransactionDetailModal(id, b.dataset.viewTx)));
      listEl.querySelectorAll('[data-undo-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Undo transaction?', message: 'Reverses the posting; balances restored.', danger: true, confirmText: 'Undo' })) return;
        try { await api.savings.undoTransaction(id, b.dataset.undoTx); toast('success', 'Transaction undone', ''); reload(); }
        catch (e) { toast('error', 'Undo failed', extractFineractError(e)); }
      }));
      listEl.querySelectorAll('[data-adj-tx]').forEach(b => b.addEventListener('click', () =>
        (typeof openAdjustSavingsTxModal === 'function') && openAdjustSavingsTxModal(id, b.dataset.adjTx, reload)));
      listEl.querySelectorAll('[data-release-tx]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Release held amount?', confirmText: 'Release' })) return;
        try { await api.savings.releaseAmount(id, b.dataset.releaseTx); toast('success', 'Amount released', ''); reload(); }
        catch (e) { toast('error', 'Release failed', extractFineractError(e)); }
      }));
    } catch (e) {
      listEl.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
    }
  }

  wrap.querySelector('#sv-tx-filter').addEventListener('change', reload);
  wrap.querySelector('#sv-tx-reload').addEventListener('click', reload);
  reload();
}

export async function loadSavingsCharges(c, id, savings) {
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
              ${!ch.paid && can('UPDATE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini" data-edit-charge="${ch.id}">Edit</button>` : ''}
              ${!ch.paid && ch.active && can('INACTIVATE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini" data-inactivate-charge="${ch.id}">Inactivate</button>` : ''}
              ${can('DELETE_SAVINGSACCOUNTCHARGE')
                ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges on this account</div>';

    listEl.querySelectorAll('[data-edit-charge]').forEach(b => b.addEventListener('click', () =>
      openEditSavingsChargeModal(id, b.dataset.editCharge, () => loadSavingsCharges(c, id, savings))));
    listEl.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      (typeof openPaySavingsChargeModal === 'function') && openPaySavingsChargeModal(id, b.dataset.payCharge, () => loadSavingsCharges(c, id, savings))));
    listEl.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await api.savings.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Waived', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Waive failed', extractFineractError(e)); }
    }));
    listEl.querySelectorAll('[data-inactivate-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Inactivate charge?', confirmText: 'Inactivate' })) return;
      try { await api.savings.inactivateCharge(id, b.dataset.inactivateCharge); toast('success', 'Inactivated', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    }));
    listEl.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.savings.deleteCharge(id, b.dataset.delCharge); toast('success', 'Deleted', ''); loadSavingsCharges(c, id, savings); }
      catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadOnHoldFunds(c, id) {
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
