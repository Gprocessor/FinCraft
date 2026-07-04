/* FinCraft · pages/system/actions/config.js — code/code-value/maker-checker/business-date modals.
   Auto-split from the original monolithic pages/system/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { can } from '../shared.js';

export function openNewCodeModal(onSuccess) {
  const mid = 'code-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>New Code</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Code name * <input id="code-name" class="form-control" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Create</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = m.querySelector('#code-name').value.trim();
    if (!name) { toast('warn', 'Enter a code name', ''); return; }
    try {
      await api.codes.create({ name });
      m.remove();
      toast('success', 'Code created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

export async function openCodeValuesModal(codeId, codeName) {
  const mid = 'cv-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${escapeHtml(codeName)} — Values</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div id="cv-list"><div class="empty-state-row">Loading…</div></div>
          <h4 class="mt-3">Add Value</h4>
          <div class="form-grid">
            <label>Name * <input id="cv-name" class="form-control" required/></label>
            <label>Description <input id="cv-desc" class="form-control"/></label>
            <label>Position <input type="number" id="cv-pos" class="form-control" value="0"/></label>
            <label class="checkbox-row"><input type="checkbox" id="cv-active" checked/> Active</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
          ${can('CREATE_CODEVALUE') ? `<button class="btn-primary" id="${mid}-save">Add Value</button>` : ''}
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  async function reloadValues() {
    const listEl = m.querySelector('#cv-list');
    listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const vals = await api.codes.values(codeId);
      const list = Array.isArray(vals) ? vals : [];
      listEl.innerHTML = list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Description</th><th>Position</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(v => `
            <tr>
              <td>${escapeHtml(v.name || '—')}</td>
              <td>${escapeHtml(v.description || '—')}</td>
              <td>${v.position ?? '—'}</td>
              <td>${v.active !== false ? 'Yes' : 'No'}</td>
              <td class="text-right">
                ${can('DELETE_CODEVALUE') ? `<button class="btn-mini btn-danger" data-del-cv="${v.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No values defined</div>';

      listEl.querySelectorAll('[data-del-cv]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({ title: 'Delete code value?', danger: true, confirmText: 'Delete' })) return;
        try {
          await api.codes.deleteValue(codeId, b.dataset.delCv);
          toast('success', 'Value deleted', '');
          reloadValues();
        } catch (e) {
          toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message);
        }
      }));
    } catch (e) {
      listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
    }
  }

  reloadValues();

  m.querySelector('#' + mid + '-save')?.addEventListener('click', async () => {
    const name = m.querySelector('#cv-name').value.trim();
    const description = m.querySelector('#cv-desc').value.trim();
    const position = parseInt(m.querySelector('#cv-pos').value) || 0;
    const isActive = m.querySelector('#cv-active').checked;
    if (!name) { toast('warn', 'Enter a value name', ''); return; }

    const payload = {};
    payload.name = name;
    payload.position = position;
    payload.isActive = isActive;
    if (description) payload.description = description;

    try {
      await api.codes.createValue(codeId, payload);
      m.querySelector('#cv-name').value = '';
      m.querySelector('#cv-desc').value = '';
      toast('success', 'Value added', name);
      reloadValues();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

export function openSetBusinessDateModal() {
  const mid = 'bdate-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Set Business Date</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Changing the business date forces all date-aware operations to use this date. Use with caution.
          </div>
          <label>New business date *
            <input type="date" id="bdate-val" class="form-control" value="${today()}" required/>
          </label>
          <label class="mt-2">Type
            <select id="bdate-type" class="form-control">
              <option value="BUSINESS_DATE" selected>BUSINESS_DATE</option>
              <option value="COB_DATE">COB_DATE</option>
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="bdate-save">Set Date</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#bdate-save').addEventListener('click', async () => {
    const date = m.querySelector('#bdate-val').value;
    const type = m.querySelector('#bdate-type').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }

    const payload = {};
    payload.date = date;
    payload.type = type;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;

    try {
      await api.cob.businessDate.set(payload);
      m.remove();
      toast('success', 'Business date updated', date);
    } catch (e) {
      toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

export function extractMCEntityGroup(code) {
  if (!code) return 'Other';
  const prefixes = ['CREATE_', 'READ_', 'UPDATE_', 'DELETE_', 'APPROVE_', 'REJECT_',
                    'ACTIVATE_', 'CLOSE_', 'DISBURSE_', 'WITHDRAW_', 'EXECUTE_',
                    'PAY_', 'WAIVE_', 'ENABLE_', 'DISABLE_', 'IMPORT_', 'EXPORT_'];
  let entity = code;
  for (const p of prefixes) {
    if (code.startsWith(p)) { entity = code.substring(p.length); break; }
  }
  entity = entity.replace(/_CHECKER$|_MAKER$/, '');
  return entity || 'Other';
}

export function questionRow(idx, existing = {}) {
  return `
    <tr class="sv-q-row" data-idx="${idx}">
      <td><input type="number" class="form-control sv-q-seq" value="${existing.sequenceNo ?? idx}" style="width:80px"/></td>
      <td><input class="form-control sv-q-text" placeholder="Question text" value="${escapeHtml(existing.text || '')}"/></td>
      <td><input class="form-control sv-q-desc" placeholder="Optional description" value="${escapeHtml(existing.description || '')}"/></td>
      <td><button type="button" class="btn-mini btn-danger sv-q-remove">&times;</button></td>
    </tr>`;
}
