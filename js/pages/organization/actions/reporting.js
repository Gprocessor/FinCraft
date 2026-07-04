/* FinCraft · pages/organization/actions/reporting.js — ad-hoc query and entity datatable check modals.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export function openAdhocQueryModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'adhoc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Adhoc Query</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">Query name * <input id="adhoc-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
          <label>Output table name * <input id="adhoc-table" class="form-control" value="${escapeHtml(existing?.tableName || '')}" required/></label>
          <label>Table fields (comma-separated) * <input id="adhoc-fields" class="form-control" value="${escapeHtml(existing?.tableFields || '')}" required/></label>
          <label>Email <input id="adhoc-email" class="form-control" value="${escapeHtml(existing?.email || '')}"/></label>
          <label>Report run frequency
            <select id="adhoc-freq" class="form-control">
              <option value="1" ${existing?.reportRunFrequency?.id === 1 ? 'selected' : ''}>Daily</option>
              <option value="2" ${existing?.reportRunFrequency?.id === 2 ? 'selected' : ''}>Weekly</option>
              <option value="3" ${existing?.reportRunFrequency?.id === 3 ? 'selected' : ''}>Monthly</option>
            </select>
          </label>
          <label>Run every N <input type="number" id="adhoc-every" class="form-control" value="${existing?.reportRunEvery ?? 1}" min="1"/></label>
          <label class="checkbox-row"><input type="checkbox" id="adhoc-active" ${existing?.isActive !== false ? 'checked' : ''}/> Active</label>
          <label class="full">SQL Query *
            <textarea id="adhoc-query" class="form-control" rows="8" required placeholder="SELECT ...">${escapeHtml(existing?.query || '')}</textarea>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="adhoc-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#adhoc-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#adhoc-name').value.trim();
    const tableName = modalEl.querySelector('#adhoc-table').value.trim();
    const tableFields = modalEl.querySelector('#adhoc-fields').value.trim();
    const query = modalEl.querySelector('#adhoc-query').value.trim();
    if (!name || !tableName || !tableFields || !query) { toast('warn', 'Fill required fields', ''); return; }

    const payload = {
      name, tableName, tableFields, query,
      reportRunFrequency: parseInt(modalEl.querySelector('#adhoc-freq').value) || 1,
      reportRunEvery: parseInt(modalEl.querySelector('#adhoc-every').value) || 1,
      isActive: modalEl.querySelector('#adhoc-active').checked
    };
    const email = modalEl.querySelector('#adhoc-email').value.trim();
    if (email) payload.email = email;

    try {
      if (isEdit) await api.adhocQueries.update(existing.id, payload);
      else        await api.adhocQueries.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Adhoc query updated' : 'Adhoc query created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEntityDatatableCheckModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.entityDatatableChecks.template(); } catch {}

  const entityOptions = tpl.entities || [
    { id: 'm_client',          name: 'Client' },
    { id: 'm_group',           name: 'Group' },
    { id: 'm_loan',            name: 'Loan' },
    { id: 'm_savings_account', name: 'Savings Account' }
  ];

  const statusOptions = tpl.statusClient || tpl.statusOptions || [
    { id: 100, name: 'Pending Submission' },
    { id: 200, name: 'Pending Activation' },
    { id: 300, name: 'Pending Approval' },
    { id: 400, name: 'Pending Disbursal' }
  ];

  const datatables = tpl.datatables || [];
  const products = tpl.products || tpl.loanProducts || [];

  const mid = 'edc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>New Entity Datatable Check</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Entity *
            <select id="edc-entity" class="form-control" required>
              <option value="">Select entity…</option>
              ${entityOptions.map(e => `<option value="${e.id || e.name}">${escapeHtml(e.name)}</option>`).join('')}
            </select>
          </label>
          <label>Status (workflow stage) *
            <select id="edc-status" class="form-control" required>
              <option value="">Select stage…</option>
              ${statusOptions.map(s => `<option value="${s.id}">${escapeHtml(s.name || s.value)}</option>`).join('')}
            </select>
          </label>
          <label>Datatable *
            <select id="edc-datatable" class="form-control" required>
              <option value="">Select datatable…</option>
              ${datatables.map(dt => `<option value="${dt.registeredTableName || dt.name}">${escapeHtml(dt.registeredTableName || dt.name)}</option>`).join('')}
            </select>
          </label>
          <label>Product (optional — leave blank for all)
            <select id="edc-product" class="form-control">
              <option value="">All products</option>
              ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="msg-banner b-warning mt-2">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Once active, the selected workflow stage will block until the datatable is populated for the entity.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="edc-save">Create Check</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#edc-save').addEventListener('click', async () => {
    const entity = modalEl.querySelector('#edc-entity').value;
    const status = parseInt(modalEl.querySelector('#edc-status').value);
    const datatableName = modalEl.querySelector('#edc-datatable').value;
    const productId = modalEl.querySelector('#edc-product').value;

    if (!entity || !status || !datatableName) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {};
    payload.entity = entity;
    payload.status = status;
    payload.datatableName = datatableName;
    if (productId) payload.productId = parseInt(productId);

    try {
      await api.entityDatatableChecks.create(payload);
      modalEl.remove();
      toast('success', 'Check created', datatableName);
      onSuccess();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
