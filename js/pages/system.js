/* FinCraft · system.js — Live API */
import { api } from '../api.js';
import { escapeHtml, fmtDate } from '../utils.js';
import { toast, showEntityDetail } from '../ui.js';
import { store } from '../store.js';

const TABS = ['Configurations','Audit Trails','Codes & Values','Roles & Permissions','Manage Jobs','External Services','COB','Hooks','SMS Campaigns','System Info'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">System</h1><div class="page-subtitle">Platform configuration & maintenance</div></div>
    </div>
    <div class="card">
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="sy-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div id="sy-${i}" class="tab-panel ${i === 0 ? 'active' : ''}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`).join('')}
    </div>
  </div>`;

  // Configurations
  try {
    const cf = await api.configurations.list();
    const list = Array.isArray(cf?.globalConfiguration) ? cf.globalConfiguration : (Array.isArray(cf) ? cf : []);
    c.querySelector('#sy-0').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Configuration</th><th>Value</th><th>Enabled</th></tr></thead>
          <tbody>${list.map(cfg => `<tr>
            <td>${escapeHtml(cfg.name)}</td>
            <td class="mono">${escapeHtml(String(cfg.value || ''))}</td>
            <td><label class="switch"><input type="checkbox" ${cfg.enabled ? 'checked' : ''} data-cfg="${cfg.id}"><span class="slider"></span></label></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-gears"></i><div>No configurations found</div></div>';

    c.querySelectorAll('[data-cfg]').forEach(sw => sw.addEventListener('change', async () => {
      try { await api.configurations.update(sw.dataset.cfg, { enabled: sw.checked }); toast('success', 'Config updated', sw.dataset.cfg + (sw.checked ? ' enabled' : ' disabled')); }
      catch (e) { sw.checked = !sw.checked; toast('error', 'Update failed', e.message); }
    }));
  } catch (e) { c.querySelector('#sy-0').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Audit Trails
  try {
    const res = await api.audits.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#sy-1').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Action</th><th>Entity</th><th>Resource</th><th>Maker</th><th>Made on</th><th>Status</th></tr></thead>
          <tbody>${list.map(a => `<tr>
            <td><b>${escapeHtml(a.actionName || '—')}</b></td>
            <td>${escapeHtml(a.entityName || '—')}</td>
            <td class="mono">${escapeHtml(a.resourceId ? String(a.resourceId) : '—')}</td>
            <td>${escapeHtml(a.maker || '—')}</td>
            <td>${fmtDate(a.madeOnDate)}</td>
            <td><span class="badge ${a.processingResult?.value === 'Processed' ? 'b-success' : 'b-warn'}">${escapeHtml(a.processingResult?.value || '—')}</span></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><div>No audit trail records</div></div>';
  } catch (e) { c.querySelector('#sy-1').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Codes & Values
  try {
    const codes = await api.codes.list();
    const list = Array.isArray(codes) ? codes : [];
    c.querySelector('#sy-2').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Code Name</th><th>System Defined</th><th></th></tr></thead>
          <tbody>${list.map(cd => `<tr>
            <td>${escapeHtml(cd.name)}</td>
            <td>${cd.systemDefined ? '<span class="badge">System</span>' : '<span class="badge b-teal">Custom</span>'}</td>
            <td><button class="btn-ghost btn-sm" data-code-view="${cd.id}" data-code-name="${escapeHtml(cd.name)}" title="View values"><i class="fa-solid fa-eye"></i></button></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-list"></i><div>No codes defined</div></div>';
    c.querySelectorAll('[data-code-view]').forEach(b => b.addEventListener('click', () => viewCodeValues(b.dataset.codeView, b.dataset.codeName)));
  } catch (e) { c.querySelector('#sy-2').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Roles
  try {
    const roles = await api.roles.list();
    const list = Array.isArray(roles) ? roles : [];
    c.querySelector('#sy-3').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Role</th><th>Description</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map(r => `<tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.description || '—')}</td>
            <td>${r.disabled ? '<span class="badge b-danger">Disabled</span>' : '<span class="badge b-success">Active</span>'}</td>
            <td>
              <button class="btn-ghost btn-sm" data-view-perms="${r.id}" data-role-name="${escapeHtml(r.name)}" title="View permissions">
                <i class="fa-solid fa-key"></i>
              </button>
            </td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-user-shield"></i><div>No roles defined</div></div>';
    c.querySelectorAll('[data-view-perms]').forEach(b => b.addEventListener('click', () => viewRolePermissions(b.dataset.viewPerms, b.dataset.roleName)));
  } catch (e) { c.querySelector('#sy-3').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Jobs
  try {
    const jobs = await api.jobs.list();
    const list = Array.isArray(jobs) ? jobs : [];
    c.querySelector('#sy-4').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Job</th><th>Cron</th><th>Running?</th><th></th></tr></thead>
          <tbody>${list.map(j => `<tr>
            <td>${escapeHtml(j.displayName || j.name || '—')}</td>
            <td class="mono">${escapeHtml(j.cronExpression || '—')}</td>
            <td>${j.currentlyRunning ? '<span class="badge b-warn">Running</span>' : '<span class="badge">Idle</span>'}</td>
            <td><button class="btn-sm btn-primary" data-run-job="${j.jobId || j.name}"><i class="fa-solid fa-play"></i> Run</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-calendar-check"></i><div>No scheduled jobs</div></div>';

    c.querySelectorAll('[data-run-job]').forEach(b => b.addEventListener('click', async () => {
      try { await api.jobs.runJob(b.dataset.runJob); toast('success', 'Job triggered', b.dataset.runJob + ' scheduled'); }
      catch (e) { toast('error', 'Job failed', e.message); }
    }));
  } catch (e) { c.querySelector('#sy-4').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // External Services — real config, was previously 4 purely decorative cards
  c.querySelector('#sy-5').innerHTML = `
    <div class="grid-2">
      ${['SMS','SMTP Email','S3 Storage','Notifications'].map((svc, i) => `
        <div class="card" style="margin:0">
          <h3 class="card-title mb-3">${svc}</h3>
          <button class="btn-ghost btn-sm" data-svc-view="${['sms','smtpEmail','s3','notification'][i]}" data-svc-label="${svc}"><i class="fa-solid fa-pen"></i> Configure ${svc}</button>
        </div>`).join('')}
    </div>`;
  c.querySelectorAll('[data-svc-view]').forEach(b => b.addEventListener('click', () => viewServiceConfig(b.dataset.svcView, b.dataset.svcLabel)));

  // COB (Close of Business)
  try {
    const [dateRes, cfgRes] = await Promise.allSettled([
      api.cob.businessDate.get(),
      api.cob.configurations()
    ]);
    const date = dateRes.status === 'fulfilled' ? dateRes.value : null;
    const cfgs = cfgRes.status === 'fulfilled' ? cfgRes.value : null;
    const cfgList = Array.isArray(cfgs) ? cfgs : (cfgs?.businessSteps || []);
    c.querySelector('#sy-6').innerHTML = `
      <div style="margin-bottom:20px">
        <h4 class="mb-2">Business Date</h4>
        ${date
          ? `<div class="flex gap-3 items-center flex-wrap">
               <span class="mono" style="font-size:18px">${escapeHtml(String(date.date || date.businessDate || JSON.stringify(date)))}</span>
               <span class="badge">${escapeHtml(date.type || '')}</span>
             </div>`
          : '<div class="text-muted">Business date not available (may require COB setup)</div>'}
      </div>
      <div class="flex gap-2 mb-4 flex-wrap">
        <button class="btn-primary btn-sm" id="cob-catchup"><i class="fa-solid fa-forward-fast"></i> Run COB Catch-Up</button>
      </div>
      ${cfgList.length
        ? `<h4 class="mb-2">Business Step Configuration</h4>
           <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Step Name</th><th>Job Name</th><th>Order</th></tr></thead>
             <tbody>${cfgList.map(s => `<tr>
               <td>${escapeHtml(s.stepName || s.name || '—')}</td>
               <td>${escapeHtml(s.jobName || '—')}</td>
               <td>${escapeHtml(String(s.order ?? '—'))}</td>
             </tr>`).join('')}</tbody></table></div>`
        : '<div class="text-muted">No business step configuration found</div>'}`;
    c.querySelector('#cob-catchup')?.addEventListener('click', async () => {
      if (!confirm('Trigger COB catch-up processing? This runs all overdue COB steps.')) return;
      try {
        await api.cob.catchUp();
        toast('success', 'COB catch-up triggered', 'Processing will run asynchronously');
      } catch (e) { toast('error', 'COB catch-up failed', e.message); }
    });
  } catch (e) {
    c.querySelector('#sy-6').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Hooks (Webhooks)
  try {
    const hooks = await api.hooks.list();
    const list = Array.isArray(hooks) ? hooks : [];
    c.querySelector('#sy-7').innerHTML = list.length
      ? `<div class="flex justify-between mb-4"><span class="text-muted">${list.length} webhooks</span></div>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th>Template</th><th>Active</th><th>Events</th></tr></thead>
            <tbody>${list.map(h => `<tr>
              <td>${escapeHtml(h.name || '—')}</td>
              <td>${escapeHtml(h.templateName || h.templateId || '—')}</td>
              <td>${h.isActive ? '<span class="badge b-success">Active</span>' : '<span class="badge">Inactive</span>'}</td>
              <td class="text-muted">${(h.events || []).map(e => escapeHtml(e.actionName + ':' + e.entityName)).join(', ') || '—'}</td>
            </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-webhook"></i><div>No webhooks configured</div></div>';
  } catch (e) { c.querySelector('#sy-7').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // SMS Campaigns
  try {
    const sms = await api.smsCampaigns.list();
    const list = Array.isArray(sms) ? sms : [];
    c.querySelector('#sy-8').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Campaign Name</th><th>Type</th><th>Status</th><th>Next Run</th></tr></thead>
          <tbody>${list.map(s => `<tr>
            <td>${escapeHtml(s.campaignName || s.name || '—')}</td>
            <td>${escapeHtml(s.campaignType?.value || '—')}</td>
            <td>${escapeHtml(s.campaignStatus?.value || s.status || '—')}</td>
            <td>${fmtDate(s.nextTriggerDate) || '—'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-sms"></i><div>No SMS campaigns</div></div>';
  } catch (e) { c.querySelector('#sy-8').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // System Info
  const a = store.get('auth') || {};
  c.querySelector('#sy-9').innerHTML = `
    <div class="card" style="margin:0">
      <h3 class="card-title mb-4">System Information</h3>
      <div class="grid-2">
        <div><div class="text-muted">Server URL</div><div class="mono">${escapeHtml(a.serverUrl || '—')}</div></div>
        <div><div class="text-muted">Tenant</div><div class="mono">${escapeHtml(a.tenantId || 'default')}</div></div>
        <div><div class="text-muted">User</div><div class="mono">${escapeHtml(a.username || '—')}</div></div>
        <div><div class="text-muted">Connection</div><div>${a.authToken ? '<span class="badge b-success">Live</span>' : '<span class="badge b-warn">Offline</span>'}</div></div>
        <div><div class="text-muted">UI Version</div><div class="mono">FinCraft 1.0.0</div></div>
        <div><div class="text-muted">API Base</div><div class="mono">/fineract-provider/api/v1</div></div>
      </div>
    </div>`;
}

// Fineract: GET /codes/{id}/codevalues — was never called even though the method existed
function viewCodeValues(codeId, codeName) {
  showEntityDetail({
    title: `${codeName || 'Code'} — Values`,
    fetchFn: () => api.codes.values(codeId),
    renderBody: (values) => {
      const list = Array.isArray(values) ? values : [];
      return list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Value</th><th>Description</th><th>Active</th><th>Position</th></tr></thead>
            <tbody>${list.map(v => `<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.description || '—')}</td><td>${v.active === false ? '<span class="badge">No</span>' : '<span class="badge b-success">Yes</span>'}</td><td>${v.position ?? '—'}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-list"></i><div>No values defined for this code</div></div>';
    }
  });
}

// Fineract: GET /roles/{id}/permissions — lists all permissions and which are enabled for this role
function viewRolePermissions(roleId, roleName) {
  showEntityDetail({
    title: `${roleName || 'Role'} — Permissions`,
    fetchFn: () => api.roles.permissions(roleId),
    renderBody: (data) => {
      const perms = Array.isArray(data?.permissionUsageData) ? data.permissionUsageData : (Array.isArray(data) ? data : []);
      if (!perms.length) return '<div class="empty-state"><i class="fa-solid fa-key"></i><div>No permissions data</div></div>';
      // Group by grouping field
      const groups = {};
      perms.forEach(p => {
        const g = p.grouping || 'Other';
        if (!groups[g]) groups[g] = [];
        groups[g].push(p);
      });
      return Object.entries(groups).map(([grp, items]) => `
        <div style="margin-bottom:16px">
          <div style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">${escapeHtml(grp)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${items.map(p => `<span class="badge ${p.selected ? 'b-success' : ''}" title="${escapeHtml(p.code || '')}">${escapeHtml(p.actionName || p.code || '—')} · ${escapeHtml(p.entityName || '')}</span>`).join('')}
          </div>
        </div>`).join('');
    }
  });
}

// Fineract: GET /externalservice/{SMS|SMTP|S3|NOTIFICATION} — existed in api.js, never called.
// Shown read-only here since the exact field schema differs per service and per-deployment;
// editing should go through Fineract's own admin tools until a verified edit form is built.
function viewServiceConfig(group, label) {
  showEntityDetail({
    title: `${label} Configuration`,
    fetchFn: () => api.externalServices[group].list(),
    renderBody: (cfg) => {
      const props = cfg?.properties || (Array.isArray(cfg) ? cfg : null);
      if (Array.isArray(props) && props.length) {
        return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property</th><th>Value</th></tr></thead>
          <tbody>${props.map(p => `<tr><td class="mono">${escapeHtml(p.name || p.key || '—')}</td><td class="mono">${escapeHtml(/pass|secret|key/i.test(p.name || '') ? '••••••••' : String(p.value ?? '—'))}</td></tr>`).join('')}</tbody></table></div>
          <div class="text-muted mt-3">Read-only preview. Edit via Fineract's own admin tools for now.</div>`;
      }
      if (cfg && typeof cfg === 'object') {
        const entries = Object.entries(cfg).filter(([k]) => k !== 'properties');
        return entries.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>${entries.map(([k, v]) => `<tr><td class="mono">${escapeHtml(k)}</td><td class="mono">${escapeHtml(/pass|secret|key/i.test(k) ? '••••••••' : String(v ?? '—'))}</td></tr>`).join('')}</tbody></table></div>
              <div class="text-muted mt-3">Read-only preview. Edit via Fineract's own admin tools for now.</div>`
          : '<div class="empty-state"><i class="fa-solid fa-gear"></i><div>No configuration found</div></div>';
      }
      return '<div class="empty-state"><i class="fa-solid fa-gear"></i><div>No configuration found</div></div>';
    }
  });
}
