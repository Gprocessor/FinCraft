import { LOCALE, DATE_FORMAT } from '../config.js';

/* FinCraft · datatables.js — Custom datatable catalog (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, escapeHtml, fmtDate, sb } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

// Fineract apps that can register datatables (system-level associations)
const APP_TABLES = [
  { id: 'm_client',           name: 'Client' },
  { id: 'm_group',            name: 'Group' },
  { id: 'm_center',           name: 'Center' },
  { id: 'm_loan',             name: 'Loan' },
  { id: 'm_savings_account',  name: 'Savings Account' },
  { id: 'm_office',           name: 'Office' }
];

// Common Fineract column types
const COLUMN_TYPES = [
  { value: 'String',   label: 'String (text)' },
  { value: 'Number',   label: 'Number (integer)' },
  { value: 'Decimal',  label: 'Decimal' },
  { value: 'Boolean',  label: 'Boolean' },
  { value: 'Date',     label: 'Date' },
  { value: 'DateTime', label: 'Date + Time' },
  { value: 'Text',     label: 'Long Text' },
  { value: 'Dropdown', label: 'Dropdown (Code-value)' }
];

export async function render(c, params = {}) {
  if (params.view === 'detail' && params.name) return renderDetail(c, params.name);
  return renderList(c);
}

// ════════════════════════════════════════════════════════════
// LIST VIEW
// ════════════════════════════════════════════════════════════
async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Data Tables</h1>
        <div class="text-muted">Custom tables for extending core entities with additional fields</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_DATATABLE') ? `<button class="btn-primary" id="dt-new"><i class="fa-solid fa-plus"></i> New Data Table</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-3">
      <div class="kpi-card"><div class="kpi-label">Total Tables</div><div class="kpi-value" id="dt-total">—</div></div>
      <div class="kpi-card"><div class="kpi-label">For Clients</div><div class="kpi-value" id="dt-clients">—</div></div>
      <div class="kpi-card"><div class="kpi-label">For Loans</div><div class="kpi-value" id="dt-loans">—</div></div>
      <div class="kpi-card"><div class="kpi-label">For Other Entities</div><div class="kpi-value" id="dt-other">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar mb-2">
        <input id="dt-search" class="form-control" placeholder="Search by table name…" autocomplete="off"/>
        <select id="dt-app-filter" class="form-control">
          <option value="">All applications</option>
          ${APP_TABLES.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>
      <table class="table">
        <thead><tr>
          <th>Table Name</th>
          <th>Registered To</th>
          <th>System</th>
          <th>Columns</th>
          <th></th>
        </tr></thead>
        <tbody id="dt-rows">
          <tr><td colspan="5" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  let allTables = [];

  async function load() {
    c.querySelector('#dt-rows').innerHTML =
      '<tr><td colspan="5" class="empty-state-row">Loading…</td></tr>';
    try {
      const res = await api.dataTables.list();
      allTables = Array.isArray(res) ? res : [];

      // KPIs
      c.querySelector('#dt-total').textContent   = num(allTables.length);
      c.querySelector('#dt-clients').textContent = num(allTables.filter(t => t.applicationTableName === 'm_client').length);
      c.querySelector('#dt-loans').textContent   = num(allTables.filter(t => t.applicationTableName === 'm_loan').length);
      c.querySelector('#dt-other').textContent   = num(allTables.filter(t => !['m_client', 'm_loan'].includes(t.applicationTableName)).length);

      applyFilters();
    } catch (e) {
      c.querySelector('#dt-rows').innerHTML =
        `<tr><td colspan="5" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function applyFilters() {
    const q = c.querySelector('#dt-search').value.toLowerCase().trim();
    const app = c.querySelector('#dt-app-filter').value;

    let filtered = allTables;
    if (q)   filtered = filtered.filter(t => (t.registeredTableName || '').toLowerCase().includes(q));
    if (app) filtered = filtered.filter(t => t.applicationTableName === app);

    draw(filtered);
  }

  function draw(rows) {
    c.querySelector('#dt-rows').innerHTML = rows.length ? rows.map(t => {
      const appName = APP_TABLES.find(a => a.id === t.applicationTableName)?.name || t.applicationTableName || '—';
      const isSystem = t.systemDefined || t.registeredTableName?.startsWith('m_');
      return `
        <tr>
          <td>
            <b>${t.registeredTableName}">${escapeHtml(t.registeredTableName || '—')}</a></b>
          </td>
          <td>${escapeHtml(appName)}</td>
          <td>${isSystem ? sb('System') : sb('Custom')}</td>
          <td>${num((t.columnHeaderData || []).length || 0)}</td>
          <td class="text-right">
            ${can('READ_DATATABLE') ? `<button class="btn-mini" data-view-dt="${t.registeredTableName}">View</button>` : ''}
            ${can('REGISTER_DATATABLE') && !t.applicationTableName ? `<button class="btn-mini btn-success" data-register-dt="${t.registeredTableName}">Register</button>` : ''}
            ${can('DEREGISTER_DATATABLE') && t.applicationTableName ? `<button class="btn-mini btn-warning" data-deregister-dt="${t.registeredTableName}">Deregister</button>` : ''}
            ${can('DELETE_DATATABLE') && !isSystem ? `<button class="btn-mini btn-danger" data-drop-dt="${t.registeredTableName}">Drop</button>` : ''}
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state-row">No data tables match</td></tr>';

    // Wire actions
    c.querySelectorAll('[data-view-dt]').forEach(b => b.addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('datatables', { view: 'detail', name: b.dataset.viewDt }))));

    c.querySelectorAll('[data-register-dt]').forEach(b => b.addEventListener('click', () =>
      openRegisterModal(b.dataset.registerDt, () => load())));

    c.querySelectorAll('[data-deregister-dt]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Deregister data table?',
        message: 'The table will no longer be linked to its entity. Stored data is preserved.',
        confirmText: 'Deregister'
      })) return;
      try {
        await api.dataTables.deregister(b.dataset.deregisterDt);
        toast('success', 'Deregistered', '');
        load();
      } catch (e) { toast('error', 'Deregister failed', e.detail?.defaultUserMessage || e.message); }
    }));

    c.querySelectorAll('[data-drop-dt]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Drop data table?',
        message: 'This permanently deletes the table and all its data. This cannot be undone.',
        danger: true, confirmText: 'Drop Table'
      })) return;
      try {
        await api.dataTables.deleteTable(b.dataset.dropDt);
        toast('success', 'Table dropped', '');
        load();
      } catch (e) { toast('error', 'Drop failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  let t;
  c.querySelector('#dt-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(applyFilters, 250);
  });
  c.querySelector('#dt-app-filter').addEventListener('change', applyFilters);

  c.querySelector('#dt-new')?.addEventListener('click', () => openCreateDataTableModal(() => load()));

  await load();
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW
// ════════════════════════════════════════════════════════════
async function renderDetail(c, name) {
  c.innerHTML = `<div class="empty-state-row">Loading data table…</div>`;
  try {
    const detail = await api.dataTables.get(name);
    const columns = detail.columnHeaderData || [];
    const appName = APP_TABLES.find(a => a.id === detail.applicationTableName)?.name || detail.applicationTableName || '—';
    const isSystem = detail.systemDefined || (name || '').startsWith('m_');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(name)}</h1>
          <div class="text-muted">
            Registered to: <b>${escapeHtml(appName)}</b>
            · ${columns.length} column${columns.length !== 1 ? 's' : ''}
            · ${isSystem ? sb('System') : sb('Custom')}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" data-back-datatables><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${can('UPDATE_DATATABLE') && !isSystem ? `<button class="btn-secondary" id="btn-add-column"><i class="fa-solid fa-plus"></i> Add Column</button>` : ''}
          ${can('REGISTER_DATATABLE') && !detail.applicationTableName ? `<button class="btn-success" id="btn-register"><i class="fa-solid fa-link"></i> Register</button>` : ''}
          ${can('DEREGISTER_DATATABLE') && detail.applicationTableName ? `<button class="btn-warning" id="btn-deregister"><i class="fa-solid fa-unlink"></i> Deregister</button>` : ''}
          ${can('DELETE_DATATABLE') && !isSystem ? `<button class="btn-danger" id="btn-drop"><i class="fa-solid fa-trash"></i> Drop Table</button>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <h3>Columns</h3>
        ${columns.length ? `
          <table class="table">
            <thead><tr>
              <th>Column Name</th><th>Type</th><th>Length</th>
              <th>Mandatory</th><th>Unique</th><th>Indexed</th><th>Code (if Dropdown)</th>
              <th></th>
            </tr></thead>
            <tbody>${columns.map(col => `
              <tr>
                <td><code>${escapeHtml(col.columnName)}</code></td>
                <td>${escapeHtml(col.columnType || '—')}</td>
                <td>${col.columnLength ?? '—'}</td>
                <td>${col.isColumnNullable === false ? 'Yes' : 'No'}</td>
                <td>${col.isColumnUnique ? 'Yes' : 'No'}</td>
                <td>${col.isColumnIndexed ? 'Yes' : 'No'}</td>
                <td>${escapeHtml(col.columnCode || '—')}</td>
                <td class="text-right">
                  ${can('UPDATE_DATATABLE') && !isSystem ? `<button class="btn-mini btn-danger" data-drop-col="${escapeHtml(col.columnName)}">Drop</button>` : ''}
                </td>
              </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state-row">No columns defined</div>'}
      </div>

      <div class="card">
        <div class="section-header">
          <h3>Cross-Links</h3>
        </div>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Manage this datatable's enforcement workflow on the <b>Entity Datatable Checks</b> tab under Organization → Module 14.
        </div>
        ${detail.applicationTableName ? `
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            Per-entity rows for this datatable are accessible on each
            ${detail.applicationTableName === 'm_client' ? 'client' :
              detail.applicationTableName === 'm_loan' ? 'loan' :
              detail.applicationTableName === 'm_savings_account' ? 'savings account' :
              'entity'}'s detail page under the <b>Datatables</b> tab.
          </div>` : ''}
      </div>`;

    c.querySelector('[data-back-datatables]').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('datatables')));

    c.querySelector('#btn-add-column')?.addEventListener('click', () =>
      openAddColumnModal(name, () => renderDetail(c, name)));

    c.querySelector('#btn-register')?.addEventListener('click', () =>
      openRegisterModal(name, () => renderDetail(c, name)));

    c.querySelector('#btn-deregister')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Deregister data table?',
        message: 'The table will no longer be linked to its entity. Stored data is preserved.',
        confirmText: 'Deregister'
      })) return;
      try {
        await api.dataTables.deregister(name);
        toast('success', 'Deregistered', '');
        renderDetail(c, name);
      } catch (e) { toast('error', 'Deregister failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-drop')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Drop data table?',
        message: 'This permanently deletes the table and all its data. Type DROP to confirm.',
        danger: true, confirmText: 'Drop Table'
      })) return;
      try {
        await api.dataTables.deleteTable(name);
        toast('success', 'Table dropped', '');
        import('../router.js').then(r => r.navigate('datatables'));
      } catch (e) { toast('error', 'Drop failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelectorAll('[data-drop-col]').forEach(b => b.addEventListener('click', async () => {
      const colName = b.dataset.dropCol;
      if (!await modalConfirm({
        title: `Drop column "${colName}"?`,
        message: 'All data in this column will be lost.',
        danger: true, confirmText: 'Drop Column'
      })) return;
      try {
        const payload = {};
        payload.dropColumns = [{ name: colName }];
        await api.dataTables.updateSchema(name, payload);
        toast('success', 'Column dropped', colName);
        renderDetail(c, name);
      } catch (e) { toast('error', 'Drop column failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load data table</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// CREATE DATA TABLE MODAL (with column editor)
// ════════════════════════════════════════════════════════════
function openCreateDataTableModal(onSuccess) {
  const mid = 'dt-create-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';

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
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// ADD COLUMN MODAL (for existing tables)
// ════════════════════════════════════════════════════════════
function openAddColumnModal(tableName, onSuccess) {
  const mid = 'dt-addcol-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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
    } catch (e) { toast('error', 'Add column failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// REGISTER DATA TABLE MODAL
// ════════════════════════════════════════════════════════════
function openRegisterModal(tableName, onSuccess) {
  const mid = 'dt-reg-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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
    } catch (e) { toast('error', 'Register failed', e.detail?.defaultUserMessage || e.message); }
  });
}