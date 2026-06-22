/* FinCraft · misc.js — Profile, Settings, Notifications, Users, Surveys etc — Live API */
import { api } from '../api.js';
import { sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal } from '../ui.js';
import { store } from '../store.js';
import { configureAPI } from '../api.js';

export async function render(c, params) {
  const view = params.view || 'profile';
  const VIEWS = { profile, settings, notifications, users, surveys, templates, navigation, 'self-service': selfService, collaterals, remittances };
  const fn = VIEWS[view] || profile;
  await fn(c);
}

function profile(c) {
  const a = store.get('auth') || {};
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Profile</h1><div class="page-subtitle">Your account details</div></div></div>
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title mb-4">Account Details</h3>
        <div class="form-grid">
          <label><span class="form-label">Username</span><input class="form-control" value="${escapeHtml(a.username || '')}" readonly /></label>
          <label><span class="form-label">Tenant</span><input class="form-control" value="${escapeHtml(a.tenantId || 'default')}" readonly /></label>
          <label class="full"><span class="form-label">Server</span><input class="form-control" value="${escapeHtml(a.serverUrl || '')}" readonly /></label>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title mb-4">Change Password</h3>
        <div class="form-grid">
          <label class="full"><span class="form-label">Current Password</span><input id="pw-cur" class="form-control" type="password" /></label>
          <label><span class="form-label">New Password</span><input id="pw-new" class="form-control" type="password" /></label>
          <label><span class="form-label">Confirm</span><input id="pw-cfm" class="form-control" type="password" /></label>
        </div>
        <button class="btn-primary mt-4" id="pw-save"><i class="fa-solid fa-key"></i> Update Password</button>
      </div>
    </div>
  </div>`;

  c.querySelector('#pw-save').addEventListener('click', async () => {
    const cur = c.querySelector('#pw-cur').value;
    const nw  = c.querySelector('#pw-new').value;
    const cfm = c.querySelector('#pw-cfm').value;
    if (!cur || !nw) { toast('warn', 'Incomplete', 'Enter current and new password'); return; }
    if (nw !== cfm)  { toast('error', 'Mismatch', 'New passwords do not match'); return; }
    const btn = c.querySelector('#pw-save');
    btn.disabled = true;
    try {
      // Verify the current password is actually correct before changing it —
      // previously this field was collected but never checked against anything.
      await api.auth(a.username, cur);
    } catch {
      toast('error', 'Incorrect password', 'Current password is not correct');
      btn.disabled = false; return;
    }
    try {
      const userId = store.get('auth')?.userId;
      if (userId) await api.users.update(userId, { password: nw, repeatPassword: cfm });
      toast('success', 'Password updated', 'Sign in with your new password next time');
      c.querySelector('#pw-cur').value = c.querySelector('#pw-new').value = c.querySelector('#pw-cfm').value = '';
    } catch (e) { toast('error', 'Update failed', e.message); }
    finally { btn.disabled = false; }
  });
}

function settings(c) {
  const a = store.get('auth') || {};
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Settings</h1><div class="page-subtitle">App preferences & connection</div></div></div>
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title mb-4">Server Connection</h3>
        <div class="form-grid">
          <label class="full"><span class="form-label">Server URL</span><input id="s-url" class="form-control" value="${escapeHtml(a.serverUrl || '')}" /></label>
          <label><span class="form-label">Tenant</span><input id="s-tenant" class="form-control" value="${escapeHtml(a.tenantId || 'default')}" /></label>
        </div>
        <button class="btn-primary mt-4" id="s-save"><i class="fa-solid fa-save"></i> Save</button>
      </div>
      <div class="card">
        <h3 class="card-title mb-4">Appearance</h3>
        <div class="flex justify-between mb-4">
          <div><b>Dark Theme</b><div class="text-muted">Use dark mode</div></div>
          <label class="switch"><input type="checkbox" id="s-theme" ${store.get('theme') === 'dark' ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
        <div class="flex justify-between">
          <div><b>Collapsed Sidebar</b><div class="text-muted">More room for content</div></div>
          <label class="switch"><input type="checkbox" id="s-sidebar" ${store.get('sidebar') === 'collapsed' ? 'checked' : ''} /><span class="slider"></span></label>
        </div>
      </div>
      <div class="card full">
        <h3 class="card-title mb-4">Keyboard Shortcuts</h3>
        <div class="grid-2">
          <div><kbd>Ctrl K</kbd> Command palette</div>
          <div><kbd>ESC</kbd> Close modals</div>
          <div><kbd>Ctrl Shift N</kbd> New Client</div>
          <div><kbd>Ctrl Shift L</kbd> New Loan</div>
          <div><kbd>?</kbd> Help</div>
        </div>
      </div>
    </div>
  </div>`;

  c.querySelector('#s-save').addEventListener('click', () => {
    const url = c.querySelector('#s-url').value.trim();
    const tnt = c.querySelector('#s-tenant').value.trim();
    store.patch('auth', { serverUrl: url, tenantId: tnt });
    configureAPI({ serverUrl: url, tenantId: tnt });
    toast('success', 'Saved', 'Server settings updated');
  });
  c.querySelector('#s-theme').addEventListener('change', e => {
    store.set('theme', e.target.checked ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', store.get('theme'));
  });
  c.querySelector('#s-sidebar').addEventListener('change', e => {
    store.set('sidebar', e.target.checked ? 'collapsed' : 'expanded');
    document.getElementById('appShell')?.classList.toggle('collapsed', e.target.checked);
  });
}

async function notifications(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Notifications</h1><div class="page-subtitle">Recent activity alerts</div></div>
      <button class="btn-ghost" id="mark-all-read"><i class="fa-solid fa-check-double"></i> Mark all read</button>
    </div>
    <div class="card" id="notif-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
  </div>`;

  try {
    const res = await api.notifications.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#notif-list').innerHTML = list.length
      ? list.map(n => `
          <div class="notif-item" data-notif="${n.id}">
            <div class="flex justify-between">
              <div><b>${escapeHtml(n.content || n.msg || '—')}</b></div>
              ${n.isRead ? '' : '<span class="badge b-warn">New</span>'}
            </div>
            <div class="when text-muted" style="font-size:12px;margin-top:4px">${escapeHtml(n.createdAt || n.when || '—')}</div>
          </div>`).join('')
      : '<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><div>No notifications</div></div>';

    c.querySelectorAll('[data-notif]').forEach(el => el.addEventListener('click', async () => {
      const id = el.dataset.notif;
      try { await api.notifications.markRead(id); el.querySelector('.badge')?.remove(); } catch {}
    }));
    c.querySelector('#mark-all-read')?.addEventListener('click', async () => {
      for (const el of c.querySelectorAll('[data-notif]')) {
        try { await api.notifications.markRead(el.dataset.notif); } catch {}
        el.querySelector('.badge')?.remove();
      }
      toast('success', 'All marked read', '');
    });
  } catch (e) {
    c.querySelector('#notif-list').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function users(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Users & Roles</h1><div class="page-subtitle">Application users and RBAC</div></div>
      <button class="btn-primary" id="new-user-btn"><i class="fa-solid fa-user-plus"></i> New User</button>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title mb-4">Users</h3>
        <div id="users-table"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
      </div>
      <div class="card">
        <h3 class="card-title mb-4">Roles</h3>
        <div id="roles-table"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
      </div>
    </div>
  </div>`;

  const [usersRes, rolesRes] = await Promise.all([
    api.users.list().catch(() => []),
    api.roles.list().catch(() => [])
  ]);

  const userList = Array.isArray(usersRes) ? usersRes : [];
  c.querySelector('#users-table').innerHTML = userList.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Username</th><th>Email</th><th>Office</th><th>Status</th></tr></thead>
        <tbody>${userList.map(u => `<tr>
          <td class="mono">${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${escapeHtml(u.officeName || '—')}</td>
          <td>${sb(u.notEnabled === false ? 'Active' : 'Inactive')}</td>
        </tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No users found</div></div>';

  const roleList = Array.isArray(rolesRes) ? rolesRes : [];
  c.querySelector('#roles-table').innerHTML = roleList.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Role</th><th>Description</th><th>Status</th></tr></thead>
        <tbody>${roleList.map(r => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.description || '—')}</td>
          <td>${sb(r.disabled ? 'Disabled' : 'Active')}</td>
        </tr>`).join('')}</tbody></table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-user-shield"></i><div>No roles defined</div></div>';

  c.querySelector('#new-user-btn').addEventListener('click', () => openModal('newUserModal'));
}

async function surveys(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Surveys</h1><div class="page-subtitle">PAT, PPI & satisfaction surveys</div></div></div>
    <div class="card" id="surveys-table"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
  </div>`;
  try {
    const res = await api.surveys.list();
    const list = Array.isArray(res) ? res : [];
    c.querySelector('#surveys-table').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Survey Name</th><th>Status</th></tr></thead>
          <tbody>${list.map(s => `<tr><td>${escapeHtml(s.name)}</td><td>${sb(s.status || 'Active')}</td></tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><div>No surveys defined</div></div>';
  } catch (e) {
    c.querySelector('#surveys-table').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function templates(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Templates</h1><div class="page-subtitle">Email & document templates</div></div></div>
    <div class="card">
      <div class="empty-state">
        <i class="fa-solid fa-file-lines"></i>
        <div><b>Not a stock Fineract feature</b></div>
        <div class="text-muted mt-2">Apache Fineract doesn't expose a generic email/document template CRUD API. Notification content is configured per SMS/Email campaign instead (see Organization → Notifications).</div>
      </div>
    </div>
  </div>`;
}

async function navigation(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Navigation</h1><div class="page-subtitle">Office → Staff hierarchy</div></div></div>
    <div class="card" id="nav-tree"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
  </div>`;
  try {
    const [offRes, staffRes] = await Promise.all([api.offices.list(), api.staff.list()]);
    const offices = Array.isArray(offRes) ? offRes : [];
    const staff   = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);
    c.querySelector('#nav-tree').innerHTML = offices.map(o => `
      <div class="tree-node parent" data-toggle>${escapeHtml(o.name)}</div>
      <div class="tree-children">
        ${staff.filter(s => s.officeId === o.id).map(s => `<div class="tree-node">👤 ${escapeHtml(s.displayName)} <span class="text-muted">· ${s.isLoanOfficer ? 'Loan Officer' : 'Staff'}</span></div>`).join('')
          || '<div class="tree-node text-muted">No staff assigned</div>'}
      </div>`).join('');
    c.querySelectorAll('[data-toggle]').forEach(n => n.addEventListener('click', () => n.classList.toggle('open')));
  } catch (e) {
    c.querySelector('#nav-tree').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function selfService(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Self Service</h1><div class="page-subtitle">Client portal user management</div></div>
      <button class="btn-primary" data-modal="selfServiceUserModal"><i class="fa-solid fa-plus"></i> Add Portal User</button>
    </div>
    <div class="card">
      <div class="tabs">
        <button class="tab active" data-tab="ss-1">Portal Users</button>
        <button class="tab" data-tab="ss-2">Beneficiaries</button>
      </div>
      <div id="ss-1" class="tab-panel active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
      <div id="ss-2" class="tab-panel"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
    </div>
  </div>`;

  // NOTE: Fineract's /self/userdetails returns the *currently authenticated* self-service
  // user's own profile — there's no admin-facing "list all portal users" endpoint in stock
  // Fineract. Calling this from an admin/staff session will typically return nothing useful.
  // New portal users can still be created below via /self/registration.
  try {
    const users = await api.selfService.users();
    c.querySelector('#ss-1').innerHTML = users?.username
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Username</th><th>Email</th></tr></thead>
          <tbody><tr><td>${escapeHtml(users.username || '—')}</td><td>${escapeHtml(users.email || '—')}</td></tr></tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-mobile-screen"></i><div><b>Not available from an admin session</b></div><div class="text-muted mt-2">Fineract has no endpoint to list all self-service portal users — only the currently logged-in portal user\'s own profile. Use "Add Portal User" below to create one.</div></div>';
  } catch {
    c.querySelector('#ss-1').innerHTML = '<div class="empty-state"><i class="fa-solid fa-mobile-screen"></i><div><b>Not available from an admin session</b></div><div class="text-muted mt-2">Fineract has no endpoint to list all self-service portal users — only the currently logged-in portal user\'s own profile. Use "Add Portal User" below to create one.</div></div>';
  }

  try {
    const ben = await api.selfService.beneficiaries();
    const list = Array.isArray(ben) ? ben : [];
    c.querySelector('#ss-2').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Account</th><th>Type</th></tr></thead>
          <tbody>${list.map(b => `<tr><td>${escapeHtml(b.name)}</td><td class="mono">${escapeHtml(b.accountNumber || '—')}</td><td>${escapeHtml(b.transferType?.value || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-people-arrows"></i><div>No beneficiaries registered</div></div>';
  } catch {
    c.querySelector('#ss-2').innerHTML = '<div class="empty-state"><i class="fa-solid fa-people-arrows"></i><div>No beneficiaries registered</div></div>';
  }
}

async function collaterals(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Collaterals</h1><div class="page-subtitle">Collateral types pledged against loans</div></div>
      <div class="page-actions"><button class="btn-primary"><i class="fa-solid fa-plus"></i> Add Collateral</button></div>
    </div>
    <div id="coll-body" class="card"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
  </div>`;
  try {
    const types = await api.collateralManagement.list().catch(() => api.codes.values('CollateralType').catch(() => null));
    const list = Array.isArray(types) ? types : (types?.allowedCollateralTypes || []);
    c.querySelector('#coll-body').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Quality</th></tr></thead>
          <tbody>${list.map(t => `<tr><td>${escapeHtml(t.name || t.value || '—')}</td><td>${escapeHtml(t.quality || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-shield-halved"></i></div><h3>No Collateral Records</h3><p>Collateral records will appear here.</p></div>';
  } catch {
    c.querySelector('#coll-body').innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-shield-halved"></i></div><h3>No Collateral Records</h3><p>Collateral records will appear here.</p></div>';
  }
}

async function remittances(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header"><div><h1 class="page-title">Remittances</h1><div class="page-subtitle">Send and track remittance transfers</div></div>
      <div class="page-actions"><button class="btn-primary" id="newRemitBtn"><i class="fa-solid fa-plus"></i> New Remittance</button></div>
    </div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ref</th><th>Sender</th><th>Beneficiary</th><th>Amount</th><th>Mode</th><th>Date</th><th>Status</th></tr></thead>
      <tbody><tr><td colspan="7" class="text-center" style="padding:30px;color:var(--text-muted)">No remittances yet — create one to get started.</td></tr></tbody>
    </table></div></div>
  </div>`;
  const { openModal } = await import('../ui.js');
  c.querySelector('#newRemitBtn').addEventListener('click', () => openModal('remittanceModal'));
}
