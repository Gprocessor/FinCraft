/* FinCraft · pages/savings/actions/transactions.js — deposit/withdraw/hold/adjust transaction modals.
   Auto-split from the original monolithic pages/savings/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

export async function openSavingsTransactionDetailModal(savingsId, transactionId) {
  const mid = `sv-txview-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Transaction Detail</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="${mid}-body"><div class="empty-state-row">Loading…</div></div>
        <div class="modal-footer"><button class="btn-secondary" data-close-modal>Close</button></div>
      </div>
    </div>`);
  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  const body = m.querySelector(`#${mid}-body`);
  try {
    const t = await api.savings.getTransaction(savingsId, transactionId);
    body.innerHTML = `
      <dl class="dl-grid">
        <dt>ID</dt><dd>${escapeHtml(String(t.id ?? '—'))}</dd>
        <dt>Date</dt><dd>${escapeHtml(Array.isArray(t.date) ? t.date.join('-') : (t.date || '—'))}</dd>
        <dt>Type</dt><dd>${escapeHtml(t.transactionType?.value || '—')}</dd>
        <dt>Amount</dt><dd>${fmt(t.amount || 0)}</dd>
        <dt>Running Balance</dt><dd>${fmt(t.runningBalance || 0)}</dd>
        <dt>Currency</dt><dd>${escapeHtml(t.currency?.code || '—')}</dd>
        <dt>Payment Type</dt><dd>${escapeHtml(t.paymentDetail?.paymentType?.name || '—')}</dd>
        <dt>Receipt No</dt><dd>${escapeHtml(t.paymentDetail?.receiptNumber || '—')}</dd>
        <dt>Reversed</dt><dd>${(t.reversed || t.manuallyReversed) ? 'Yes' : 'No'}</dd>
        <dt>Submitted By</dt><dd>${escapeHtml(t.submittedByUsername || '—')}</dd>
      </dl>`;
  } catch (e) {
    body.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export function openSavingsTransactionModal({ id, type, label }) {
  const mid = `sv-tx-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', `${label} failed`, e.detail?.defaultUserMessage || e.message); }
  });
}

export function openHoldModal(id) {
  const mid = `sv-hold-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Hold failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openAdjustSavingsTxModal(id, txId, onSuccess) {
  const mid = `sv-adj-${Date.now()}`;
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
