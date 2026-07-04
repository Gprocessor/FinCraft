/* FinCraft · pages/system/loaders/access.js — roles & permissions tab loader.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, num, sb } from '../../../utils.js';

export async function loadRoles(c) {
  const el = c.querySelector('#sy-3');
  el.innerHTML = '<div class="empty-state-row">Loading role summary…</div>';
  try {
    const roles = await api.roles.list();
    const list = Array.isArray(roles) ? roles : [];

    el.innerHTML = `
      <div class="msg-banner b-info mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Full role &amp; permission editing is now in the dedicated Users &amp; Roles module.
        This tab provides a read-only summary.
      </div>

      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} role${list.length !== 1 ? 's' : ''}</span>
        ${can('READ_ROLE') ? `<button class="btn-primary" id="btn-go-roles"><i class="fa-solid fa-arrow-right"></i> Manage in Users Module</button>` : ''}
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr><th>Role</th><th>Description</th><th>Status</th></tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td><b>${escapeHtml(r.name)}</b></td>
              <td>${escapeHtml(r.description || '—')}</td>
              <td>${r.disabled ? sb('Disabled') : sb('Active')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No roles defined</div>'}`;

    el.querySelector('#btn-go-roles')?.addEventListener('click', () =>
      import('../../../router.js').then(r => r.navigate('users'))
    );
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
