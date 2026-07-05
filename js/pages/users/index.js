/* FinCraft · pages/users/index.js — render() entry point — builds the tab shell.
   Auto-split from the original monolithic pages/users.js for maintainability. */

import { loadUsersList, renderUserDetail } from './account.js';
import { loadRoles, renderRoleDetail } from './roles.js';
import { loadPasswordPolicy, loadTwoFactorConfig } from './security.js';
import { TABS } from './shared.js';

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
      loaders[idx](c);
    }
  }));

  loadUsersList(c);
  loaded[0] = true;
}
