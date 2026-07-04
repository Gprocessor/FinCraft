/* FinCraft · pages/organization/actions/si.js — standing instruction modal.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export async function openStandingInstructionModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.standingInstructions.template(); } catch {}
  const recurrenceTypes  = (tpl.recurrenceTypeOptions  || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Periodic</option><option value="2">Fixed</option>';
  const statusOptions    = (tpl.statusOptions          || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Active</option>';
  const instructionTypes = (tpl.instructionTypeOptions || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Fixed</option>';

  const mid = 'si-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>New Standing Instruction</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Instruction name * <input id="si-name" class="form-control" required/></label>
          <label>From savings account (account no) * <input id="si-from" class="form-control" required/></label>
          <label>To savings account (account no) * <input id="si-to" class="form-control" required/></label>
          <label>Amount * <input type="number" step="0.01" id="si-amount" class="form-control" required/></label>
          <label>Transfer type <select id="si-inst-type" class="form-control">${instructionTypes}</select></label>
          <label>Priority <input type="number" id="si-priority" class="form-control" value="1"/></label>
          <label>Recurrence type <select id="si-recurrence-type" class="form-control">${recurrenceTypes}</select></label>
          <label>Recurrence frequency <input type="number" id="si-recurrence-freq" class="form-control" value="1"/></label>
          <label>Recurrence interval
            <select id="si-recurrence-interval" class="form-control">
              <option value="0">Days</option><option value="1">Weeks</option>
              <option value="2">Months</option><option value="3" selected>Years</option>
            </select>
          </label>
          <label>Valid from * <input type="date" id="si-valid-from" class="form-control" required/></label>
          <label>Valid to <input type="date" id="si-valid-to" class="form-control"/></label>
          <label>Status <select id="si-status" class="form-control">${statusOptions}</select></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="si-save">Create</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#si-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#si-name').value.trim();
    const fromAccountNo = modalEl.querySelector('#si-from').value.trim();
    const toAccountNo   = modalEl.querySelector('#si-to').value.trim();
    const amount = parseFloat(modalEl.querySelector('#si-amount').value);
    const validFrom = modalEl.querySelector('#si-valid-from').value;
    if (!name || !fromAccountNo || !toAccountNo || isNaN(amount) || !validFrom) {
      toast('warn', 'Fill required fields', ''); return;
    }
    const validTo = modalEl.querySelector('#si-valid-to').value;
    const payload = {
      name, amount, locale: LOCALE, dateFormat: DATE_FORMAT,
      fromAccountNumber: fromAccountNo,
      toAccountNumber: toAccountNo,
      transferType:        parseInt(modalEl.querySelector('#si-inst-type').value) || 1,
      priority:            parseInt(modalEl.querySelector('#si-priority').value) || 1,
      instructionType:     parseInt(modalEl.querySelector('#si-inst-type').value) || 1,
      recurrenceType:      parseInt(modalEl.querySelector('#si-recurrence-type').value) || 1,
      recurrenceFrequency: parseInt(modalEl.querySelector('#si-recurrence-freq').value) || 1,
      recurrenceInterval:  parseInt(modalEl.querySelector('#si-recurrence-interval').value) || 3,
      validFrom,
      status:              parseInt(modalEl.querySelector('#si-status').value) || 1
    };
    if (validTo) payload.validTill = validTo;
    try {
      await api.standingInstructions.create(payload);
      modalEl.remove();
      toast('success', 'Standing instruction created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
