/* FinCraft · pages/templates/list.js — renderList — the document templates list view.
   Auto-split from the original monolithic pages/templates.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num } from '../../utils.js';
import { openPreviewModal, openTemplateFormModal } from './actions.js';
import { ENTITY_OPTIONS, TYPE_OPTIONS, can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Templates</h1>
        <div class="text-muted">User-generated document templates for emails, SMS, and PDFs</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_TEMPLATE') ? `<button class="btn-primary" id="tpl-new"><i class="fa-solid fa-plus"></i> New Template</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-3">
      <div class="kpi-card"><div class="kpi-label">Total Templates</div><div class="kpi-value" id="tpl-total">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Email</div><div class="kpi-value" id="tpl-email">—</div></div>
      <div class="kpi-card"><div class="kpi-label">SMS</div><div class="kpi-value" id="tpl-sms">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Documents</div><div class="kpi-value" id="tpl-doc">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar mb-2">
        <input id="tpl-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="tpl-type-filter" class="form-control">
          <option value="">All types</option>
          ${TYPE_OPTIONS.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
        <select id="tpl-entity-filter" class="form-control">
          <option value="">All entities</option>
          ${ENTITY_OPTIONS.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div>
      <table class="table">
        <thead><tr>
          <th>Name</th>
          <th>Type</th>
          <th>Entity</th>
          <th>Mappers</th>
          <th>Preview</th>
          <th></th>
        </tr></thead>
        <tbody id="tpl-rows">
          <tr><td colspan="6" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  let allTemplates = [];

  async function load() {
    c.querySelector('#tpl-rows').innerHTML =
      '<tr><td colspan="6" class="empty-state-row">Loading…</td></tr>';
    try {
      const res = await api.templates.list();
      allTemplates = Array.isArray(res) ? res : [];

      // KPIs
      c.querySelector('#tpl-total').textContent = num(allTemplates.length);
      c.querySelector('#tpl-email').textContent = num(allTemplates.filter(t => (t.type?.id ?? t.typeId) === 1).length);
      c.querySelector('#tpl-sms').textContent   = num(allTemplates.filter(t => (t.type?.id ?? t.typeId) === 2).length);
      c.querySelector('#tpl-doc').textContent   = num(allTemplates.filter(t => (t.type?.id ?? t.typeId) === 0).length);

      applyFilters();
    } catch (e) {
      c.querySelector('#tpl-rows').innerHTML =
        `<tr><td colspan="6" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
    }
  }

  function applyFilters() {
    const q = c.querySelector('#tpl-search').value.toLowerCase().trim();
    const typeFilter = c.querySelector('#tpl-type-filter').value;
    const entityFilter = c.querySelector('#tpl-entity-filter').value;

    let filtered = allTemplates;
    if (q) filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(q));
    if (typeFilter !== '') filtered = filtered.filter(t => String(t.type?.id ?? t.typeId) === typeFilter);
    if (entityFilter !== '') filtered = filtered.filter(t => String(t.entity?.id ?? t.entityId) === entityFilter);

    draw(filtered);
  }

  function draw(rows) {
    c.querySelector('#tpl-rows').innerHTML = rows.length ? rows.map(t => {
      const typeId = t.type?.id ?? t.typeId;
      const entityId = t.entity?.id ?? t.entityId;
      const typeInfo = TYPE_OPTIONS.find(x => x.id === typeId);
      const entityInfo = ENTITY_OPTIONS.find(x => x.id === entityId);
      const mapperCount = (t.mappers || t.mappersData || []).length;
      const preview = (t.text || '').substring(0, 80);
      return `
        <tr>
          <td>
            <b><a href="#" data-view-tpl="${t.id}">${escapeHtml(t.name || '—')}</a></b>
          </td>
          <td>
            ${typeInfo ? `<i class="fa-solid ${typeInfo.icon}"></i> ${escapeHtml(typeInfo.name)}` : (escapeHtml(t.type?.value || '—'))}
          </td>
          <td>${escapeHtml(entityInfo?.name || t.entity?.value || '—')}</td>
          <td>${num(mapperCount)}</td>
          <td class="text-muted small">${escapeHtml(preview)}${preview.length >= 80 ? '…' : ''}</td>
          <td class="text-right">
            <button class="btn-mini" data-preview-tpl="${t.id}">Preview</button>
            ${can('READ_TEMPLATE') ? `<button class="btn-mini" data-view-tpl="${t.id}">View</button>` : ''}
            ${can('UPDATE_TEMPLATE') ? `<button class="btn-mini" data-edit-tpl="${t.id}">Edit</button>` : ''}
            ${can('DELETE_TEMPLATE') ? `<button class="btn-mini btn-danger" data-del-tpl="${t.id}">Delete</button>` : ''}
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state-row">No templates match</td></tr>';

    c.querySelectorAll('[data-view-tpl]').forEach(b => b.addEventListener('click', () =>
      import('../../router.js').then(r => r.navigate('templates', { view: 'detail', id: b.dataset.viewTpl }))));

    c.querySelectorAll('[data-edit-tpl]').forEach(b => b.addEventListener('click', () =>
      openTemplateFormModal(b.dataset.editTpl, () => load())));

    c.querySelectorAll('[data-preview-tpl]').forEach(b => b.addEventListener('click', () =>
      openPreviewModal(b.dataset.previewTpl)));

    c.querySelectorAll('[data-del-tpl]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete template?',
        message: 'This will fail if any SMS campaign or notification rule references this template.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.templates.delete(b.dataset.delTpl);
        toast('success', 'Template deleted', '');
        load();
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  }

  let t;
  c.querySelector('#tpl-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 250); });
  c.querySelector('#tpl-type-filter').addEventListener('change', applyFilters);
  c.querySelector('#tpl-entity-filter').addEventListener('change', applyFilters);

  c.querySelector('#tpl-new')?.addEventListener('click', () => openTemplateFormModal(null, () => load()));

  await load();
}
