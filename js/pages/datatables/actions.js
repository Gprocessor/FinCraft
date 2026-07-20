/* FinCraft · pages/datatables/actions.js — modal openers for create/add-column/register actions.
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { APP_TABLES, COLUMN_TYPES, can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export function openDatatableEntryModal(tableName, entityId, columns, existing, onSuccess) {
  const mid = 'dt-entry-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');

  // Skip system-managed columns that Fineract populates itself.
  const editable = columns.filter(c => !['id'].includes(c.columnName));

  const inputFor = (col) => {
    const val = existing ? (existing[col.columnName] ?? '') : '';
    const t = (col.columnType || '').toUpperCase();
    if (t.includes('DATE') && !t.includes('DATETIME')) {
      return `<input type="date" class="form-control dt-field" data-col="${escapeHtml(col.columnName)}" value="${escapeHtml(String(val))}"/>`;
    }
    if (t.includes('INT') || t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('DOUBLE') || t.includes('FLOAT')) {
      return `<input type="number" step="any" class="form-control dt-field" data-col="${escapeHtml(col.columnName)}" value="${escapeHtml(String(val))}"/>`;
    }
    if (t.includes('BOOLEAN') || t.includes('BIT')) {
      return `<select class="form-control dt-field" data-col="${escapeHtml(col.columnName)}">
        <option value="true" ${val === true || val === 'true' ? 'selected' : ''}>True</option>
        <option value="false" ${val === false || val === 'false' ? 'selected' : ''}>False</option>
      </select>`;
    }
    if (t.includes('TEXT')) {
      return `<textarea class="form-control dt-field" data-col="${escapeHtml(col.columnName)}" rows="3">${escapeHtml(String(val))}</textarea>`;
    }
    return `<input class="form-control dt-field" data-col="${escapeHtml(col.columnName)}" value="${escapeHtml(String(val))}"/>`;
  };

  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${existing ? 'Edit' : 'Add'} Entry</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          ${editable.map(col => `
            <label>${escapeHtml(col.columnName)}${col.isColumnNullable === false ? ' *' : ''}
              ${inputFor(col)}
            </label>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="dt-entry-save">Save</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#dt-entry-save').addEventListener('click', async () => {
    const body = {};
    modalEl.querySelectorAll('.dt-field').forEach(inp => {
      const v = inp.value;
      if (v !== '') body[inp.dataset.col] = v;
    });
    try {
      if (existing && existing.id != null) {
        await api.dataTables.updateEntryOneToMany(tableName, entityId, existing.id, body);
      } else if (existing) {
        await api.dataTables.update(tableName, entityId, body);
      } else {
        await api.dataTables.createEntry(tableName, entityId, body);
      }
      modalEl.remove(); toast('success', existing ? 'Entry updated' : 'Entry created', ''); onSuccess();
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}

export function openCreateDataTableModal(onSuccess) {
  const mid = 'dt-create-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');

  const columnRow = (idx) => `
    <tr class="dt-col-row" data-row-idx="${idx}">
      <td><input class="form-control col-name" placeholder="column_name" required/></td>
      <td>
        <select class="form-control col-type">
          ${COLUMN_TYPES.map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" class="form-control col-length" placeholder="50" value="50"/></td>
      <td><input type="checkbox" class="col-nullable" checked/></td>
      <td><input type="checkbox" class="col-unique"/></td>
      <td><input type="checkbox" class="col-indexed"/></td>
      <td><input class="form-control col-code" placeholder="(for Dropdown)"/></td>
      <td><button type="button" class="btn-mini btn-danger col-remove">&times;</button></td>
    </tr>`;

  modalEl.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header"><h3>New Data Table</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Table name *
            <input id="dt-name" class="form-control" placeholder="e.g. client_kyc_details" required pattern="[a-z_][a-z0-9_]*"/>
          </label>
          <label>Application table (entity) *
            <select id="dt-app" class="form-control" required>
              <option value="">Select entity…</option>
              ${APP_TABLES.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${a.id})</option>`).join('')}
            </select>
          </label>
          <label>Multi-row table?
            <select id="dt-multirow" class="form-control">
              <option value="false">No (one row per entity)</option>
              <option value="true">Yes (multiple rows per entity)</option>
            </select>
          </label>
        </div>

        <h4 class="mt-3">Columns</h4>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Column names must be lowercase with underscores. <code>id</code> column is auto-added.
        </div>
        <table class="table">
          <thead><tr>
            <th>Column Name *</th>
            <th>Type *</th>
            <th>Length</th>
            <th>Nullable</th>
            <th>Unique</th>
            <th>Indexed</th>
            <th>Code Name (for Dropdown)</th>
            <th></th>
          </tr></thead>
          <tbody id="dt-cols">${columnRow(0)}</tbody>
        </table>
        <button type="button" class="btn-secondary btn-sm" id="dt-add-col"><i class="fa-solid fa-plus"></i> Add Column</button>

        <div class="msg-banner b-warning mt-3">
          <i class="fa-solid fa-triangle-exclamation"></i>
          The selected entity will be implicitly registered to this table on creation.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="dt-create">Create Data Table</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  let colIdx = 1;
  const wireRowRemove = () => {
    modalEl.querySelectorAll('.col-remove').forEach(btn => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          const rows = modalEl.querySelectorAll('.dt-col-row');
          if (rows.length > 1) btn.closest('.dt-col-row').remove();
          else toast('warn', 'At least one column required', '');
        });
      }
    });
  };
  wireRowRemove();

  modalEl.querySelector('#dt-add-col').addEventListener('click', () => {
    modalEl.querySelector('#dt-cols').insertAdjacentHTML('beforeend', columnRow(colIdx++));
    wireRowRemove();
  });

  modalEl.querySelector('#dt-create').addEventListener('click', async () => {
    const name = modalEl.querySelector('#dt-name').value.trim();
    const apptableName = modalEl.querySelector('#dt-app').value;
    const multiRow = modalEl.querySelector('#dt-multirow').value === 'true';

    if (!name || !apptableName) { toast('warn', 'Enter name and entity', ''); return; }
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      toast('warn', 'Invalid table name', 'Lowercase letters, numbers, and underscores only');
      return;
    }

    const columns = [];
    const rows = modalEl.querySelectorAll('.dt-col-row');
    for (const row of rows) {
      const colName = row.querySelector('.col-name').value.trim();
      if (!colName) continue;
      const col = {};
      col.name = colName;
      col.type = row.querySelector('.col-type').value;
      const len = parseInt(row.querySelector('.col-length').value);
      if (col.type === 'String' || col.type === 'Text') {
        col.length = isFinite(len) ? len : 50;
      }
      col.mandatory = !row.querySelector('.col-nullable').checked;
      if (row.querySelector('.col-unique').checked)  col.unique = true;
      if (row.querySelector('.col-indexed').checked) col.indexed = true;
      const code = row.querySelector('.col-code').value.trim();
      if (col.type === 'Dropdown') {
        if (!code) { toast('warn', 'Code name required', `Column "${colName}" is Dropdown — enter code name`); return; }
        col.code = code;
      }
      columns.push(col);
    }

    if (!columns.length) { toast('warn', 'Add at least one column', ''); return; }

    const payload = {};
    payload.datatableName = name;
    payload.apptableName = apptableName;
    payload.multiRow = multiRow;
    payload.columns = columns;

    try {
      await api.dataTables.create(payload);
      modalEl.remove();
      toast('success', 'Data table created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', extractFineractError(e)); }
  });
}

export function openAddColumnModal(tableName, onSuccess) {
  const mid = 'dt-addcol-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Add Column to ${escapeHtml(tableName)}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Column name * <input id="ac-name" class="form-control" placeholder="column_name" required pattern="[a-z_][a-z0-9_]*"/></label>
          <label>Type *
            <select id="ac-type" class="form-control" required>
              ${COLUMN_TYPES.map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('')}
            </select>
          </label>
          <label>Length (for String/Text) <input type="number" id="ac-length" class="form-control" value="50"/></label>
          <label>Code name (for Dropdown) <input id="ac-code" class="form-control"/></label>
          <label class="checkbox-row"><input type="checkbox" id="ac-mandatory"/> Mandatory</label>
          <label class="checkbox-row"><input type="checkbox" id="ac-unique"/> Unique</label>
          <label class="checkbox-row"><input type="checkbox" id="ac-indexed"/> Indexed</label>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Existing rows will have <code>NULL</code> in this column. To enforce mandatory on existing rows, populate them after adding.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="ac-save">Add Column</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#ac-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#ac-name').value.trim();
    const type = modalEl.querySelector('#ac-type').value;
    if (!name || !type) { toast('warn', 'Fill required fields', ''); return; }
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      toast('warn', 'Invalid column name', 'Lowercase letters, numbers, and underscores only');
      return;
    }

    const col = {};
    col.name = name;
    col.type = type;
    if (type === 'String' || type === 'Text') {
      col.length = parseInt(modalEl.querySelector('#ac-length').value) || 50;
    }
    col.mandatory = modalEl.querySelector('#ac-mandatory').checked;
    if (modalEl.querySelector('#ac-unique').checked)  col.unique = true;
    if (modalEl.querySelector('#ac-indexed').checked) col.indexed = true;
    if (type === 'Dropdown') {
      const code = modalEl.querySelector('#ac-code').value.trim();
      if (!code) { toast('warn', 'Code name required', ''); return; }
      col.code = code;
    }

    const payload = {};
    payload.addColumns = [col];

    try {
      await api.dataTables.updateSchema(tableName, payload);
      modalEl.remove();
      toast('success', 'Column added', name);
      onSuccess();
    } catch (e) { toast('error', 'Add column failed', extractFineractError(e)); }
  });
}

export function openRegisterModal(tableName, onSuccess) {
  const mid = 'dt-reg-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Register ${escapeHtml(tableName)}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="text-muted small mb-3">
          <i class="fa-solid fa-circle-info"></i>
          Registering the data table links it to an entity, so rows can be created per entity instance.
        </div>
        <label>Application table (entity) *
          <select id="reg-app" class="form-control" required>
            <option value="">Select entity…</option>
            ${APP_TABLES.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${a.id})</option>`).join('')}
          </select>
        </label>
        <label class="mt-2">Entity sub-type (e.g. PERSON, ENTITY for clients)
          <input id="reg-subtype" class="form-control" placeholder="optional"/>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="reg-save">Register</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#reg-save').addEventListener('click', async () => {
    const app = modalEl.querySelector('#reg-app').value;
    const subtype = modalEl.querySelector('#reg-subtype').value.trim();
    if (!app) { toast('warn', 'Select an entity', ''); return; }

    const payload = {};
    if (subtype) payload.entitySubType = subtype;

    try {
      await api.dataTables.register(tableName, app, payload);
      modalEl.remove();
      toast('success', 'Registered', `${tableName} → ${app}`);
      onSuccess();
    } catch (e) { toast('error', 'Register failed', extractFineractError(e)); }
  });
}
