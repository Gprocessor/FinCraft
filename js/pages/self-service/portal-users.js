/* FinCraft · pages/self-service/portal-users.js — self-service portal user tab loader and modals.
   Auto-split from the original monolithic pages/self-service.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, fmtDate, ini, num, sb } from '../../utils.js';
import { can } from './shared.js';
import { extractFineractError } from '../../ui/dom-helpers.js';

export async function loadPortalUsers(c) {
  const el = c.querySelector('#ss-0');
  el.innerHTML = '<div class="empty-state-row">Loading portal users…</div>';

  try {
    const res = await api.selfService.users();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    // KPIs
    const activeCount   = list.filter(u => u.passwordExpired !== true && u.accountNonLocked !== false).length;
    const lockedCount   = list.filter(u => u.accountNonLocked === false).length;
    const expiredCount  = list.filter(u => u.passwordExpired).length;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Total Portal Users</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value">${num(activeCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Locked</div><div class="kpi-value">${num(lockedCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Password Expired</div><div class="kpi-value">${num(expiredCount)}</div></div>
      </div>

      <div class="section-header mb-2">
        <div class="filter-bar" style="flex:1">
          <input id="ss-user-search" class="form-control" placeholder="Search username, email, client…" autocomplete="off"/>
          <select id="ss-user-status" class="form-control">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="expired">Password Expired</option>
          </select>
        </div>
        <button class="btn-secondary" id="btn-ss-info"><i class="fa-solid fa-circle-info"></i> About Self-Service</button>
      </div>

      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Portal users are self-registered via the self-service mobile/web app. Admin can activate, reset password, and view linked clients.
      </div>

      <div id="ss-user-table"></div>`;

    function draw(rows) {
      const tableWrap = el.querySelector('#ss-user-table');
      if (!rows.length) {
        tableWrap.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-mobile-screen"></i>
            <h3>No portal users found</h3>
            <div class="text-muted mt-2">Users self-register via the self-service mobile/web app.</div>
          </div>`;
        return;
      }

      tableWrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Username</th><th>Linked Client</th><th>Email</th>
            <th>Last Login</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows.map(u => `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="avatar">${ini(u.username || '?')}</div>
                  <div><b>${escapeHtml(u.username)}</b>
                  ${u.firstname || u.lastname ? `<div class="text-muted small">${escapeHtml((u.firstname || '') + ' ' + (u.lastname || ''))}</div>` : ''}
                  </div>
                </div>
              </td>
              <td>${u.clientId ? `<a href="#" data-ss-view-client="${u.clientId}">${escapeHtml(u.clientName || ('#' + u.clientId))}</a>` : '—'}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>${fmtDate(u.lastLogin) || fmtDate(u.lastTimePasswordUpdated) || '—'}</td>
              <td>
                ${u.accountNonLocked === false ? '<span class="badge b-danger">Locked</span>' : ''}
                ${u.passwordExpired ? '<span class="badge b-warning">Expired</span>' : ''}
                ${u.accountNonLocked !== false && !u.passwordExpired ? sb('Active') : ''}
              </td>
              <td class="text-right">
                ${can('CHANGEPWD_USER') ? `<button class="btn-mini" data-ss-reset="${u.id}" data-ss-username="${escapeHtml(u.username)}">Reset Password</button>` : ''}
                ${can('UPDATE_USER') && u.accountNonLocked === false ? `<button class="btn-mini btn-success" data-ss-unlock="${u.id}">Unlock</button>` : ''}
                ${u.clientId ? `<button class="btn-mini" data-ss-view-client="${u.clientId}">View Client</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>`;

      tableWrap.querySelectorAll('[data-ss-reset]').forEach(b => b.addEventListener('click', () =>
        openResetPortalPasswordModal(b.dataset.ssReset, b.dataset.ssUsername)
      ));

      tableWrap.querySelectorAll('[data-ss-unlock]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({ title: 'Unlock portal user?', confirmText: 'Unlock' })) return;
        try {
          await api.users.update(b.dataset.ssUnlock, { accountNonLocked: true });
          toast('success', 'Account unlocked', '');
          loadPortalUsers(c);
        } catch (e) { toast('error', 'Unlock failed', extractFineractError(e)); }
      }));

      tableWrap.querySelectorAll('[data-ss-view-client]').forEach(b => b.addEventListener('click', () =>
        import('../../router.js').then(r => r.navigate('client-detail', { id: b.dataset.ssViewClient }))
      ));
    }

    function applyFilters() {
      const q = el.querySelector('#ss-user-search').value.toLowerCase().trim();
      const status = el.querySelector('#ss-user-status').value;

      let filtered = list;
      if (q) filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.clientName || '').toLowerCase().includes(q));
      if (status === 'locked')  filtered = filtered.filter(u => u.accountNonLocked === false);
      if (status === 'expired') filtered = filtered.filter(u => u.passwordExpired);
      if (status === 'active')  filtered = filtered.filter(u => u.accountNonLocked !== false && !u.passwordExpired);

      draw(filtered);
    }

    let t;
    el.querySelector('#ss-user-search').addEventListener('input', () => {
      clearTimeout(t); t = setTimeout(applyFilters, 250);
    });
    el.querySelector('#ss-user-status').addEventListener('change', applyFilters);

    el.querySelector('#btn-ss-info')?.addEventListener('click', () => openSelfServiceInfoModal());

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Self-service not enabled on this tenant: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}

function openResetPortalPasswordModal(userId, username) {
  const mid = 'ss-reset-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>Reset Password — @' + escapeHtml(username) + '</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<div class="msg-banner b-warning mb-2">' +
        '<i class="fa-solid fa-triangle-exclamation"></i> ' +
        'The user will need to use this new password on their next login to the portal.' +
      '</div>' +
      '<div class="form-grid">' +
        '<label>New password * <input type="password" id="rpp-new" class="form-control" autocomplete="new-password" required/></label>' +
        '<label>Repeat password * <input type="password" id="rpp-repeat" class="form-control" autocomplete="new-password" required/></label>' +
        '<label class="checkbox-row"><input type="checkbox" id="rpp-must-change" checked/> Require user to change on next login</label>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Cancel</button>' +
      '<button class="btn-primary" id="rpp-save">Reset Password</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#rpp-save').addEventListener('click', async () => {
    const pw = modalEl.querySelector('#rpp-new').value;
    const pw2 = modalEl.querySelector('#rpp-repeat').value;
    if (!pw || pw !== pw2) { toast('warn', 'Passwords must match', ''); return; }

    const payload = {};
    payload.password = pw;
    payload.repeatPassword = pw2;
    if (modalEl.querySelector('#rpp-must-change').checked) payload.shouldRenewPassword = true;

    try {
      // POST /users/{userId}/pwd (UsersApiResource#changePassword), not the
      // generic PUT /users/{userId} update endpoint — see api/auth-account.js.
      await api.password.change(userId, payload);
      modalEl.remove();
      toast('success', 'Password reset', 'User must log in with new password');
    } catch (e) { toast('error', 'Reset failed', extractFineractError(e)); }
  });
}

function openSelfServiceInfoModal() {
  const mid = 'ss-info-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>About Self-Service</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<h4>What is Self-Service?</h4>' +
      '<div class="text-muted mb-3">' +
        'Self-Service is a parallel API surface that lets end customers manage their own accounts via mobile/web apps without staff intervention.' +
      '</div>' +
      '<h4>Registration Flow</h4>' +
      '<ol style="line-height:1.8">' +
        '<li>Customer registers via the self-service mobile/web app</li>' +
        '<li>Fineract creates a portal user linked to a real client account</li>' +
        '<li>Admin reviews and activates the user (if required by tenant config)</li>' +
        '<li>Customer can then view accounts, see balances, and create third-party transfer (TPT) beneficiaries</li>' +
      '</ol>' +
      '<h4 class="mt-3">Admin Tasks Here</h4>' +
      '<ul style="line-height:1.8">' +
        '<li>View list of registered portal users</li>' +
        '<li>Reset password for users locked out</li>' +
        '<li>Unlock accounts</li>' +
        '<li>Manage third-party transfer (TPT) beneficiaries</li>' +
      '</ul>' +
      '<div class="msg-banner b-info mt-3">' +
        '<i class="fa-solid fa-circle-info"></i> ' +
        'New portal user registrations come from the customer-facing app, not from this admin interface.' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Close</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
}
