/* FinCraft · pages/accounting/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/accounting.js for maintainability. */

import { loadAccountingRules, loadChartOfAccounts, loadFinancialActivities, loadFrequentPostings, loadGLClosure, loadJournalEntries, loadOpeningBalances, loadProvisioning, loadRunAccruals } from './loaders.js';
import { TABS, _glCache, resetGlCache } from './shared.js';

export async function render(c) {
  resetGlCache();

  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Accounting</h1>
        <div class="text-muted">GL, journals, rules, closures, provisioning, accruals</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="acc-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="acc-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="acc-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  // Tab switching
  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
  }));

  // Load all tabs (could be lazy but small enough that eager works)
  loadChartOfAccounts(c);
  loadJournalEntries(c);
  loadFrequentPostings(c);
  loadAccountingRules(c);
  loadOpeningBalances(c);
  loadRunAccruals(c);
  loadGLClosure(c);
  loadProvisioning(c);
  loadFinancialActivities(c);
}
