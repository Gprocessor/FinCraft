/* FinCraft · pages/groups/actions/charges.js — apply/pay group charge modals.
   Auto-split from the original monolithic pages/groups/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

export async function openApplyChargeModal(groupId, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 4 }); // 4 = Group charges in Fineract
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `grp-charge-${Date.now()}`;
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
      await api.groups.addCharge(groupId, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openPayChargeModal(groupId, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `grp-pay-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
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
      await api.groups.payCharge(groupId, chargeId, {
        amount, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}
