/* FinCraft · pages/datatables/list.js — renderList — the datatables list view.
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { openCreateDataTableModal, openRegisterModal } from './actions.js';
import { APP_TABLES, can } from './shared.js';

export async function renderList(c) {
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
            <b><a href="#" data-view-dt="${t.registeredTableName}">${escapeHtml(t.registeredTableName || '—')}</a></b>
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
      import('../../router.js').then(r => r.navigate('datatables', { view: 'detail', name: b.dataset.viewDt }))));

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
