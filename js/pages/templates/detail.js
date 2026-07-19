/* FinCraft · pages/templates/detail.js — renderDetail — template detail view.
   Auto-split from the original monolithic pages/templates.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml } from '../../utils.js';
import { openPreviewModal, openTemplateFormModal } from './actions.js';
import { render } from './index.js';
import { ENTITY_OPTIONS, TYPE_OPTIONS, can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderDetail(c, templateId) {
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
      import('../../router.js').then(r => r.navigate('templates')));

    c.querySelector('#btn-edit')?.addEventListener('click', () =>
      openTemplateFormModal(templateId, () => renderDetail(c, templateId)));

    c.querySelector('#btn-preview').addEventListener('click', () => openPreviewModal(templateId));
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load template</b></div>
      <div class="text-muted mt-2">${escapeHtml(extractFineractError(e))}</div>
    </div></div>`;
  }
}
