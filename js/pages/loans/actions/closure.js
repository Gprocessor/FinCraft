/* FinCraft · pages/loans/actions/closure.js — charge-off, foreclose, close, and other terminal-status modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { toast } from '../../../ui.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export function openChargeOffModal(id) {
  openSimpleLoanCmdModal({ id, command: 'chargeOff', label: 'Charge Off Loan', dateField: 'transactionDate' });
}

export function openForecloseModal(id) {
  openSimpleLoanCmdModal({ id, command: 'foreclosure', label: 'Foreclose Loan', dateField: 'transactionDate' });
}

export function openCloseLoanModal(id) {
  openSimpleLoanCmdModal({ id, command: 'close', label: 'Close Loan', dateField: 'transactionDate' });
}

export function openSimpleLoanCmdModal({ id, command, label, dateField = 'transactionDate', isTransaction = false, amountRequired = false }) {
  const mid = `lncmd-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="cmd-date" class="form-control" value="${today()}" required/></label>
          ${amountRequired ? `<label class="mt-2">Amount * <input type="number" step="0.01" id="cmd-amount" class="form-control" required/></label>` : ''}
          <label class="mt-2">Note <textarea id="cmd-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="cmd-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cmd-save').addEventListener('click', async () => {
 const payload = {
      [dateField]: el.querySelector('#cmd-date').value,
      dateFormat: DATE_FORMAT,
      locale: LOCALE
    };
    if (amountRequired) {
      const amt = parseFloat(el.querySelector('#cmd-amount').value);
      if (isNaN(amt)) { toast('warn', 'Enter amount', ''); return; }
      payload.transactionAmount = amt;
    }
    const note = el.querySelector('#cmd-note').value.trim();
    if (note) payload.note = note;
    try {
      // AUDIT FIX (Loans LU-1, UI-contract sweep): map UI command tokens to their corrected
      // API-layer methods so the terminal-status buttons do NOT bypass the audited routing/
      // token via the generic escape hatch. Previously chargeOff/foreclosure/close fell
      // through to api.loans.command() -> POST /loans/{id}?command=..., re-introducing the
      // L-01/L-04/L-05 bugs (wrong resource + 'chargeOff' token) at the UI layer and silently
      // undoing the API-method fixes. Now they route through the fixed methods, which target
      // /loans/{id}/transactions with the correct tokens (charge-off, foreclosure, close).
      const apiMethodMap = {
        recoverypayment: 'recoverPayment',
        chargeOff:       'chargeOff',   // -> /loans/{id}/transactions?command=charge-off
        foreclosure:     'foreclose',   // -> /loans/{id}/transactions?command=foreclosure
        close:           'close',       // -> /loans/{id}/transactions?command=close
      };
      const methodName = apiMethodMap[command];
      if (methodName && typeof api.loans[methodName] === 'function') {
        await api.loans[methodName](id, payload);
      } else {
        await api.loans.command(id, command, payload);
      }
      el.remove();
      toast('success', `${label} successful`, `Loan #${id}`);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', `${label} failed`, extractFineractError(e)); }
  });
}
