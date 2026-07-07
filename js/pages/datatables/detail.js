/* FinCraft · pages/datatables/detail.js — renderDetail — datatable column/registration detail.
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, sb } from '../../utils.js';
import { openAddColumnModal, openDatatableEntryModal, openRegisterModal } from './actions.js';
import { APP_TABLES, can } from './shared.js';

export async function renderDetail(c, name) {
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

      <div class="card mb-3">
        <h3>Entries</h3>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Datatable rows are keyed by the id of the entity they're registered to
          (e.g. a client id, if this table is registered to ${escapeHtml(appName)}).
          Enter that id to view or manage its row(s).
        </div>
        <div class="filter-bar mb-2">
          <input id="dt-entity-id" class="form-control" placeholder="Entity ID" style="max-width:160px" type="number"/>
          <button class="btn-secondary" id="dt-entity-load"><i class="fa-solid fa-magnifying-glass"></i> Load Entries</button>
          <button class="btn-primary" id="dt-entity-add" style="display:none"><i class="fa-solid fa-plus"></i> Add Entry</button>
        </div>
        <div id="dt-entries-list"></div>
      </div>

      <div class="card">
        <div class="section-header">
          <h3>Cross-Links</h3>
        </div>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Manage this datatable's enforcement workflow on the <b>Entity Datatable Checks</b> tab under Organization → Module 14.
        </div>
      </div>`;

    c.querySelector('[data-back-datatables]').addEventListener('click', () =>
      import('../../router.js').then(r => r.navigate('datatables')));

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
        import('../../router.js').then(r => r.navigate('datatables'));
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

    // ---- Entries (rows) management ----
    // Fineract doesn't document, in the reference available here, whether a
    // given datatable is one-to-one or one-to-many — handled defensively by
    // checking whether the response is a single object or an array.
    const entriesList = c.querySelector('#dt-entries-list');
    const addBtn = c.querySelector('#dt-entity-add');
    let currentEntityId = null;

    function renderEntryRows(rows) {
      if (!rows.length) {
        entriesList.innerHTML = '<div class="empty-state-row">No entries for this entity yet</div>';
        return;
      }
      const cols = columns.map(c2 => c2.columnName);
      entriesList.innerHTML = `
        <table class="table">
          <thead><tr>${cols.map(cn => `<th>${escapeHtml(cn)}</th>`).join('')}<th></th></tr></thead>
          <tbody>${rows.map((row, i) => `
            <tr data-row-idx="${i}">
              ${cols.map(cn => `<td>${escapeHtml(row[cn] != null ? String(row[cn]) : '—')}</td>`).join('')}
              <td class="text-right">
                ${can('UPDATE_DATATABLE') ? `<button class="btn-mini" data-edit-row="${i}">Edit</button>` : ''}
                ${can('DELETE_DATATABLE') ? `<button class="btn-mini btn-danger" data-del-row="${i}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>`;
      entriesList.querySelectorAll('[data-edit-row]').forEach(b => b.addEventListener('click', () =>
        openDatatableEntryModal(name, currentEntityId, columns, rows[parseInt(b.dataset.editRow)], () => loadEntries())));
      entriesList.querySelectorAll('[data-del-row]').forEach(b => b.addEventListener('click', async () => {
        const row = rows[parseInt(b.dataset.delRow)];
        if (!await modalConfirm({ title: 'Delete this entry?', danger: true, confirmText: 'Delete' })) return;
        try {
          if (row.id != null) await api.dataTables.deleteEntry(name, currentEntityId, row.id);
          else await api.dataTables.delete(name, currentEntityId);
          toast('success', 'Entry deleted', '');
          loadEntries();
        } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
      }));
    }

    async function loadEntries() {
      entriesList.innerHTML = '<div class="empty-state-row">Loading…</div>';
      try {
        const res = await api.dataTables.query(name, currentEntityId);
        const rows = Array.isArray(res) ? res : (res ? [res] : []);
        renderEntryRows(rows);
      } catch (e) {
        entriesList.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
      }
    }

    c.querySelector('#dt-entity-load').addEventListener('click', () => {
      const val = parseInt(c.querySelector('#dt-entity-id').value);
      if (!isFinite(val)) { toast('warn', 'Enter a valid entity id', ''); return; }
      currentEntityId = val;
      addBtn.style.display = can('CREATE_DATATABLE') ? '' : 'none';
      loadEntries();
    });
    addBtn.addEventListener('click', () => {
      if (currentEntityId == null) { toast('warn', 'Load an entity id first', ''); return; }
      openDatatableEntryModal(name, currentEntityId, columns, null, () => loadEntries());
    });
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load data table</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}
