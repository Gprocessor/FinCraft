import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · notifications.js — Notifications, Audit Trails, My Activity
   Enhanced: real-time polling, toast on new push, audit cross-linking,
   filter chips, time-ago formatting, deep links */

import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);
const TABS = ['Notifications', 'Audit Trails', 'My Activity'];

// Track the last notification ID we've seen, so we can detect new ones
let _lastSeenNotifId = null;
let _pollTimer = null;
let _autoRefresh = false;

// Entity types and their target routes for cross-linking
const ENTITY_ROUTES = {
  CLIENT:          'client-detail',
  LOAN:            'loans',
  SAVINGSACCOUNT:  'savings',
  SAVING:          'savings',
  FIXEDDEPOSITACCOUNT:    'deposits',
  RECURRINGDEPOSITACCOUNT:'deposits',
  SHAREACCOUNT:    'shares',
  GROUP:           'groups',
  CENTER:          'centers',
  CHARGE:          'charges',
  USER:            'users',
  ROLE:            'users',
  OFFICE:          'organization',
  STAFF:           'organization',
  LOANPRODUCT:     'products',
  SAVINGSPRODUCT:  'products',
  JOURNALENTRY:    'accounting',
  GLACCOUNT:       'accounting'
};

// Time-ago helper for human-readable timestamps
function timeAgo(date) {
  if (!date) return '';
  let d;
  if (Array.isArray(date)) d = new Date(date[0], date[1] - 1, date[2], date[3] || 0, date[4] || 0);
  else d = new Date(date);
  if (isNaN(d)) return String(date);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)     return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000)   return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(d);
}

// Stop polling on page unload (cleanup)
function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
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
    _autoRefresh = e.target.checked;
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

// ════════════════════════════════════════════════════════════
// POLLING — checks for new notifications every 30s
// ════════════════════════════════════════════════════════════
function startPolling(c) {
  stopPolling();
  _pollTimer = setInterval(async () => {
    try {
      const res = await api.notifications.list({ limit: 5, isRead: false, orderBy: 'createdAt', sortOrder: 'DESC' });
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) return;

      const newestId = list[0].id;
      if (_lastSeenNotifId !== null && newestId > _lastSeenNotifId) {
        // New notification(s) arrived
        const newOnes = list.filter(n => n.id > _lastSeenNotifId);
        newOnes.slice(0, 3).forEach(n => {
          toast('info', 'New notification', n.content || n.message || n.objectType || '');
        });
        // Refresh current tab content if user is on Notifications
        const activeTab = c.querySelector('.tab-btn.active');
        if (activeTab?.dataset.tab === 'nt-0') loadNotifications(c);
        // Update bell badge
        const dot = document.getElementById('notifBadgeDot');
        if (dot) dot.hidden = false;
      }
      _lastSeenNotifId = newestId;
    } catch (e) {
      console.warn('[notif-poll]', e);
    }
  }, 30000);
}

// ════════════════════════════════════════════════════════════
// TAB 0 — NOTIFICATIONS (with filter chips + mark all read)
// ════════════════════════════════════════════════════════════
async function loadNotifications(c) {
  const el = c.querySelector('#nt-0');
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';

  try {
    const res = await api.notifications.list({ limit: 100, orderBy: 'createdAt', sortOrder: 'DESC' });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    if (list.length) _lastSeenNotifId = list[0].id;

    const unreadCount = list.filter(n => !n.isRead).length;
    const readCount   = list.length - unreadCount;

    // Object-type frequency for filter chips
    const typeCounts = {};
    list.forEach(n => {
      const t = n.objectType || 'Other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    el.innerHTML = `
      <div class="grid-4 mb-3">
        <div class="stat-card c-teal">
          <div class="stat-icon c-teal"><i class="fa-solid fa-bell"></i></div>
          <div class="stat-value">${num(list.length)}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-card c-amber">
          <div class="stat-icon c-amber"><i class="fa-solid fa-circle-exclamation"></i></div>
          <div class="stat-value">${num(unreadCount)}</div>
          <div class="stat-label">Unread</div>
        </div>
        <div class="stat-card c-green">
          <div class="stat-icon c-green"><i class="fa-solid fa-check"></i></div>
          <div class="stat-value">${num(readCount)}</div>
          <div class="stat-label">Read</div>
        </div>
        <div class="stat-card c-blue">
          <div class="stat-icon c-blue"><i class="fa-solid fa-list"></i></div>
          <div class="stat-value">${num(Object.keys(typeCounts).length)}</div>
          <div class="stat-label">Event Types</div>
        </div>
      </div>

      <div class="filter-bar mb-3">
        <div class="search-bar" style="flex:1;max-width:300px">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="nt-search" placeholder="Search notifications…"/>
        </div>
        <select id="nt-status" class="form-control" style="width:auto">
          <option value="">All</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>
        ${unreadCount > 0 ? `
          <button class="btn-secondary btn-sm ml-auto" id="nt-mark-all-read">
            <i class="fa-solid fa-check-double"></i> Mark All Read
          </button>
        ` : ''}
      </div>

      ${topTypes.length ? `
        <div class="mb-3" style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="text-muted small" style="align-self:center">Filter:</span>
          <button class="btn-secondary btn-xs nt-chip nt-chip-active" data-type="">All</button>
          ${topTypes.map(([t, n]) =>
            `<button class="btn-secondary btn-xs nt-chip" data-type="${escapeHtml(t)}">${escapeHtml(t)} <span class="text-muted">(${n})</span></button>`
          ).join('')}
        </div>
      ` : ''}

      <div class="card">
        <div id="nt-list"></div>
      </div>
    `;

    let activeType = '';
    let activeStatus = '';
    let activeQuery = '';

    function draw(rows) {
      const listEl = el.querySelector('#nt-list');
      if (!rows.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-bell-slash empty-state-icon"></i>
            <h3>No notifications</h3>
            <p>You're all caught up!</p>
          </div>`;
        return;
      }
      listEl.innerHTML = `
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th></th>
              <th>Content</th>
              <th>Type</th>
              <th>When</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${rows.map(n => {
                const link = buildEntityLink(n.objectType, n.objectIdentifier);
                return `
                <tr class="${n.isRead ? '' : 'fw-600'}">
                  <td>${n.isRead ? '<i class="fa-solid fa-circle text-muted" style="font-size:8px"></i>' : '<i class="fa-solid fa-circle text-teal" style="font-size:8px"></i>'}</td>
                  <td>
                    ${escapeHtml(n.content || n.message || n.objectType || '—')}
                    ${n.objectIdentifier ? `<div class="text-muted small mono">${escapeHtml(n.objectType || '')}: #${escapeHtml(String(n.objectIdentifier))}</div>` : ''}
                  </td>
                  <td><span class="badge b-info">${escapeHtml(n.objectType || '—')}</span></td>
                  <td title="${escapeHtml(String(n.createdAt || ''))}">${timeAgo(n.createdAt)}</td>
                  <td class="text-right">
                    ${link ? `<button class="btn-ghost btn-xs" data-go-link="${link}" title="Open entity"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : ''}
                    ${!n.isRead ? `<button class="btn-ghost btn-xs" data-mark-read="${n.id}" title="Mark as read"><i class="fa-solid fa-check"></i></button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;

      // Mark individual as read
      listEl.querySelectorAll('[data-mark-read]').forEach(b =>
        b.addEventListener('click', async () => {
          try {
            await api.notifications.markRead(b.dataset.markRead);
            toast('success', 'Marked as read', '');
            loadNotifications(c);
          } catch (e) {
            toast('error', 'Failed', e.detail?.defaultUserMessage || e.message);
          }
        })
      );

      // Open entity link
      listEl.querySelectorAll('[data-go-link]').forEach(b =>
        b.addEventListener('click', () => {
          location.hash = b.dataset.goLink;
        })
      );
    }

    function applyFilters() {
      let filtered = list;
      if (activeQuery) {
        const q = activeQuery.toLowerCase();
        filtered = filtered.filter(n =>
          (n.content || n.message || '').toLowerCase().includes(q) ||
          (n.objectType || '').toLowerCase().includes(q)
        );
      }
      if (activeStatus === 'unread') filtered = filtered.filter(n => !n.isRead);
      if (activeStatus === 'read')   filtered = filtered.filter(n =>  n.isRead);
      if (activeType) filtered = filtered.filter(n => n.objectType === activeType);
      draw(filtered);
    }

    // Wire filters
    let t;
    el.querySelector('#nt-search').addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { activeQuery = e.target.value; applyFilters(); }, 250);
    });
    el.querySelector('#nt-status').addEventListener('change', e => {
      activeStatus = e.target.value;
      applyFilters();
    });
    el.querySelectorAll('.nt-chip').forEach(chip =>
      chip.addEventListener('click', () => {
        el.querySelectorAll('.nt-chip').forEach(c => c.classList.remove('nt-chip-active'));
        chip.classList.add('nt-chip-active');
        activeType = chip.dataset.type;
        applyFilters();
      })
    );

    // Mark all as read
    el.querySelector('#nt-mark-all-read')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Mark all notifications as read?',
        message: `This will mark all ${unreadCount} unread notifications as read.`,
        confirmText: 'Mark All Read'
      })) return;
      try {
        await api.notifications.markAllRead();
        toast('success', 'All marked as read', '');
        // Update bell badge
        const dot = document.getElementById('notifBadgeDot');
        if (dot) dot.hidden = true;
        loadNotifications(c);
      } catch (e) {
        toast('error', 'Failed', e.detail?.defaultUserMessage || e.message);
      }
    });

    draw(list);
  } catch (e) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load notifications</h3>
        <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
      </div>`;
  }
}

// Build a deep link to an entity from notification metadata
function buildEntityLink(objectType, objectId) {
  if (!objectType || !objectId) return null;
  const route = ENTITY_ROUTES[(objectType || '').toUpperCase()];
  if (!route) return null;
  return `#/${route}?id=${objectId}`;
}

// ════════════════════════════════════════════════════════════
// TAB 1 — AUDIT TRAILS (with cross-linking)
// ════════════════════════════════════════════════════════════
async function loadAuditTrails(c) {
  const el = c.querySelector('#nt-1');
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';

  let tpl = {};
  try { tpl = await api.audits.searchTemplate(); } catch {}

  const actionNames = tpl.actionNames || tpl.actionOptions || [];
  const entityNames = tpl.entityNames || tpl.entityOptions || [];
  const appUsers    = tpl.appUsers || [];

  el.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">
        <h3 class="card-title">Audit Search</h3>
        ${can('READ_AUDIT') ? '<button class="btn-ghost btn-sm" id="aud-clear-filters"><i class="fa-solid fa-xmark"></i> Clear</button>' : ''}
      </div>
      <div class="card-body">
        <div class="form-grid fg-4">
          <label><span class="form-label">User</span>
            <select id="aud-username" class="form-control">
              <option value="">All users</option>
              ${appUsers.map(u => `<option value="${escapeHtml(u.username || u.id)}">${escapeHtml(u.username)}</option>`).join('')}
            </select>
          </label>
          <label><span class="form-label">Action</span>
            <select id="aud-action" class="form-control">
              <option value="">All actions</option>
              ${actionNames.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
            </select>
          </label>
          <label><span class="form-label">Entity</span>
            <select id="aud-entity" class="form-control">
              <option value="">All entities</option>
              ${entityNames.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('')}
            </select>
          </label>
          <label><span class="form-label">From</span><input type="date" id="aud-from" class="form-control"/></label>
          <label><span class="form-label">To</span><input type="date" id="aud-to" class="form-control"/></label>
          <label style="grid-column:span 3"><span class="form-label">&nbsp;</span>
            <button class="btn-primary w-full" id="aud-search-go">
              <i class="fa-solid fa-magnifying-glass"></i> Search Audit Log
            </button>
          </label>
        </div>
      </div>
    </div>

    <div id="aud-results">
      <div class="empty-state">
        <i class="fa-solid fa-clipboard-list empty-state-icon"></i>
        <h3>Enter criteria and click Search</h3>
        <p>The Fineract audit log records all CREATE, UPDATE, DELETE, APPROVE, etc. actions.</p>
      </div>
    </div>
  `;

  async function runAuditSearch() {
    const resultsEl = el.querySelector('#aud-results');
    resultsEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Searching…</h3></div>';

    const params = { limit: 200 };
    const user   = el.querySelector('#aud-username').value;
    const action = el.querySelector('#aud-action').value;
    const entity = el.querySelector('#aud-entity').value;
    const from   = el.querySelector('#aud-from').value;
    const to     = el.querySelector('#aud-to').value;
    if (user)   params.makerUsername = user;
    if (action) params.actionName    = action;
    if (entity) params.entityName    = entity;
    if (from)   { params.fromDate = from; params.dateFormat = DATE_FORMAT; params.locale = LOCALE; }
    if (to)     params.toDate = to;

    try {
      const res = await api.audits.list(params);
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) {
        resultsEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-circle-question empty-state-icon"></i>
            <h3>No audit entries match</h3>
            <p>Try widening your filters.</p>
          </div>`;
        return;
      }

      resultsEl.innerHTML = `
        <div class="filter-bar mb-3">
          <span class="text-muted">${num(list.length)} audit entries found</span>
          <button class="btn-secondary btn-sm ml-auto" id="aud-export"><i class="fa-solid fa-download"></i> Export CSV</button>
        </div>
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Resource</th>
                <th>Maker</th>
                <th>When</th>
                <th>Status</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${list.map(a => {
                  const link = buildEntityLink(a.entityName, a.resourceId);
                  return `
                  <tr>
                    <td><b>${escapeHtml(a.actionName || '—')}</b></td>
                    <td><span class="badge b-info">${escapeHtml(a.entityName || '—')}</span></td>
                    <td class="mono">${a.resourceId ? `#${a.resourceId}` : '—'}</td>
                    <td>${escapeHtml(a.maker || '—')}</td>
                    <td title="${escapeHtml(String(a.madeOnDate || ''))}">${timeAgo(a.madeOnDate)}</td>
                    <td>${a.processingResult?.value ? sb(a.processingResult.value) : '—'}</td>
                    <td class="text-right">
                      ${link ? `<button class="btn-ghost btn-xs" data-go-link="${link}" title="Open entity"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : ''}
                      <button class="btn-ghost btn-xs" data-audit-id="${a.id}" title="View details"><i class="fa-solid fa-eye"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

      resultsEl.querySelectorAll('[data-audit-id]').forEach(b =>
        b.addEventListener('click', () => openAuditDetailModal(b.dataset.auditId))
      );
      resultsEl.querySelectorAll('[data-go-link]').forEach(b =>
        b.addEventListener('click', () => { location.hash = b.dataset.goLink; })
      );
      resultsEl.querySelector('#aud-export').addEventListener('click', () => {
        const rows = [['Action', 'Entity', 'Resource', 'Maker', 'Made On', 'Status']];
        list.forEach(a => rows.push([
          a.actionName || '',
          a.entityName || '',
          String(a.resourceId || ''),
          a.maker || '',
          fmtDate(a.madeOnDate) || '',
          a.processingResult?.value || ''
        ]));
        const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `audit_export_${Date.now()}.csv`;
        a.click();
        toast('success', 'Exported', `${list.length} entries`);
      });
    } catch (e) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
          <h3>Search failed</h3>
          <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
        </div>`;
    }
  }

  el.querySelector('#aud-search-go').addEventListener('click', runAuditSearch);
  el.querySelector('#aud-clear-filters')?.addEventListener('click', () => {
    ['aud-username', 'aud-action', 'aud-entity', 'aud-from', 'aud-to'].forEach(id => {
      el.querySelector(`#${id}`).value = '';
    });
    el.querySelector('#aud-results').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-clipboard-list empty-state-icon"></i>
        <h3>Enter criteria and click Search</h3>
      </div>`;
  });

  // Enter key on text fields triggers search
  ['#aud-from', '#aud-to'].forEach(sel =>
    el.querySelector(sel)?.addEventListener('keypress', e => {
      if (e.key === 'Enter') runAuditSearch();
    })
  );
}

// ════════════════════════════════════════════════════════════
// AUDIT DETAIL MODAL
// ════════════════════════════════════════════════════════════
async function openAuditDetailModal(auditId) {
  const mid = 'aud-mod-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3 class="modal-title">Audit Entry #${escapeHtml(String(auditId))}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" id="${mid}-body">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
        </div>
        <div class="modal-foot"><button class="btn-ghost" data-close-modal>Close</button></div>
      </div>
    </div>
  `);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  try {
    const audit = await api.audits.get(auditId);
    const body = document.getElementById(mid + '-body');
    let payload = '—';
    try {
      payload = audit.commandAsJson ? JSON.stringify(JSON.parse(audit.commandAsJson), null, 2) : '—';
    } catch { payload = String(audit.commandAsJson || '—'); }

    const link = buildEntityLink(audit.entityName, audit.resourceId);

    body.innerHTML = `
      <div class="info-grid mb-3">
        <div class="info-item"><div class="info-label">Action</div><div class="info-value"><b>${escapeHtml(audit.actionName || '—')}</b></div></div>
        <div class="info-item"><div class="info-label">Entity</div><div class="info-value">${escapeHtml(audit.entityName || '—')}</div></div>
        <div class="info-item"><div class="info-label">Resource ID</div><div class="info-value mono">${escapeHtml(String(audit.resourceId || '—'))}</div></div>
        <div class="info-item"><div class="info-label">Office</div><div class="info-value">${escapeHtml(audit.officeName || '—')}</div></div>
        <div class="info-item"><div class="info-label">Maker</div><div class="info-value">${escapeHtml(audit.maker || '—')}</div></div>
        <div class="info-item"><div class="info-label">Made On</div><div class="info-value">${fmtDate(audit.madeOnDate) || '—'}</div></div>
        <div class="info-item"><div class="info-label">Checker</div><div class="info-value">${escapeHtml(audit.checker || '—')}</div></div>
        <div class="info-item"><div class="info-label">Status</div><div class="info-value">${audit.processingResult?.value ? sb(audit.processingResult.value) : '—'}</div></div>
      </div>
      ${link ? `<div class="mb-3"><button class="btn-primary btn-sm" id="aud-goto"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open ${escapeHtml(audit.entityName)} #${audit.resourceId}</button></div>` : ''}
      <div>
        <h4 class="mb-2">Command Payload</h4>
        <pre style="background:var(--bg-card-alt);border:1px solid var(--border-1);border-radius:6px;padding:12px;overflow-x:auto;font-size:11px;font-family:var(--font-mono);max-height:300px;overflow-y:auto">${escapeHtml(payload)}</pre>
      </div>
    `;

    if (link) {
      el.querySelector('#aud-goto')?.addEventListener('click', () => {
        el.remove();
        location.hash = link;
      });
    }
  } catch (e) {
    document.getElementById(mid + '-body').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load</h3>
        <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
      </div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 2 — MY ACTIVITY (audit log filtered to current user)
// ════════════════════════════════════════════════════════════
async function loadMyActivity(c) {
  const el = c.querySelector('#nt-2');
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';

  const auth = store.get('auth') || {};
  const username = auth.username;
  if (!username) {
    el.innerHTML = '<div class="empty-state"><h3>Not logged in</h3></div>';
    return;
  }

  try {
    const res = await api.audits.list({ limit: 100, makerUsername: username });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    // KPIs
    const todayStr = today();
    const todayCount = list.filter(a => String(a.madeOnDate || '').startsWith(todayStr)).length;

    const byAction = {};
    list.forEach(a => {
      const action = a.actionName || 'Other';
      byAction[action] = (byAction[action] || 0) + 1;
    });
    const topAction = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0];

    el.innerHTML = `
      <div class="grid-4 mb-3">
        <div class="stat-card c-teal">
          <div class="stat-icon c-teal"><i class="fa-solid fa-user-check"></i></div>
          <div class="stat-value">${escapeHtml(username)}</div>
          <div class="stat-label">Your User</div>
        </div>
        <div class="stat-card c-amber">
          <div class="stat-icon c-amber"><i class="fa-solid fa-list-check"></i></div>
          <div class="stat-value">${num(list.length)}</div>
          <div class="stat-label">Recent Actions (last 100)</div>
        </div>
        <div class="stat-card c-green">
          <div class="stat-icon c-green"><i class="fa-solid fa-calendar-day"></i></div>
          <div class="stat-value">${num(todayCount)}</div>
          <div class="stat-label">Today</div>
        </div>
        <div class="stat-card c-blue">
          <div class="stat-icon c-blue"><i class="fa-solid fa-trophy"></i></div>
          <div class="stat-value">${topAction ? escapeHtml(topAction[0]) : '—'}</div>
          <div class="stat-label">Most Common ${topAction ? `(${topAction[1]} times)` : ''}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Activity Timeline</h3>
          <div class="search-bar" style="width:220px">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="my-search" placeholder="Filter…"/>
          </div>
        </div>
        ${list.length ? `
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Resource</th>
                <th>Office</th>
                <th>When</th>
                <th>Status</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${list.map(a => {
                  const link = buildEntityLink(a.entityName, a.resourceId);
                  return `
                  <tr class="my-act-row">
                    <td><b>${escapeHtml(a.actionName || '—')}</b></td>
                    <td>${escapeHtml(a.entityName || '—')}</td>
                    <td class="mono">${a.resourceId ? `#${a.resourceId}` : '—'}</td>
                    <td>${escapeHtml(a.officeName || '—')}</td>
                    <td title="${escapeHtml(String(a.madeOnDate || ''))}">${timeAgo(a.madeOnDate)}</td>
                    <td>${a.processingResult?.value ? sb(a.processingResult.value) : '—'}</td>
                    <td class="text-right">
                      ${link ? `<button class="btn-ghost btn-xs" data-go-link="${link}" title="Open entity"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : ''}
                      <button class="btn-ghost btn-xs" data-act-id="${a.id}" title="View detail"><i class="fa-solid fa-eye"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state">
            <i class="fa-solid fa-clock-rotate-left empty-state-icon"></i>
            <h3>No recent activity</h3>
            <p>Your audit log is empty for the recent period.</p>
          </div>
        `}
      </div>
    `;

    el.querySelector('#my-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.my-act-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    el.querySelectorAll('[data-act-id]').forEach(b =>
      b.addEventListener('click', () => openAuditDetailModal(b.dataset.actId))
    );
    el.querySelectorAll('[data-go-link]').forEach(b =>
      b.addEventListener('click', () => { location.hash = b.dataset.goLink; })
    );
  } catch (e) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load activity</h3>
        <p>${escapeHtml(e.detail?.defaultUserMessage || e.message || '')}</p>
      </div>`;
  }
}