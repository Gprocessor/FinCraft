/* FinCraft · pages/system/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/system.js for maintainability. */

import { loadAccountNumberPrefs, loadAuditTrails, loadCOB, loadCodes, loadConfigurations, loadEntityMappings, loadExternalEvents, loadExternalServices, loadHooks, loadJobs, loadMakerCheckerConfig, loadMigrationLinks, loadRoles, loadSurveys, loadSystemInfo } from './loaders.js';
import { TABS } from './shared.js';

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>System</h1>
        <div class="text-muted">Platform configuration &amp; maintenance</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="sy-tabs" style="flex-wrap:wrap">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="sy-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="sy-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0:  loadConfigurations,
    1:  loadAuditTrails,
    2:  loadCodes,
    3:  loadRoles,
    4:  loadJobs,
    5:  loadExternalServices,
    6:  loadCOB,
    7:  loadHooks,
    8:  loadAccountNumberPrefs,
    9:  loadEntityMappings,
    10: loadExternalEvents,
    11: loadMakerCheckerConfig,
    12: loadSurveys,
    13: loadMigrationLinks,
    14: loadSystemInfo
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

  loadConfigurations(c);
  loaded[0] = true;
}
