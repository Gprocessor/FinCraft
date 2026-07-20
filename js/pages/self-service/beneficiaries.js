/* FinCraft · pages/self-service/beneficiaries.js — external transfer beneficiaries tab loader and modal.
   Auto-split from the original monolithic pages/self-service.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num } from '../../utils.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function loadBeneficiaries(c) {
  const el = c.querySelector('#ss-1');
  el.innerHTML = '<div class="empty-state-row">Loading beneficiaries…</div>';

  try {
    const res = await api.selfService.beneficiaries();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Third-Party Transfer (TPT) Beneficiaries</h3>
          <span class="text-muted">${num(list.length)} beneficiar${list.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        ${can('CREATE_USER') ? '<button class="btn-primary" id="btn-add-ben"><i class="fa-solid fa-plus"></i> Add Beneficiary</button>' : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        TPT beneficiaries allow portal users to make transfers to pre-approved external accounts.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Office</th><th>Client</th>
            <th>Account</th><th>Type</th><th></th>
          </tr></thead>
          <tbody>${list.map(b => `
            <tr>
              <td><b>${escapeHtml(b.name || '—')}</b></td>
              <td>${escapeHtml(b.officeName || '—')}</td>
              <td>${escapeHtml(b.clientName || '—')}</td>
              <td>${escapeHtml(b.accountNumber || b.accountNo || '—')}</td>
              <td>${escapeHtml(b.accountType?.value || b.accountType || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_USER') ? `<button class="btn-mini" data-edit-ben="${b.id}">Edit</button>` : ''}
                ${can('DELETE_USER') ? `<button class="btn-mini btn-danger" data-del-ben="${b.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-user-tag"></i>
          <h3>No beneficiaries defined</h3>
          ${can('CREATE_USER') ? '<div class="text-muted mt-2">Add the first beneficiary using the button above.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-add-ben')?.addEventListener('click', () =>
      openBeneficiaryFormModal(null, () => loadBeneficiaries(c))
    );

    el.querySelectorAll('[data-edit-ben]').forEach(b => b.addEventListener('click', () => {
      const existing = list.find(x => String(x.id) === b.dataset.editBen);
      if (existing) openBeneficiaryFormModal(existing, () => loadBeneficiaries(c));
    }));

    el.querySelectorAll('[data-del-ben]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete beneficiary?',
        message: 'This will fail if any pending transfer references this beneficiary.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.selfService.deleteBeneficiary(b.dataset.delBen);
        toast('success', 'Beneficiary deleted', '');
        loadBeneficiaries(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">TPT beneficiaries not enabled on this tenant: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}

function openBeneficiaryFormModal(existing, onSuccess) {
  const isEdit = !!existing;

  // Account types per Fineract TPT spec
  const accountTypes = [
    { id: 1, name: 'Loan' },
    { id: 2, name: 'Savings' }
  ];

  const mid = 'ben-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');

  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>' + (isEdit ? 'Edit' : 'Add') + ' TPT Beneficiary</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<div class="form-grid">' +
        '<label>Beneficiary nickname * <input id="bf-name" class="form-control" value="' + escapeHtml(existing?.name || '') + '" required/></label>' +
        '<label>Office name * <input id="bf-office" class="form-control" value="' + escapeHtml(existing?.officeName || '') + '" required ' + (isEdit ? 'disabled' : '') + '/></label>' +
        '<label>Client account number * <input id="bf-client-acc" class="form-control" value="' + escapeHtml(existing?.accountNumber || existing?.accountNo || '') + '" required ' + (isEdit ? 'disabled' : '') + '/></label>' +
        '<label>Account type *' +
          '<select id="bf-acc-type" class="form-control" required ' + (isEdit ? 'disabled' : '') + '>' +
            '<option value="">Select…</option>' +
            accountTypes.map(t => '<option value="' + t.id + '"' + ((existing?.accountType?.id || existing?.accountTypeId) === t.id ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('') +
          '</select>' +
        '</label>' +
        '<label>Transfer limit ' +
          '<input type="number" step="0.01" id="bf-limit" class="form-control" value="' + (existing?.transferLimit ?? '') + '"/>' +
        '</label>' +
      '</div>' +
      '<div class="msg-banner b-info mt-2">' +
        '<i class="fa-solid fa-circle-info"></i> ' +
        (isEdit ? 'Only nickname and transfer limit can be edited after creation.' : 'The system validates that the office name + account number combination exists.') +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Cancel</button>' +
      '<button class="btn-primary" id="bf-save">' + (isEdit ? 'Save Changes' : 'Add Beneficiary') + '</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#bf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#bf-name').value.trim();
    const officeName = modalEl.querySelector('#bf-office').value.trim();
    const accountNumber = modalEl.querySelector('#bf-client-acc').value.trim();
    const accountType = parseInt(modalEl.querySelector('#bf-acc-type').value);
    const limit = parseFloat(modalEl.querySelector('#bf-limit').value);

    if (!name) { toast('warn', 'Enter a name', ''); return; }
    if (!isEdit && (!officeName || !accountNumber || !accountType)) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {};
    payload.name = name;
    if (isFinite(limit)) payload.transferLimit = limit;

    if (!isEdit) {
      payload.officeName = officeName;
      payload.accountNumber = accountNumber;
      payload.accountType = accountType;
    }

    try {
      if (isEdit) await api.selfService.updateBeneficiary(existing.id, payload);
      else        await api.selfService.addBeneficiary(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Beneficiary updated' : 'Beneficiary added', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}
