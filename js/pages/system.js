import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · system.js — System administration (permission-gated, 15 sub-tabs)
   Modular build: each tab loaded in sequence, defensive against truncation. */

import { api } from '../api.js';
import { escapeHtml, fmtDate, num, sb } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';
import { store } from '../store.js';

const can = (code) => store.hasPermission(code);

const TABS = [
  'Configurations',
  'Audit Trails',
  'Codes & Values',
  'Roles & Permissions',
  'Manage Jobs',
  'External Services',
  'COB',
  'Hooks',
  'Account Number Prefs',
  'Entity Mappings',
  'External Events',
  'Maker-Checker Config',
  'Surveys',
  'Migration Links',
  'System Info'
];

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>System</h1>
        <div class="text-muted">Platform configuration &amp; maintenance</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="sy-tabs" style="flex-wrap:wrap">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="sy-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="sy-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0:  loadConfigurations,
    1:  loadAuditTrails,
    2:  loadCodes,
    3:  loadRoles,
    4:  loadJobs,
    5:  loadExternalServices,
    6:  loadCOB,
    7:  loadHooks,
    8:  loadAccountNumberPrefs,
    9:  loadEntityMappings,
    10: loadExternalEvents,
    11: loadMakerCheckerConfig,
    12: loadSurveys,
    13: loadMigrationLinks,
    14: loadSystemInfo
  };
  const loaded = {};

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    if (loaders[idx] && !loaded[idx]) {
      loaded[idx] = true;
      loadersc;
    }
  }));

  loadConfigurations(c);
  loaded[0] = true;
}

// ════════════════════════════════════════════════════════════
// PLACEHOLDER STUBS — all 15 tabs (replaced one-by-one in next steps)
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// TAB 0 — CONFIGURATIONS
// ════════════════════════════════════════════════════════════
async function loadConfigurations(c) {
  const el = c.querySelector('#sy-0');
  el.innerHTML = '<div class="empty-state-row">Loading configurations…</div>';
  try {
    const cf = await api.configurations.list();
    const list = Array.isArray(cf?.globalConfiguration)
      ? cf.globalConfiguration
      : (Array.isArray(cf) ? cf : []);
    const canEdit = can('UPDATE_CONFIGURATION');

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} configuration${list.length !== 1 ? 's' : ''}</span>
        <input id="cfg-search" class="form-control" placeholder="Search…" style="max-width:300px"/>
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Toggle global system settings. Changes apply tenant-wide.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Configuration</th><th>Description</th><th>Value</th><th>Enabled</th>
          </tr></thead>
          <tbody id="cfg-tbody">${list.map(cfg => `
            <tr class="cfg-row">
              <td><code>${escapeHtml(cfg.name)}</code></td>
              <td class="text-muted small">${escapeHtml(cfg.description || '—')}</td>
              <td>${escapeHtml(String(cfg.value ?? '—'))}</td>
              <td>
                ${canEdit
                  ? `<input type="checkbox" data-cfg="${cfg.id || cfg.name}" ${cfg.enabled ? 'checked' : ''}/>`
                  : (cfg.enabled ? sb('Yes') : sb('No'))}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No configurations found</div>'}`;

    el.querySelector('#cfg-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.cfg-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-cfg]').forEach(sw => sw.addEventListener('change', async () => {
      try {
        await api.configurations.update(sw.dataset.cfg, { enabled: sw.checked });
        toast('success', 'Config updated', sw.dataset.cfg + (sw.checked ? ' enabled' : ' disabled'));
      } catch (e) {
        sw.checked = !sw.checked;
        toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message);
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 1 — AUDIT TRAILS
// ════════════════════════════════════════════════════════════
async function loadAuditTrails(c) {
  const el = c.querySelector('#sy-1');
  el.innerHTML = '<div class="empty-state-row">Loading audit trails…</div>';
  try {
    const res = await api.audits.list({ limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} audit entries (most recent 100)</span>
        <input id="aud-search" class="form-control" placeholder="Search action, entity, maker…" style="max-width:300px"/>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Action</th><th>Entity</th><th>Resource</th>
            <th>Maker</th><th>Made On</th><th>Status</th><th></th>
          </tr></thead>
          <tbody id="aud-tbody">${list.map(a => `
            <tr class="aud-row">
              <td><b>${escapeHtml(a.actionName || '—')}</b></td>
              <td>${escapeHtml(a.entityName || '—')}</td>
              <td>${escapeHtml(a.resourceId ? String(a.resourceId) : '—')}</td>
              <td>${escapeHtml(a.maker || '—')}</td>
              <td>${fmtDate(a.madeOnDate) || '—'}</td>
              <td>${escapeHtml(a.processingResult?.value || '—')}</td>
              <td class="text-right">
                <button class="btn-mini" data-audit-id="${a.id}">View</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No audit trail records</div>'}`;

    el.querySelector('#aud-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.aud-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-audit-id]').forEach(b => b.addEventListener('click', () =>
      openAuditDetail(b.dataset.auditId)
    ));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
async function openAuditDetail(auditId) {
  const mid = 'audit-detail-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>Audit Entry #${escapeHtml(String(auditId))}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="${mid}-body">
          <div class="empty-state-row">Loading…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  try {
    const audit = await api.audits.get(auditId);
    const body = document.getElementById(mid + '-body');
    let payload = '—';
    try {
      payload = audit.commandAsJson
        ? JSON.stringify(JSON.parse(audit.commandAsJson), null, 2)
        : '—';
    } catch {
      payload = String(audit.commandAsJson || '—');
    }

    body.innerHTML = `
      <div class="grid-2">
        <div>
          <dl class="dl-grid">
            <dt>Action</dt><dd>${escapeHtml(audit.actionName || '—')}</dd>
            <dt>Entity</dt><dd>${escapeHtml(audit.entityName || '—')}</dd>
            <dt>Resource ID</dt><dd>${escapeHtml(String(audit.resourceId || '—'))}</dd>
          </dl>
        </div>
        <div>
          <dl class="dl-grid">
            <dt>Maker</dt><dd>${escapeHtml(audit.maker || '—')}</dd>
            <dt>Made On</dt><dd>${fmtDate(audit.madeOnDate) || '—'}</dd>
            <dt>Status</dt><dd>${escapeHtml(audit.processingResult?.value || '—')}</dd>
          </dl>
        </div>
      </div>
      <h4 class="mt-3">Payload (commandAsJson)</h4>
      <pre style="background:var(--surface-1); padding:12px; border-radius:4px; max-height:400px; overflow:auto; font-family:monospace; font-size:12px">${escapeHtml(payload)}</pre>`;
  } catch (e) {
    document.getElementById(mid + '-body').innerHTML =
      `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 2 — CODES & VALUES
// ════════════════════════════════════════════════════════════
async function loadCodes(c) {
  const el = c.querySelector('#sy-2');
  el.innerHTML = '<div class="empty-state-row">Loading codes…</div>';
  try {
    const codes = await api.codes.list();
    const list = Array.isArray(codes) ? codes : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} code${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_CODE') ? `<button class="btn-primary" id="btn-new-code"><i class="fa-solid fa-plus"></i> New Code</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Code Name</th><th>Type</th><th></th>
          </tr></thead>
          <tbody>${list.map(cd => `
            <tr>
              <td><b>${escapeHtml(cd.name)}</b></td>
              <td>${cd.systemDefined ? sb('System') : sb('Custom')}</td>
              <td class="text-right">
                <button class="btn-mini" data-code-vals="${cd.id}" data-code-name="${escapeHtml(cd.name)}">Values</button>
                ${can('DELETE_CODE') && !cd.systemDefined ? `<button class="btn-mini btn-danger" data-del-code="${cd.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No codes</div>'}`;

    el.querySelector('#btn-new-code')?.addEventListener('click', () =>
      openNewCodeModal(() => loadCodes(c))
    );
    el.querySelectorAll('[data-code-vals]').forEach(b => b.addEventListener('click', () =>
      openCodeValuesModal(b.dataset.codeVals, b.dataset.codeName)
    ));
    el.querySelectorAll('[data-del-code]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete code?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.codes.delete(b.dataset.delCode);
        toast('success', 'Code deleted', '');
        loadCodes(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
function openNewCodeModal(onSuccess) {
  const mid = 'code-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>New Code</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Code name * <input id="code-name" class="form-control" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Create</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = m.querySelector('#code-name').value.trim();
    if (!name) { toast('warn', 'Enter a code name', ''); return; }
    try {
      await api.codes.create({ name });
      m.remove();
      toast('success', 'Code created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

async function openCodeValuesModal(codeId, codeName) {
  const mid = 'cv-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${escapeHtml(codeName)} — Values</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div id="cv-list"><div class="empty-state-row">Loading…</div></div>
          <h4 class="mt-3">Add Value</h4>
          <div class="form-grid">
            <label>Name * <input id="cv-name" class="form-control" required/></label>
            <label>Description <input id="cv-desc" class="form-control"/></label>
            <label>Position <input type="number" id="cv-pos" class="form-control" value="0"/></label>
            <label class="checkbox-row"><input type="checkbox" id="cv-active" checked/> Active</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
          ${can('CREATE_CODEVALUE') ? `<button class="btn-primary" id="${mid}-save">Add Value</button>` : ''}
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  async function reloadValues() {
    const listEl = m.querySelector('#cv-list');
    listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const vals = await api.codes.values(codeId);
      const list = Array.isArray(vals) ? vals : [];
      listEl.innerHTML = list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Description</th><th>Position</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(v => `
            <tr>
              <td>${escapeHtml(v.name || '—')}</td>
              <td>${escapeHtml(v.description || '—')}</td>
              <td>${v.position ?? '—'}</td>
              <td>${v.active !== false ? 'Yes' : 'No'}</td>
              <td class="text-right">
                ${can('DELETE_CODEVALUE') ? `<button class="btn-mini btn-danger" data-del-cv="${v.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No values defined</div>';

      listEl.querySelectorAll('[data-del-cv]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({ title: 'Delete code value?', danger: true, confirmText: 'Delete' })) return;
        try {
          await api.codes.deleteValue(codeId, b.dataset.delCv);
          toast('success', 'Value deleted', '');
          reloadValues();
        } catch (e) {
          toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message);
        }
      }));
    } catch (e) {
      listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
    }
  }

  reloadValues();

  m.querySelector('#' + mid + '-save')?.addEventListener('click', async () => {
    const name = m.querySelector('#cv-name').value.trim();
    const description = m.querySelector('#cv-desc').value.trim();
    const position = parseInt(m.querySelector('#cv-pos').value) || 0;
    const isActive = m.querySelector('#cv-active').checked;
    if (!name) { toast('warn', 'Enter a value name', ''); return; }

    const payload = {};
    payload.name = name;
    payload.position = position;
    payload.isActive = isActive;
    if (description) payload.description = description;

    try {
      await api.codes.createValue(codeId, payload);
      m.querySelector('#cv-name').value = '';
      m.querySelector('#cv-desc').value = '';
      toast('success', 'Value added', name);
      reloadValues();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
// ════════════════════════════════════════════════════════════
// TAB 3 — ROLES & PERMISSIONS (redirect view to Users module)
// ════════════════════════════════════════════════════════════
async function loadRoles(c) {
  const el = c.querySelector('#sy-3');
  el.innerHTML = '<div class="empty-state-row">Loading role summary…</div>';
  try {
    const roles = await api.roles.list();
    const list = Array.isArray(roles) ? roles : [];

    el.innerHTML = `
      <div class="msg-banner b-info mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Full role &amp; permission editing is now in the dedicated Users &amp; Roles module.
        This tab provides a read-only summary.
      </div>

      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} role${list.length !== 1 ? 's' : ''}</span>
        ${can('READ_ROLE') ? `<button class="btn-primary" id="btn-go-roles"><i class="fa-solid fa-arrow-right"></i> Manage in Users Module</button>` : ''}
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr><th>Role</th><th>Description</th><th>Status</th></tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td><b>${escapeHtml(r.name)}</b></td>
              <td>${escapeHtml(r.description || '—')}</td>
              <td>${r.disabled ? sb('Disabled') : sb('Active')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No roles defined</div>'}`;

    el.querySelector('#btn-go-roles')?.addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('users'))
    );
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 4 — MANAGE JOBS (with run + run history)
// ════════════════════════════════════════════════════════════
async function loadJobs(c) {
  const el = c.querySelector('#sy-4');
  el.innerHTML = '<div class="empty-state-row">Loading jobs…</div>';
  try {
    const jobs = await api.jobs.list();
    const list = Array.isArray(jobs) ? jobs : [];

    const canRun = can('EXECUTEJOB_JOB') || can('UPDATE_JOB');

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} scheduled job${list.length !== 1 ? 's' : ''}</span>
        <input id="job-search" class="form-control" placeholder="Search jobs…" style="max-width:300px"/>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Job</th><th>Cron</th><th>Last Run</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.flatMap(j => {
            const jobId = j.jobId || j.id;
            return [`
              <tr class="job-row">
                <td><b>${escapeHtml(j.displayName || j.name || '—')}</b></td>
                <td><code class="small">${escapeHtml(j.cronExpression || '—')}</code></td>
                <td>${fmtDate(j.lastRunHistory?.jobRunStartTime) || '—'}</td>
                <td>${j.currentlyRunning ? sb('Running') : sb('Idle')}</td>
                <td class="text-right">
                  <button class="btn-mini" data-job-history="${jobId}" data-job-name="${escapeHtml(j.displayName || j.name || '')}">History</button>
                  ${canRun ? `<button class="btn-mini btn-success" data-run-job="${jobId}">Run</button>` : ''}
                </td>
              </tr>
              <tr id="job-hist-${jobId}" style="display:none">
                <td colspan="5"><div id="job-hist-body-${jobId}"></div></td>
              </tr>`];
          }).join('')}
          </tbody>
        </table>` : '<div class="empty-state-row">No scheduled jobs</div>'}`;

    el.querySelector('#job-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.job-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-run-job]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Run job now?', confirmText: 'Run' })) return;
      try {
        await api.jobs.runJob(b.dataset.runJob);
        toast('success', 'Job triggered', 'Job #' + b.dataset.runJob + ' scheduled');
      } catch (e) {
        toast('error', 'Job failed', e.detail?.defaultUserMessage || e.message);
      }
    }));

    el.querySelectorAll('[data-job-history]').forEach(b => b.addEventListener('click', async () => {
      const jid = b.dataset.jobHistory;
      const row = el.querySelector('#job-hist-' + jid);
      const body = el.querySelector('#job-hist-body-' + jid);
      if (row.style.display !== 'none') { row.style.display = 'none'; return; }
      row.style.display = '';
      body.innerHTML = '<div class="empty-state-row">Loading history…</div>';
      try {
        const res = await api.jobs.history(jid, { limit: 10 });
        const runs = Array.isArray(res) ? res : (res?.pageItems || []);
        body.innerHTML = runs.length ? `
          <div class="text-muted small mb-1">Run history &mdash; ${escapeHtml(b.dataset.jobName)}</div>
          <table class="table table-compact">
            <thead><tr><th>Started</th><th>Finished</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>${runs.map(r => `
              <tr>
                <td>${fmtDate(r.jobRunStartTime) || '—'}</td>
                <td>${fmtDate(r.jobRunEndTime) || '—'}</td>
                <td>${escapeHtml(r.status || '—')}</td>
                <td class="text-muted small">${escapeHtml(r.triggerType || r.jobRunErrorMessage || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state-row">No run history</div>';
      } catch (e) {
        body.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 5 — EXTERNAL SERVICES (read-only preview)
// ════════════════════════════════════════════════════════════
async function loadExternalServices(c) {
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

function viewServiceConfig(group, label) {
  const mid = 'svc-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
        `<div class="empty-state-row text-muted">Service not configured: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    });
}
// ════════════════════════════════════════════════════════════
// TAB 6 — COB (Close of Business)
// ════════════════════════════════════════════════════════════
async function loadCOB(c) {
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

    const canCatchUp = can('CATCHUP_LOAN_COB') || can('EXECUTE_JOB');
    const canSetDate = can('UPDATE_BUSINESSDATE');

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
        toast('error', 'COB catch-up failed', e.detail?.defaultUserMessage || e.message);
      }
    });

    el.querySelector('#cob-set-date')?.addEventListener('click', () => openSetBusinessDateModal());
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

function openSetBusinessDateModal() {
  const mid = 'bdate-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Set Business Date</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Changing the business date forces all date-aware operations to use this date. Use with caution.
          </div>
          <label>New business date *
            <input type="date" id="bdate-val" class="form-control" value="${today()}" required/>
          </label>
          <label class="mt-2">Type
            <select id="bdate-type" class="form-control">
              <option value="BUSINESS_DATE" selected>BUSINESS_DATE</option>
              <option value="COB_DATE">COB_DATE</option>
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="bdate-save">Set Date</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#bdate-save').addEventListener('click', async () => {
    const date = m.querySelector('#bdate-val').value;
    const type = m.querySelector('#bdate-type').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }

    const payload = {};
    payload.date = date;
    payload.type = type;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;

    try {
      await api.cob.businessDate.set(payload);
      m.remove();
      toast('success', 'Business date updated', date);
    } catch (e) {
      toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
// ════════════════════════════════════════════════════════════
// TAB 7 — HOOKS (webhooks for external system integration)
// ════════════════════════════════════════════════════════════
async function loadHooks(c) {
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
        toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message);
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
async function openWebhookModal(hookId, onSuccess) {
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
    <div class="modal-overlay open" id="${mid}">
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
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
// ════════════════════════════════════════════════════════════
// TAB 8 — ACCOUNT NUMBER PREFERENCES (audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadAccountNumberPrefs(c) {
  const el = c.querySelector('#sy-8');
  el.innerHTML = '<div class="empty-state-row">Loading account number preferences…</div>';
  try {
    const res = await api.accountNumberPreferences.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} preference${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-primary" id="btn-new-anp"><i class="fa-solid fa-plus"></i> New Preference</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Configure how new account numbers are auto-generated per entity type (Clients, Loans, Savings, etc.).
        For example, prefix with office name, suffix with timestamp, or use sequential ID.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Entity</th><th>Format Type</th><th>Prefix</th><th></th>
          </tr></thead>
          <tbody>${list.map(p => `
            <tr>
              <td><b>${escapeHtml(p.accountNumberType?.value || p.accountType?.value || '—')}</b></td>
              <td>${escapeHtml(p.prefixType?.value || 'Default Sequential')}</td>
              <td><code>${escapeHtml(p.prefix || '—')}</code></td>
              <td class="text-right">
                ${can('UPDATE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-mini" data-edit-anp="${p.id}">Edit</button>` : ''}
                ${can('DELETE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-mini btn-danger" data-del-anp="${p.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-hashtag"></i>
          <h3>No account number preferences configured</h3>
          ${can('CREATE_ACCOUNTNUMBERFORMAT') ? '<div class="text-muted mt-2">Default sequential numbering is used until configured here.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-new-anp')?.addEventListener('click', () =>
      openAccountNumberPrefModal(null, () => loadAccountNumberPrefs(c))
    );

    el.querySelectorAll('[data-edit-anp]').forEach(b => b.addEventListener('click', () =>
      openAccountNumberPrefModal(b.dataset.editAnp, () => loadAccountNumberPrefs(c))
    ));

    el.querySelectorAll('[data-del-anp]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete account number preference?',
        message: 'New accounts of this type will revert to default sequential numbering.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.accountNumberPreferences.delete(b.dataset.delAnp);
        toast('success', 'Preference deleted', '');
        loadAccountNumberPrefs(c);
      } catch (e) {
        toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message);
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Account number preferences not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
async function openAccountNumberPrefModal(prefId, onSuccess) {
  const isEdit = !!prefId;
  let existing = {};
  let tpl = {};

  try {
    if (isEdit) existing = await api.accountNumberPreferences.get(prefId);
    tpl = await api.accountNumberPreferences.template();
  } catch (e) {
    toast('error', 'Could not load form data', e.detail?.defaultUserMessage || e.message);
    return;
  }

  const entityOptions = tpl.accountNumberTypeOptions || tpl.accountTypeOptions || [
    { id: 1, value: 'Clients' },
    { id: 2, value: 'Loans' },
    { id: 3, value: 'Savings' },
    { id: 4, value: 'Centers' },
    { id: 5, value: 'Groups' }
  ];

  const prefixTypeOptions = tpl.prefixTypeOptions || [
    { id: 'PREFIX_SHORT_NAME',      value: 'Office short name' },
    { id: 'PREFIX_OFFICE_NAME',     value: 'Office name' },
    { id: 'PREFIX_PRODUCT_SHORTNAME', value: 'Product short name' },
    { id: 'NONE',                   value: 'No prefix (sequential only)' }
  ];

  const currentEntityId = existing.accountNumberType?.id || existing.accountTypeId;
  const currentPrefixType = existing.prefixType?.id || existing.prefixType;

  const mid = 'anp-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Account Number Preference</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Entity *
              <select id="anp-entity" class="form-control" required ${isEdit ? 'disabled' : ''}>
                <option value="">Select entity…</option>
                ${entityOptions.map(o => {
                  const selected = currentEntityId === o.id ? 'selected' : '';
                  return `<option value="${o.id}" ${selected}>${escapeHtml(o.value || o.name)}</option>`;
                }).join('')}
              </select>
            </label>
            <label>Prefix Type
              <select id="anp-prefix-type" class="form-control">
                <option value="">— None —</option>
                ${prefixTypeOptions.map(o => {
                  const selected = currentPrefixType === o.id ? 'selected' : '';
                  return `<option value="${o.id}" ${selected}>${escapeHtml(o.value || o.name)}</option>`;
                }).join('')}
              </select>
            </label>
          </div>

          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            New accounts of the selected entity will have account numbers auto-generated using:
            <code>[prefix]&lt;sequential ID&gt;</code>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="anp-save">${isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#anp-save').addEventListener('click', async () => {
    const entityId = parseInt(m.querySelector('#anp-entity').value);
    const prefixType = m.querySelector('#anp-prefix-type').value;

    if (!entityId) { toast('warn', 'Select an entity', ''); return; }

    const payload = {};
    if (!isEdit) payload.accountNumberType = entityId;
    if (prefixType) payload.prefixType = prefixType;

    try {
      if (isEdit) await api.accountNumberPreferences.update(prefId, payload);
      else        await api.accountNumberPreferences.create(payload);
      m.remove();
      toast('success', isEdit ? 'Preference updated' : 'Preference created', '');
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
// ════════════════════════════════════════════════════════════
// TAB 9 — ENTITY-TO-ENTITY MAPPING (audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadEntityMappings(c) {
  const el = c.querySelector('#sy-9');
  el.innerHTML = '<div class="empty-state-row">Loading entity mappings…</div>';
  try {
    const res = await api.entityToEntityMappings.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Entity-to-Entity Mappings</h3>
        <span class="text-muted">${num(list.length)} mapping type${list.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Restrict which entities of one type can be linked to entities of another type — e.g. which offices can use which loan products,
        which roles can perform which actions.
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Mapping Type</th>
            <th>From Entity</th>
            <th>To Entity</th>
            <th class="text-right">Mapped Count</th>
            <th></th>
          </tr></thead>
          <tbody>${list.map(m => {
            const mappedCount = (m.mappings || m.entityMappings || []).length;
            return `
              <tr>
                <td><b>${escapeHtml(m.mappingName || m.entityToEntityMapping || '—')}</b>
                  ${m.description ? `<div class="text-muted small">${escapeHtml(m.description)}</div>` : ''}
                </td>
                <td>${escapeHtml(m.fromType || m.firstEntity || '—')}</td>
                <td>${escapeHtml(m.toType || m.secondEntity || '—')}</td>
                <td class="text-right">${num(mappedCount)}</td>
                <td class="text-right">
                  ${can('UPDATE_ENTITYTOENTITYMAPPING') ? `<button class="btn-mini" data-edit-map="${m.mapId || m.id}" data-map-name="${escapeHtml(m.mappingName || '—')}">View / Edit</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-diagram-project"></i>
          <h3>No entity mappings defined</h3>
          <div class="text-muted mt-2">Entity-to-entity mappings are tenant-configuration features. Contact your administrator if you need restrictions enabled.</div>
        </div>`}`;

    el.querySelectorAll('[data-edit-map]').forEach(b => b.addEventListener('click', () =>
      openEntityMappingDetail(b.dataset.editMap, b.dataset.mapName)
    ));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Entity mappings not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

async function openEntityMappingDetail(mapId, mapName) {
  const mid = 'map-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${escapeHtml(mapName)} — Mapping Details</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="map-body">
          <div class="empty-state-row">Loading mapping details…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  try {
    const detail = await api.entityToEntityMappings.get(mapId);
    const mappings = detail?.mappings || detail?.entityMappings || (Array.isArray(detail) ? detail : []);
    const body = m.querySelector('#map-body');

    body.innerHTML = `
      <div class="msg-banner b-info mb-3">
        <i class="fa-solid fa-circle-info"></i>
        ${escapeHtml(detail.description || 'This mapping restricts which entities can interact with each other.')}
      </div>

      <h4>Current Mappings (${num(mappings.length)})</h4>
      ${mappings.length ? `
        <table class="table">
          <thead><tr>
            <th>From</th><th>To</th><th>Valid From</th><th>Valid Until</th>
          </tr></thead>
          <tbody>${mappings.map(mp => `
            <tr>
              <td>${escapeHtml(mp.fromEntityName || String(mp.fromId || '—'))}</td>
              <td>${escapeHtml(mp.toEntityName || String(mp.toId || '—'))}</td>
              <td>${fmtDate(mp.startDate) || '—'}</td>
              <td>${fmtDate(mp.endDate) || 'Indefinite'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No mappings defined yet</div>'}

      <div class="msg-banner b-warning mt-3">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Adding or editing individual mappings is performed via the underlying admin tools.
        This view is read-only.
      </div>`;
  } catch (e) {
    m.querySelector('#map-body').innerHTML =
      `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 10 — EXTERNAL EVENTS (audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadExternalEvents(c) {
  const el = c.querySelector('#sy-10');
  el.innerHTML = '<div class="empty-state-row">Loading external event configuration…</div>';
  try {
    const [eventsRes, configRes] = await Promise.allSettled([
      api.externalEvents.list({ limit: 50 }),
      api.externalEvents.configurations()
    ]);

    const recentEvents = eventsRes.status === 'fulfilled'
      ? (Array.isArray(eventsRes.value) ? eventsRes.value : (eventsRes.value?.pageItems || []))
      : [];
    const configList = configRes.status === 'fulfilled'
      ? (Array.isArray(configRes.value) ? configRes.value : (configRes.value?.externalEventConfiguration || []))
      : [];

    const canEdit = can('UPDATE_EXTERNALEVENT_CONFIGURATION');

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
      ` : '<div class="empty-state-row">No event configurations available</div>'}

      <h3 class="mt-4">Recent Events (last 50)</h3>
      ${recentEvents.length ? `
        <table class="table table-compact">
          <thead><tr>
            <th>ID</th><th>Type</th><th>Status</th><th>Created</th>
          </tr></thead>
          <tbody>${recentEvents.slice(0, 50).map(e => `
            <tr>
              <td>#${e.id || '—'}</td>
              <td>${escapeHtml(e.type || e.eventType || '—')}</td>
              <td>${escapeHtml(e.status || e.eventStatus || '—')}</td>
              <td>${fmtDate(e.createdAt || e.creationDate) || '—'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No recent events recorded</div>'}`;

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
        toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message);
      }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">External events not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 11 — MAKER-CHECKER TASK CONFIGURATION (audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadMakerCheckerConfig(c) {
  const el = c.querySelector('#sy-11');
  el.innerHTML = '<div class="empty-state-row">Loading maker-checker tasks…</div>';
  try {
    const res = await api.makerCheckerTasks.list();
    const list = Array.isArray(res) ? res : (res?.permissions || []);

    const canEdit = can('UPDATE_PERMISSION') || can('UPDATE_MAKERCHECKERPERMISSIONS');

    // Group by entity prefix (CLIENT, LOAN, SAVINGS, etc.)
    const groups = {};
    list.forEach(p => {
      const code = p.code || p.permissionCode || '';
      const group = extractMCEntityGroup(code);
      (groups[group] ||= []).push(p);
    });
    const groupKeys = Object.keys(groups).sort();
    const enabledCount = list.filter(p => p.selected || p.makerChecker).length;

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Maker-Checker Task Configuration</h3>
        <span class="text-muted">${num(enabledCount)} of ${num(list.length)} tasks require approval</span>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Enable maker-checker on individual actions so they require approval before taking effect.
        Approvers see pending tasks in the <b>Checker Inbox</b> module.
      </div>

      ${list.length ? `
        <div class="filter-bar mb-2">
          <input id="mc-search" class="form-control" placeholder="Search permissions…" autocomplete="off"/>
          ${canEdit ? `<button class="btn-success btn-sm" id="mc-enable-all">Require Approval — All</button>` : ''}
          ${canEdit ? `<button class="btn-secondary btn-sm" id="mc-disable-all">Auto-approve All</button>` : ''}
        </div>

        <div id="mc-groups">
          ${groupKeys.map(g => {
            const perms = groups[g].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
            const enabled = perms.filter(p => p.selected || p.makerChecker).length;
            return `
              <div class="mc-group mb-3" data-group="${escapeHtml(g)}">
                <div class="section-header" style="cursor:pointer" data-toggle-mc-group>
                  <h4><i class="fa-solid fa-chevron-down"></i> ${escapeHtml(g)}</h4>
                  <span class="text-muted">${enabled}/${perms.length}</span>
                </div>
                <div class="mc-perm-list" style="padding:4px 12px">
                  ${perms.map(p => {
                    const code = p.code || p.permissionCode || '';
                    const isChecked = p.selected || p.makerChecker;
                    return `
                      <label class="checkbox-row mc-perm-row" style="display:flex; align-items:center; padding:3px 0">
                        ${canEdit
                          ? `<input type="checkbox" class="mc-chk" data-code="${escapeHtml(code)}" ${isChecked ? 'checked' : ''}/>`
                          : `<span style="width:18px"></span>`}
                        <code style="margin-left:8px">${escapeHtml(code)}</code>
                        ${p.actionName && p.entityName ? `<span class="text-muted small" style="margin-left:auto">${escapeHtml(p.actionName)} ${escapeHtml(p.entityName)}</span>` : ''}
                      </label>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>

        ${canEdit ? `<div class="mt-3"><button class="btn-primary" id="mc-save">Save Configuration</button></div>` : ''}
      ` : '<div class="empty-state-row">No maker-checker permissions available</div>'}`;

    // Expand/collapse group panels
    el.querySelectorAll('[data-toggle-mc-group]').forEach(h => h.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const panel = h.parentElement.querySelector('.mc-perm-list');
      const icon = h.querySelector('i');
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? '' : 'none';
      icon.className = hidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
    }));

    // Filter
    el.querySelector('#mc-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.mc-group').forEach(g => {
        let groupHasMatch = false;
        g.querySelectorAll('.mc-perm-row').forEach(row => {
          const match = !q || row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          if (match) groupHasMatch = true;
        });
        g.style.display = groupHasMatch ? '' : 'none';
      });
    });

    el.querySelector('#mc-enable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.mc-chk').forEach(cb => cb.checked = true);
    });

    el.querySelector('#mc-disable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.mc-chk').forEach(cb => cb.checked = false);
    });

    el.querySelector('#mc-save')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Save maker-checker configuration?',
        message: 'Affected actions will start (or stop) requiring approval immediately.',
        confirmText: 'Save'
      })) return;

      const permissions = {};
      el.querySelectorAll('.mc-chk').forEach(cb => {
        permissions[cb.dataset.code] = cb.checked;
      });

      try {
        await api.makerCheckerTasks.update({ permissions });
        toast('success', 'Maker-checker configuration saved', '');
        loadMakerCheckerConfig(c);
      } catch (e) {
        toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message);
      }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Maker-checker configuration not available on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

function extractMCEntityGroup(code) {
  if (!code) return 'Other';
  const prefixes = ['CREATE_', 'READ_', 'UPDATE_', 'DELETE_', 'APPROVE_', 'REJECT_',
                    'ACTIVATE_', 'CLOSE_', 'DISBURSE_', 'WITHDRAW_', 'EXECUTE_',
                    'PAY_', 'WAIVE_', 'ENABLE_', 'DISABLE_', 'IMPORT_', 'EXPORT_'];
  let entity = code;
  for (const p of prefixes) {
    if (code.startsWith(p)) { entity = code.substring(p.length); break; }
  }
  entity = entity.replace(/_CHECKER$|_MAKER$/, '');
  return entity || 'Other';
}
// ════════════════════════════════════════════════════════════
// TAB 12 — SURVEYS (audit gap closed — full CRUD)
// ════════════════════════════════════════════════════════════
async function loadSurveys(c) {
  const el = c.querySelector('#sy-12');
  el.innerHTML = '<div class="empty-state-row">Loading surveys…</div>';
  try {
    const res = await api.surveysAdmin.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} survey${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_SURVEY') ? `<button class="btn-primary" id="btn-new-survey"><i class="fa-solid fa-plus"></i> New Survey</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Surveys capture customer feedback (NPS, satisfaction, etc.) at touchpoints like loan disbursement or onboarding.
        Responses are stored against client/loan records and exportable via Reports.
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Country</th><th>Description</th><th>Questions</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(s => {
            const isActive = s.status?.value === 'Active' || s.active !== false;
            return `
              <tr>
                <td><b>${escapeHtml(s.name || s.key || '—')}</b></td>
                <td>${escapeHtml(s.countryCode || '—')}</td>
                <td class="text-muted small">${escapeHtml(s.description || '—')}</td>
                <td>${num((s.questionDatas || s.questions || []).length)}</td>
                <td>${isActive ? sb('Active') : sb('Inactive')}</td>
                <td class="text-right">
                  ${can('UPDATE_SURVEY') ? `<button class="btn-mini" data-edit-survey="${s.id}">Edit</button>` : ''}
                  ${isActive && can('DEACTIVATE_SURVEY')
                    ? `<button class="btn-mini btn-warning" data-deactivate-survey="${s.id}">Deactivate</button>`
                    : ''}
                  ${!isActive && can('ACTIVATE_SURVEY')
                    ? `<button class="btn-mini btn-success" data-activate-survey="${s.id}">Activate</button>`
                    : ''}
                  ${can('DELETE_SURVEY') ? `<button class="btn-mini btn-danger" data-del-survey="${s.id}">Delete</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-list"></i>
          <h3>No surveys defined</h3>
          ${can('CREATE_SURVEY') ? '<div class="text-muted mt-2">Create a survey to start collecting customer feedback.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-new-survey')?.addEventListener('click', () =>
      openSurveyFormModal(null, () => loadSurveys(c))
    );

    el.querySelectorAll('[data-edit-survey]').forEach(b => b.addEventListener('click', () =>
      openSurveyFormModal(b.dataset.editSurvey, () => loadSurveys(c))
    ));

    el.querySelectorAll('[data-activate-survey]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.surveysAdmin.activate(b.dataset.activateSurvey);
        toast('success', 'Survey activated', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-deactivate-survey]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Deactivate survey?', confirmText: 'Deactivate' })) return;
      try {
        await api.surveysAdmin.deactivate(b.dataset.deactivateSurvey);
        toast('success', 'Survey deactivated', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Deactivation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-survey]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete survey?',
        message: 'This permanently removes the survey and its question definitions. Responses are preserved.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.surveysAdmin.delete(b.dataset.delSurvey);
        toast('success', 'Survey deleted', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Surveys not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
async function openSurveyFormModal(surveyId, onSuccess) {
  const isEdit = !!surveyId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.surveysAdmin.get(surveyId); }
    catch (e) { toast('error', 'Could not load survey', e.detail?.defaultUserMessage || e.message); return; }
  }

  // Question builder rows — flexible structure matching Fineract survey schema
  const existingQuestions = existing.questionDatas || existing.questions || [];
  const initialQuestionRows = existingQuestions.length
    ? existingQuestions.map((q, i) => questionRow(i, q)).join('')
    : questionRow(0);

  const mid = 'survey-form-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-xl">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Survey</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Survey Key / Name * <input id="sv-key" class="form-control" value="${escapeHtml(existing.key || existing.name || '')}" required ${isEdit ? 'disabled' : ''}/></label>
            <label>Country Code <input id="sv-country" class="form-control" maxlength="2" value="${escapeHtml(existing.countryCode || '')}" placeholder="e.g. US, IN"/></label>
            <label class="full">Description
              <textarea id="sv-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea>
            </label>
            <label>Valid From <input type="date" id="sv-valid-from" class="form-control" value="${existing.validFrom || ''}"/></label>
            <label>Valid To <input type="date" id="sv-valid-to" class="form-control" value="${existing.validTo || ''}"/></label>
          </div>

          <h4 class="mt-3">Questions</h4>
          <div class="text-muted small mb-2">
            <i class="fa-solid fa-circle-info"></i>
            Each question has a text and a sequence number. Survey responses are stored against client/loan records.
          </div>
          <table class="table">
            <thead><tr>
              <th>Sequence</th>
              <th>Question Text</th>
              <th>Description</th>
              <th></th>
            </tr></thead>
            <tbody id="sv-questions">${initialQuestionRows}</tbody>
          </table>
          <button type="button" class="btn-secondary btn-sm" id="sv-add-q"><i class="fa-solid fa-plus"></i> Add Question</button>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="sv-save">${isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  let qIdx = existingQuestions.length || 1;
  const wireRowRemove = () => {
    m.querySelectorAll('.sv-q-remove').forEach(btn => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          const rows = m.querySelectorAll('.sv-q-row');
          if (rows.length > 1) btn.closest('.sv-q-row').remove();
          else toast('warn', 'At least one question required', '');
        });
      }
    });
  };
  wireRowRemove();

  m.querySelector('#sv-add-q').addEventListener('click', () => {
    m.querySelector('#sv-questions').insertAdjacentHTML('beforeend', questionRow(qIdx++));
    wireRowRemove();
  });

  m.querySelector('#sv-save').addEventListener('click', async () => {
    const key = m.querySelector('#sv-key').value.trim();
    const countryCode = m.querySelector('#sv-country').value.trim().toUpperCase();
    const description = m.querySelector('#sv-desc').value.trim();
    const validFrom = m.querySelector('#sv-valid-from').value;
    const validTo = m.querySelector('#sv-valid-to').value;

    if (!key) { toast('warn', 'Enter a survey name', ''); return; }

    const questions = [];
    m.querySelectorAll('.sv-q-row').forEach(row => {
      const seq = parseInt(row.querySelector('.sv-q-seq').value) || 0;
      const text = row.querySelector('.sv-q-text').value.trim();
      const qDesc = row.querySelector('.sv-q-desc').value.trim();
      if (text) {
        const q = {};
        q.text = text;
        q.sequenceNo = seq;
        if (qDesc) q.description = qDesc;
        questions.push(q);
      }
    });

    if (!questions.length) { toast('warn', 'Add at least one question', ''); return; }

    const payload = {};
    if (!isEdit) payload.key = key;
    if (countryCode) payload.countryCode = countryCode;
    if (description) payload.description = description;
    if (validFrom) {
      payload.validFrom = validFrom;
      payload.dateFormat = DATE_FORMAT;
      payload.locale = LOCALE;
    }
    if (validTo) payload.validTo = validTo;
    payload.questionDatas = questions;

    try {
      if (isEdit) await api.surveysAdmin.update(surveyId, payload);
      else        await api.surveysAdmin.create(payload);
      m.remove();
      toast('success', isEdit ? 'Survey updated' : 'Survey created', key);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

function questionRow(idx, existing = {}) {
  return `
    <tr class="sv-q-row" data-idx="${idx}">
      <td><input type="number" class="form-control sv-q-seq" value="${existing.sequenceNo ?? idx}" style="width:80px"/></td>
      <td><input class="form-control sv-q-text" placeholder="Question text" value="${escapeHtml(existing.text || '')}"/></td>
      <td><input class="form-control sv-q-desc" placeholder="Optional description" value="${escapeHtml(existing.description || '')}"/></td>
      <td><button type="button" class="btn-mini btn-danger sv-q-remove">&times;</button></td>
    </tr>`;
}
// ════════════════════════════════════════════════════════════
// TAB 13 — MIGRATION LINKS (α cleanup: where modules moved to)
// ════════════════════════════════════════════════════════════
async function loadMigrationLinks(c) {
  const el = c.querySelector('#sy-13');

  const migrations = [
    { icon: 'fa-comment-sms',   title: 'SMS Campaigns', subtitle: 'Moved to Organization → SMS Campaigns tab', target: 'organization' },
    { icon: 'fa-table',         title: 'Data Tables',   subtitle: 'Now a standalone module at /datatables',     target: 'datatables' },
    { icon: 'fa-user-shield',   title: 'Users & Roles', subtitle: 'Now a standalone module at /users',          target: 'users' },
    { icon: 'fa-file-lines',    title: 'Templates',     subtitle: 'Now a standalone module at /templates',      target: 'templates' },
    { icon: 'fa-shield-halved', title: 'Collateral',    subtitle: 'Moved to a standalone module at /collaterals', target: 'collaterals' },
    { icon: 'fa-mobile-screen', title: 'Self-Service',  subtitle: 'Moved to a standalone module at /self-service', target: 'self-service' }
  ];

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>Migrated Modules</h3>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      The following modules have moved out of System into their own dedicated pages for clarity and feature parity with Mifos.
    </div>

    <div class="kpi-grid">
      ${migrations.map(m => `
        <div class="kpi-card" style="text-align:left; padding:16px">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px">
            <i class="fa-solid ${m.icon}" style="font-size:24px; color:var(--accent)"></i>
            <div>
              <div class="kpi-label">${escapeHtml(m.title)}</div>
              <div class="text-muted small">${escapeHtml(m.subtitle)}</div>
            </div>
          </div>
          <button class="btn-primary btn-sm" data-go-mod="${m.target}">
            <i class="fa-solid fa-arrow-right"></i> Go to ${escapeHtml(m.title)}
          </button>
        </div>`).join('')}
    </div>

    <div class="msg-banner b-info mt-3">
      <i class="fa-solid fa-circle-info"></i>
      <b>Architectural Note:</b> Modules are now organized by primary user-task rather than by API surface.
      This matches Mifos Web App conventions and makes permission gating more granular.
    </div>`;

  el.querySelectorAll('[data-go-mod]').forEach(b => b.addEventListener('click', () =>
    import('../router.js').then(r => r.navigate(b.dataset.goMod))
  ));
}
// ════════════════════════════════════════════════════════════
// TAB 14 — SYSTEM INFO (audit gap closed — real version info)
// ════════════════════════════════════════════════════════════
async function loadSystemInfo(c) {
  const el = c.querySelector('#sy-14');
  el.innerHTML = '<div class="empty-state-row">Loading system information…</div>';

  const auth = store.get('auth') || {};

  // Try to fetch real version/tenant info from Fineract endpoints
  let serverVersion = '—';
  let buildInfo = '—';
  let cacheInfo = '—';

  try {
    // Some Fineract versions expose /configurations or /info — try gracefully
    const cfg = await api.configurations.list().catch(() => null);
    if (cfg) {
      const versionCfg = (cfg.globalConfiguration || []).find(c =>
        /version|build/i.test(c.name)
      );
      if (versionCfg) serverVersion = versionCfg.value || versionCfg.stringValue || '—';
    }
  } catch {}

  try {
    const cacheRes = await api.configurations.cacheTypes?.();
    if (cacheRes) {
      const cacheArr = Array.isArray(cacheRes) ? cacheRes : (cacheRes?.cacheTypes || []);
      if (cacheArr.length) {
        cacheInfo = cacheArr.map(c => escapeHtml(c.value || c.name || c)).join(', ');
      }
    }
  } catch {}

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>System Information</h3>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      Connection details, version metadata, and infrastructure information.
    </div>

    <div class="grid-2">
      <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4><i class="fa-solid fa-plug"></i> Connection</h4>
        <dl class="dl-grid">
          <dt>Server URL</dt><dd><code>${escapeHtml(auth.serverUrl || '—')}</code></dd>
          <dt>Tenant</dt><dd><b>${escapeHtml(auth.tenantId || 'default')}</b></dd>
          <dt>User</dt><dd>${escapeHtml(auth.username || '—')}</dd>
          <dt>Session Status</dt><dd>${auth.authToken ? sb('Connected') : sb('Offline')}</dd>
          <dt>API Base</dt><dd><code>/fineract-provider/api/v1</code></dd>
        </dl>
      </div>

      <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4><i class="fa-solid fa-code-branch"></i> Build &amp; Version</h4>
        <dl class="dl-grid">
          <dt>UI Application</dt><dd><b>FinCraft</b></dd>
          <dt>UI Version</dt><dd>1.0.0</dd>
          <dt>Fineract Server</dt><dd>${escapeHtml(serverVersion)}</dd>
          <dt>Cache Strategy</dt><dd>${cacheInfo}</dd>
          <dt>Build Date</dt><dd>${fmtDate(new Date().toISOString()) || '—'}</dd>
        </dl>
      </div>
    </div>

    <h3 class="mt-3">Available Module Permissions</h3>
    <div id="sys-perms"><div class="empty-state-row">Loading permission summary…</div></div>

    <h3 class="mt-3">Quick Diagnostics</h3>
    <div class="kpi-grid">
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-heart-pulse"></i> API Health</div>
        <div class="kpi-value" id="sys-health" style="font-size:14px">Testing…</div>
      </div>
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-gauge"></i> Last Response Time</div>
        <div class="kpi-value" id="sys-rt" style="font-size:14px">—</div>
      </div>
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-clock"></i> Server Date</div>
        <div class="kpi-value" id="sys-time" style="font-size:14px">—</div>
      </div>
    </div>`;

  // Permission summary
  const permEl = el.querySelector('#sys-perms');
  try {
    const perms = store.get('perms') || [];
    const total = perms.length;
    const byEntity = {};
    perms.forEach(p => {
      const entity = extractMCEntityGroup(p);
      byEntity[entity] = (byEntity[entity] || 0) + 1;
    });
    const topEntities = Object.entries(byEntity).sort((a, b) => b[1] - a[1]).slice(0, 8);

    permEl.innerHTML = `
      <div class="text-muted small mb-2">${num(total)} permissions granted to the current user across ${num(Object.keys(byEntity).length)} entity groups.</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px">
        ${topEntities.map(([entity, count]) => `
          <span class="badge">${escapeHtml(entity)} (${count})</span>
        `).join('')}
        ${Object.keys(byEntity).length > 8 ? `<span class="text-muted small">… and ${Object.keys(byEntity).length - 8} more</span>` : ''}
      </div>`;
  } catch {
    permEl.innerHTML = '<div class="empty-state-row text-muted">Permission summary unavailable</div>';
  }

  // API health check
  const healthEl = el.querySelector('#sys-health');
  const rtEl = el.querySelector('#sys-rt');
  const timeEl = el.querySelector('#sys-time');

  const t0 = performance.now();
  api.offices.list().then(() => {
    const elapsed = Math.round(performance.now() - t0);
    healthEl.innerHTML = '<span class="text-success">●</span> Healthy';
    rtEl.textContent = elapsed + ' ms';
    timeEl.textContent = new Date().toISOString().substring(0, 19).replace('T', ' ');
  }).catch(e => {
    healthEl.innerHTML = '<span class="text-error">●</span> ' + escapeHtml(e.message || 'Unknown error');
    rtEl.textContent = '—';
    timeEl.textContent = '—';
  });
}