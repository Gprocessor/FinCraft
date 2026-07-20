/* FinCraft · pages/loans/actions/repayment.js — repayment, waiver, chargeback, and goodwill credit modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { toast } from '../../../ui.js';
import { openSimpleLoanCmdModal } from './closure.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export function openWaiveInterestModal(id) {
  const mid = `ln-waive-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Waive Interest</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="wi-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount to waive * <input type="number" step="0.01" id="wi-amount" class="form-control" required/></label>
          <label class="mt-2">Note <textarea id="wi-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="wi-save">Waive Interest</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#wi-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#wi-date').value;
    const transactionAmount = parseFloat(el.querySelector('#wi-amount').value);
    if (isNaN(transactionAmount)) { toast('warn', 'Enter amount', ''); return; }
    const note = el.querySelector('#wi-note').value.trim();
    try {
      await api.loans.waiveInterest(id, {
        transactionDate, transactionAmount,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Interest waived', `${transactionAmount}`);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
  });
}

export function openRecoverPaymentModal(id) {
  openSimpleLoanCmdModal({
    id, command: 'recoverypayment', label: 'Recover Repayment',
    dateField: 'transactionDate', isTransaction: true, amountRequired: true
  });
}

export async function openAdjustTransactionModal(loanId, txId, onSuccess) {
  const mid = `tx-adjust-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Adjust Transaction #${txId}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>New transaction date * <input type="date" id="adj-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">New transaction amount * <input type="number" step="0.01" id="adj-amount" class="form-control" required/></label>
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
      await api.loans.adjustTransaction(loanId, txId, {
        transactionDate: el.querySelector('#adj-date').value,
        transactionAmount: amt,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(el.querySelector('#adj-note').value.trim() && { note: el.querySelector('#adj-note').value.trim() })
      });
      el.remove();
      toast('success', 'Transaction adjusted', `#${txId}`);
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', extractFineractError(e)); }
  });
}

export async function openChargebackModal(loanId, txId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `tx-cb-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Chargeback Transaction #${txId}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction amount * <input type="number" step="0.01" id="cb-amount" class="form-control" required/></label>
          <label class="mt-2">Payment type
            <select id="cb-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="cb-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="cb-save">Post Chargeback</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cb-save').addEventListener('click', async () => {
    const amt = parseFloat(el.querySelector('#cb-amount').value);
    if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
    const pt = el.querySelector('#cb-pt').value;
    const note = el.querySelector('#cb-note').value.trim();
    try {
      await api.loans.chargebackTx(loanId, txId, {
        transactionAmount: amt,
        locale: LOCALE,
        ...(pt && { paymentTypeId: parseInt(pt) }),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Chargeback posted', `#${txId}`);
      onSuccess();
    } catch (e) { toast('error', 'Chargeback failed', extractFineractError(e)); }
  });
}

export function openGoodwillModal(loanId, onSuccess) {
  openSimpleTxModal({
    loanId, label: 'Goodwill Credit',
    apiCall: (body) => api.loans.goodwillCredit(loanId, body),
    onSuccess
  });
}

export function openChargeRefundModal(loanId, onSuccess) {
  openSimpleTxModal({
    loanId, label: 'Charge Refund',
    apiCall: (body) => api.loans.chargeRefund(loanId, body),
    onSuccess
  });
}

export function openSimpleTxModal({ loanId, label, apiCall, onSuccess }) {
  const mid = `tx-simple-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Transaction date * <input type="date" id="st-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="st-amount" class="form-control" required/></label>
          <label class="mt-2">Note <textarea id="st-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="st-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#st-save').addEventListener('click', async () => {
    const amt = parseFloat(el.querySelector('#st-amount').value);
    if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
    const note = el.querySelector('#st-note').value.trim();
    try {
      await apiCall({
        transactionDate: el.querySelector('#st-date').value,
        transactionAmount: amt,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', `${label} posted`, '');
      onSuccess();
    } catch (e) { toast('error', `${label} failed`, extractFineractError(e)); }
  });
}
