/* FinCraft · misc.js
   Profile, Settings, Navigation, Remittances views.
   Other modules (users, notifications, templates, self-service, collaterals,
   surveys, datatables, SMS campaigns) are standalone — not routed through here. */

import { api, configureAPI } from '../api.js';
import { store } from '../store.js';
import { sb, escapeHtml, fmtDate, fmt } from '../utils.js';
import { toast } from '../ui.js';
import { FINERACT_DEMO } from '../config.js';

export async function render(c, params = {}) {
  const view = params.view || 'profile';
  const VIEWS = { profile, settings, navigation, remittances };
  const fn = VIEWS[view] || profile;
  await fn(c);
}

// ════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════
async function profile(c) {
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
      await api.users.update(auth.userId, { password: nw, repeatPassword: cfm });
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

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
function settings(c) {
  const auth = store.get('auth') || {};

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <div class="page-subtitle">App preferences and connection</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Server Connection</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <label><span class="form-label">Server URL</span>
              <input class="form-control" id="s-url" value="${escapeHtml(auth.serverUrl || FINERACT_DEMO.serverUrl)}"/>
            </label>
            <label><span class="form-label">Tenant ID</span>
              <input class="form-control" id="s-tenant" value="${escapeHtml(auth.tenantId || FINERACT_DEMO.tenantId)}"/>
            </label>
            <button class="btn-primary mt-2" id="s-save">
              <i class="fa-solid fa-floppy-disk"></i> Save Connection
            </button>
            <div class="msg-banner b-info mt-2" style="font-size:12px">
              <i class="fa-solid fa-circle-info"></i>
              Changing the server invalidates your current session. Sign out and back in for the change to take full effect.
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Appearance</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <label class="form-check">
              <input type="checkbox" id="s-theme" ${store.get('theme') === 'dark' ? 'checked' : ''}/>
              <span><b>Dark theme</b> — easier on the eyes</span>
            </label>
            <label class="form-check">
              <input type="checkbox" id="s-sidebar" ${store.get('sidebar') === 'collapsed' ? 'checked' : ''}/>
              <span><b>Collapsed sidebar</b> — more room for content</span>
            </label>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column:span 2">
        <div class="card-header"><h3 class="card-title">Keyboard Shortcuts</h3></div>
        <div class="card-body">
          <div class="tbl-wrap">
            <table class="tbl">
              <tbody>
                <tr><td style="width:200px"><kbd>Ctrl + K</kbd></td><td>Command palette</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close modals / panels / palette</td></tr>
                <tr><td><kbd>Ctrl + Shift + N</kbd></td><td>New Client</td></tr>
                <tr><td><kbd>Ctrl + Shift + L</kbd></td><td>New Loan</td></tr>
                <tr><td><kbd>?</kbd></td><td>Show shortcut help</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  c.querySelector('#s-save').addEventListener('click', () => {
    const url = c.querySelector('#s-url').value.trim().replace(/\/$/, '');
    const tnt = c.querySelector('#s-tenant').value.trim();
    if (!url || !tnt) { toast('warn', 'Required', 'Server URL and tenant required'); return; }
    store.patch('auth', { serverUrl: url, tenantId: tnt });
    configureAPI({ serverUrl: url, tenantId: tnt });
    toast('success', 'Saved', 'Sign out + back in to fully apply');
  });

  c.querySelector('#s-theme').addEventListener('change', e => {
    store.set('theme', e.target.checked ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', store.get('theme'));
    const icon = document.querySelector('#themeBtn i');
    if (icon) icon.className = `fa-solid fa-${e.target.checked ? 'moon' : 'sun'}`;
  });

  c.querySelector('#s-sidebar').addEventListener('change', e => {
    store.set('sidebar', e.target.checked ? 'collapsed' : 'expanded');
    document.getElementById('sidebar')?.classList.toggle('collapsed', e.target.checked);
  });
}

// ════════════════════════════════════════════════════════════
// NAVIGATION — collapsible Office → Staff tree
// ════════════════════════════════════════════════════════════
async function navigation(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Navigation</h1>
        <div class="page-subtitle">Drill down: Office → Staff → Clients</div>
      </div>
    </div>
    <div id="nav-tree" class="card">
      <div class="card-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </div>
    </div>
  `;

  try {
    const [offRes, staffRes] = await Promise.all([
      api.offices.list(),
      api.staff.list()
    ]);
    const offices = Array.isArray(offRes) ? offRes : [];
    const staff   = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);
    const tree    = c.querySelector('#nav-tree .card-body');

    if (!offices.length) {
      tree.innerHTML = '<div class="empty-state"><i class="fa-solid fa-building-circle-xmark empty-state-icon"></i><h3>No offices found</h3></div>';
      return;
    }

    tree.innerHTML = offices.map(o => {
      const officeStaff = staff.filter(s => s.officeId === o.id);
      return `
        <div class="card mb-2">
          <div class="card-header" style="cursor:pointer" data-toggle-office="${o.id}">
            <h3 class="card-title">
              <i class="fa-solid fa-chevron-right" style="font-size:9px;margin-right:6px;transition:transform 200ms" data-chevron="${o.id}"></i>
              <i class="fa-solid fa-building text-teal" style="margin-right:6px"></i>
              ${escapeHtml(o.name)}
            </h3>
            <span class="text-muted small">${officeStaff.length} staff</span>
          </div>
          <div class="card-body" data-office-body="${o.id}" style="display:none;padding-top:0">
            ${officeStaff.length ? officeStaff.map(s => `
              <div class="flex items-center gap-2" style="padding:8px 0;border-bottom:1px solid var(--border-1);cursor:pointer" data-view-staff="${s.id}" data-staff-name="${escapeHtml(s.displayName)}">
                <div class="avatar av-sm">${escapeHtml((s.displayName || '?').slice(0, 2).toUpperCase())}</div>
                <div style="flex:1">
                  <div class="fw-600">${escapeHtml(s.displayName)}</div>
                  <div class="text-muted small">${s.isLoanOfficer ? 'Loan Officer' : 'Staff'} · ${s.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <button class="btn-ghost btn-xs"><i class="fa-solid fa-arrow-right"></i></button>
              </div>
            `).join('') : '<div class="text-muted small text-center" style="padding:12px">No staff assigned</div>'}
          </div>
        </div>
      `;
    }).join('');

    // Toggle office expand
    tree.querySelectorAll('[data-toggle-office]').forEach(header =>
      header.addEventListener('click', () => {
        const id = header.dataset.toggleOffice;
        const body = tree.querySelector(`[data-office-body="${id}"]`);
        const chevron = tree.querySelector(`[data-chevron="${id}"]`);
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
      })
    );

    // Click staff to view their clients
    tree.querySelectorAll('[data-view-staff]').forEach(row =>
      row.addEventListener('click', () => {
        const staffId = row.dataset.viewStaff;
        const staffName = row.dataset.staffName;
        location.hash = `#/clients?staffId=${staffId}`;
        toast('info', staffName, 'Viewing assigned clients');
      })
    );
  } catch (e) {
    c.querySelector('#nav-tree .card-body').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load</h3>
        <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
      </div>
    `;
  }
}

// ════════════════════════════════════════════════════════════
// REMITTANCES — list account transfers + launch stepper
// ════════════════════════════════════════════════════════════
async function remittances(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Remittances</h1>
        <div class="page-subtitle">Send money to beneficiaries; view recent transfers</div>
      </div>
      <div class="page-actions">
        <button class="btn-primary btn-sm" id="newRemitBtn">
          <i class="fa-solid fa-paper-plane"></i> New Remittance
        </button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3 class="card-title">Recent Account Transfers</h3></div>
      <div id="remit-list">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </div>
    </div>

    <div class="msg-banner b-info">
      <i class="fa-solid fa-circle-info"></i>
      <div>
        <b>How remittances work in FinCraft</b><br/>
        Remittances are implemented as Fineract account-to-account transfers between two savings accounts.
        The "New Remittance" button launches a 4-step stepper (Sender → Beneficiary → Transfer → Confirm)
        and posts the transaction via the <code>/accounttransfers</code> endpoint.
      </div>
    </div>
  `;

  c.querySelector('#newRemitBtn').addEventListener('click', () =>
    import('../remit.js').then(m => m.Remit.open())
  );

  try {
    const res = await api.transfers.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const listEl = c.querySelector('#remit-list');

    if (!list.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-paper-plane empty-state-icon"></i>
          <h3>No transfers yet</h3>
          <p>Click "New Remittance" above to send your first transfer.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>Date</th>
            <th>From</th>
            <th>To</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Reference</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            ${list.map(t => `
              <tr>
                <td>${fmtDate(t.transferDate) || '—'}</td>
                <td>${escapeHtml(t.fromAccountNo || `#${t.fromAccount?.id || '—'}`)}<div class="text-muted small">${escapeHtml(t.fromClientName || '')}</div></td>
                <td>${escapeHtml(t.toAccountNo || `#${t.toAccount?.id || '—'}`)}<div class="text-muted small">${escapeHtml(t.toClientName || '')}</div></td>
                <td class="mono text-teal">${fmt(t.transferAmount || 0)}</td>
                <td>${escapeHtml(t.currency?.code || '—')}</td>
                <td class="mono small">${escapeHtml(t.transferDescription || '—')}</td>
                <td>${sb(t.transferType?.value || 'Completed')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    c.querySelector('#remit-list').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load transfers</h3>
        <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
      </div>
    `;
  }
}