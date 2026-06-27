import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · users.js — Users, Roles, Password Policy, 2FA Configuration
   Replaces the legacy view-in-misc.js model with dedicated standalone routes. */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = [
  'Users',
  'Roles & Permissions',
  'Password Policy',
  'Two-Factor Auth'
];

export async function render(c, params = {}) {
  // Sub-routing inside this module via ?view=
  if (params.view === 'user-detail' && params.id) return renderUserDetail(c, params.id);
  if (params.view === 'role-detail' && params.id) return renderRoleDetail(c, params.id);

  // Default: tabbed shell
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Users &amp; Roles</h1>
        <div class="text-muted">Manage users, roles, password policy, and two-factor authentication</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="usr-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="usr-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="usr-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0: loadUsersList,
    1: loadRoles,
    2: loadPasswordPolicy,
    3: loadTwoFactorConfig
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

  loadUsersList(c);
  loaded[0] = true;
}

// ════════════════════════════════════════════════════════════
// TAB 0 — USERS LIST
// ════════════════════════════════════════════════════════════
async function loadUsersList(c) {
  const el = c.querySelector('#usr-0');
  try {
    const [users, offices] = await Promise.all([
      api.users.list(),
      api.offices.list().catch(() => [])
    ]);
    const list = Array.isArray(users) ? users : [];
    const officeList = Array.isArray(offices) ? offices : [];

    const activeCount = list.filter(u => !u.passwordNeverExpires === false ? true : true).length; // server doesn't expose
    const lockedCount = list.filter(u => u.accountNonLocked === false).length;
    const expiredCount = list.filter(u => u.passwordExpired).length;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Total Users</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Locked</div><div class="kpi-value">${num(lockedCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Password Expired</div><div class="kpi-value">${num(expiredCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Offices</div><div class="kpi-value">${num(officeList.length)}</div></div>
      </div>

      <div class="section-header mb-2">
        <div class="filter-bar" style="flex:1">
          <input id="usr-search" class="form-control" placeholder="Search username, email, name…" autocomplete="off"/>
          <select id="usr-office-filter" class="form-control">
            <option value="">All offices</option>
            ${officeList.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          </select>
          <select id="usr-status-filter" class="form-control">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="expired">Password Expired</option>
          </select>
        </div>
        ${can('CREATE_USER') ? `<button class="btn-primary" id="btn-new-user"><i class="fa-solid fa-plus"></i> New User</button>` : ''}
      </div>

      <div id="usr-table-wrap"></div>`;

    function draw(rows) {
      const tableWrap = el.querySelector('#usr-table-wrap');
      tableWrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Username</th>
            <th>Name</th>
            <th>Office</th>
            <th>Email</th>
            <th>Roles</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>${rows.length ? rows.map(u => `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="avatar">${ini(u.firstname + ' ' + u.lastname)}</div>
                  <div>
                    <b>${u.id}">${escapeHtml(u.username)}</a></b>
                    ${u.staff ? `<div class="text-muted small">Staff: ${escapeHtml(u.staff?.displayName || '')}</div>` : ''}
                  </div>
                </div>
              </td>
              <td>${escapeHtml((u.firstname || '') + ' ' + (u.lastname || ''))}</td>
              <td>${escapeHtml(u.officeName || '—')}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>${(u.selectedRoles || u.availableRoles || []).map(r => `<span class="badge">${escapeHtml(r.name)}</span>`).join(' ') || '—'}</td>
              <td>
                ${u.accountNonLocked === false ? '<span class="badge b-danger">Locked</span>' : ''}
                ${u.passwordExpired ? '<span class="badge b-warning">Expired</span>' : ''}
                ${u.accountNonLocked !== false && !u.passwordExpired ? sb('Active') : ''}
              </td>
              <td class="text-right">
                ${can('READ_USER') ? `<button class="btn-mini" data-view-user="${u.id}">View</button>` : ''}
                ${can('UPDATE_USER') ? `<button class="btn-mini" data-edit-user="${u.id}">Edit</button>` : ''}
                ${can('UPDATE_USER') && u.accountNonLocked === false ? `<button class="btn-mini btn-success" data-unlock-user="${u.id}">Unlock</button>` : ''}
                ${can('DELETE_USER') ? `<button class="btn-mini btn-danger" data-del-user="${u.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty-state-row">No users match</td></tr>'}
          </tbody>
        </table>`;

      tableWrap.querySelectorAll('[data-view-user]').forEach(b => b.addEventListener('click', () =>
        import('../router.js').then(r => r.navigate('users', { view: 'user-detail', id: b.dataset.viewUser }))));
      tableWrap.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () =>
        openUserFormModal(b.dataset.editUser, () => loadUsersList(c))));
      tableWrap.querySelectorAll('[data-unlock-user]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({ title: 'Unlock user account?', confirmText: 'Unlock' })) return;
        try {
          await api.users.update(b.dataset.unlockUser, { accountNonLocked: true });
          toast('success', 'Account unlocked', '');
          loadUsersList(c);
        } catch (e) { toast('error', 'Unlock failed', e.detail?.defaultUserMessage || e.message); }
      }));
      tableWrap.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({
          title: 'Delete user account?',
          message: 'This permanently removes the user. Their audit history is preserved.',
          danger: true, confirmText: 'Delete'
        })) return;
        try {
          await api.users.delete(b.dataset.delUser);
          toast('success', 'User deleted', '');
          loadUsersList(c);
        } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
      }));
    }

    function applyFilters() {
      const q = el.querySelector('#usr-search').value.toLowerCase().trim();
      const officeId = el.querySelector('#usr-office-filter').value;
      const status = el.querySelector('#usr-status-filter').value;

      let filtered = list;
      if (q) filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        ((u.firstname || '') + ' ' + (u.lastname || '')).toLowerCase().includes(q));
      if (officeId) filtered = filtered.filter(u => String(u.officeId) === officeId);
      if (status === 'locked') filtered = filtered.filter(u => u.accountNonLocked === false);
      if (status === 'expired') filtered = filtered.filter(u => u.passwordExpired);
      if (status === 'active') filtered = filtered.filter(u => u.accountNonLocked !== false && !u.passwordExpired);

      draw(filtered);
    }

    let t;
    el.querySelector('#usr-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 250); });
    el.querySelector('#usr-office-filter').addEventListener('change', applyFilters);
    el.querySelector('#usr-status-filter').addEventListener('change', applyFilters);

    el.querySelector('#btn-new-user')?.addEventListener('click', () =>
      openUserFormModal(null, () => loadUsersList(c)));

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// USER DETAIL VIEW (dedicated route)
// ════════════════════════════════════════════════════════════
async function renderUserDetail(c, userId) {
  c.innerHTML = `<div class="empty-state-row">Loading user…</div>`;
  try {
    const [user, roles, allPerms] = await Promise.all([
      api.users.get(userId),
      api.roles.list(),
      api.permissions.list().catch(() => [])
    ]);
    const roleList = Array.isArray(roles) ? roles : [];
    const userRoles = user.selectedRoles || [];

    // Compute inherited permissions from selected roles
    let inheritedPerms = new Set();
    for (const r of userRoles) {
      try {
        const fullRole = await api.roles.get(r.id);
        const grants = fullRole?.permissionUsageData || [];
        grants.filter(p => p.selected).forEach(p => inheritedPerms.add(p.code));
      } catch {}
    }

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>
            <span class="avatar avatar-lg">${ini(user.firstname + ' ' + user.lastname)}</span>
            ${escapeHtml(user.firstname || '')} ${escapeHtml(user.lastname || '')}
          </h1>
          <div class="text-muted">
            <b>@${escapeHtml(user.username)}</b> · ${escapeHtml(user.officeName || '—')}
            ${user.staff ? ` · Staff: ${escapeHtml(user.staff?.displayName || '')}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" data-back-users><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${can('UPDATE_USER') ? `<button class="btn-secondary" id="btn-reset-pw"><i class="fa-solid fa-key"></i> Reset Password</button>` : ''}
          ${can('UPDATE_USER') ? `<button class="btn-primary" id="btn-edit-user"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <h3>Profile</h3>
        <div class="grid-2">
          <div>
            <dl class="dl-grid">
              <dt>Username</dt><dd>${escapeHtml(user.username)}</dd>
              <dt>Full name</dt><dd>${escapeHtml((user.firstname || '') + ' ' + (user.lastname || ''))}</dd>
              <dt>Email</dt><dd>${escapeHtml(user.email || '—')}</dd>
              <dt>Office</dt><dd>${escapeHtml(user.officeName || '—')}</dd>
            </dl>
          </div>
          <div>
            <dl class="dl-grid">
              <dt>Account locked</dt><dd>${user.accountNonLocked === false ? '<span class="badge b-danger">Yes</span>' : 'No'}</dd>
              <dt>Password expired</dt><dd>${user.passwordExpired ? '<span class="badge b-warning">Yes</span>' : 'No'}</dd>
              <dt>Password never expires</dt><dd>${user.passwordNeverExpires ? 'Yes' : 'No'}</dd>
              <dt>Last time password updated</dt><dd>${fmtDate(user.lastTimePasswordUpdated) || '—'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <h3>Roles (${userRoles.length})</h3>
        ${userRoles.length ? `
          <div class="chip-list">
            ${userRoles.map(r => `<span class="chip">${escapeHtml(r.name)}</span>`).join('')}
          </div>` : '<div class="text-muted">No roles assigned</div>'}
      </div>

      <div class="card">
        <h3>Inherited Permissions (${inheritedPerms.size})</h3>
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Permissions are inherited from the user's roles. To modify, edit the role or change the user's role assignment.
        </div>
        ${inheritedPerms.size ? `
          <div style="max-height:400px;overflow:auto;border:1px solid var(--border);padding:8px;border-radius:4px">
            ${[...inheritedPerms].sort().map(p => `<div style="padding:2px 0"><code>${escapeHtml(p)}</code></div>`).join('')}
          </div>` : '<div class="text-muted">No permissions inherited</div>'}
      </div>`;

    c.querySelector('[data-back-users]').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('users')));
    c.querySelector('#btn-edit-user')?.addEventListener('click', () =>
      openUserFormModal(userId, () =>
        import('../router.js').then(r => r.navigate('users', { view: 'user-detail', id: userId }))));
    c.querySelector('#btn-reset-pw')?.addEventListener('click', () => openResetPasswordModal(userId, user.username));
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load user</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// USER FORM MODAL (Create + Edit)
// ════════════════════════════════════════════════════════════
async function openUserFormModal(userId, onSuccess) {
  const isEdit = !!userId;

  let tpl = {}, existing = {};
  try {
    tpl = await api.users.template();
    if (isEdit) existing = await api.users.get(userId);
  } catch (e) {
    toast('error', 'Could not load form data', e.detail?.defaultUserMessage || e.message);
    return;
  }

  const offices = tpl.allowedOffices || tpl.officeOptions || [];
  const allRoles = tpl.availableRoles || tpl.allowedRoles || [];
  const allStaff = tpl.staffOptions || [];
  const selectedRoleIds = new Set((existing.selectedRoles || []).map(r => r.id));

  const mid = 'usr-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit User' : 'New User'}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Username * <input id="uf-username" class="form-control" value="${escapeHtml(existing.username || '')}" required ${isEdit ? 'disabled' : ''}/></label>
          <label>Email * <input id="uf-email" type="email" class="form-control" value="${escapeHtml(existing.email || '')}" required/></label>
          <label>First name * <input id="uf-firstname" class="form-control" value="${escapeHtml(existing.firstname || '')}" required/></label>
          <label>Last name * <input id="uf-lastname" class="form-control" value="${escapeHtml(existing.lastname || '')}" required/></label>
          <label>Office *
            <select id="uf-office" class="form-control" required>
              <option value="">Select office…</option>
              ${offices.map(o => `<option value="${o.id}" ${existing.officeId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </label>
          <label>Staff (optional)
            <select id="uf-staff" class="form-control">
              <option value="">— None —</option>
              ${allStaff.map(s => `<option value="${s.id}" ${existing.staff?.id === s.id ? 'selected' : ''}>${escapeHtml(s.displayName || s.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <h4 class="mt-3">Roles *</h4>
        <div class="text-muted small mb-2">User inherits all permissions granted to the selected roles.</div>
        <div style="max-height:200px;overflow:auto;border:1px solid var(--border);padding:8px;border-radius:4px">
          ${allRoles.map(r => `
            <label class="checkbox-row" style="display:block; padding:4px 0">
              <input type="checkbox" class="uf-role-chk" value="${r.id}" ${selectedRoleIds.has(r.id) ? 'checked' : ''}/>
              <b>${escapeHtml(r.name)}</b>
              ${r.description ? `<div class="text-muted small">${escapeHtml(r.description)}</div>` : ''}
            </label>`).join('')}
        </div>

        ${!isEdit ? `
          <h4 class="mt-3">Initial Password</h4>
          <div class="form-grid">
            <label class="checkbox-row"><input type="checkbox" id="uf-send-email"/> Send password by email (recommended)</label>
            <label>Password (if not sending by email)
              <input type="password" id="uf-password" class="form-control" autocomplete="new-password"/>
            </label>
            <label>Repeat password
              <input type="password" id="uf-password-repeat" class="form-control" autocomplete="new-password"/>
            </label>
            <label class="checkbox-row"><input type="checkbox" id="uf-must-change" checked/> User must change password on first login</label>
          </div>` : ''}

        ${isEdit ? `
          <h4 class="mt-3">Account Status</h4>
          <div class="form-grid">
            <label class="checkbox-row"><input type="checkbox" id="uf-locked" ${existing.accountNonLocked === false ? 'checked' : ''}/> Account locked</label>
            <label class="checkbox-row"><input type="checkbox" id="uf-never-expires" ${existing.passwordNeverExpires ? 'checked' : ''}/> Password never expires</label>
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="uf-save">${isEdit ? 'Save Changes' : 'Create User'}</button>
      </div>
    </div>`;

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#uf-save').addEventListener('click', async () => {
    const username = modalEl.querySelector('#uf-username').value.trim();
    const email = modalEl.querySelector('#uf-email').value.trim();
    const firstname = modalEl.querySelector('#uf-firstname').value.trim();
    const lastname = modalEl.querySelector('#uf-lastname').value.trim();
    const officeId = parseInt(modalEl.querySelector('#uf-office').value);
    const staffId = modalEl.querySelector('#uf-staff').value;
    const roles = [...modalEl.querySelectorAll('.uf-role-chk:checked')].map(cb => parseInt(cb.value));

    if (!username || !email || !firstname || !lastname || !officeId) {
      toast('warn', 'Fill required fields', ''); return;
    }
    if (!roles.length) { toast('warn', 'Select at least one role', ''); return; }

    const payload = {};
    if (!isEdit) payload.username = username;
    payload.email = email;
    payload.firstname = firstname;
    payload.lastname = lastname;
    payload.officeId = officeId;
    payload.roles = roles;
    if (staffId) payload.staffId = parseInt(staffId);

    if (!isEdit) {
      const sendEmail = modalEl.querySelector('#uf-send-email').checked;
      if (sendEmail) {
        payload.sendPasswordToEmail = true;
      } else {
        const pw = modalEl.querySelector('#uf-password').value;
        const pw2 = modalEl.querySelector('#uf-password-repeat').value;
        if (!pw || pw !== pw2) { toast('warn', 'Passwords must match', ''); return; }
        payload.password = pw;
        payload.repeatPassword = pw2;
        payload.sendPasswordToEmail = false;
      }
      payload.passwordNeverExpires = false;
      if (modalEl.querySelector('#uf-must-change').checked) payload.shouldRenewPassword = true;
    } else {
      payload.accountNonLocked = !modalEl.querySelector('#uf-locked').checked;
      payload.passwordNeverExpires = modalEl.querySelector('#uf-never-expires').checked;
    }

    try {
      if (isEdit) await api.users.update(userId, payload);
      else        await api.users.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'User updated' : 'User created', username);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

// ════════════════════════════════════════════════════════════
// RESET PASSWORD MODAL (admin function)
// ════════════════════════════════════════════════════════════
function openResetPasswordModal(userId, username) {
  const mid = 'rpw-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Reset Password — @${escapeHtml(username)}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="msg-banner b-warning mb-2">
          <i class="fa-solid fa-triangle-exclamation"></i>
          The user will need to use this password on their next login.
        </div>
        <div class="form-grid">
          <label>New password * <input type="password" id="rpw-new" class="form-control" autocomplete="new-password" required/></label>
          <label>Repeat password * <input type="password" id="rpw-repeat" class="form-control" autocomplete="new-password" required/></label>
          <label class="checkbox-row"><input type="checkbox" id="rpw-must-change" checked/> Require user to change on next login</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="rpw-save">Reset Password</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#rpw-save').addEventListener('click', async () => {
    const pw = modalEl.querySelector('#rpw-new').value;
    const pw2 = modalEl.querySelector('#rpw-repeat').value;
    if (!pw || pw !== pw2) { toast('warn', 'Passwords must match', ''); return; }

    const payload = {};
    payload.password = pw;
    payload.repeatPassword = pw2;
    if (modalEl.querySelector('#rpw-must-change').checked) payload.shouldRenewPassword = true;

    try {
      await api.users.update(userId, payload);
      modalEl.remove();
      toast('success', 'Password reset', 'User notified to log in with new password');
    } catch (e) { toast('error', 'Reset failed', e.detail?.defaultUserMessage || e.message); }
  });
}



// ════════════════════════════════════════════════════════════
// TAB 1 — ROLES & PERMISSIONS
// ════════════════════════════════════════════════════════════
async function loadRoles(c) {
  const el = c.querySelector('#usr-1');
  try {
    const res = await api.roles.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Roles &amp; Permissions</h3>
          <span class="text-muted">${list.length} role${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_ROLE') ? `<button class="btn-primary" id="btn-new-role"><i class="fa-solid fa-plus"></i> New Role</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Roles bundle permissions. Assign roles to users on the Users tab to grant access.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Description</th><th>Permissions</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td><b>${escapeHtml(r.name)}</b></td>
              <td>${escapeHtml(r.description || '—')}</td>
              <td>${num(r.permissionCount || r.permissions?.length || 0)}</td>
              <td>${r.disabled ? sb('Disabled') : sb('Active')}</td>
              <td class="text-right">
                ${can('READ_ROLE') ? `<button class="btn-mini" data-view-role="${r.id}">Permissions</button>` : ''}
                ${can('UPDATE_ROLE') ? `<button class="btn-mini" data-edit-role="${r.id}">Edit</button>` : ''}
                ${can('DISABLE_ROLE') && !r.disabled ? `<button class="btn-mini btn-warning" data-disable-role="${r.id}">Disable</button>` : ''}
                ${can('ENABLE_ROLE')  &&  r.disabled ? `<button class="btn-mini btn-success" data-enable-role="${r.id}">Enable</button>` : ''}
                ${can('DELETE_ROLE') ? `<button class="btn-mini btn-danger" data-del-role="${r.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-user-shield"></i>
          <h3>No roles defined</h3>
          ${can('CREATE_ROLE') ? `<div class="text-muted mt-2">Create your first role to begin granting access.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-role')?.addEventListener('click', () => openRoleFormModal(null, () => loadRoles(c)));

    el.querySelectorAll('[data-view-role]').forEach(b => b.addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('users', { view: 'role-detail', id: b.dataset.viewRole }))));

    el.querySelectorAll('[data-edit-role]').forEach(b => b.addEventListener('click', () =>
      openRoleFormModal(b.dataset.editRole, () => loadRoles(c))));

    el.querySelectorAll('[data-disable-role]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Disable role?', message: 'Users with this role will lose access immediately.', danger: true, confirmText: 'Disable' })) return;
      try { await api.roles.disable(b.dataset.disableRole); toast('success', 'Role disabled', ''); loadRoles(c); }
      catch (e) { toast('error', 'Disable failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-enable-role]').forEach(b => b.addEventListener('click', async () => {
      try { await api.roles.enable(b.dataset.enableRole); toast('success', 'Role enabled', ''); loadRoles(c); }
      catch (e) { toast('error', 'Enable failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-role]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete role?',
        message: 'This will fail if any user is currently assigned this role.',
        danger: true, confirmText: 'Delete'
      })) return;
      try { await api.roles.delete(b.dataset.delRole); toast('success', 'Role deleted', ''); loadRoles(c); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// ROLE FORM MODAL (Create + Edit basic info)
// ════════════════════════════════════════════════════════════
async function openRoleFormModal(roleId, onSuccess) {
  const isEdit = !!roleId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.roles.get(roleId); } catch {}
  }

  const mid = 'role-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit Role' : 'New Role'}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Role name * <input id="rf-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
          <label class="full">Description <textarea id="rf-desc" class="form-control" rows="3">${escapeHtml(existing.description || '')}</textarea></label>
        </div>
        ${!isEdit ? `
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            After creating the role, click <b>Permissions</b> on the role list to grant specific access rights.
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="rf-save">${isEdit ? 'Save Changes' : 'Create Role'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#rf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#rf-name').value.trim();
    const description = modalEl.querySelector('#rf-desc').value.trim();
    if (!name) { toast('warn', 'Enter a role name', ''); return; }

    const payload = {};
    payload.name = name;
    if (description) payload.description = description;

    try {
      if (isEdit) await api.roles.update(roleId, payload);
      else        await api.roles.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Role updated' : 'Role created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// ROLE DETAIL — PERMISSIONS MATRIX EDITOR
// ════════════════════════════════════════════════════════════
async function renderRoleDetail(c, roleId) {
  c.innerHTML = `<div class="empty-state-row">Loading role…</div>`;
  try {
    const role = await api.roles.get(roleId);
    const permData = role.permissionUsageData || [];

    // Group permissions by code prefix (CREATE_, READ_, UPDATE_, DELETE_, etc.)
    // and by entity (extracted from code suffix). Group by "grouping" field where available.
    const grouped = {};
    permData.forEach(p => {
      const group = p.grouping || extractGroup(p.code);
      (grouped[group] ||= []).push(p);
    });
    const groupKeys = Object.keys(grouped).sort();
    const selectedCount = permData.filter(p => p.selected).length;

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(role.name)}</h1>
          <div class="text-muted">
            ${escapeHtml(role.description || '—')} ·
            <b>${selectedCount}</b> of ${permData.length} permissions granted
            ${role.disabled ? ' · <span class="badge b-warning">Disabled</span>' : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" data-back-roles><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${can('UPDATE_ROLE') ? `<button class="btn-primary" id="btn-save-perms"><i class="fa-solid fa-save"></i> Save Permissions</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="filter-bar mb-3">
          <input id="perm-search" class="form-control" placeholder="Filter permissions…" autocomplete="off"/>
          ${can('UPDATE_ROLE') ? `
            <button class="btn-secondary" id="perm-select-all">Select All</button>
            <button class="btn-secondary" id="perm-clear-all">Clear All</button>
            <button class="btn-secondary" id="perm-select-readonly">Read-only Only</button>` : ''}
        </div>

        <div id="perm-groups">
          ${groupKeys.map(g => {
            const perms = grouped[g].sort((a, b) => a.code.localeCompare(b.code));
            const groupSelected = perms.filter(p => p.selected).length;
            return `
              <div class="perm-group mb-3" data-group="${escapeHtml(g)}">
                <div class="section-header" style="cursor:pointer" data-toggle-group>
                  <h4><i class="fa-solid fa-chevron-down"></i> ${escapeHtml(g)}</h4>
                  <div>
                    <span class="text-muted">${groupSelected}/${perms.length}</span>
                    ${can('UPDATE_ROLE') ? `<button class="btn-mini" data-group-toggle="${escapeHtml(g)}">Toggle All</button>` : ''}
                  </div>
                </div>
                <div class="perm-list" style="padding:8px 12px">
                  ${perms.map(p => `
                    <label class="checkbox-row" style="display:flex; align-items:center; padding:3px 0">
                      <input type="checkbox" class="perm-chk" data-code="${escapeHtml(p.code)}" data-group="${escapeHtml(g)}" ${p.selected ? 'checked' : ''} ${can('UPDATE_ROLE') ? '' : 'disabled'}/>
                      <code style="margin-left:8px">${escapeHtml(p.code)}</code>
                      ${p.actionName && p.entityName ? `<span class="text-muted small" style="margin-left:auto">${escapeHtml(p.actionName)} ${escapeHtml(p.entityName)}</span>` : ''}
                    </label>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    c.querySelector('[data-back-roles]').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('users')));

    // Toggle group panels
    c.querySelectorAll('[data-toggle-group]').forEach(h => h.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // ignore button clicks
      const panel = h.parentElement.querySelector('.perm-list');
      const icon = h.querySelector('i');
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? '' : 'none';
      icon.className = hidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
    }));

    // Per-group toggle
    c.querySelectorAll('[data-group-toggle]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = b.dataset.groupToggle;
      const checkboxes = c.querySelectorAll(`.perm-chk[data-group="${group}"]`);
      const allChecked = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
      updateCounts();
    }));

    function updateCounts() {
      c.querySelectorAll('.perm-group').forEach(g => {
        const total = g.querySelectorAll('.perm-chk').length;
        const checked = g.querySelectorAll('.perm-chk:checked').length;
        const span = g.querySelector('.section-header span.text-muted');
        if (span) span.textContent = `${checked}/${total}`;
      });
    }

    c.querySelectorAll('.perm-chk').forEach(cb => cb.addEventListener('change', updateCounts));

    // Filter
    c.querySelector('#perm-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      c.querySelectorAll('.perm-group').forEach(g => {
        let groupHasMatch = false;
        g.querySelectorAll('.perm-chk').forEach(cb => {
          const code = cb.dataset.code.toLowerCase();
          const match = !q || code.includes(q);
          cb.closest('label').style.display = match ? '' : 'none';
          if (match) groupHasMatch = true;
        });
        g.style.display = groupHasMatch ? '' : 'none';
      });
    });

    // Bulk select buttons
    c.querySelector('#perm-select-all')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => cb.checked = true);
      updateCounts();
    });
    c.querySelector('#perm-clear-all')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => cb.checked = false);
      updateCounts();
    });
    c.querySelector('#perm-select-readonly')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => {
        cb.checked = cb.dataset.code.startsWith('READ_');
      });
      updateCounts();
    });

    // Save
    c.querySelector('#btn-save-perms')?.addEventListener('click', async () => {
      const permissions = {};
      c.querySelectorAll('.perm-chk').forEach(cb => {
        permissions[cb.dataset.code] = cb.checked;
      });
      try {
        await api.roles.updatePermissions(roleId, { permissions });
        toast('success', 'Permissions saved', `${Object.values(permissions).filter(Boolean).length} granted`);
      } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
    });
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load role</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// Extract entity grouping from permission code (e.g. READ_CLIENT → CLIENT)
function extractGroup(code) {
  if (!code) return 'Other';
  // Common Fineract action prefixes
  const prefixes = ['CREATE_', 'READ_', 'UPDATE_', 'DELETE_', 'APPROVE_', 'REJECT_', 'ACTIVATE_',
                    'CLOSE_', 'DISBURSE_', 'WITHDRAW_', 'EXECUTE_', 'PAY_', 'WAIVE_',
                    'ENABLE_', 'DISABLE_', 'IMPORT_', 'EXPORT_'];
  let entity = code;
  for (const p of prefixes) {
    if (code.startsWith(p)) { entity = code.substring(p.length); break; }
  }
  // Strip _CHECKER or _MAKER suffix if present
  entity = entity.replace(/_CHECKER$|_MAKER$/, '');
  return entity || 'Other';
}

// ════════════════════════════════════════════════════════════
// TAB 2 — PASSWORD POLICY
// ════════════════════════════════════════════════════════════
async function loadPasswordPolicy(c) {
  const el = c.querySelector('#usr-2');
  try {
    const prefs = await api.password.preferences();
    const list = Array.isArray(prefs?.activePasswordValidationPolicy)
      ? prefs.activePasswordValidationPolicy
      : (Array.isArray(prefs) ? prefs : (prefs?.policies || []));

    // Fineract returns activePasswordValidationPolicy as single object, with a list of available policies
    const allPolicies = prefs.activePasswordValidationPolicy
      ? [prefs.activePasswordValidationPolicy, ...(prefs.policies || [])]
      : list;
    const activeId = prefs.activePasswordValidationPolicy?.id || prefs.activePolicyId;

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Password Policy</h3>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Choose the active password validation policy. All new and updated passwords must satisfy the selected policy.
      </div>

      ${allPolicies.length ? `
        <div class="form-grid">
          ${allPolicies.map(p => `
            <label class="checkbox-row" style="display:block; padding:12px; border:1px solid var(--border); border-radius:4px; margin-bottom:8px">
              <input type="radio" name="pwd-policy" value="${p.id}" ${p.id === activeId ? 'checked' : ''} ${can('UPDATE_PASSWORD_PREFERENCES') ? '' : 'disabled'}/>
              <b>${escapeHtml(p.key || p.name || '—')}</b>
              <div class="text-muted small mt-1">${escapeHtml(p.description || 'No description')}</div>
            </label>`).join('')}
        </div>

        <div class="mt-3">
          ${can('UPDATE_PASSWORD_PREFERENCES') ? `<button class="btn-primary" id="btn-save-policy">Apply Selected Policy</button>` : ''}
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-shield-halved"></i>
          <h3>No password policies available</h3>
          <div class="text-muted">Password policies are configured server-side by Fineract administrators.</div>
        </div>`}`;

    el.querySelector('#btn-save-policy')?.addEventListener('click', async () => {
      const selected = el.querySelector('input[name="pwd-policy"]:checked');
      if (!selected) { toast('warn', 'Select a policy', ''); return; }
      try {
        await api.password.updatePreferences({ validationPolicyId: parseInt(selected.value) });
        toast('success', 'Password policy updated', '');
        loadPasswordPolicy(c);
      } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Password preferences not available: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 3 — TWO-FACTOR AUTHENTICATION CONFIGURATION
// ════════════════════════════════════════════════════════════
async function loadTwoFactorConfig(c) {
  const el = c.querySelector('#usr-3');
  try {
    const config = await api.twoFactor.config.get();
    // Fineract returns an array of config entries [{name, value}] or an object
    const entries = Array.isArray(config) ? config : Object.entries(config || {}).map(([name, value]) => ({ name, value }));

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Two-Factor Authentication (Tenant Configuration)</h3>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Tenant-wide 2FA configuration. Individual users opt in via their profile.
      </div>

      ${entries.length ? `
        <table class="table">
          <thead><tr>
            <th>Setting</th><th>Current Value</th>
            <th>${can('UPDATE_TWOFACTOR_CONFIG') ? 'New Value' : ''}</th>
          </tr></thead>
          <tbody>${entries.map((e, i) => {
            const isBool = typeof e.value === 'boolean' || ['true', 'false'].includes(String(e.value).toLowerCase());
            const isNum = !isBool && (!isNaN(parseFloat(e.value)) && isFinite(e.value));
            const inputId = `tfa-${i}`;
            let input = '';
            if (can('UPDATE_TWOFACTOR_CONFIG')) {
              if (isBool) {
                input = `<select id="${inputId}" class="form-control" data-name="${escapeHtml(e.name)}">
                  <option value="true" ${e.value === true || e.value === 'true' ? 'selected' : ''}>true</option>
                  <option value="false" ${e.value === false || e.value === 'false' ? 'selected' : ''}>false</option>
                </select>`;
              } else if (isNum) {
                input = `<input id="${inputId}" type="number" class="form-control" data-name="${escapeHtml(e.name)}" value="${escapeHtml(String(e.value))}"/>`;
              } else {
                input = `<input id="${inputId}" class="form-control" data-name="${escapeHtml(e.name)}" value="${escapeHtml(String(e.value || ''))}"/>`;
              }
            }
            return `
              <tr>
                <td><code>${escapeHtml(e.name)}</code></td>
                <td>${escapeHtml(String(e.value ?? '—'))}</td>
                <td>${input}</td>
              </tr>`;
          }).join('')}</tbody>
        </table>

        <div class="mt-3">
          ${can('UPDATE_TWOFACTOR_CONFIG') ? `<button class="btn-primary" id="btn-save-tfa">Save Changes</button>` : ''}
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-shield"></i>
          <h3>2FA Configuration unavailable</h3>
          <div class="text-muted">This Fineract tenant may not have two-factor authentication enabled at the platform level.</div>
        </div>`}`;

    el.querySelector('#btn-save-tfa')?.addEventListener('click', async () => {
      const payload = {};
      el.querySelectorAll('[data-name]').forEach(input => {
        let val = input.value.trim();
        // Coerce booleans and numbers back
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(parseFloat(val)) && isFinite(val) && val !== '') val = parseFloat(val);
        payload[input.dataset.name] = val;
      });
      try {
        await api.twoFactor.config.update(payload);
        toast('success', '2FA config saved', '');
        loadTwoFactorConfig(c);
      } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">2FA configuration not available on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}