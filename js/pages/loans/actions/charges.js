/* FinCraft · pages/loans/actions/charges.js — apply/pay/adjust loan charge modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml, fmt } from '../../../utils.js';
import { toast } from '../../../ui.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openApplyLoanChargeModal(loanId, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 1 }); // 1 = Loan charges
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `ln-applycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Charge *
            <select id="ac-charge" class="form-control" required>
              <option value="">Select charge…</option>
              ${charges.map(ch => `<option value="${ch.id}" data-amount="${ch.amount}">${escapeHtml(ch.name)} (${fmt(ch.amount)})</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="ac-amount" class="form-control" required/></label>
          <label class="mt-2">Due date <input type="date" id="ac-due" class="form-control" value="${today()}"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ac-save">Apply</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ac-charge').addEventListener('change', (e) => {
    el.querySelector('#ac-amount').value = e.target.selectedOptions[0]?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    const dueDate = el.querySelector('#ac-due').value;
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields', ''); return; }
    try {
      await api.loans.addCharge(loanId, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', extractFineractError(e)); }
  });
}

export async function openPayLoanChargeModal(loanId, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `ln-paycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pc-save">Pay</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#pc-amount').value);
    const transactionDate = el.querySelector('#pc-date').value;
    const paymentTypeId = el.querySelector('#pc-pt').value;
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.loans.payCharge(loanId, chargeId, {
        amount, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', extractFineractError(e)); }
  });
}

export async function openEditLoanChargeModal(loanId, chargeId, onSuccess) {
  let charge = null;
  try { charge = await api.loans.getCharge(loanId, chargeId); } catch (e) {
    toast('error', 'Failed to load charge', extractFineractError(e)); return;
  }
  const mid = `ln-editcharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(charge?.name || charge?.chargeName || '—')}</div>
          <label>Amount * <input type="number" step="0.01" id="ec-amount" class="form-control" value="${charge?.amount ?? charge?.amountOrPercentage ?? ''}" required/></label>
          <label class="mt-2">Due date <input type="date" id="ec-due" class="form-control" value="${charge?.dueDate ? (Array.isArray(charge.dueDate) ? charge.dueDate.join('-') : charge.dueDate) : ''}"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ec-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ec-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#ec-amount').value);
    const dueDate = el.querySelector('#ec-due').value;
    if (!isFinite(amount)) { toast('warn', 'Enter a valid amount', ''); return; }
    const payload = { amount, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (dueDate) payload.dueDate = dueDate;
    try {
      await api.loans.updateCharge(loanId, chargeId, payload);
      el.remove(); toast('success', 'Charge updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openAdjustLoanChargeModal(loanId, chargeId, onSuccess) {
  const mid = `ln-adjcharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Adjust Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Adjustment amount * <input type="number" step="0.01" id="aj-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="aj-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Note <textarea id="aj-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="aj-save">Adjust</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#aj-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#aj-amount').value);
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.loans.chargeAdjustment(loanId, chargeId, {
        amount,
        transactionDate: el.querySelector('#aj-date').value,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(el.querySelector('#aj-note').value.trim() && { note: el.querySelector('#aj-note').value.trim() })
      });
      el.remove();
      toast('success', 'Charge adjusted', '');
      onSuccess();
    } catch (e) { toast('error', 'Adjust failed', extractFineractError(e)); }
  });
}
