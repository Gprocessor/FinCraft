/* FinCraft · pages/deposits/actions/transactions.js — transaction, adjust, and statement export.
   Auto-split from the original monolithic pages/deposits/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function exportDepositStatement(d, isFD, id, apiObj) {
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

export function openDepositTxModal(apiObj, id, txType, label) {
  const mid = 'dep-tx-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', label + ' failed', extractFineractError(e)); }
  });
}

export function openAdjustDepositTxModal(apiObj, id, txId, onSuccess) {
  const mid = 'dep-adj-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
    } catch (e) { toast('error', 'Adjust failed', extractFineractError(e)); }
  });
}
