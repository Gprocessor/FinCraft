/* FinCraft · pages/users/account/list.js — user list tab loader.
   Auto-split from the original monolithic pages/users/account.js for maintainability. */

import { api } from '../../../api.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { escapeHtml, ini, num, sb } from '../../../utils.js';
import { can } from '../shared.js';
import { openUserFormModal } from './detail.js';

export async function loadUsersList(c) {
  const el = c.querySelector('#usr-0');
  try {
    const [users, offices] = await Promise.all([
      api.users.list(),
      api.offices.list().catch(() => [])
    ]);
    const list = Array.isArray(users) ? users : [];
    const officeList = Array.isArray(offices) ? offices : [];

    const activeCount = list.filter(u => u.accountNonLocked !== false && !u.passwordExpired).length;
    const lockedCount = list.filter(u => u.accountNonLocked === false).length;
    const expiredCount = list.filter(u => u.passwordExpired).length;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Total Users</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value">${num(activeCount)}</div></div>
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
                    <b><a href="#" data-view-user="${u.id}">${escapeHtml(u.username)}</a></b>
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
        import('../../../router.js').then(r => r.navigate('users', { view: 'user-detail', id: b.dataset.viewUser }))));
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
