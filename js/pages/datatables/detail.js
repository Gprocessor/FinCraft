/* FinCraft · pages/datatables/detail.js — renderDetail — datatable column/registration detail.
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, sb } from '../../utils.js';
import { openAddColumnModal, openRegisterModal } from './actions.js';
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
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load data table</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}
