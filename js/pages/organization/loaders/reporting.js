/* FinCraft · pages/organization/loaders/reporting.js — ad-hoc queries and entity datatable checks tab loaders.
   Auto-split (2nd pass) from pages/organization/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, sb } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openAdhocQueryModal, openEntityDatatableCheckModal } from '../actions.js';

export async function loadAdhocQueries(c) {
  const el = c.querySelector('#og-9');
  try {
    const res = await api.adhocQueries.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Adhoc Queries</h3>
          <span class="text-muted">${list.length} quer${list.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div>
          <!-- FLAGGED, NOT VERIFIED: no EXECUTE_ADHOC(QUERY) permission exists in the 961-code set, and
               AdHocApiResource's parsed methods show no "execute" command either — api.adhocQueries.runAll()
               posts ?command=execute to a resource that may not support command dispatch at all. Gating on
               CREATE_ADHOC as the closest real code; confirm against a live server. -->
          ${list.length && can('CREATE_ADHOC') ? `<button class="btn-secondary mr-2" id="btn-run-all-adhoc"><i class="fa-solid fa-bolt"></i> Run All</button>` : ''}
          ${can('CREATE_ADHOC') ? `<button class="btn-primary" id="btn-new-adhoc"><i class="fa-solid fa-plus"></i> New Query</button>` : ''}
        </div>
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Adhoc queries are scheduled SQL queries that load results into a reporting datatable.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Source</th><th>Table</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(q => `
            <tr>
              <td><b>${escapeHtml(q.name || '—')}</b><div class="text-muted small">${escapeHtml((q.query || '').substring(0, 100))}…</div></td>
              <td>${escapeHtml(q.tableName || '—')}</td>
              <td>${escapeHtml(q.tableFields || '—')}</td>
              <td>${q.isActive ? sb('Active') : sb('Inactive')}</td>
              <td class="text-right">
                ${can('UPDATE_ADHOC') ? `<button class="btn-mini" data-edit-adhoc="${q.id}">Edit</button>` : ''}
                ${can('DELETE_ADHOC') ? `<button class="btn-mini btn-danger" data-del-adhoc="${q.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No adhoc queries defined</div>'}`;

    el.querySelector('#btn-new-adhoc')?.addEventListener('click', () => openAdhocQueryModal(null, () => loadAdhocQueries(c)));
    el.querySelector('#btn-run-all-adhoc')?.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Run all adhoc queries?', confirmText: 'Run All' })) return;
      try {
        await api.adhocQueries.runAll();
        toast('success', 'All adhoc queries queued', 'Check job history for status');
      } catch (e) { toast('error', 'Run failed', e.detail?.defaultUserMessage || e.message); }
    });
    el.querySelectorAll('[data-edit-adhoc]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.adhocQueries.get(b.dataset.editAdhoc);
        openAdhocQueryModal(existing, () => loadAdhocQueries(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));
    el.querySelectorAll('[data-del-adhoc]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete adhoc query?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.adhocQueries.delete(b.dataset.delAdhoc);
        toast('success', 'Deleted', '');
        loadAdhocQueries(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadEntityDatatableChecks(c) {
  const el = c.querySelector('#og-12');
  try {
    const res = await api.entityDatatableChecks.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Entity Datatable Checks</h3>
          <span class="text-muted">${list.length} check${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_ENTITY_DATATABLE_CHECK') ? `<button class="btn-primary" id="btn-new-edc"><i class="fa-solid fa-plus"></i> New Check</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Datatable checks enforce that mandatory datatables (e.g. KYC, employment details) are populated before a workflow stage (Submit, Approve, Disburse, Activate) can proceed.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Entity</th><th>Datatable</th><th>Status</th><th>Product</th><th></th>
          </tr></thead>
          <tbody>${list.map(chk => `
            <tr>
              <td>${escapeHtml(chk.entity || '—')}</td>
              <td><b>${escapeHtml(chk.datatableName || '—')}</b></td>
              <td>${escapeHtml(chk.status?.value || chk.status || '—')}</td>
              <td>${escapeHtml(chk.productName || chk.productId || 'All')}</td>
              <td class="text-right">
                ${can('DELETE_ENTITY_DATATABLE_CHECK') ? `<button class="btn-mini btn-danger" data-del-edc="${chk.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-check"></i>
          <h3>No datatable checks configured</h3>
          ${can('CREATE_ENTITY_DATATABLE_CHECK') ? `<div class="text-muted mt-2">Configure checks to enforce data quality before workflow transitions.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-edc')?.addEventListener('click', () =>
      openEntityDatatableCheckModal(() => loadEntityDatatableChecks(c)));

    el.querySelectorAll('[data-del-edc]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete datatable check?',
        message: 'Workflow transitions for the affected entity will no longer require this datatable.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.entityDatatableChecks.delete(b.dataset.delEdc);
        toast('success', 'Check deleted', '');
        loadEntityDatatableChecks(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Entity datatable checks not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
