/* FinCraft · pages/deposits/detail/transactions.js — transactions and charges tab loaders.
   Auto-split from the original monolithic pages/deposits/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openAdjustDepositTxModal, openApplyDepositChargeModal, openPayDepositChargeModal } from '../actions.js';
import { can } from '../shared.js';

export async function loadDepositTransactions(c, apiGroup, id) {
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

export async function loadDepositCharges(c, apiGroup, id) {
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
