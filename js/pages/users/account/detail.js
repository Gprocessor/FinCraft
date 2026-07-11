/* FinCraft · pages/users/account/detail.js — user detail view plus its form/reset-password modals.
   Auto-split from the original monolithic pages/users/account.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmtDate, ini } from '../../../utils.js';
import { extractFineractError } from '../../../ui/dom-helpers.js';
import { can } from '../shared.js';

export async function renderUserDetail(c, userId) {
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
          ${can('CHANGEPWD_USER') ? `<button class="btn-secondary" id="btn-reset-pw"><i class="fa-solid fa-key"></i> Reset Password</button>` : ''}
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
      import('../../../router.js').then(r => r.navigate('users')));
    c.querySelector('#btn-edit-user')?.addEventListener('click', () =>
      openUserFormModal(userId, () =>
        import('../../../router.js').then(r => r.navigate('users', { view: 'user-detail', id: userId }))));
    c.querySelector('#btn-reset-pw')?.addEventListener('click', () => openResetPasswordModal(userId, user.username));
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load user</b></div>
      <div class="text-muted mt-2">${escapeHtml(extractFineractError(e))}</div>
    </div></div>`;
  }
}

export async function openUserFormModal(userId, onSuccess) {
  const isEdit = !!userId;

  let tpl = {}, existing = {};
  try {
    tpl = await api.users.template();
    if (isEdit) existing = await api.users.get(userId);
  } catch (e) {
    toast('error', 'Could not load form data', extractFineractError(e));
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
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
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
      toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e));
    }
  });
}

function openResetPasswordModal(userId, username) {
  const mid = 'rpw-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
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
      // Fineract exposes a dedicated POST /users/{userId}/pwd for password
      // changes (UsersApiResource#changePassword, gated by CHANGEPWD_USER).
      // The generic PUT /users/{userId} update endpoint is a different
      // resource and isn't guaranteed to validate/accept a password change
      // the same way — see js/api/auth-account.js:makePasswordAPI().
      await api.password.change(userId, payload);
      modalEl.remove();
      toast('success', 'Password reset', 'User notified to log in with new password');
    } catch (e) { toast('error', 'Reset failed', extractFineractError(e)); }
  });
}
