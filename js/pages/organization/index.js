/* FinCraft · pages/organization/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/organization.js for maintainability. */

import { api } from '../../api.js';
import { loadAdhocQueries, loadBulkImports, loadCurrencies, loadEntityDatatableChecks, loadExternalAssetOwners, loadFunds, loadHolidays, loadLoanOriginators, loadOffices, loadPaymentTypes, loadSmsCampaigns, loadStaff, loadStandingInstructions, loadTellers, loadWorkingDays } from './loaders.js';
import { TABS } from './shared.js';

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Organization</h1>
        <div class="text-muted">Offices, staff, holidays, operational config & SMS campaigns</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="og-tabs" style="flex-wrap:wrap">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="og-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="og-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    // Lazy-load on first click for new tabs
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    const newLoaders = {
      8: loadFunds,
      9: loadAdhocQueries,
      10: loadLoanOriginators,
      11: loadExternalAssetOwners,
      12: loadEntityDatatableChecks,
      13: loadBulkImports,
      14: loadSmsCampaigns
    };
    if (newLoaders[idx] && !tab.dataset.loaded) {
      tab.dataset.loaded = '1';
      newLoaders[idx](c);
    }
  }));

  // Eager-load original 8 tabs (preserves existing behaviour)
  let officeList = [];
  const officesRes = await api.offices.list().catch(() => []);
  officeList = Array.isArray(officesRes) ? officesRes : [];

  loadOffices(c, officeList);
  loadStaff(c);
  loadTellers(c);
  loadHolidays(c, officeList);
  loadWorkingDays(c);
  loadCurrencies(c);
  loadPaymentTypes(c);
  loadStandingInstructions(c);
}
