/* FinCraft · misc.js — Profile, Settings, Navigation, Remittances
   Other views (users, notifications, templates, self-service, collaterals, surveys)
   have been migrated to dedicated standalone pages and are no longer routed through here. */

import { api } from '../api.js';
import { sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal } from '../ui.js';
import { store } from '../store.js';
import { configureAPI } from '../api.js';

export async function render(c, params) {
  const view = params.view || 'profile';
  const VIEWS = {
    profile,
    settings,
    navigation,
    remittances
  };
  const fn = VIEWS[view] || profile;
  await fn(c);
}

// ════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════
async function profile(c) {
  const a = store.get('auth') || {};
  c.innerHTML = `
    <div class="page-header mb-3">
      <h1>Profile</h1>
      <div class="text-muted">Your account details</div>
    </div>

    <div class="card mb-3">
      <h3>Account Details</h3>
      <div id="profile-details"><div class="empty-state-row">Loading…</div></div>
    </div>

    <div class="card">
      <h3>Change Password</h3>
      <div class="form-grid">
        <label>Current Password <input type="password" id="pw-cur" class="form-control" autocomplete="current-password"/></label>
        <label>New Password <input type="password" id="pw-new" class="form-control" autocomplete="new-password"/></label>
        <label>Confirm <input type="password" id="pw-cfm" class="form-control" autocomplete="new-password"/></label>
      </div>
      <div class="mt-3">
        <button class="btn-primary" id="pw-save">Update Password</button>
      </div>
    </div>`;

  const detailEl = c.querySelector('#profile-details');
  const userId = a.userId;
  if (userId) {
    try {
      const u = await api.users.get(userId);
      const roles = (u.roles || []).map(r => escapeHtml(r.name || '')).filter(Boolean).join(', ') || '—';
      detailEl.innerHTML = `
        <dl class="dl-grid">
          <dt>Username</dt><dd>${escapeHtml(u.username || a.username || '—')}</dd>
          <dt>Email</dt><dd>${escapeHtml(u.email || '—')}</dd>
          <dt>First Name</dt><dd>${escapeHtml(u.firstname || '—')}</dd>
          <dt>Last Name</dt><dd>${escapeHtml(u.lastname || '—')}</dd>
          <dt>Office</dt><dd>${escapeHtml(u.officeName || '—')}</dd>
          <dt>Roles</dt><dd>${roles}</dd>
          <dt>Tenant</dt><dd>${escapeHtml(a.tenantId || 'default')}</dd>
          <dt>Server</dt><dd><code>${escapeHtml(a.serverUrl || '—')}</code></dd>
        </dl>`;
    } catch {
      detailEl.innerHTML = `
        <dl class="dl-grid">
          <dt>Username</dt><dd>${escapeHtml(a.username || '—')}</dd>
          <dt>Tenant</dt><dd>${escapeHtml(a.tenantId || 'default')}</dd>
          <dt>Server</dt><dd><code>${escapeHtml(a.serverUrl || '—')}</code></dd>
        </dl>`;
    }
  } else {
    detailEl.innerHTML = `
      <dl class="dl-grid">
        <dt>Username</dt><dd>${escapeHtml(a.username || '—')}</dd>
        <dt>Tenant</dt><dd>${escapeHtml(a.tenantId || 'default')}</dd>
        <dt>Server</dt><dd><code>${escapeHtml(a.serverUrl || '—')}</code></dd>
      </dl>`;
  }

  c.querySelector('#pw-save').addEventListener('click', async () => {
    const cur = c.querySelector('#pw-cur').value;
    const nw  = c.querySelector('#pw-new').value;
    const cfm = c.querySelector('#pw-cfm').value;

    if (!cur || !nw) { toast('warn', 'Incomplete', 'Enter current and new password'); return; }
    if (nw !== cfm) { toast('error', 'Mismatch', 'New passwords do not match'); return; }

    const btn = c.querySelector('#pw-save');
    btn.disabled = true;
    try {
      // Verify the current password is correct
      await api.auth(a.username, cur);
    } catch {
      toast('error', 'Incorrect password', 'Current password is not correct');
      btn.disabled = false;
      return;
    }

    try {
      const userId = store.get('auth')?.userId;
      if (userId) await api.users.update(userId, { password: nw, repeatPassword: cfm });
      toast('success', 'Password updated', 'Sign in with your new password next time');
      c.querySelector('#pw-cur').value = '';
      c.querySelector('#pw-new').value = '';
      c.querySelector('#pw-cfm').value = '';
    } catch (e) {
      toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
function settings(c) {
  const a = store.get('auth') || {};
  c.innerHTML = `
    <div class="page-header mb-3">
      <h1>Settings</h1>
      <div class="text-muted">App preferences &amp; connection</div>
    </div>

    <div class="card mb-3">
      <h3>Server Connection</h3>
      <div class="form-grid">
        <label>Server URL <input id="s-url" class="form-control" value="${escapeHtml(a.serverUrl || '')}"/></label>
        <label>Tenant <input id="s-tenant" class="form-control" value="${escapeHtml(a.tenantId || 'default')}"/></label>
      </div>
      <div class="mt-3">
        <button class="btn-primary" id="s-save">Save</button>
      </div>
    </div>

    <div class="card mb-3">
      <h3>Appearance</h3>
      <label class="checkbox-row">
        <input type="checkbox" id="s-theme" ${store.get('theme') === 'dark' ? 'checked' : ''}/>
        <div>
          <div><b>Dark Theme</b></div>
          <div class="text-muted small">Use dark mode</div>
        </div>
      </label>
      <label class="checkbox-row mt-2">
        <input type="checkbox" id="s-sidebar" ${store.get('sidebar') === 'collapsed' ? 'checked' : ''}/>
        <div>
          <div><b>Collapsed Sidebar</b></div>
          <div class="text-muted small">More room for content</div>
        </div>
      </label>
    </div>

    <div class="card">
      <h3>Keyboard Shortcuts</h3>
      <table class="table">
        <tbody>
          <tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd></td><td>Command palette</td></tr>
          <tr><td><kbd>ESC</kbd></td><td>Close modals</td></tr>
          <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd></td><td>New Client</td></tr>
          <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd></td><td>New Loan</td></tr>
          <tr><td><kbd>?</kbd></td><td>Help</td></tr>
        </tbody>
      </table>
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

// ════════════════════════════════════════════════════════════
// NAVIGATION (Office → Staff hierarchy)
// ════════════════════════════════════════════════════════════
async function navigation(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <h1>Navigation</h1>
      <div class="text-muted">Office &rarr; Staff hierarchy</div>
    </div>

    <div class="card">
      <div id="nav-tree"><div class="empty-state-row">Loading…</div></div>
    </div>`;

  try {
    const [offRes, staffRes] = await Promise.all([
      api.offices.list(),
      api.staff.list()
    ]);
    const offices = Array.isArray(offRes) ? offRes : [];
    const staff = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);

    c.querySelector('#nav-tree').innerHTML = offices.map(o => `
      <div class="nav-office mb-2" data-toggle>
        <h4 style="cursor:pointer; padding:6px 0">
          <i class="fa-solid fa-chevron-right"></i> ${escapeHtml(o.name)}
        </h4>
        <div class="nav-staff" style="padding-left:20px; display:none">
          ${staff.filter(s => s.officeId === o.id).map(s => `
            <div style="padding:4px 0">
              <i class="fa-solid fa-user"></i> ${escapeHtml(s.displayName)}
              <span class="text-muted small">· ${s.isLoanOfficer ? 'Loan Officer' : 'Staff'}</span>
            </div>`).join('') || '<div class="text-muted small">No staff assigned</div>'}
        </div>
      </div>`).join('');

    c.querySelectorAll('[data-toggle]').forEach(n => n.querySelector('h4').addEventListener('click', () => {
      const staff = n.querySelector('.nav-staff');
      const icon = n.querySelector('i');
      const hidden = staff.style.display === 'none';
      staff.style.display = hidden ? '' : 'none';
      icon.className = hidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
    }));
  } catch (e) {
    c.querySelector('#nav-tree').innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// REMITTANCES (placeholder — no Fineract endpoint)
// ════════════════════════════════════════════════════════════
async function remittances(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <h1>Remittances</h1>
      <div class="text-muted">Send and track remittance transfers</div>
    </div>

    <div class="card">
      <div class="section-header mb-2">
        <button class="btn-primary" id="newRemitBtn"><i class="fa-solid fa-plus"></i> New Remittance</button>
      </div>
      <table class="table">
        <thead><tr>
          <th>Ref</th><th>Sender</th><th>Beneficiary</th>
          <th class="text-right">Amount</th><th>Mode</th><th>Date</th><th>Status</th>
        </tr></thead>
        <tbody>
          <tr><td colspan="7" class="empty-state-row">No remittances yet &mdash; create one to get started.</td></tr>
        </tbody>
      </table>
      <div class="text-muted small mt-2">
        <i class="fa-solid fa-circle-info"></i>
        Remittances are tracked via integrations with external transfer providers. Configure in System &rarr; External Services.
      </div>
    </div>`;

  c.querySelector('#newRemitBtn').addEventListener('click', () => openModal('remittanceModal'));
}