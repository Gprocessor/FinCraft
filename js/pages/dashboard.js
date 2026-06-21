/* FinCraft · dashboard.js — Live API only */
import { api } from '../api.js';
import { fmt, num, ini, sb, bars, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <div class="page-subtitle">Portfolio at a glance</div>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost" data-modal="quickModal"><i class="fa-solid fa-bolt"></i> Quick Action</button>
        <button class="btn-primary" data-modal="newClientModal"><i class="fa-solid fa-user-plus"></i> New Client</button>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active Clients</div><div class="value" id="stat-clients"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
      <div class="stat-card c-info"><div class="label">Active Loans</div><div class="value" id="stat-loans"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
      <div class="stat-card"><div class="label">Total Savings Balance</div><div class="value" id="stat-savings"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
      <div class="stat-card c-warn"><div class="label">Pending Tasks</div><div class="value" id="stat-tasks"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Recent Clients</h3><a data-nav="clients">All clients</a></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Client</th><th>Office</th><th>Since</th><th>Status</th></tr></thead><tbody id="recent-clients"><tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody></table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Pending Checker Tasks</h3><a data-nav="tasks">View all</a></div>
        <div id="pending-tasks"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Recent Loans</h3><a data-nav="loans">All loans</a></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Client</th><th>Outstanding</th><th>Status</th></tr></thead><tbody id="recent-loans"><tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody></table></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Recent Savings</h3><a data-nav="savings">All savings</a></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Client</th><th>Balance</th><th>Status</th></tr></thead><tbody id="recent-savings"><tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody></table></div>
      </div>
    </div>
  </div>`;

  // Two kinds of queries here, deliberately kept separate:
  //  - "recent" fetches (small limit, for the preview tables) — any status, most recent first
  //  - "stat" fetches (status-filtered) — used only to read totalFilteredRecords for the stat cards,
  //    so "Active Clients"/"Active Loans" actually mean active, not "whatever the preview returned"
  const [cl, ln, sv, tasks, clActive, lnActive, svActive] = await Promise.all([
    api.clients.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }).catch(() => null),
    api.loans.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }).catch(() => null),
    api.savings.list({ limit: 5, orderBy: 'id', sortOrder: 'DESC' }).catch(() => null),
    api.makerchecker.list({ limit: 100 }).catch(() => null),
    api.clients.list({ limit: 1, status: 'active' }).catch(() => null),
    api.loans.list({ limit: 1, status: 'active' }).catch(() => null),
    // NOTE: Fineract has no single "sum of all active savings balances" endpoint — a true
    // institution-wide total would need a Report or paging through every account. This caps
    // at 200 active accounts as a practical dashboard tradeoff (fine for demo/small deployments;
    // for a large production book this should be swapped for a real report query).
    api.savings.list({ limit: 200, status: 'active' }).catch(() => null)
  ]);

  // Stats
  c.querySelector('#stat-clients').textContent = num(clActive?.totalFilteredRecords ?? '—');
  c.querySelector('#stat-loans').textContent   = num(lnActive?.totalFilteredRecords ?? '—');

  const svActiveList = Array.isArray(svActive) ? svActive : (svActive?.pageItems || []);
  const svTotal = svActiveList.reduce((s, a) => s + (a.summary?.accountBalance || 0), 0);
  c.querySelector('#stat-savings').textContent = svActiveList.length ? fmt(svTotal) : '—';

  const taskList = Array.isArray(tasks) ? tasks : (tasks?.pageItems || []);
  c.querySelector('#stat-tasks').textContent = num(tasks?.totalFilteredRecords ?? taskList.length ?? 0);

  // Recent clients
  const clientList = Array.isArray(cl) ? cl : (cl?.pageItems || []);
  c.querySelector('#recent-clients').innerHTML = clientList.length
    ? clientList.map(x => `<tr>
        <td><div class="flex items-center gap-2"><div class="avatar">${ini(x.displayName)}</div>${escapeHtml(x.displayName)}</div></td>
        <td>${escapeHtml(x.officeName || '—')}</td>
        <td>${fmtDate(x.activationDate)}</td>
        <td>${sb(x.status?.value || '—')}</td></tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No clients found</div></div></td></tr>';

  // Pending tasks
  c.querySelector('#pending-tasks').innerHTML = taskList.length
    ? taskList.slice(0, 5).map(t => `
        <div class="flex items-center gap-3 mt-3" style="padding-bottom:12px;border-bottom:1px solid var(--border-1)">
          <div class="avatar">${ini(t.maker || t.maker_id || '?')}</div>
          <div style="flex:1">
            <div><b>${escapeHtml(t.actionName || t.action || '—')}</b> · ${escapeHtml(t.entityName || t.entity || '—')}</div>
            <div class="text-dim" style="font-size:12px">${escapeHtml(t.madeOnDate || t.made || '—')}</div>
          </div>
          <span class="badge b-warn">Pending</span>
        </div>`).join('')
    : '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No pending tasks</div></div>';

  // Recent loans
  const loanList = Array.isArray(ln) ? ln : (ln?.pageItems || []);
  c.querySelector('#recent-loans').innerHTML = loanList.length
    ? loanList.map(l => `<tr>
        <td class="mono">${escapeHtml(l.accountNo || `#${l.id}`)}</td>
        <td>${escapeHtml(l.clientName || l.clientDisplayName || '—')}</td>
        <td class="mono">${fmt(l.summary?.totalOutstanding ?? 0)}</td>
        <td>${sb(l.status?.value || '—')}</td></tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-hand-holding-dollar"></i><div>No loans found</div></div></td></tr>';

  // Recent savings
  c.querySelector('#recent-savings').innerHTML = svList.length
    ? svList.map(s => `<tr>
        <td class="mono">${escapeHtml(s.accountNo || `#${s.id}`)}</td>
        <td>${escapeHtml(s.clientName || '—')}</td>
        <td class="mono">${fmt(s.summary?.accountBalance ?? 0)}</td>
        <td>${sb(s.status?.value || '—')}</td></tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-piggy-bank"></i><div>No savings found</div></div></td></tr>';
}
