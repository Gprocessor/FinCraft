import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · system.js — Full system (Phase 6) */
import { api } from '../api.js';
import { escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';
import { store } from '../store.js';

const TABS = ['Configurations','Audit Trails','Codes & Values','Roles & Permissions','Manage Jobs','External Services','COB','Hooks','SMS Campaigns','Data Tables','System Info'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">System</h1><div class="page-subtitle">Platform configuration &amp; maintenance</div></div>
    </div>
    <div class="card">
      <div class="tabs" style="flex-wrap:wrap">${TABS.map((t,i)=>
        `<button class="tab${i===0?' active':''}" data-tab="sy-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((_,i)=>
        `<div id="sy-${i}" class="tab-panel${i===0?' active':''}">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
        </div>`).join('')}
    </div>
  </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
  }));

  loadConfigurations(c);
  loadAuditTrails(c);
  loadCodes(c);
  loadRoles(c);
  loadJobs(c);
  loadExternalServices(c);
  loadCOB(c);
  loadHooks(c);
  loadSMSCampaigns(c);
  loadDataTables(c);
  loadSystemInfo(c);
}

// ════════════════════════════════════════════════════════════
// TAB 0 — CONFIGURATIONS
// ════════════════════════════════════════════════════════════
async function loadConfigurations(c) {
  const el = c.querySelector('#sy-0');
  try {
    const cf   = await api.configurations.list();
    const list = Array.isArray(cf?.globalConfiguration) ? cf.globalConfiguration : (Array.isArray(cf) ? cf : []);
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Configuration</th><th>Value</th><th>Enabled</th></tr></thead>
          <tbody>${list.map(cfg=>`<tr>
            <td>${escapeHtml(cfg.name)}</td>
            <td class="mono">${escapeHtml(String(cfg.value??''))}</td>
            <td><label class="switch"><input type="checkbox" ${cfg.enabled?'checked':''} data-cfg="${cfg.id}"><span class="slider"></span></label></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-gears"></i><div>No configurations found</div></div>';
    el.querySelectorAll('[data-cfg]').forEach(sw => sw.addEventListener('change', async () => {
      try { await api.configurations.update(sw.dataset.cfg, { enabled: sw.checked }); toast('success','Config updated',sw.dataset.cfg+(sw.checked?' enabled':' disabled')); }
      catch (e) { sw.checked = !sw.checked; toast('error','Update failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 1 — AUDIT TRAILS
// ════════════════════════════════════════════════════════════
async function loadAuditTrails(c) {
  const el = c.querySelector('#sy-1');
  try {
    const res  = await api.audits.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Action</th><th>Entity</th><th>Resource</th><th>Maker</th><th>Made on</th><th>Status</th></tr></thead>
          <tbody>${list.map(a=>`<tr>
            <td><b>${escapeHtml(a.actionName||'—')}</b></td>
            <td>${escapeHtml(a.entityName||'—')}</td>
            <td class="mono">${escapeHtml(a.resourceId?String(a.resourceId):'—')}</td>
            <td>${escapeHtml(a.maker||'—')}</td>
            <td>${fmtDate(a.madeOnDate)||'—'}</td>
            <td><span class="badge ${a.processingResult?.value==='Processed'?'b-success':'b-warn'}">${escapeHtml(a.processingResult?.value||'—')}</span></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><div>No audit trail records</div></div>';
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 2 — CODES & VALUES (P6-7 — full CRUD)
// ════════════════════════════════════════════════════════════
async function loadCodes(c) {
  const el = c.querySelector('#sy-2');
  try {
    const codes = await api.codes.list();
    const list  = Array.isArray(codes) ? codes : [];
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} code${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-code"><i class="fa-solid fa-plus"></i> New Code</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Code Name</th><th>System Defined</th><th></th></tr></thead>
        <tbody>${list.map(cd=>`<tr>
          <td>${escapeHtml(cd.name)}</td>
          <td>${cd.systemDefined?'<span class="badge">System</span>':'<span class="badge b-teal">Custom</span>'}</td>
          <td>
            <button class="btn-ghost btn-sm" data-code-vals="${cd.id}" data-code-name="${escapeHtml(cd.name)}" title="Manage values"><i class="fa-solid fa-list"></i> Values</button>
            ${!cd.systemDefined ? `<button class="btn-ghost btn-sm" data-del-code="${cd.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
          </td>
        </tr>`).join('')||'<tr><td colspan="3" class="text-center text-muted" style="padding:16px">No codes</td></tr>'}
        </tbody>
      </table></div>`;

    el.querySelector('#btn-new-code').addEventListener('click', () => openNewCodeModal(() => loadCodes(c)));
    el.querySelectorAll('[data-code-vals]').forEach(b =>
      b.addEventListener('click', () => openCodeValuesModal(b.dataset.codeVals, b.dataset.codeName)));
    el.querySelectorAll('[data-del-code]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this code?')) return;
      try { await api.codes.delete(b.dataset.delCode); toast('success','Code deleted',''); loadCodes(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function openNewCodeModal(onSuccess) {
  const mid = `code-${Date.now()}`;
  const m = mkModal(mid, 'New Code', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Code name *</span>
        <input id="code-name" class="form-control" required placeholder="e.g. CustomerType"/></label>
    </div>`);
  m.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = m.querySelector('#code-name').value.trim();
    if (!name) { toast('warn','Enter a code name',''); return; }
    try { await api.codes.create({ name }); m.remove(); toast('success','Code created',name); onSuccess(); }
    catch (e) { toast('error','Create failed',e.message); }
  });
}

async function openCodeValuesModal(codeId, codeName) {
  const mid = `cv-${Date.now()}`;
  const m = mkModal(mid, `${codeName} — Values`, `
    <div id="cv-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
    <hr style="margin:16px 0;border-color:var(--color-border-tertiary)"/>
    <h4 style="font-size:13px;font-weight:600;margin-bottom:8px">Add Value</h4>
    <div class="form-grid">
      <label><span class="form-label">Name *</span><input id="cv-name" class="form-control" required/></label>
      <label><span class="form-label">Description</span><input id="cv-desc" class="form-control"/></label>
      <label><span class="form-label">Position</span><input type="number" id="cv-pos" min="0" value="0" class="form-control"/></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="cv-active" checked/> <span>Active</span></label>
    </div>`, false);

  async function reloadValues() {
    const listEl = m.querySelector('#cv-list');
    try {
      const vals = await api.codes.values(codeId);
      const list = Array.isArray(vals) ? vals : [];
      listEl.innerHTML = list.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th>Description</th><th>Position</th><th>Active</th><th></th></tr></thead>
            <tbody>${list.map(v=>`<tr>
              <td>${escapeHtml(v.name||'—')}</td>
              <td>${escapeHtml(v.description||'—')}</td>
              <td>${v.position??'—'}</td>
              <td>${v.active!==false?'<span class="badge b-success">Yes</span>':'<span class="badge">No</span>'}</td>
              <td>
                <button class="btn-ghost btn-sm" data-del-cv="${v.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="text-muted" style="padding:8px 0">No values defined</div>';
      listEl.querySelectorAll('[data-del-cv]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this code value?')) return;
        try { await api.codes.deleteValue(codeId, b.dataset.delCv); toast('success','Deleted',''); reloadValues(); }
        catch (e) { toast('error','Delete failed',e.message); }
      }));
    } catch (e) { listEl.innerHTML = `<div class="text-muted">${escapeHtml(e.message)}</div>`; }
  }

  await reloadValues();

  m.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name     = m.querySelector('#cv-name').value.trim();
    const description = m.querySelector('#cv-desc').value.trim();
    const position = parseInt(m.querySelector('#cv-pos').value)||0;
    const active   = m.querySelector('#cv-active').checked;
    if (!name) { toast('warn','Enter a value name',''); return; }
    try {
      await api.codes.createValue(codeId, { name, description, position, isActive: active });
      m.querySelector('#cv-name').value = '';
      m.querySelector('#cv-desc').value = '';
      toast('success','Value added',name); reloadValues();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// TAB 3 — ROLES & PERMISSIONS (P6-5 — full editor)
// ════════════════════════════════════════════════════════════
async function loadRoles(c) {
  const el = c.querySelector('#sy-3');
  try {
    const roles = await api.roles.list();
    const list  = Array.isArray(roles) ? roles : [];
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} role${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-role"><i class="fa-solid fa-plus"></i> New Role</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Role</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(r=>`<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.description||'—')}</td>
          <td>${r.disabled?'<span class="badge b-danger">Disabled</span>':'<span class="badge b-success">Active</span>'}</td>
          <td>
            <button class="btn-ghost btn-sm" data-edit-perms="${r.id}" data-role-name="${escapeHtml(r.name)}" title="Edit permissions">
              <i class="fa-solid fa-key"></i> Permissions
            </button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
    el.querySelector('#btn-new-role').addEventListener('click', () => openNewRoleModal(() => loadRoles(c)));
    el.querySelectorAll('[data-edit-perms]').forEach(b =>
      b.addEventListener('click', () => openPermissionsEditor(b.dataset.editPerms, b.dataset.roleName)));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function openNewRoleModal(onSuccess) {
  const mid = `role-${Date.now()}`;
  const m = mkModal(mid, 'New Role', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Role name *</span><input id="role-name" class="form-control" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="role-desc" class="form-control" rows="2"></textarea></label>
    </div>`);
  m.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name        = m.querySelector('#role-name').value.trim();
    const description = m.querySelector('#role-desc').value.trim();
    if (!name) { toast('warn','Enter a role name',''); return; }
    try { await api.roles.create({ name, description }); m.remove(); toast('success','Role created',name); onSuccess(); }
    catch (e) { toast('error','Create failed',e.message); }
  });
}

async function openPermissionsEditor(roleId, roleName) {
  const mid = `perms-${Date.now()}`;
  const m = mkModal(mid, `Permissions — ${roleName}`, `
    <div id="perms-body"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading permissions…</div></div></div>`, true);

  // Override save button label
  m.querySelector(`#${mid}-save`).innerHTML = '<i class="fa-solid fa-save"></i> Save Permissions';

  let permData = [];
  try {
    const data = await api.roles.permissions(roleId);
    permData   = Array.isArray(data?.permissionUsageData) ? data.permissionUsageData : (Array.isArray(data) ? data : []);
  } catch (e) {
    m.querySelector('#perms-body').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    return;
  }

  // Group by grouping field
  const groups = {};
  permData.forEach(p => { (groups[p.grouping||'Other'] ||= []).push(p); });

  const body = m.querySelector('#perms-body');
  body.innerHTML = `
    <div class="flex gap-2 mb-3">
      <button class="btn-ghost btn-sm" id="perms-select-all">Select all</button>
      <button class="btn-ghost btn-sm" id="perms-deselect-all">Deselect all</button>
      <input class="form-control" id="perms-filter" placeholder="Filter permissions…" style="flex:1;max-width:240px"/>
    </div>
    ${Object.entries(groups).map(([grp, items]) => `
      <div class="perms-group mb-4">
        <div style="font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-secondary);margin-bottom:8px">${escapeHtml(grp)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${items.map(p => `
            <label class="perm-item flex items-center gap-1" style="cursor:pointer;padding:4px 8px;border-radius:4px;border:1px solid var(--color-border-tertiary);font-size:12px"
              data-perm-code="${escapeHtml(p.code||'')}" data-perm-group="${escapeHtml(grp)}">
              <input type="checkbox" class="perm-cb" data-code="${escapeHtml(p.code||'')}" ${p.selected?'checked':''}/>
              <span>${escapeHtml(p.actionName||p.code||'—')}</span>
              ${p.entityName ? `<span class="text-muted">· ${escapeHtml(p.entityName)}</span>` : ''}
            </label>`).join('')}
        </div>
      </div>`).join('')}`;

  // Filter
  m.querySelector('#perms-filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    m.querySelectorAll('.perm-item').forEach(item => {
      item.style.display = !q || item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  m.querySelector('#perms-select-all').addEventListener('click', () =>
    m.querySelectorAll('.perm-cb').forEach(cb => { cb.checked = true; }));
  m.querySelector('#perms-deselect-all').addEventListener('click', () =>
    m.querySelectorAll('.perm-cb').forEach(cb => { cb.checked = false; }));

  m.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const permissions = {};
    m.querySelectorAll('.perm-cb').forEach(cb => { permissions[cb.dataset.code] = cb.checked; });
    try {
      await api.roles.updatePermissions(roleId, { permissions });
      m.remove(); toast('success','Permissions saved',roleName);
    } catch (e) { toast('error','Save failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// TAB 4 — MANAGE JOBS (P6-6 — run history)
// ════════════════════════════════════════════════════════════
async function loadJobs(c) {
  const el = c.querySelector('#sy-4');
  try {
    const jobs = await api.jobs.list();
    const list = Array.isArray(jobs) ? jobs : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Job</th><th>Cron</th><th>Last Run</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map(j=>`
            <tr>
              <td>${escapeHtml(j.displayName||j.name||'—')}</td>
              <td class="mono">${escapeHtml(j.cronExpression||'—')}</td>
              <td>${fmtDate(j.lastRunHistory?.jobRunStartTime)||'—'}</td>
              <td>${j.currentlyRunning?'<span class="badge b-warn">Running</span>':'<span class="badge">Idle</span>'}</td>
              <td>
                <button class="btn-primary btn-sm" data-run-job="${j.jobId||j.id||j.name}"><i class="fa-solid fa-play"></i> Run</button>
                <button class="btn-ghost btn-sm" data-job-history="${j.jobId||j.id}" data-job-name="${escapeHtml(j.displayName||j.name||'')}" title="History"><i class="fa-solid fa-clock-rotate-left"></i></button>
              </td>
            </tr>
            <tr id="job-hist-${j.jobId||j.id}" style="display:none">
              <td colspan="5" style="background:var(--color-background-secondary);padding:12px 16px">
                <div id="job-hist-body-${j.jobId||j.id}"></div>
              </td>
            </tr>`).join('')}
          </tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-calendar-check"></i><div>No scheduled jobs</div></div>';

    el.querySelectorAll('[data-run-job]').forEach(b => b.addEventListener('click', async () => {
      try { await api.jobs.runJob(b.dataset.runJob); toast('success','Job triggered',b.dataset.runJob+' scheduled'); }
      catch (e) { toast('error','Job failed',e.message); }
    }));

    el.querySelectorAll('[data-job-history]').forEach(b => b.addEventListener('click', async () => {
      const jid  = b.dataset.jobHistory;
      const row  = el.querySelector(`#job-hist-${jid}`);
      const body = el.querySelector(`#job-hist-body-${jid}`);
      if (row.style.display !== 'none') { row.style.display = 'none'; return; }
      row.style.display = '';
      body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading history…</div></div>';
      try {
        const res  = await api.jobs.history(jid, { limit: 10 });
        const runs = Array.isArray(res) ? res : (res?.pageItems || []);
        body.innerHTML = runs.length
          ? `<b style="font-size:12px">Run History — ${escapeHtml(b.dataset.jobName)}</b>
             <div class="tbl-wrap" style="margin-top:8px"><table class="tbl">
               <thead><tr><th>Started</th><th>Finished</th><th>Status</th><th>Error</th></tr></thead>
               <tbody>${runs.map(r=>`<tr>
                 <td>${fmtDate(r.jobRunStartTime)||'—'}</td>
                 <td>${fmtDate(r.jobRunEndTime)||'—'}</td>
                 <td><span class="badge ${r.status==='success'?'b-success':r.status==='failed'?'b-danger':'b-warn'}">${escapeHtml(r.status||'—')}</span></td>
                 <td class="text-muted" style="font-size:12px">${escapeHtml(r.triggerType||r.jobRunErrorMessage||'—')}</td>
               </tr>`).join('')}</tbody>
             </table></div>`
          : `<span class="text-muted" style="font-size:13px">No run history for ${escapeHtml(b.dataset.jobName)}</span>`;
      } catch (e) { body.innerHTML = `<span class="text-muted">${escapeHtml(e.message)}</span>`; }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 5 — EXTERNAL SERVICES
// ════════════════════════════════════════════════════════════
async function loadExternalServices(c) {
  const el = c.querySelector('#sy-5');
  el.innerHTML = `
    <div class="grid-2">
      ${['SMS','SMTP Email','S3 Storage','Notifications'].map((svc,i)=>`
        <div class="card" style="margin:0">
          <h3 class="card-title mb-3">${svc}</h3>
          <button class="btn-ghost btn-sm" data-svc-view="${['sms','smtpEmail','s3','notification'][i]}" data-svc-label="${svc}">
            <i class="fa-solid fa-pen"></i> Configure ${svc}
          </button>
        </div>`).join('')}
    </div>`;
  el.querySelectorAll('[data-svc-view]').forEach(b =>
    b.addEventListener('click', () => viewServiceConfig(b.dataset.svcView, b.dataset.svcLabel)));
}

// ════════════════════════════════════════════════════════════
// TAB 6 — COB
// ════════════════════════════════════════════════════════════
async function loadCOB(c) {
  const el = c.querySelector('#sy-6');
  try {
    const [dateRes, cfgRes] = await Promise.allSettled([api.cob.businessDate.get(), api.cob.configurations()]);
    const date    = dateRes.status==='fulfilled' ? dateRes.value : null;
    const cfgs    = cfgRes.status==='fulfilled'  ? cfgRes.value  : null;
    const cfgList = Array.isArray(cfgs) ? cfgs : (cfgs?.businessSteps || []);
    el.innerHTML = `
      <div style="margin-bottom:20px">
        <h4 class="mb-2">Business Date</h4>
        ${date
          ? `<div class="flex gap-3 items-center flex-wrap">
               <span class="mono" style="font-size:18px">${escapeHtml(String(date.date||date.businessDate||JSON.stringify(date)))}</span>
               <span class="badge">${escapeHtml(date.type||'')}</span>
             </div>`
          : '<div class="text-muted">Business date not available</div>'}
      </div>
      <div class="flex gap-2 mb-4 flex-wrap">
        <button class="btn-primary btn-sm" id="cob-catchup"><i class="fa-solid fa-forward-fast"></i> Run COB Catch-Up</button>
      </div>
      ${cfgList.length
        ? `<h4 class="mb-2">Business Step Configuration</h4>
           <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Step Name</th><th>Job Name</th><th>Order</th></tr></thead>
             <tbody>${cfgList.map(s=>`<tr>
               <td>${escapeHtml(s.stepName||s.name||'—')}</td>
               <td>${escapeHtml(s.jobName||'—')}</td>
               <td>${escapeHtml(String(s.order??'—'))}</td>
             </tr>`).join('')}</tbody></table></div>`
        : '<div class="text-muted mt-2">No business step configuration found</div>'}`;
    el.querySelector('#cob-catchup').addEventListener('click', async () => {
      if (!confirm('Trigger COB catch-up? This runs all overdue COB steps.')) return;
      try { await api.cob.catchUp(); toast('success','COB catch-up triggered','Processing will run asynchronously'); }
      catch (e) { toast('error','COB catch-up failed',e.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 7 — HOOKS
// ════════════════════════════════════════════════════════════
async function loadHooks(c) {
  const el = c.querySelector('#sy-7');
  try {
    const hooks = await api.hooks.list();
    const list  = Array.isArray(hooks) ? hooks : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Template</th><th>Active</th><th>Events</th></tr></thead>
          <tbody>${list.map(h=>`<tr>
            <td>${escapeHtml(h.name||'—')}</td>
            <td>${escapeHtml(h.templateName||h.templateId||'—')}</td>
            <td>${h.isActive?'<span class="badge b-success">Active</span>':'<span class="badge">Inactive</span>'}</td>
            <td class="text-muted">${(h.events||[]).map(e=>escapeHtml(e.actionName+':'+e.entityName)).join(', ')||'—'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-webhook"></i><div>No webhooks configured</div></div>';
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 8 — SMS CAMPAIGNS
// ════════════════════════════════════════════════════════════
async function loadSMSCampaigns(c) {
  const el = c.querySelector('#sy-8');
  try {
    const sms  = await api.smsCampaigns.list();
    const list = Array.isArray(sms) ? sms : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Campaign Name</th><th>Type</th><th>Status</th><th>Next Run</th></tr></thead>
          <tbody>${list.map(s=>`<tr>
            <td>${escapeHtml(s.campaignName||s.name||'—')}</td>
            <td>${escapeHtml(s.campaignType?.value||'—')}</td>
            <td>${escapeHtml(s.campaignStatus?.value||s.status||'—')}</td>
            <td>${fmtDate(s.nextTriggerDate)||'—'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-sms"></i><div>No SMS campaigns</div></div>';
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 9 — DATA TABLES (P6-8 — new)
// ════════════════════════════════════════════════════════════
async function loadDataTables(c) {
  const el = c.querySelector('#sy-9');
  try {
    const res  = await api.dataTables.list();
    const list = Array.isArray(res) ? res : [];
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} data table${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-dt"><i class="fa-solid fa-plus"></i> Register Data Table</button>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Table Name</th><th>Application Table</th><th>Columns</th><th></th></tr></thead>
            <tbody>${list.map(dt=>`<tr>
              <td class="mono">${escapeHtml(dt.registeredTableName||dt.tableName||'—')}</td>
              <td>${escapeHtml(dt.applicationTableName||'—')}</td>
              <td>${(dt.columnHeaderData||[]).length||'—'}</td>
              <td>
                <button class="btn-ghost btn-sm" data-dt-view="${escapeHtml(dt.registeredTableName||dt.tableName||'')}" title="View schema"><i class="fa-solid fa-eye"></i></button>
                <button class="btn-ghost btn-sm" data-dt-del="${escapeHtml(dt.registeredTableName||dt.tableName||'')}" title="Deregister"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-table"></i><div>No data tables registered</div></div>'}`;

    el.querySelector('#btn-new-dt').addEventListener('click', () => openRegisterDataTableModal(() => loadDataTables(c)));

    el.querySelectorAll('[data-dt-view]').forEach(b => b.addEventListener('click', async () => {
      try {
        const dt   = await api.dataTables.get(b.dataset.dtView);
        const cols = dt?.columnHeaderData || [];
        const mid  = `dt-view-${Date.now()}`;
        const m    = mkModal(mid, `Schema: ${b.dataset.dtView}`, `
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Column</th><th>Type</th><th>Nullable</th></tr></thead>
            <tbody>${cols.map(col=>`<tr>
              <td class="mono">${escapeHtml(col.columnName||'—')}</td>
              <td class="mono">${escapeHtml(col.columnType||'—')}</td>
              <td>${col.isColumnNullable?'Yes':'No'}</td>
            </tr>`).join('')||'<tr><td colspan="3" class="text-center text-muted" style="padding:14px">No column data</td></tr>'}
            </tbody></table></div>`);
        m.querySelector(`#${mid}-save`).style.display = 'none';
      } catch (e) { toast('error','Failed to load schema',e.message); }
    }));

    el.querySelectorAll('[data-dt-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Deregister data table "${b.dataset.dtDel}"? This removes the custom table registration.`)) return;
      try { await api.dataTables.deregister(b.dataset.dtDel); toast('success','Data table deregistered',''); loadDataTables(c); }
      catch (e) { toast('error','Deregister failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openRegisterDataTableModal(onSuccess) {
  const appTables = ['m_client','m_loan','m_savings_account','m_group','m_center','m_office'];
  const mid = `dt-reg-${Date.now()}`;
  const m = mkModal(mid, 'Register Data Table', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Table name *</span>
        <input id="dt-name" class="form-control" required placeholder="e.g. my_custom_table"/></label>
      <label class="full"><span class="form-label">Application table *</span>
        <select id="dt-app" class="form-control" required>
          <option value="">Select…</option>
          ${appTables.map(t=>`<option value="${t}">${t}</option>`).join('')}
        </select></label>
      <div class="full">
        <h4 style="font-size:13px;font-weight:600;margin-bottom:8px">Columns</h4>
        <div id="dt-cols">
          <div class="dt-col flex gap-2 mb-2">
            <input class="form-control dt-col-name" placeholder="Column name" style="flex:2"/>
            <select class="form-control dt-col-type" style="flex:1">
              <option value="String">String</option><option value="Number">Number</option>
              <option value="Boolean">Boolean</option><option value="Date">Date</option><option value="Text">Text</option>
            </select>
            <label class="flex items-center gap-1" style="font-size:12px;white-space:nowrap"><input type="checkbox" class="dt-col-mandatory"/> Required</label>
          </div>
        </div>
        <button type="button" class="btn-ghost btn-sm mt-2" id="dt-add-col"><i class="fa-solid fa-plus"></i> Add column</button>
      </div>
    </div>`);

  m.querySelector('#dt-add-col').addEventListener('click', () => {
    m.querySelector('#dt-cols').insertAdjacentHTML('beforeend', `
      <div class="dt-col flex gap-2 mb-2">
        <input class="form-control dt-col-name" placeholder="Column name" style="flex:2"/>
        <select class="form-control dt-col-type" style="flex:1">
          <option value="String">String</option><option value="Number">Number</option>
          <option value="Boolean">Boolean</option><option value="Date">Date</option><option value="Text">Text</option>
        </select>
        <label class="flex items-center gap-1" style="font-size:12px;white-space:nowrap"><input type="checkbox" class="dt-col-mandatory"/> Required</label>
        <button type="button" class="btn-ghost btn-sm" onclick="this.closest('.dt-col').remove()"><i class="fa-solid fa-trash"></i></button>
      </div>`);
  });

  m.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const tableName         = m.querySelector('#dt-name').value.trim();
    const applicationTableName = m.querySelector('#dt-app').value;
    if (!tableName || !applicationTableName) { toast('warn','Fill required fields',''); return; }
    const columns = [...m.querySelectorAll('.dt-col')].map(row => ({
      columnName:    row.querySelector('.dt-col-name').value.trim(),
      columnType:    row.querySelector('.dt-col-type').value,
      mandatory:     row.querySelector('.dt-col-mandatory').checked,
      unique:        false,
      indexed:       false
    })).filter(col => col.columnName);
    try {
      await api.dataTables.create({ tableName, applicationTableName, columns, apptableName: applicationTableName });
      m.remove(); toast('success','Data table registered',tableName); onSuccess();
    } catch (e) { toast('error','Registration failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// TAB 10 — SYSTEM INFO
// ════════════════════════════════════════════════════════════
function loadSystemInfo(c) {
  const el = c.querySelector('#sy-10');
  const a  = store.get('auth') || {};
  el.innerHTML = `
    <div class="card" style="margin:0">
      <h3 class="card-title mb-4">System Information</h3>
      <div class="grid-2">
        <div><div class="text-muted">Server URL</div><div class="mono">${escapeHtml(a.serverUrl||'—')}</div></div>
        <div><div class="text-muted">Tenant</div><div class="mono">${escapeHtml(a.tenantId||'default')}</div></div>
        <div><div class="text-muted">User</div><div class="mono">${escapeHtml(a.username||'—')}</div></div>
        <div><div class="text-muted">Connection</div><div>${a.authToken?'<span class="badge b-success">Live</span>':'<span class="badge b-warn">Offline</span>'}</div></div>
        <div><div class="text-muted">UI Version</div><div class="mono">FinCraft 1.0.0</div></div>
        <div><div class="text-muted">API Base</div><div class="mono">/fineract-provider/api/v1</div></div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════
function mkModal(mid, title, body, wide=false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal${wide?' xl':' lg'}">
        <div class="modal-head"><h3 class="modal-title">${title}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save"><i class="fa-solid fa-check"></i> Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  return el;
}

function viewServiceConfig(group, label) {
  const mid = `svc-${Date.now()}`;
  const m = mkModal(mid, `${label} Configuration`, `
    <div id="svc-cfg-body"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`);
  m.querySelector(`#${mid}-save`).style.display = 'none';
  api.externalServices[group].list().then(cfg => {
    const props = cfg?.properties || (Array.isArray(cfg) ? cfg : null);
    const el    = m.querySelector('#svc-cfg-body');
    if (Array.isArray(props) && props.length) {
      el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>${props.map(p=>`<tr>
          <td class="mono">${escapeHtml(p.name||p.key||'—')}</td>
          <td class="mono">${escapeHtml(/pass|secret|key/i.test(p.name||'')?'••••••••':String(p.value??'—'))}</td>
        </tr>`).join('')}</tbody></table></div>
        <div class="text-muted mt-3" style="font-size:12px">Read-only preview. Edit via Fineract admin tools.</div>`;
    } else {
      el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-gear"></i><div>No configuration found</div></div>';
    }
  }).catch(e => {
    m.querySelector('#svc-cfg-body').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  });
}
