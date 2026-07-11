/* FinCraft · pages/misc/profile.js — the Profile view.
   Auto-split from the original monolithic pages/misc.js for maintainability. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';

export async function profile(c) {
  const auth = store.get('auth') || {};

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Profile</h1>
        <div class="page-subtitle">Your account details and password</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Account Details</h3></div>
        <div class="card-body" id="profile-details">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Change Password</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <label><span class="form-label">Current Password <span style="color:var(--clr-danger)">*</span></span>
              <input type="password" class="form-control" id="pw-cur" autocomplete="current-password"/>
            </label>
            <label><span class="form-label">New Password <span style="color:var(--clr-danger)">*</span></span>
              <input type="password" class="form-control" id="pw-new" autocomplete="new-password"/>
            </label>
            <label><span class="form-label">Confirm New Password <span style="color:var(--clr-danger)">*</span></span>
              <input type="password" class="form-control" id="pw-cfm" autocomplete="new-password"/>
            </label>
            <button class="btn-primary mt-2" id="pw-save">
              <i class="fa-solid fa-lock"></i> Update Password
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load user details
  const detailEl = c.querySelector('#profile-details');
  let me = null;
  if (auth.userId) {
    try { me = await api.users.get(auth.userId); } catch {}
  }

  const rolesList = (me?.roles || me?.selectedRoles || [])
    .map(r => escapeHtml(r.name || ''))
    .filter(Boolean).join(', ') || '—';

  detailEl.innerHTML = `
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Username</div><div class="info-value">${escapeHtml(me?.username || auth.username || '—')}</div></div>
      <div class="info-item"><div class="info-label">Email</div><div class="info-value">${escapeHtml(me?.email || '—')}</div></div>
      <div class="info-item"><div class="info-label">First Name</div><div class="info-value">${escapeHtml(me?.firstname || '—')}</div></div>
      <div class="info-item"><div class="info-label">Last Name</div><div class="info-value">${escapeHtml(me?.lastname || '—')}</div></div>
      <div class="info-item"><div class="info-label">Office</div><div class="info-value">${escapeHtml(me?.officeName || auth.officeName || '—')}</div></div>
      <div class="info-item"><div class="info-label">Roles</div><div class="info-value">${rolesList}</div></div>
      <div class="info-item"><div class="info-label">Tenant</div><div class="info-value mono">${escapeHtml(auth.tenantId || 'default')}</div></div>
      <div class="info-item"><div class="info-label">Server</div><div class="info-value mono" style="word-break:break-all">${escapeHtml(auth.serverUrl || '—')}</div></div>
    </div>
  `;

  // Change password handler
  c.querySelector('#pw-save').addEventListener('click', async () => {
    const cur = c.querySelector('#pw-cur').value;
    const nw  = c.querySelector('#pw-new').value;
    const cfm = c.querySelector('#pw-cfm').value;

    if (!cur || !nw) { toast('warn', 'Incomplete', 'Enter current and new password'); return; }
    if (nw !== cfm)  { toast('error', 'Mismatch', 'New passwords do not match'); return; }
    if (nw.length < 8) { toast('warn', 'Too short', 'Use at least 8 characters'); return; }

    const btn = c.querySelector('#pw-save');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating…';

    // Verify current password by attempting auth
    try {
      await api.auth(auth.username, cur);
    } catch {
      toast('error', 'Incorrect password', 'Current password is wrong');
      btn.disabled = false;
      btn.innerHTML = orig;
      return;
    }

    // Update password
    try {
      if (!auth.userId) throw new Error('Session missing user ID — sign out and back in');
      // POST /users/{userId}/pwd (UsersApiResource#changePassword), not the
      // generic PUT /users/{userId} update endpoint — see api/auth-account.js.
      await api.password.change(auth.userId, { password: nw, repeatPassword: cfm });
      toast('success', 'Password updated', 'Use the new password on next sign-in');
      c.querySelector('#pw-cur').value = '';
      c.querySelector('#pw-new').value = '';
      c.querySelector('#pw-cfm').value = '';
    } catch (e) {
      toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });
}
