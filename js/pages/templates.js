import { LOCALE, DATE_FORMAT } from '../config.js';

/* FinCraft · templates.js — User-Generated Document templates (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, escapeHtml, sb } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

// Fineract template entity enum
const ENTITY_OPTIONS = [
  { id: 0, name: 'Client' },
  { id: 1, name: 'Loan' },
  { id: 2, name: 'Savings' },
  { id: 3, name: 'Group' }
];

// Fineract template type enum
const TYPE_OPTIONS = [
  { id: 0, name: 'Document', icon: 'fa-file-pdf' },
  { id: 1, name: 'Email',    icon: 'fa-envelope' },
  { id: 2, name: 'SMS',      icon: 'fa-comment-sms' }
];

export async function render(c, params = {}) {
  if (params.view === 'detail' && params.id) return renderDetail(c, params.id);
  return renderList(c);
}

// ════════════════════════════════════════════════════════════
// LIST VIEW
// ════════════════════════════════════════════════════════════
async function renderList(c) {
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
        `<tr><td colspan="6" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
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
            <b>${t.id}">${escapeHtml(t.name || '—')}</a></b>
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
      import('../router.js').then(r => r.navigate('templates', { view: 'detail', id: b.dataset.viewTpl }))));

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
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  let t;
  c.querySelector('#tpl-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 250); });
  c.querySelector('#tpl-type-filter').addEventListener('change', applyFilters);
  c.querySelector('#tpl-entity-filter').addEventListener('change', applyFilters);

  c.querySelector('#tpl-new')?.addEventListener('click', () => openTemplateFormModal(null, () => load()));

  await load();
}

// ════════════════════════════════════════════════════════════
// DETAIL VIEW
// ════════════════════════════════════════════════════════════
async function renderDetail(c, templateId) {
  c.innerHTML = `<div class="empty-state-row">Loading template…</div>`;
  try {
    const tpl = await api.templates.get(templateId);
    const typeInfo = TYPE_OPTIONS.find(t => t.id === (tpl.type?.id ?? tpl.typeId));
    const entityInfo = ENTITY_OPTIONS.find(e => e.id === (tpl.entity?.id ?? tpl.entityId));
    const mappers = tpl.mappers || tpl.mappersData || [];

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(tpl.name)}</h1>
          <div class="text-muted">
            ${typeInfo ? `<i class="fa-solid ${typeInfo.icon}"></i> ${escapeHtml(typeInfo.name)}` : '—'}
            · Entity: <b>${escapeHtml(entityInfo?.name || '—')}</b>
            · ${mappers.length} mapper${mappers.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" data-back><i class="fa-solid fa-arrow-left"></i> Back</button>
          <button class="btn-secondary" id="btn-preview"><i class="fa-solid fa-eye"></i> Preview</button>
          ${can('UPDATE_TEMPLATE') ? `<button class="btn-primary" id="btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <h3>Template Body</h3>
        <pre style="background:var(--surface-1); padding:16px; border-radius:4px; max-height:500px; overflow:auto; white-space:pre-wrap; font-family:monospace; font-size:13px">${escapeHtml(tpl.text || '')}</pre>
      </div>

      <div class="card">
        <h3>Mappers (Placeholder → Data Source)</h3>
        ${mappers.length ? `
          <table class="table">
            <thead><tr><th>Mapper Key</th><th>Order</th><th>Data Source</th></tr></thead>
            <tbody>${mappers.map(m => `
              <tr>
                <td><code>${escapeHtml(m.mapperKey || '—')}</code></td>
                <td>${m.mapperOrder ?? '—'}</td>
                <td>${escapeHtml(m.mapperValue || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state-row">No mappers configured</div>'}
        <div class="text-muted small mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Mappers map placeholder keys (used as <code>&#123;&#123;mapperKey&#125;&#125;</code> in the template body) to data sources at render time.
        </div>
      </div>`;

    c.querySelector('[data-back]').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('templates')));

    c.querySelector('#btn-edit')?.addEventListener('click', () =>
      openTemplateFormModal(templateId, () => renderDetail(c, templateId)));

    c.querySelector('#btn-preview').addEventListener('click', () => openPreviewModal(templateId));
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load template</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// CREATE / EDIT TEMPLATE MODAL
// ════════════════════════════════════════════════════════════
async function openTemplateFormModal(templateId, onSuccess) {
  const isEdit = !!templateId;
  let existing = {};

  if (isEdit) {
    try { existing = await api.templates.get(templateId); }
    catch (e) { toast('error', 'Could not load template', e.detail?.defaultUserMessage || e.message); return; }
  }

  const existingMappers = existing.mappers || existing.mappersData || [];
  const initialMapperRows = existingMappers.length
    ? existingMappers.map((m, i) => mapperRow(i, m)).join('')
    : mapperRow(0);

  const mid = 'tpl-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Template</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Template name * <input id="tf-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
          <label>Type *
            <select id="tf-type" class="form-control" required>
              <option value="">Select…</option>
              ${TYPE_OPTIONS.map(t => {
                const selected = (existing.type?.id ?? existing.typeId) === t.id ? 'selected' : '';
                return `<option value="${t.id}" ${selected}>${escapeHtml(t.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label>Entity *
            <select id="tf-entity" class="form-control" required>
              <option value="">Select…</option>
              ${ENTITY_OPTIONS.map(e => {
                const selected = (existing.entity?.id ?? existing.entityId) === e.id ? 'selected' : '';
                return `<option value="${e.id}" ${selected}>${escapeHtml(e.name)}</option>`;
              }).join('')}
            </select>
          </label>
        </div>

        <h4 class="mt-3">Template Body *</h4>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Use <code>&#123;&#123;placeholder&#125;&#125;</code> syntax for dynamic content. Common placeholders:
          <code>&#123;&#123;client.displayName&#125;&#125;</code>, <code>&#123;&#123;loan.accountNo&#125;&#125;</code>, <code>&#123;&#123;loan.dueAmount&#125;&#125;</code>.
        </div>
        <textarea id="tf-text" class="form-control" rows="12" required placeholder="Dear {{client.displayName}}, your loan #{{loan.accountNo}} payment of {{loan.dueAmount}} is due on {{loan.dueDate}}.">${escapeHtml(existing.text || '')}</textarea>

        <h4 class="mt-3">Mappers (Optional)</h4>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Define custom mappers that resolve placeholder keys to external data sources.
        </div>
        <table class="table">
          <thead><tr>
            <th>Mapper Key</th>
            <th>Order</th>
            <th>Data Source (URL or expression)</th>
            <th></th>
          </tr></thead>
          <tbody id="tf-mappers">${initialMapperRows}</tbody>
        </table>
        <button type="button" class="btn-secondary btn-sm" id="tf-add-mapper"><i class="fa-solid fa-plus"></i> Add Mapper</button>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="tf-save">${isEdit ? 'Save Changes' : 'Create Template'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  let mapperIdx = existingMappers.length || 1;
  const wireMapperRemove = () => {
    modalEl.querySelectorAll('.tf-mapper-remove').forEach(btn => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => btn.closest('.tf-mapper-row').remove());
      }
    });
  };
  wireMapperRemove();

  modalEl.querySelector('#tf-add-mapper').addEventListener('click', () => {
    modalEl.querySelector('#tf-mappers').insertAdjacentHTML('beforeend', mapperRow(mapperIdx++));
    wireMapperRemove();
  });

  modalEl.querySelector('#tf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#tf-name').value.trim();
    const type = parseInt(modalEl.querySelector('#tf-type').value);
    const entity = parseInt(modalEl.querySelector('#tf-entity').value);
    const text = modalEl.querySelector('#tf-text').value.trim();

    if (!name || !text || isNaN(type) || isNaN(entity)) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const mappers = [];
    modalEl.querySelectorAll('.tf-mapper-row').forEach(row => {
      const key = row.querySelector('.tf-mapper-key').value.trim();
      const order = parseInt(row.querySelector('.tf-mapper-order').value) || 0;
      const value = row.querySelector('.tf-mapper-value').value.trim();
      if (key && value) {
        const m = {};
        m.mapperKey = key;
        m.mapperOrder = order;
        m.mapperValue = value;
        mappers.push(m);
      }
    });

    const payload = {};
    payload.name = name;
    payload.entity = entity;
    payload.type = type;
    payload.text = text;
    if (mappers.length) payload.mappers = mappers;

    try {
      if (isEdit) await api.templates.update(templateId, payload);
      else        await api.templates.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Template updated' : 'Template created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

function mapperRow(idx, existing = {}) {
  return `
    <tr class="tf-mapper-row" data-idx="${idx}">
      <td><input class="form-control tf-mapper-key" placeholder="e.g. clientName" value="${escapeHtml(existing.mapperKey || '')}"/></td>
      <td><input type="number" class="form-control tf-mapper-order" value="${existing.mapperOrder ?? idx}" style="width:80px"/></td>
      <td><input class="form-control tf-mapper-value" placeholder="URL or expression" value="${escapeHtml(existing.mapperValue || '')}"/></td>
      <td><button type="button" class="btn-mini btn-danger tf-mapper-remove">&times;</button></td>
    </tr>`;
}

// ════════════════════════════════════════════════════════════
// PREVIEW MODAL
// ════════════════════════════════════════════════════════════
async function openPreviewModal(templateId) {
  let tpl;
  try { tpl = await api.templates.get(templateId); }
  catch (e) { toast('error', 'Could not load template', e.detail?.defaultUserMessage || e.message); return; }

  const mid = 'tpl-preview-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Preview: ${escapeHtml(tpl.name)}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Enter sample data as JSON to render the template against. Use the placeholder names from the template body.
        </div>

        <label>Sample data (JSON)
          <textarea id="prev-data" class="form-control" rows="8" placeholder='{"client":{"displayName":"Jane Doe"},"loan":{"accountNo":"L00123","dueAmount":"$500.00"}}'>{
  "client": { "displayName": "Jane Doe" },
  "loan": { "accountNo": "L00123", "dueAmount": "$500.00", "dueDate": "2026-07-01" }
}</textarea>
        </label>

        <div class="mt-2" style="display:flex; gap:8px">
          <button class="btn-primary" id="prev-render"><i class="fa-solid fa-play"></i> Render Locally</button>
          <button class="btn-secondary" id="prev-server">Server-side Preview</button>
        </div>

        <h4 class="mt-3">Original Template</h4>
        <pre style="background:var(--surface-1); padding:12px; border-radius:4px; max-height:200px; overflow:auto; white-space:pre-wrap; font-family:monospace; font-size:12px">${escapeHtml(tpl.text || '')}</pre>

        <h4 class="mt-3">Rendered Output</h4>
        <div id="prev-output" class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px; min-height:80px; background:var(--surface-1); white-space:pre-wrap">
          <span class="text-muted">Click <b>Render Locally</b> or <b>Server-side Preview</b> to see the output.</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Close</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  // Local render — simple Mustache-like substitution
  modalEl.querySelector('#prev-render').addEventListener('click', () => {
    const out = modalEl.querySelector('#prev-output');
    let data;
    try { data = JSON.parse(modalEl.querySelector('#prev-data').value); }
    catch (e) {
      out.innerHTML = `<div class="text-error">Invalid JSON: ${escapeHtml(e.message)}</div>`;
      return;
    }
    const rendered = renderMustache(tpl.text || '', data);
    out.textContent = rendered;
  });

  // Server-side render via /templates/{id} POST
  modalEl.querySelector('#prev-server').addEventListener('click', async () => {
    const out = modalEl.querySelector('#prev-output');
    let data;
    try { data = JSON.parse(modalEl.querySelector('#prev-data').value); }
    catch (e) {
      out.innerHTML = `<div class="text-error">Invalid JSON: ${escapeHtml(e.message)}</div>`;
      return;
    }
    out.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Rendering server-side…';
    try {
      const res = await api.templates.preview(templateId, data);
      out.textContent = typeof res === 'string' ? res : (res?.text || JSON.stringify(res, null, 2));
    } catch (e) {
      out.innerHTML = `<div class="text-error">Server render failed: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  });
}

// Simple Mustache-like renderer for local preview (no nested helpers/sections)
function renderMustache(template, data) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const parts = path.split('.');
    let val = data;
    for (const p of parts) {
      if (val && typeof val === 'object' && p in val) val = val[p];
      else return match; // leave placeholder if not found
    }
    return String(val ?? '');
  });
}