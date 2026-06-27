/* FinCraft · dashboard.js — Live Fineract API, no demo data, permission-aware */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';

const SKELETON_ROW = (cols) =>
  `<tr><td colspan="${cols}"><div class="skeleton-bar" style="height:14px;width:60%"></div></td></tr>`;

const SKELETON_KPI = `<span class="skeleton-bar" style="display:inline-block;height:24px;width:80px"></span>`;

/* Build the page once, then progressively fill cards as data lands. */
export async function render(c) {
  const auth = store.get('auth') || {};
  const canRead = (code) => store.hasPermission(code);

  c.innerHTML = `
    <div class="page-header mb-4">
      <div>
        <h1>Dashboard</h1>
        <div class="text-muted">Portfolio at a glance${auth.officeName ? ` · ${escapeHtml(auth.officeName)}` : ''}</div>
      </div>
      <div class="page-actions">
        ${canRead('CREATE_CLIENT') ? `<button class="btn-primary" data-modal="newClientModal">
          <i class="fa-solid fa-plus"></i> New Client
        </button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card" id="kpi-clients">
        <div class="kpi-label">Active Clients</div>
        <div class="kpi-value">${SKELETON_KPI}</div>
        <div class="kpi-foot text-muted">All offices</div>
      </div>
      <div class="kpi-card" id="kpi-loans">
        <div class="kpi-label">Active Loans</div>
        <div class="kpi-value">${SKELETON_KPI}</div>
        <div class="kpi-foot text-muted">Portfolio at a glance</div>
      </div>
      <div class="kpi-card" id="kpi-savings">
        <div class="kpi-label">Total Savings Balance</div>
        <div class="kpi-value">${SKELETON_KPI}</div>
        <div class="kpi-foot text-muted">Active deposits</div>
      </div>
      <div class="kpi-card" id="kpi-tasks">
        <div class="kpi-label">Pending Tasks</div>
        <div class="kpi-value">${SKELETON_KPI}</div>
        <div class="kpi-foot text-muted">Checker inbox</div>
      </div>
    </div>

    <div class="dashboard-grid">
      ${canRead('READ_CLIENT') ? `
      <div class="card">
        <div class="card-header">
          <h3>Recent Clients</h3>
          <a href="#/clients" class="text-muted">All clients</a>
        </div>
        <table class="table">
          <thead><tr><th>Client</th><th>Office</th><th>Since</th><th>Status</th></tr></thead>
          <tbody id="recent-clients">${SKELETON_ROW(4)}</tbody>
        </table>
      </div>` : ''}

      ${canRead('CHECKER_SUPER_USER') ? `
      <div class="card">
        <div class="card-header">
          <h3>Pending Checker Tasks</h3>
          <a href="#/tasks" class="text-muted">View all</a>
        </div>
        <div id="pending-tasks"><div class="skeleton-bar" style="height:60px"></div></div>
      </div>` : ''}

      ${canRead('READ_LOAN') ? `
      <div class="card">
        <div class="card-header">
          <h3>Recent Loans</h3>
          <a href="#/loans" class="text-muted">All loans</a>
        </div>
        <table class="table">
          <thead><tr><th>Account</th><th>Client</th><th>Outstanding</th><th>Status</th></tr></thead>
          <tbody id="recent-loans">${SKELETON_ROW(4)}</tbody>
        </table>
      </div>` : ''}

      ${canRead('READ_SAVINGSACCOUNT') ? `
      <div class="card">
        <div class="card-header">
          <h3>Recent Savings</h3>
          <a href="#/savings" class="text-muted">All savings</a>
        </div>
        <table class="table">
          <thead><tr><th>Account</th><th>Client</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody id="recent-savings">${SKELETON_ROW(4)}</tbody>
        </table>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>Notifications</h3>
          <a href="#/notifications" class="text-muted">View all</a>
        </div>
        <div id="recent-notifs"><div class="skeleton-bar" style="height:40px"></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Recent Activity</h3>
          <span class="text-muted">Last 10 audit events</span>
        </div>
        <div id="recent-audits"><div class="skeleton-bar" style="height:40px"></div></div>
      </div>
    </div>`;

  /* -------------------------- KPI loaders -------------------------- */
  // Each loader is independent so a single failing endpoint can't blank the dashboard.

  // KPI: clients — uses totalFilteredRecords (cheap, no body iteration)
  if (canRead('READ_CLIENT')) {
    loadKpi('#kpi-clients .kpi-value',
      () => api.clients.list({ limit: 1, status: 'active' }),
      r => num(r?.totalFilteredRecords ?? 0));
  } else fillCard('#kpi-clients .kpi-value', '—');

  // KPI: loans — totalFilteredRecords
  if (canRead('READ_LOAN')) {
    loadKpi('#kpi-loans .kpi-value',
      () => api.loans.list({ limit: 1, status: 'active' }),
      r => num(r?.totalFilteredRecords ?? 0));
  } else fillCard('#kpi-loans .kpi-value', '—');

  // KPI: total savings balance — prefer the canonical Fineract report
  if (canRead('READ_SAVINGSACCOUNT')) {
    loadKpi('#kpi-savings .kpi-value', async () => {
      try {
        const r = await api.runReports.run('Portfolio at a glance', { R_officeId: -1 });
        const headers = r?.columnHeaders?.map(h => h.columnName.toLowerCase()) || [];
        const idx = headers.findIndex(h => h.includes('savings') && h.includes('balance'));
        if (idx >= 0 && r.data?.length) return fmt(r.data[0].row[idx] ?? 0);
      } catch {}
      // Fallback: best-effort across a single page of active accounts (kept under 50).
      const sv = await api.savings.list({ limit: 50, status: 'active' });
      const list = Array.isArray(sv) ? sv : (sv?.pageItems || []);
      const sum = list.reduce((s, a) => s + (a.summary?.accountBalance || 0), 0);
      return fmt(sum) + ' *';
    }, x => x);
  } else fillCard('#kpi-savings .kpi-value', '—');

  // KPI: pending tasks — totalFilteredRecords only (no full list pulled)
  if (canRead('CHECKER_SUPER_USER')) {
    loadKpi('#kpi-tasks .kpi-value',
      () => api.makerchecker.list({ limit: 1 }),
      r => num(r?.totalFilteredRecords ?? 0));
  } else fillCard('#kpi-tasks .kpi-value', '—');

  /* ----------------------- Recent tables ----------------------- */
  if (canRead('READ_CLIENT')) {
    loadTable('#recent-clients', () => api.clients.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }),
      (list) => list.length ? list.map(x => `
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar">${ini(x.displayName)}</div>
              <a href="#/client-detail?id=${x.id}">${escapeHtml(x.displayName)}</a>
            </div>
          </td>
          <td>${escapeHtml(x.officeName || '—')}</td>
          <td>${fmtDate(x.activationDate)}</td>
          <td>${sb(x.status?.value || '—')}</td>
        </tr>`).join('')
        : `<tr><td colspan="4" class="empty-state-row">No clients found</td></tr>`,
      4);
  }

  if (canRead('READ_LOAN')) {
    loadTable('#recent-loans', () => api.loans.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }),
      (list) => list.length ? list.map(l => `
        <tr>
          <td><a href="#/loans?id=${l.id}">${escapeHtml(l.accountNo || `#${l.id}`)}</a></td>
          <td>${escapeHtml(l.clientName || l.clientDisplayName || '—')}</td>
          <td class="text-right">${fmt(l.summary?.totalOutstanding ?? 0)}</td>
          <td>${sb(l.status?.value || '—')}</td>
        </tr>`).join('')
        : `<tr><td colspan="4" class="empty-state-row">No loans found</td></tr>`,
      4);
  }

  if (canRead('READ_SAVINGSACCOUNT')) {
    loadTable('#recent-savings', () => api.savings.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }),
      (list) => list.length ? list.map(s => `
        <tr>
          <td><a href="#/savings?id=${s.id}">${escapeHtml(s.accountNo || `#${s.id}`)}</a></td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td class="text-right">${fmt(s.summary?.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td>
        </tr>`).join('')
        : `<tr><td colspan="4" class="empty-state-row">No savings found</td></tr>`,
      4);
  }

  /* ----------------------- Pending tasks list ----------------------- */
  if (canRead('CHECKER_SUPER_USER')) {
    safeLoad('#pending-tasks', () => api.makerchecker.list({ limit: 5 }), (res) => {
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) return `<div class="empty-state-row">No pending tasks</div>`;
      return `<ul class="activity-list">${list.map(t => `
        <li>
          <div class="avatar">${ini(t.maker || '?')}</div>
          <div>
            <strong>${escapeHtml(t.actionName || t.action || '—')}</strong>
            · <span class="text-muted">${escapeHtml(t.entityName || t.entity || '—')}</span>
            <div class="text-muted small">${escapeHtml(t.madeOnDate || t.made || '')}</div>
          </div>
          <span class="badge b-warning">Pending</span>
        </li>`).join('')}</ul>`;
    });
  }

  /* ----------------------- Notifications ----------------------- */
  safeLoad('#recent-notifs',
    () => api.notifications.list({ isRead: false, limit: 5, orderBy: 'createdAt', sortOrder: 'DESC' }),
    (res) => {
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) return `<div class="empty-state-row">You're all caught up</div>`;
      return `<ul class="activity-list">${list.map(n => `
        <li>
          <i class="fa-solid fa-bell"></i>
          <div>
            <div>${escapeHtml(n.content || n.message || n.objectType || 'Notification')}</div>
            <div class="text-muted small">${escapeHtml(n.createdAt || '')}</div>
          </div>
        </li>`).join('')}</ul>`;
    });

  /* ----------------------- Recent audit events ----------------------- */
  safeLoad('#recent-audits',
    () => api.audits.list({ limit: 10, orderBy: 'id', sortOrder: 'DESC', paged: true }),
    (res) => {
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) return `<div class="empty-state-row">No recent activity</div>`;
      return `<ul class="activity-list">${list.map(a => `
        <li>
          <i class="fa-solid fa-clock-rotate-left"></i>
          <div>
            <strong>${escapeHtml(a.actionName || '—')}</strong>
            ${a.entityName ? ` <span class="text-muted">on ${escapeHtml(a.entityName)}</span>` : ''}
            <div class="text-muted small">
              ${escapeHtml(a.maker || a.madeBy || '—')}
              ${a.madeOnDate ? ` · ${escapeHtml(a.madeOnDate)}` : ''}
            </div>
          </div>
        </li>`).join('')}</ul>`;
    });
}

/* ------------------------------------------------------------------- */
/* Small helpers — kept inside this file so dashboard stays self-contained */
/* ------------------------------------------------------------------- */
async function loadKpi(selector, fetcher, mapper) {
  try {
    const r = await fetcher();
    fillCard(selector, mapper(r));
  } catch {
    fillCard(selector, '—');
  }
}

async function loadTable(selector, fetcher, renderer, cols) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const r = await fetcher();
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    el.innerHTML = renderer(list);
  } catch (e) {
    el.innerHTML = `<tr><td colspan="${cols}" class="text-error">
      <i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(e.message || 'Failed to load')}
    </td></tr>`;
  }
}

async function safeLoad(selector, fetcher, renderer) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const r = await fetcher();
    el.innerHTML = renderer(r);
  } catch (e) {
    el.innerHTML = `<div class="text-error small">
      <i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(e.message || 'Failed to load')}
    </div>`;
  }
}

function fillCard(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}