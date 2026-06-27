import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · notifications.js — Notifications, Audit Trails, Activity (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = [
  'Notifications',
  'Audit Trails',
  'My Activity'
];

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Notifications &amp; Activity</h1>
        <div class="text-muted">Recent notifications, audit trails, and activity logs</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="nt-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="nt-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="nt-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0: loadNotifications,
    1: loadAuditTrails,
    2: loadMyActivity
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

  loadNotifications(c);
  loaded[0] = true;
}

// ════════════════════════════════════════════════════════════
// TAB 0 — NOTIFICATIONS
// ════════════════════════════════════════════════════════════
async function loadNotifications(c) {
  const el = c.querySelector('#nt-0');
  el.innerHTML = '<div class="empty-state-row">Loading notifications…</div>';
  try {
    const res = await api.notifications.list({ limit: 100, orderBy: 'createdAt', sortOrder: 'DESC' });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    const unreadCount = list.filter(n => !n.isRead).length;
    const readCount = list.length - unreadCount;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Unread</div><div class="kpi-value">${num(unreadCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Read</div><div class="kpi-value">${num(readCount)}</div></div>
      </div>

      <div class="section-header mb-2">
        <div class="filter-bar" style="flex:1">
          <input id="nt-search" class="form-control" placeholder="Search notifications…" autocomplete="off"/>
          <select id="nt-status" class="form-control">
            <option value="">All</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </div>
        ${unreadCount > 0 ? `<button class="btn-secondary" id="nt-mark-all-read"><i class="fa-solid fa-check-double"></i> Mark All Read</button>` : ''}
      </div>

      <div id="nt-list"></div>`;

    function draw(rows) {
      const listEl = el.querySelector('#nt-list');
      if (!rows.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-bell-slash"></i>
            <h3>No notifications</h3>
            <div class="text-muted mt-2">You're all caught up!</div>
          </div>`;
        return;
      }

      listEl.innerHTML = `
        <table class="table">
          <thead><tr>
            <th></th><th>Content</th><th>Type</th><th>Created</th><th></th>
          </tr></thead>
          <tbody>${rows.map(n => `
            <tr class="${n.isRead ? '' : 'text-bold'}" data-notif-id="${n.id}">
              <td>
                ${n.isRead
                  ? '<i class="fa-regular fa-circle text-muted"></i>'
                  : '<i class="fa-solid fa-circle text-accent"></i>'}
              </td>
              <td>
                ${escapeHtml(n.content || n.message || n.objectType || '—')}
                ${n.objectIdentifier ? `<div class="text-muted small">Object: ${escapeHtml(String(n.objectIdentifier))}</div>` : ''}
              </td>
              <td>${escapeHtml(n.objectType || '—')}</td>
              <td>${fmtDate(n.createdAt) || '—'}</td>
              <td class="text-right">
                ${!n.isRead ? `<button class="btn-mini" data-mark-read="${n.id}">Mark Read</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>`;

      listEl.querySelectorAll('[data-mark-read]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.notifications.markRead(b.dataset.markRead);
          toast('success', 'Marked as read', '');
          loadNotifications(c);
        } catch (e) {
          toast('error', 'Failed', e.detail?.defaultUserMessage || e.message);
        }
      }));
    }

    function applyFilters() {
      const q = el.querySelector('#nt-search').value.toLowerCase().trim();
      const status = el.querySelector('#nt-status').value;

      let filtered = list;
      if (q) filtered = filtered.filter(n =>
        (n.content || n.message || '').toLowerCase().includes(q) ||
        (n.objectType || '').toLowerCase().includes(q));
      if (status === 'unread') filtered = filtered.filter(n => !n.isRead);
      if (status === 'read')   filtered = filtered.filter(n => n.isRead);

      draw(filtered);
    }

    let t;
    el.querySelector('#nt-search').addEventListener('input', () => {
      clearTimeout(t); t = setTimeout(applyFilters, 250);
    });
    el.querySelector('#nt-status').addEventListener('change', applyFilters);

    el.querySelector('#nt-mark-all-read')?.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Mark all notifications as read?', confirmText: 'Mark All' })) return;
      try {
        await api.notifications.markAllRead();
        toast('success', 'All marked as read', '');
        loadNotifications(c);
      } catch (e) {
        toast('error', 'Failed', e.detail?.defaultUserMessage || e.message);
      }
    });

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// STUBS — replaced in next parts
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// TAB 1 — AUDIT TRAILS (advanced search)
// ════════════════════════════════════════════════════════════
async function loadAuditTrails(c) {
  const el = c.querySelector('#nt-1');
  el.innerHTML = '<div class="empty-state-row">Loading audit search options…</div>';

  // Try to fetch the audit search template for dropdowns
  let tpl = {};
  try { tpl = await api.audits.template(); } catch {}
  const actionNames = tpl.actionNames || tpl.actionOptions || [];
  const entityNames = tpl.entityNames || tpl.entityOptions || [];

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>Audit Search</h3>
      ${can('READ_AUDIT') ? '<button class="btn-secondary btn-sm" id="aud-clear-filters">Clear Filters</button>' : ''}
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      Search system audit logs by action, entity, user, or date range. Maker-checker tasks also appear here.
    </div>

    <div class="filter-bar mb-3" style="flex-wrap:wrap; gap:8px">
      <input id="aud-username" class="form-control" placeholder="Maker username…" style="max-width:200px"/>
      <select id="aud-action" class="form-control" style="max-width:200px">
        <option value="">All actions</option>
        ${actionNames.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
      </select>
      <select id="aud-entity" class="form-control" style="max-width:200px">
        <option value="">All entities</option>
        ${entityNames.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('')}
      </select>
      <input type="date" id="aud-from" class="form-control" style="max-width:160px"/>
      <input type="date" id="aud-to" class="form-control" style="max-width:160px"/>
      <button class="btn-primary" id="aud-search-go"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
    </div>

    <div id="aud-results"><div class="empty-state-row">Enter criteria and click Search</div></div>`;

  async function runAuditSearch() {
    const resultsEl = el.querySelector('#aud-results');
    resultsEl.innerHTML = '<div class="empty-state-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching…</div>';

    const params = { limit: 100 };
    const maker = el.querySelector('#aud-username').value.trim();
    const action = el.querySelector('#aud-action').value;
    const entity = el.querySelector('#aud-entity').value;
    const from = el.querySelector('#aud-from').value;
    const to = el.querySelector('#aud-to').value;

    if (maker) params.makerUsername = maker;
    if (action) params.actionName = action;
    if (entity) params.entityName = entity;
    if (from) {
      params.fromDate = from;
      params.dateFormat = DATE_FORMAT;
      params.locale = LOCALE;
    }
    if (to) params.toDate = to;

    try {
      const res = await api.audits.list(params);
      const list = Array.isArray(res) ? res : (res?.pageItems || []);

      if (!list.length) {
        resultsEl.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-clipboard-list"></i>
            <h3>No audit entries match</h3>
            <div class="text-muted mt-2">Try widening your filters or removing some criteria.</div>
          </div>`;
        return;
      }

      resultsEl.innerHTML = `
        <div class="section-header mb-2">
          <span class="text-muted">${num(list.length)} audit entries found</span>
          <button class="btn-secondary btn-sm" id="aud-export"><i class="fa-solid fa-download"></i> Export CSV</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>Action</th><th>Entity</th><th>Resource</th>
            <th>Maker</th><th>Made On</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(a => `
            <tr>
              <td><b>${escapeHtml(a.actionName || '—')}</b></td>
              <td>${escapeHtml(a.entityName || '—')}</td>
              <td>${escapeHtml(a.resourceId ? String(a.resourceId) : '—')}</td>
              <td>${escapeHtml(a.maker || '—')}</td>
              <td>${fmtDate(a.madeOnDate) || '—'}</td>
              <td>${escapeHtml(a.processingResult?.value || '—')}</td>
              <td class="text-right">
                <button class="btn-mini" data-audit-id="${a.id}">View</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`;

      resultsEl.querySelectorAll('[data-audit-id]').forEach(b => b.addEventListener('click', () =>
        openAuditDetailModal(b.dataset.auditId)
      ));

      resultsEl.querySelector('#aud-export').addEventListener('click', () => {
        const rows = [['Action', 'Entity', 'Resource', 'Maker', 'Made On', 'Status']];
        list.forEach(a => rows.push([
          a.actionName || '', a.entityName || '', String(a.resourceId || ''),
          a.maker || '', fmtDate(a.madeOnDate) || '', a.processingResult?.value || ''
        ]));
        const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'audit_export_' + Date.now() + '.csv';
        a.click();
        toast('success', 'Exported', list.length + ' entries');
      });
    } catch (e) {
      resultsEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }

  el.querySelector('#aud-search-go').addEventListener('click', runAuditSearch);

  el.querySelector('#aud-clear-filters')?.addEventListener('click', () => {
    el.querySelector('#aud-username').value = '';
    el.querySelector('#aud-action').value = '';
    el.querySelector('#aud-entity').value = '';
    el.querySelector('#aud-from').value = '';
    el.querySelector('#aud-to').value = '';
    el.querySelector('#aud-results').innerHTML = '<div class="empty-state-row">Enter criteria and click Search</div>';
  });

  // Allow Enter to trigger search
  ['#aud-username', '#aud-from', '#aud-to'].forEach(sel => {
    el.querySelector(sel)?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') runAuditSearch();
    });
  });
}

async function openAuditDetailModal(auditId) {
  const mid = 'aud-mod-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>Audit Entry #${escapeHtml(String(auditId))}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="${mid}-body">
          <div class="empty-state-row">Loading…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  try {
    const audit = await api.audits.get(auditId);
    const body = document.getElementById(mid + '-body');

    let payload = '—';
    try {
      payload = audit.commandAsJson
        ? JSON.stringify(JSON.parse(audit.commandAsJson), null, 2)
        : '—';
    } catch {
      payload = String(audit.commandAsJson || '—');
    }

    body.innerHTML = `
      <div class="grid-2">
        <div>
          <dl class="dl-grid">
            <dt>Action</dt><dd>${escapeHtml(audit.actionName || '—')}</dd>
            <dt>Entity</dt><dd>${escapeHtml(audit.entityName || '—')}</dd>
            <dt>Resource ID</dt><dd>${escapeHtml(String(audit.resourceId || '—'))}</dd>
            <dt>Office</dt><dd>${escapeHtml(audit.officeName || '—')}</dd>
          </dl>
        </div>
        <div>
          <dl class="dl-grid">
            <dt>Maker</dt><dd>${escapeHtml(audit.maker || '—')}</dd>
            <dt>Made On</dt><dd>${fmtDate(audit.madeOnDate) || '—'}</dd>
            <dt>Checker</dt><dd>${escapeHtml(audit.checker || '—')}</dd>
            <dt>Status</dt><dd>${escapeHtml(audit.processingResult?.value || '—')}</dd>
          </dl>
        </div>
      </div>

      <h4 class="mt-3">Payload (commandAsJson)</h4>
      <pre style="background:var(--surface-1); padding:12px; border-radius:4px; max-height:400px; overflow:auto; font-family:monospace; font-size:12px">${escapeHtml(payload)}</pre>`;
  } catch (e) {
    document.getElementById(mid + '-body').innerHTML =
      `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
// ════════════════════════════════════════════════════════════
// TAB 2 — MY ACTIVITY (audit trail filtered to current user)
// ════════════════════════════════════════════════════════════
async function loadMyActivity(c) {
  const el = c.querySelector('#nt-2');
  el.innerHTML = '<div class="empty-state-row">Loading your recent activity…</div>';

  const auth = store.get('auth') || {};
  const username = auth.username;

  if (!username) {
    el.innerHTML = '<div class="empty-state-row text-muted">Not logged in</div>';
    return;
  }

  try {
    const params = { limit: 100, makerUsername: username };
    const res = await api.audits.list(params);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    // KPIs
    const today = new Date().toISOString().substring(0, 10);
    const todayCount = list.filter(a => {
      const d = typeof a.madeOnDate === 'object' ? '' : (a.madeOnDate || '');
      return String(d).startsWith(today);
    }).length;

    const byAction = {};
    list.forEach(a => {
      const action = a.actionName || 'Other';
      byAction[action] = (byAction[action] || 0) + 1;
    });
    const topAction = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0];

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card">
          <div class="kpi-label">Your User</div>
          <div class="kpi-value" style="font-size:14px">${escapeHtml(username)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Actions (recent 100)</div>
          <div class="kpi-value">${num(list.length)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Today</div>
          <div class="kpi-value">${num(todayCount)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Top Action</div>
          <div class="kpi-value" style="font-size:14px">${topAction ? escapeHtml(topAction[0]) : '—'}</div>
          <div class="kpi-foot text-muted">${topAction ? topAction[1] + ' times' : ''}</div>
        </div>
      </div>

      <div class="section-header mb-2">
        <h3>Activity Timeline</h3>
        <input id="my-search" class="form-control" placeholder="Search…" style="max-width:300px"/>
      </div>

      ${list.length ? `
        <div id="my-timeline">
          ${list.map(a => `
            <div class="my-act-row" style="display:flex; gap:12px; padding:12px 0; border-bottom:1px solid var(--border)">
              <div class="avatar" style="background:var(--accent); color:#fff; flex-shrink:0">
                <i class="fa-solid fa-circle-check"></i>
              </div>
              <div style="flex:1">
                <div><b>${escapeHtml(a.actionName || '—')}</b> · ${escapeHtml(a.entityName || '—')}
                  ${a.resourceId ? `<span class="text-muted">#${escapeHtml(String(a.resourceId))}</span>` : ''}
                </div>
                <div class="text-muted small">
                  ${fmtDate(a.madeOnDate) || '—'}
                  ${a.officeName ? ` · ${escapeHtml(a.officeName)}` : ''}
                  ${a.processingResult?.value ? ` · ${escapeHtml(a.processingResult.value)}` : ''}
                </div>
              </div>
              <div>
                <button class="btn-mini" data-act-id="${a.id}">Detail</button>
              </div>
            </div>`).join('')}
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <h3>No recent activity</h3>
          <div class="text-muted mt-2">Your audit log is empty for the recent period.</div>
        </div>`}`;

    el.querySelector('#my-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.my-act-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-act-id]').forEach(b => b.addEventListener('click', () =>
      openAuditDetailModal(b.dataset.actId)
    ));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}