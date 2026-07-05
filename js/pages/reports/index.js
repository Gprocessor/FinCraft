/* FinCraft · pages/reports/index.js — render() entry point — builds the tab shell.
   Auto-split from the original monolithic pages/reports.js for maintainability. */

import { loadManageReports } from './manage-reports.js';
import { loadRunReports } from './run-reports.js';
import { TABS } from './shared.js';

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Reports</h1>
        <div class="text-muted">Standard, ad-hoc &amp; custom report definitions</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="rep-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="rep-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="rep-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = { 0: loadRunReports, 1: loadManageReports };
  const loaded = {};

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    if (loaders[idx] && !loaded[idx]) { loaded[idx] = true; loaders[idx](c); }
  }));

  loadRunReports(c);
  loaded[0] = true;
}
