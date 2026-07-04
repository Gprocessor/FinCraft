/* FinCraft · pages/templates/actions.js — template create/edit/preview modals and the mustache renderer.
   Auto-split from the original monolithic pages/templates.js for maintainability. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { render } from './index.js';
import { ENTITY_OPTIONS, TYPE_OPTIONS } from './shared.js';

export async function openTemplateFormModal(templateId, onSuccess) {
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

export async function openPreviewModal(templateId) {
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
