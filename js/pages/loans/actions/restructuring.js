/* FinCraft · pages/loans/actions/restructuring.js — reage, reamortize, tranche edit, and delinquency action modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openReageModal(id) {
  const mid = `ln-reage-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Re-age Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="ra-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="ra-note" class="form-control" rows="2"></textarea></label>
          <div id="ra-preview" class="mt-2"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-secondary" id="ra-preview-btn">Preview</button>
          <button class="btn-primary" id="ra-save">Re-age Loan</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  const buildPayload = () => {
    const payload = { transactionDate: el.querySelector('#ra-date').value, dateFormat: DATE_FORMAT, locale: LOCALE };
    const note = el.querySelector('#ra-note').value.trim();
    if (note) payload.note = note;
    return payload;
  };
  el.querySelector('#ra-preview-btn').addEventListener('click', async () => {
    const box = el.querySelector('#ra-preview');
    box.innerHTML = '<div class="empty-state-row">Loading preview…</div>';
    try {
      const res = await api.loans.reagePreview(id, buildPayload());
      const installments = res?.periods || res?.installments || [];
      box.innerHTML = `<div class="msg-banner b-info small">
        ${installments.length ? `Preview shows ${installments.length} resulting installment(s).` : 'Preview returned no schedule detail.'}
      </div>`;
    } catch (e) { box.innerHTML = `<div class="text-error small">${escapeHtml(extractFineractError(e))}</div>`; }
  });
  el.querySelector('#ra-save').addEventListener('click', async () => {
    try {
      await api.loans.reage(id, buildPayload());
      el.remove();
      toast('success', 'Loan re-aged', '');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Re-age failed', extractFineractError(e)); }
  });
}

export async function openReamortizeModal(id) {
  const mid = `ln-reamort-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Re-amortize Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="rm-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="rm-note" class="form-control" rows="2"></textarea></label>
          <div id="rm-preview" class="mt-2"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-secondary" id="rm-preview-btn">Preview</button>
          <button class="btn-primary" id="rm-save">Re-amortize Loan</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  const buildPayload = () => {
    const payload = { transactionDate: el.querySelector('#rm-date').value, dateFormat: DATE_FORMAT, locale: LOCALE };
    const note = el.querySelector('#rm-note').value.trim();
    if (note) payload.note = note;
    return payload;
  };
  el.querySelector('#rm-preview-btn').addEventListener('click', async () => {
    const box = el.querySelector('#rm-preview');
    box.innerHTML = '<div class="empty-state-row">Loading preview…</div>';
    try {
      const res = await api.loans.reamortizePreview(id, buildPayload());
      const installments = res?.periods || res?.installments || [];
      box.innerHTML = `<div class="msg-banner b-info small">
        ${installments.length ? `Preview shows ${installments.length} resulting installment(s).` : 'Preview returned no schedule detail.'}
      </div>`;
    } catch (e) { box.innerHTML = `<div class="text-error small">${escapeHtml(extractFineractError(e))}</div>`; }
  });
  el.querySelector('#rm-save').addEventListener('click', async () => {
    try {
      await api.loans.reamortize(id, buildPayload());
      el.remove();
      toast('success', 'Loan re-amortized', '');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Re-amortize failed', extractFineractError(e)); }
  });
}

export async function openTrancheEditorModal(loanId, existing, onSuccess) {
  const isEdit = !!existing;
  const mid = `ln-tranche-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      else        await api.loans.editDisbursements(loanId, { disbursementData: [payload] });
      el.remove();
      toast('success', isEdit ? 'Tranche updated' : 'Tranche added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
  });
}

export async function openBulkTrancheEditorModal(loanId, onSuccess) {
  let list = [];
  try {
    // No bare GET /loans/{id}/disbursements collection endpoint exists per Fineract source — read the real
    // source of this data: disbursementDetails embedded in the loan account via the associations query param.
    const l = await api.loans.get(loanId, 'disbursementDetails');
    list = (l.disbursementDetails || []).filter(d => !d.actualDisbursementDate);
  } catch (e) {
    toast('error', 'Failed to load tranches', extractFineractError(e)); return;
  }
  if (!list.length) { toast('warn', 'No editable (undisbursed) tranches found', ''); return; }
  const mid = `ln-bulktranche-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit All Disbursements</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted small mb-2">
            <i class="fa-solid fa-circle-info"></i>
            The API reference documents this endpoint's path but not its request body —
            this sends the same field shape used elsewhere for disbursement data
            (an array of id/date/principal). Verify against your instance before relying
            on it for production edits.
          </div>
          <table class="table">
            <thead><tr><th>#</th><th>Expected Date</th><th>Principal</th></tr></thead>
            <tbody>${list.map((d, i) => `
              <tr data-tranche-id="${d.id}">
                <td>${i + 1}</td>
                <td><input type="date" class="form-control bt-date" value="${d.expectedDisbursementDate || ''}"/></td>
                <td><input type="number" step="0.01" class="form-control bt-principal" value="${d.principal ?? ''}"/></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="bt-save">Save All</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#bt-save').addEventListener('click', async () => {
    const rows = el.querySelectorAll('tr[data-tranche-id]');
    const disbursementData = Array.from(rows).map(row => ({
      id: parseInt(row.dataset.trancheId),
      expectedDisbursementDate: row.querySelector('.bt-date').value,
      principal: parseFloat(row.querySelector('.bt-principal').value)
    }));
    if (disbursementData.some(d => !d.expectedDisbursementDate || !isFinite(d.principal))) {
      toast('warn', 'Fill in all dates and principal amounts', ''); return;
    }
    try {
      await api.loans.editDisbursements(loanId, { disbursementData, dateFormat: DATE_FORMAT, locale: LOCALE });
      el.remove(); toast('success', 'Disbursements updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openDelinquencyActionModal(loanId, onSuccess) {
  const mid = `ln-delq-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
    } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
  });
}
