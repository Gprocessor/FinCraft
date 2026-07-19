/* FinCraft · pages/system/loaders/integrations.js — external services, webhooks, external events, and COB tab loaders.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, num, sb } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openSetBusinessDateModal, openWebhookModal, viewServiceConfig } from '../actions.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadExternalServices(c) {
  const el = c.querySelector('#sy-5');

  const services = [
    { key: 'sms',          label: 'SMS Gateway',         icon: 'fa-comment-sms' },
    { key: 'smtpEmail',    label: 'SMTP Email',          icon: 'fa-envelope' },
    { key: 's3',           label: 'S3 Storage',          icon: 'fa-cloud' },
    { key: 'notification', label: 'Push Notifications',  icon: 'fa-bell' }
  ];

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>External Services</h3>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      External service configuration is read-only here for security. Editing is done via the Fineract server-side tooling.
    </div>
    <div class="kpi-grid">
      ${services.map(svc => `
        <div class="kpi-card" style="text-align:left">
          <div class="kpi-label">
            <i class="fa-solid ${svc.icon}"></i> ${svc.label}
          </div>
          <div class="mt-2">
            <button class="btn-secondary btn-sm" data-svc-view="${svc.key}" data-svc-label="${escapeHtml(svc.label)}">
              <i class="fa-solid fa-eye"></i> View Configuration
            </button>
          </div>
        </div>`).join('')}
    </div>`;

  el.querySelectorAll('[data-svc-view]').forEach(b => b.addEventListener('click', () =>
    viewServiceConfig(b.dataset.svcView, b.dataset.svcLabel)
  ));
}

export async function loadCOB(c) {
  const el = c.querySelector('#sy-6');
  el.innerHTML = '<div class="empty-state-row">Loading COB configuration…</div>';
  try {
    const [dateRes, cfgRes] = await Promise.allSettled([
      api.cob.businessDate.get(),
      api.cob.configurations()
    ]);
    const date = dateRes.status === 'fulfilled' ? dateRes.value : null;
    const cfgs = cfgRes.status === 'fulfilled' ? cfgRes.value : null;
    const cfgList = Array.isArray(cfgs) ? cfgs : (cfgs?.businessSteps || []);

    const canCatchUp = can('EXECUTEJOB_SCHEDULER'); // LoanCOBCatchUpApiResource has no documented permission requirement in Fineract source at all
    const canSetDate = can('UPDATE_BUSINESS_DATE');

    const dateDisplay = date
      ? escapeHtml(String(date.date || date.businessDate || JSON.stringify(date)))
      : '—';
    const dateType = date ? escapeHtml(date.type || 'BUSINESS_DATE') : '—';

    el.innerHTML = `
      <div class="grid-2">
        <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
          <h3>Business Date</h3>
          ${date ? `
            <dl class="dl-grid">
              <dt>Current</dt>
              <dd><b style="font-size:18px">${dateDisplay}</b></dd>
              <dt>Type</dt>
              <dd>${dateType}</dd>
            </dl>
            ${canSetDate ? `
              <div class="mt-2">
                <button class="btn-secondary btn-sm" id="cob-set-date">
                  <i class="fa-solid fa-calendar-day"></i> Set Business Date
                </button>
              </div>` : ''}
          ` : '<div class="empty-state-row">Business date not available</div>'}
        </div>

        <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
          <h3>COB Operations</h3>
          <div class="text-muted small mb-2">
            <i class="fa-solid fa-circle-info"></i>
            Catch-up processes any COB steps that are overdue (e.g. due to downtime).
          </div>
          ${canCatchUp ? `<button class="btn-warning" id="cob-catchup">
            <i class="fa-solid fa-rotate"></i> Run COB Catch-Up
          </button>` : '<div class="text-muted small">Insufficient permissions for catch-up</div>'}
        </div>
      </div>

      <h3 class="mt-3">Business Step Configuration</h3>
      ${cfgList.length ? `
        <table class="table">
          <thead><tr>
            <th>Step Name</th><th>Job Name</th><th>Order</th>
          </tr></thead>
          <tbody>${cfgList.map(s => `
            <tr>
              <td><b>${escapeHtml(s.stepName || s.name || '—')}</b></td>
              <td><code>${escapeHtml(s.jobName || '—')}</code></td>
              <td>${escapeHtml(String(s.order ?? '—'))}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No business step configuration found</div>'}`;

    el.querySelector('#cob-catchup')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Trigger COB catch-up?',
        message: 'This runs all overdue COB steps asynchronously. May take several minutes.',
        confirmText: 'Run Catch-Up'
      })) return;
      try {
        await api.cob.catchUp();
        toast('success', 'COB catch-up triggered', 'Processing asynchronously');
      } catch (e) {
        toast('error', 'COB catch-up failed', extractFineractError(e));
      }
    });

    el.querySelector('#cob-set-date')?.addEventListener('click', () => openSetBusinessDateModal());
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadHooks(c) {
  const el = c.querySelector('#sy-7');
  el.innerHTML = '<div class="empty-state-row">Loading hooks…</div>';
  try {
    const hooks = await api.hooks.list();
    const list = Array.isArray(hooks) ? hooks : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} webhook${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_HOOK') ? `<button class="btn-primary" id="btn-new-hook"><i class="fa-solid fa-plus"></i> New Webhook</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Webhooks notify external systems when specific Fineract events occur (e.g. loan disbursed, client created).
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Template</th><th>Active</th><th>Events</th><th></th>
          </tr></thead>
          <tbody>${list.map(h => {
            const eventsList = (h.events || [])
              .map(e => escapeHtml((e.actionName || '') + ':' + (e.entityName || '')))
              .join(', ') || '—';
            return `
              <tr>
                <td><b>${escapeHtml(h.name || '—')}</b>
                  ${h.displayName ? `<div class="text-muted small">${escapeHtml(h.displayName)}</div>` : ''}
                </td>
                <td>${escapeHtml(h.templateName || h.templateId || '—')}</td>
                <td>${h.isActive ? sb('Active') : sb('Inactive')}</td>
                <td><span class="text-muted small">${eventsList}</span></td>
                <td class="text-right">
                  ${can('UPDATE_HOOK') ? `<button class="btn-mini" data-edit-hook="${h.id}">Edit</button>` : ''}
                  ${can('DELETE_HOOK') ? `<button class="btn-mini btn-danger" data-del-hook="${h.id}">Delete</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-link"></i>
          <h3>No webhooks configured</h3>
          ${can('CREATE_HOOK') ? '<div class="text-muted mt-2">Create a webhook to integrate Fineract with external systems.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-new-hook')?.addEventListener('click', () =>
      openWebhookModal(null, () => loadHooks(c))
    );

    el.querySelectorAll('[data-edit-hook]').forEach(b => b.addEventListener('click', () =>
      openWebhookModal(b.dataset.editHook, () => loadHooks(c))
    ));

    el.querySelectorAll('[data-del-hook]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete webhook?',
        message: 'External systems will no longer receive event notifications.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.hooks.delete(b.dataset.delHook);
        toast('success', 'Webhook deleted', '');
        loadHooks(c);
      } catch (e) {
        toast('error', 'Delete failed', extractFineractError(e));
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadExternalEvents(c) {
  const el = c.querySelector('#sy-10');
  el.innerHTML = '<div class="empty-state-row">Loading external event configuration…</div>';
  try {
    // FIXLOG #3: externalEvents.list() removed — no public Fineract route backs it.
    const configRes = await api.externalEvents.configurations().catch(() => null);

    const configList = Array.isArray(configRes) ? configRes : (configRes?.externalEventConfiguration || []);

    const canEdit = can('UPDATE_EXTERNAL_EVENT_CONFIGURATION');

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>External Event Configuration</h3>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Toggle individual external events to be published to the event stream (Kafka, RabbitMQ, etc.).
        Events that are enabled here trigger webhooks and downstream integrations.
      </div>

      ${configList.length ? `
        <div class="filter-bar mb-2">
          <input id="ee-search" class="form-control" placeholder="Search event types…" autocomplete="off"/>
          ${canEdit ? `<button class="btn-success btn-sm" id="ee-enable-all">Enable All</button>` : ''}
          ${canEdit ? `<button class="btn-secondary btn-sm" id="ee-disable-all">Disable All</button>` : ''}
        </div>

        <table class="table">
          <thead><tr>
            <th>Event Type</th><th>Enabled</th>
          </tr></thead>
          <tbody id="ee-tbody">${configList.map(c => `
            <tr class="ee-row">
              <td><code>${escapeHtml(c.type || c.name || '—')}</code></td>
              <td>
                ${canEdit
                  ? `<input type="checkbox" class="ee-chk" data-event-type="${escapeHtml(c.type || c.name)}" ${c.enabled ? 'checked' : ''}/>`
                  : (c.enabled ? sb('Yes') : sb('No'))}
              </td>
            </tr>`).join('')}</tbody>
        </table>

        ${canEdit ? `<div class="mt-3"><button class="btn-primary" id="ee-save">Save Changes</button></div>` : ''}
      ` : '<div class="empty-state-row">No event configurations available</div>'}`;

    el.querySelector('#ee-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.ee-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelector('#ee-enable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.ee-chk').forEach(cb => cb.checked = true);
    });

    el.querySelector('#ee-disable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.ee-chk').forEach(cb => cb.checked = false);
    });

    el.querySelector('#ee-save')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Save event configuration?',
        message: 'Changes will affect all downstream integrations using the event stream.',
        confirmText: 'Save'
      })) return;

      const externalEventConfigurations = {};
      el.querySelectorAll('.ee-chk').forEach(cb => {
        externalEventConfigurations[cb.dataset.eventType] = cb.checked;
      });

      try {
        await api.externalEvents.updateConfig({ externalEventConfigurations });
        toast('success', 'Event configuration saved', '');
        loadExternalEvents(c);
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">External events not enabled on this tenant: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}
