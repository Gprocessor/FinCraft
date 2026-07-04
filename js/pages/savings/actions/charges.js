/* FinCraft · pages/savings/actions/charges.js — apply/pay savings charge modals.
   Auto-split from the original monolithic pages/savings/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

export async function openApplySavingsChargeModal(id, onSuccess) {
  let charges = [];
  try {
    // chargeAppliesTo: 2 = Savings charges in Fineract
    const r = await api.charges.list({ chargeAppliesTo: 2 });
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `sv-applycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
      await api.savings.addCharge(id, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openPaySavingsChargeModal(id, chargeId, onSuccess) {
  const mid = `sv-paycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
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
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.savings.payCharge(id, chargeId, {
        amount, transactionDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}
