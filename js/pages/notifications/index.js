/* FinCraft · pages/notifications/index.js — render() entry point — builds the tab shell and starts polling.
   Auto-split from the original monolithic pages/notifications.js for maintainability. */

import { store } from '../../store.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { loadMyActivity } from './activity.js';
import { loadAuditTrails } from './audit.js';
import { loadNotifications } from './feed.js';
import { TABS, _autoRefresh, setAutoRefresh, startPolling, stopPolling } from './shared.js';

export async function render(c) {
  stopPolling();
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Notifications & Activity</h1>
        <div class="page-subtitle">Recent notifications, audit trails, and activity logs</div>
      </div>
      <div class="page-actions">
        <label class="form-check" title="Poll every 30 seconds">
          <input type="checkbox" id="nt-auto-poll"/>
          <span>Auto-refresh (30s)</span>
        </label>
      </div>
    </div>

    <div class="tabs" id="nt-tabs">
      ${TABS.map((t, i) => `
        <button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="nt-${i}">${escapeHtml(t)}</button>
      `).join('')}
    </div>

    ${TABS.map((_, i) => `
      <div class="tab-panel ${i === 0 ? 'active' : ''}" id="nt-${i}">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </div>
    `).join('')}
  `;

  const loaders = { 0: loadNotifications, 1: loadAuditTrails, 2: loadMyActivity };
  const loaded  = {};

  c.querySelectorAll('.tab-btn').forEach(tab =>
    tab.addEventListener('click', () => {
      c.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
      const idx = parseInt(tab.dataset.tab.split('-')[1], 10);
      if (loaders[idx] && !loaded[idx]) { loaded[idx] = true; loaders[idx](c); }
    })
  );

  // Auto-refresh toggle
  c.querySelector('#nt-auto-poll').addEventListener('change', e => {
    setAutoRefresh(e.target.checked);
    if (_autoRefresh) {
      startPolling(c);
      toast('info', 'Auto-refresh enabled', 'Checking every 30 seconds');
    } else {
      stopPolling();
      toast('info', 'Auto-refresh disabled', '');
    }
  });

  // Load tab 0 immediately
  loaded[0] = true;
  await loadNotifications(c);

  // Clean up polling when user navigates away
  store.subscribe('currentPage', page => {
    if (page !== 'notifications') stopPolling();
  });
}
