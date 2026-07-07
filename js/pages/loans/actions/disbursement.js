/* FinCraft · pages/loans/actions/disbursement.js — disburse (to loan / to savings) modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { toast } from '../../../ui.js';
import { openSimpleLoanCmdModal } from './closure.js';

export async function openModifyAvailableDisbursementAmountModal(loanId, currentAmount, onSuccess) {
  const mid = `ln-modava-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Modify Available Disbursement Amount</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>New available disbursement amount * <input type="number" step="0.01" id="mava-amount" class="form-control" value="${currentAmount ?? ''}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="mava-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#mava-save').addEventListener('click', async () => {
    const availableDisbursementAmount = parseFloat(el.querySelector('#mava-amount').value);
    if (!isFinite(availableDisbursementAmount) || availableDisbursementAmount < 0) {
      toast('warn', 'Enter a valid amount', ''); return;
    }
    try {
      await api.loans.updateAvailableDisbursementAmount(loanId, { availableDisbursementAmount, locale: LOCALE });
      el.remove(); toast('success', 'Available disbursement amount updated', ''); onSuccess?.();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openDisburseModal(id) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `ln-disb-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Disburse Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Disbursement date * <input type="date" id="d-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Transaction amount (override) <input type="number" step="0.01" id="d-amount" class="form-control"/></label>
          <label class="mt-2">Payment type
            <select id="d-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="d-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="d-save">Disburse</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#d-save').addEventListener('click', async () => {
    const payload = {
      actualDisbursementDate: el.querySelector('#d-date').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const amt = parseFloat(el.querySelector('#d-amount').value);
    if (!isNaN(amt)) payload.transactionAmount = amt;
    const pt  = el.querySelector('#d-pt').value;
    if (pt) payload.paymentTypeId = parseInt(pt);
    const note= el.querySelector('#d-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.loans.disburse(id, payload);
      el.remove();
      toast('success', 'Loan disbursed', `#${id}`);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Disburse failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openDisburseToSavingsModal(id) {
  openSimpleLoanCmdModal({
    id, command: 'disburseToSavings', label: 'Disburse to Savings', dateField: 'actualDisbursementDate'
  });
}
