/* FinCraft · pages/self-service/index.js — render() entry point — builds the tab shell.
   Auto-split from the original monolithic pages/self-service.js for maintainability. */

import { loadBeneficiaries } from './beneficiaries.js';
import { loadPortalUsers } from './portal-users.js';
import { TABS } from './shared.js';

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Self Service</h1>
        <div class="text-muted">Manage portal users and third-party transfer beneficiaries</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="ss-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="ss-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="ss-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0: loadPortalUsers,
    1: loadBeneficiaries
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

  loadPortalUsers(c);
  loaded[0] = true;
}
