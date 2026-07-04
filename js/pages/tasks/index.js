/* FinCraft · pages/tasks/index.js — render() entry point — builds the tab shell.
   Auto-split from the original monolithic pages/tasks.js for maintainability. */

import { toast } from '../../ui.js';
import { loadClientApprovals, loadLoanApprovals, loadRescheduleRequests } from './approvals.js';
import { loadCheckerInbox } from './checker-inbox.js';
import { TABS } from './shared.js';

let _autoRefresh = false;

let _refreshTimer = null;

export async function render(c) {
  // Cleanup any prior auto-refresh
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }

  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Checker Inbox &amp; Tasks</h1>
        <div class="text-muted">Pending approvals across the platform</div>
      </div>
      <div class="page-actions">
        <label class="checkbox-row" style="margin-right:12px">
          <input type="checkbox" id="tk-auto-refresh"/>
          Auto-refresh (30s)
        </label>
        <button class="btn-secondary" id="tk-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="tk-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="tk-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="tk-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0: loadCheckerInbox,
    1: loadLoanApprovals,
    2: loadClientApprovals,
    3: loadRescheduleRequests
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

  // Auto-refresh wiring
  c.querySelector('#tk-auto-refresh').addEventListener('change', (e) => {
    _autoRefresh = e.target.checked;
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    if (_autoRefresh) {
      _refreshTimer = setInterval(() => {
        const activeTab = c.querySelector('.tab.active');
        if (!activeTab) return;
        const idx = parseInt(activeTab.dataset.tab.split('-')[1]);
        loaders[idx]?.(c);
      }, 30000);
      toast('info', 'Auto-refresh enabled', 'Refreshing every 30s');
    }
  });

  // Manual refresh
  c.querySelector('#tk-refresh').addEventListener('click', () => {
    const activeTab = c.querySelector('.tab.active');
    if (!activeTab) return;
    const idx = parseInt(activeTab.dataset.tab.split('-')[1]);
    loaders[idx]?.(c);
  });

  loadCheckerInbox(c);
  loaded[0] = true;
}
