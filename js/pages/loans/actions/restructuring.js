/* FinCraft · pages/loans/actions/restructuring.js — reage, reamortize, tranche edit, and delinquency action modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { openSimpleLoanCmdModal } from './closure.js';

export function openReageModal(id) {
  openSimpleLoanCmdModal({ id, command: 'reAge', label: 'Re-age Loan', dateField: 'transactionDate' });
}

export function openReamortizeModal(id) {
  openSimpleLoanCmdModal({ id, command: 'reAmortize', label: 'Re-amortize Loan', dateField: 'transactionDate' });
}

export async function openTrancheEditorModal(loanId, existing, onSuccess) {
  const isEdit = !!existing;
  const mid = `ln-tranche-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Add'} Tranche</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Expected disbursement date * <input type="date" id="tr-date" class="form-control" value="${existing?.expectedDisbursementDate || today()}" required/></label>
          <label class="mt-2">Principal * <input type="number" step="0.01" id="tr-principal" class="form-control" value="${existing?.principal || ''}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tr-save">${isEdit ? 'Save Changes' : 'Add Tranche'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tr-save').addEventListener('click', async () => {
    const payload = {
      expectedDisbursementDate: el.querySelector('#tr-date').value,
      principal: parseFloat(el.querySelector('#tr-principal').value),
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (isNaN(payload.principal)) { toast('warn', 'Enter principal', ''); return; }
    try {
      if (isEdit) await api.loans.updateDisbursement(loanId, existing.id, payload);
      else        await api.loans.addDisbursement(loanId, { disbursementData: [payload] });
      el.remove();
      toast('success', isEdit ? 'Tranche updated' : 'Tranche added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openDelinquencyActionModal(loanId, onSuccess) {
  const mid = `ln-delq-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Delinquency Action</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Action *
            <select id="da-action" class="form-control" required>
              <option value="PAUSE">Pause Delinquency</option>
              <option value="RESUME">Resume Delinquency</option>
            </select>
          </label>
          <label class="mt-2">Start date * <input type="date" id="da-start" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">End date <input type="date" id="da-end" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="da-save">Submit</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#da-save').addEventListener('click', async () => {
    const payload = {
      action: el.querySelector('#da-action').value,
      startDate: el.querySelector('#da-start').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const endDate = el.querySelector('#da-end').value;
    if (endDate) payload.endDate = endDate;
    try {
      await api.loans.addDelinquencyAction(loanId, payload);
      el.remove();
      toast('success', 'Delinquency action posted', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}
