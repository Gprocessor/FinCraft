/* FinCraft · pages/system/actions/integrations.js — external service and webhook modals.
   Auto-split from the original monolithic pages/system/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export function viewServiceConfig(group, label) {
  const mid = 'svc-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>${escapeHtml(label)} Configuration</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="svc-cfg-body">
          <div class="empty-state-row">Loading…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  api.externalServices[group].list()
    .then(cfg => {
      const props = cfg?.properties || (Array.isArray(cfg) ? cfg : null);
      const body = m.querySelector('#svc-cfg-body');
      if (Array.isArray(props) && props.length) {
        body.innerHTML = `
          <table class="table">
            <thead><tr><th>Property</th><th>Value</th></tr></thead>
            <tbody>${props.map(p => {
              const key = p.name || p.key || '—';
              const isSecret = /pass|secret|key|token/i.test(key);
              const valueDisplay = isSecret
                ? '<span class="text-muted">••••••••</span>'
                : escapeHtml(String(p.value ?? '—'));
              return `
                <tr>
                  <td><code>${escapeHtml(key)}</code></td>
                  <td>${valueDisplay}</td>
                </tr>`;
            }).join('')}</tbody>
          </table>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i>
            Secret values are masked. Edit via Fineract admin tools or server-side config files.
          </div>`;
      } else {
        body.innerHTML = '<div class="empty-state-row">No configuration found for this service</div>';
      }
    })
    .catch(e => {
      m.querySelector('#svc-cfg-body').innerHTML =
        `<div class="empty-state-row text-muted">Service not configured: ${escapeHtml(extractFineractError(e))}</div>`;
    });
}

export async function openWebhookModal(hookId, onSuccess) {
  const isEdit = !!hookId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.hooks.get(hookId); }
    catch { toast('error', 'Could not load webhook', ''); return; }
  }

  let tpl = {};
  try { tpl = await api.hooks.template(); } catch {}
  const templateOptions = tpl.templates || [];
  const eventOptions = tpl.groupings || tpl.events || [];

  const existingUrl = existing.config?.find(c => c.fieldName === 'Payload URL')?.fieldValue || '';
  const existingEvents = (existing.events || [])
    .map(e => (e.actionName || '') + ':' + (e.entityName || ''))
    .join('\n');

  const mid = 'hook-modal-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Webhook</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Name *
              <input id="hk-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/>
            </label>
            <label>Display name
              <input id="hk-display" class="form-control" value="${escapeHtml(existing.displayName || '')}"/>
            </label>
            <label class="full">Payload URL *
              <input id="hk-url" class="form-control" value="${escapeHtml(existingUrl)}" placeholder="https://example.com/webhook" required/>
            </label>
            <label>Template
              <select id="hk-template" class="form-control">
                <option value="">— None —</option>
                ${templateOptions.map(t => {
                  const selected = existing.templateId === t.id ? 'selected' : '';
                  return `<option value="${t.id}" ${selected}>${escapeHtml(t.name || t.value || '—')}</option>`;
                }).join('')}
              </select>
            </label>
            <label>Active
              <select id="hk-active" class="form-control">
                <option value="true" ${existing.isActive ? 'selected' : ''}>Yes</option>
                <option value="false" ${!existing.isActive ? 'selected' : ''}>No</option>
              </select>
            </label>
          </div>

          <h4 class="mt-3">Events</h4>
          <div class="text-muted small mb-2">
            <i class="fa-solid fa-circle-info"></i>
            One event per line in format <code>actionName:entityName</code>
            (e.g. <code>CREATE:CLIENT</code> or <code>DISBURSE:LOAN</code>).
          </div>
          <textarea id="hk-events" class="form-control" rows="6" placeholder="CREATE:CLIENT&#10;APPROVE:LOAN&#10;DISBURSE:LOAN">${escapeHtml(existingEvents)}</textarea>

          ${eventOptions.length ? `
            <div class="text-muted small mt-2">
              <b>Available events (from template):</b>
              ${eventOptions.slice(0, 20).map(e => {
                const evtStr = (e.actionName || '') + ':' + (e.entityName || '');
                return `<code style="margin-right:6px">${escapeHtml(evtStr)}</code>`;
              }).join('')}
              ${eventOptions.length > 20 ? `<span>… and ${eventOptions.length - 20} more</span>` : ''}
            </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="hk-save">${isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#hk-save').addEventListener('click', async () => {
    const name = m.querySelector('#hk-name').value.trim();
    const displayName = m.querySelector('#hk-display').value.trim();
    const url = m.querySelector('#hk-url').value.trim();
    const templateId = m.querySelector('#hk-template').value.trim();
    const isActive = m.querySelector('#hk-active').value === 'true';
    const eventsRaw = m.querySelector('#hk-events').value.trim();

    if (!name || !url) { toast('warn', 'Fill required fields', ''); return; }

    const events = eventsRaw ? eventsRaw.split('\n').filter(Boolean).map(ev => {
      const parts = ev.split(':');
      return { actionName: parts[0]?.trim(), entityName: parts[1]?.trim() };
    }) : [];

    const payload = {};
    payload.name = name;
    payload.isActive = isActive;
    payload.events = events;
    payload.config = [{ fieldName: 'Payload URL', fieldValue: url }];
    if (displayName) payload.displayName = displayName;
    if (templateId) payload.templateId = parseInt(templateId);

    try {
      if (isEdit) await api.hooks.update(hookId, payload);
      else        await api.hooks.create(payload);
      m.remove();
      toast('success', isEdit ? 'Webhook updated' : 'Webhook created', name);
      onSuccess?.();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e));
    }
  });
}
