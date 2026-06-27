import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · tasks.js — Checker Inbox & Pending Approvals (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { sb, fmt, num, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = ['Checker Inbox', 'Loan Approvals', 'Client Approvals', 'Reschedule Requests'];

let _autoRefresh = false;
let _refreshTimer = null;

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════
// TAB 0 — CHECKER INBOX (filters, KPIs, bulk ops)
// ════════════════════════════════════════════════════════════
async function loadCheckerInbox(c) {
  const el = c.querySelector('#tk-0');
  el.innerHTML = `<div class="empty-state-row">Loading checker inbox…</div>`;
  try {
    const res = await api.makerchecker.list({ limit: 200 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    // KPIs computation
    const actionGroups = {};
    const entityGroups = {};
    let todayCount = 0;
    const todayStr = today();

    list.forEach(t => {
      const action = t.actionName || t.action || 'Unknown';
      const entity = t.entityName || t.entity || 'Unknown';
      actionGroups[action] = (actionGroups[action] || 0) + 1;
      entityGroups[entity] = (entityGroups[entity] || 0) + 1;
      const dateStr = typeof t.madeOnDate === 'object'
        ? (Array.isArray(t.madeOnDate) ? t.madeOnDate.join('-') : '')
        : (t.madeOnDate || '');
      if (dateStr.startsWith(todayStr)) todayCount++;
    });

    const topAction = Object.entries(actionGroups).sort((a, b) => b[1] - a[1])[0];
    const topEntity = Object.entries(entityGroups).sort((a, b) => b[1] - a[1])[0];

    const canApprove = can('CHECKER_APPROVE') || can('CHECKER_SUPER_USER');
    const canReject  = can('CHECKER_REJECT')  || can('CHECKER_SUPER_USER');
    const canDelete  = can('CHECKER_DELETE')  || can('CHECKER_SUPER_USER');
    const showCheckboxes = canApprove || canReject || canDelete;
    const colspan = showCheckboxes ? 7 : 6;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Created Today</div><div class="kpi-value">${num(todayCount)}</div></div>
        <div class="kpi-card">
          <div class="kpi-label">Top Action</div>
          <div class="kpi-value" style="font-size:14px">${topAction ? escapeHtml(topAction[0]) : '—'}</div>
          <div class="kpi-foot text-muted">${topAction ? `${topAction[1]} item${topAction[1] !== 1 ? 's' : ''}` : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Top Entity</div>
          <div class="kpi-value" style="font-size:14px">${topEntity ? escapeHtml(topEntity[0]) : '—'}</div>
          <div class="kpi-foot text-muted">${topEntity ? `${topEntity[1]} item${topEntity[1] !== 1 ? 's' : ''}` : ''}</div>
        </div>
      </div>

      <div class="filter-bar mb-2">
        <input id="ck-search" class="form-control" placeholder="Search action, entity, maker…" autocomplete="off"/>
        <select id="ck-action-filter" class="form-control">
          <option value="">All actions</option>
          ${Object.keys(actionGroups).sort().map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)} (${actionGroups[a]})</option>`).join('')}
        </select>
        <select id="ck-entity-filter" class="form-control">
          <option value="">All entities</option>
          ${Object.keys(entityGroups).sort().map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)} (${entityGroups[e]})</option>`).join('')}
        </select>
      </div>

      ${list.length && showCheckboxes ? `
        <div class="section-header mb-2">
          <div>
            <span class="text-muted"><span id="ck-selected-count">0</span> selected</span>
          </div>
          <div>
            ${canApprove ? `<button class="btn-success btn-sm" id="ck-bulk-approve" disabled><i class="fa-solid fa-check"></i> Bulk Approve</button>` : ''}
            ${canReject  ? `<button class="btn-warning btn-sm" id="ck-bulk-reject" disabled><i class="fa-solid fa-ban"></i> Bulk Reject</button>` : ''}
          </div>
        </div>` : ''}

      <table class="table">
        <thead><tr>
          ${showCheckboxes ? '<th><input type="checkbox" id="ck-select-all"/></th>' : ''}
          <th>ID</th><th>Action</th><th>Entity</th>
          <th>Maker</th><th>Made On</th><th></th>
        </tr></thead>
        <tbody id="ck-tbody">
          <tr><td colspan="${colspan}" class="empty-state-row">Filtering…</td></tr>
        </tbody>
      </table>`;

    function draw(rows) {
      const tbody = el.querySelector('#ck-tbody');
      tbody.innerHTML = rows.length ? rows.map(t => {
        const dateVal = typeof t.madeOnDate === 'object'
          ? fmtDate(t.madeOnDate)
          : (t.madeOnDate || '—');
        return `
          <tr data-task-id="${t.id}">
            ${showCheckboxes ? `<td><input type="checkbox" class="ck-row-chk" value="${t.id}"/></td>` : ''}
            <td><b>#${t.id || '—'}</b></td>
            <td><b>${escapeHtml(t.actionName || t.action || '—')}</b></td>
            <td>${escapeHtml(t.entityName || t.entity || '—')}</td>
            <td>${escapeHtml(t.maker || '—')}</td>
            <td>${escapeHtml(dateVal)}</td>
            <td class="text-right">
              <button class="btn-mini" data-view-task="${t.id}">Detail</button>
              ${canApprove ? `<button class="btn-mini btn-success" data-approve="${t.id}">Approve</button>` : ''}
              ${canReject  ? `<button class="btn-mini btn-warning" data-reject="${t.id}">Reject</button>` : ''}
              ${canDelete  ? `<button class="btn-mini btn-danger" data-cancel="${t.id}">Cancel</button>` : ''}
            </td>
          </tr>`;
      }).join('') : `<tr><td colspan="${colspan}" class="empty-state-row">No pending checker tasks</td></tr>`;

      wireRowActions(c, el);
      updateSelectedCount(el);
    }

    function applyFilters() {
      const q = el.querySelector('#ck-search').value.toLowerCase().trim();
      const actionFilter = el.querySelector('#ck-action-filter').value;
      const entityFilter = el.querySelector('#ck-entity-filter').value;

      let filtered = list;
      if (q) filtered = filtered.filter(t =>
        (t.actionName || t.action || '').toLowerCase().includes(q) ||
        (t.entityName || t.entity || '').toLowerCase().includes(q) ||
        (t.maker || '').toLowerCase().includes(q));
      if (actionFilter) filtered = filtered.filter(t => (t.actionName || t.action) === actionFilter);
      if (entityFilter) filtered = filtered.filter(t => (t.entityName || t.entity) === entityFilter);

      draw(filtered);
    }

    let t;
    el.querySelector('#ck-search').addEventListener('input', () => {
      clearTimeout(t); t = setTimeout(applyFilters, 250);
    });
    el.querySelector('#ck-action-filter').addEventListener('change', applyFilters);
    el.querySelector('#ck-entity-filter').addEventListener('change', applyFilters);

    if (showCheckboxes) {
      el.querySelector('#ck-select-all').addEventListener('change', (e) => {
        el.querySelectorAll('.ck-row-chk').forEach(cb => cb.checked = e.target.checked);
        updateSelectedCount(el);
      });

      el.querySelector('#ck-bulk-approve')?.addEventListener('click', () => bulkApprove(c, el));
      el.querySelector('#ck-bulk-reject')?.addEventListener('click', () => bulkReject(c, el));
    }

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// ROW ACTION WIRING (Detail, Approve, Reject, Cancel)
// ════════════════════════════════════════════════════════════
function wireRowActions(c, el) {
  // Row checkbox listeners
  el.querySelectorAll('.ck-row-chk').forEach(cb =>
    cb.addEventListener('change', () => updateSelectedCount(el))
  );

  // Detail viewer
  el.querySelectorAll('[data-view-task]').forEach(b => b.addEventListener('click', async () => {
    const taskId = b.dataset.viewTask;
    try {
      const res = await api.makerchecker.list({ makerCheckerId: taskId });
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      const task = list.find(t => String(t.id) === String(taskId)) || list[0];
      if (task) openTaskDetailModal(task);
      else toast('warn', 'Task not found', '');
    } catch (e) {
      toast('error', 'Failed to load', e.detail?.defaultUserMessage || e.message);
    }
  }));

  // Individual approve
  el.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
    try {
      await api.makerchecker.approve(b.dataset.approve);
      b.closest('tr')?.remove();
      toast('success', 'Approved', `Task #${b.dataset.approve}`);
    } catch (e) {
      toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message);
    }
  }));

  // Individual reject
  el.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
    if (!await modalConfirm({
      title: 'Reject task?',
      message: `Reject task #${b.dataset.reject}?`,
      danger: true,
      confirmText: 'Reject'
    })) return;
    try {
      await api.makerchecker.reject(b.dataset.reject);
      b.closest('tr')?.remove();
      toast('warn', 'Rejected', `Task #${b.dataset.reject}`);
    } catch (e) {
      toast('error', 'Rejection failed', e.detail?.defaultUserMessage || e.message);
    }
  }));

  // Individual cancel/delete
  el.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    if (!await modalConfirm({
      title: 'Cancel task?',
      message: `Withdraw task #${b.dataset.cancel} without approving or rejecting?`,
      danger: true,
      confirmText: 'Cancel Task'
    })) return;
    try {
      await api.makerchecker.delete(b.dataset.cancel);
      b.closest('tr')?.remove();
      toast('info', 'Task cancelled', `Task #${b.dataset.cancel}`);
    } catch (e) {
      toast('error', 'Cancel failed', e.detail?.defaultUserMessage || e.message);
    }
  }));
}

// ════════════════════════════════════════════════════════════
// BULK SELECTION HELPERS
// ════════════════════════════════════════════════════════════
function updateSelectedCount(el) {
  const selected = el.querySelectorAll('.ck-row-chk:checked').length;
  const countEl = el.querySelector('#ck-selected-count');
  if (countEl) countEl.textContent = num(selected);
  const bulkApproveBtn = el.querySelector('#ck-bulk-approve');
  const bulkRejectBtn  = el.querySelector('#ck-bulk-reject');
  if (bulkApproveBtn) bulkApproveBtn.disabled = selected === 0;
  if (bulkRejectBtn)  bulkRejectBtn.disabled  = selected === 0;
}

async function bulkApprove(c, el) {
  const ids = [...el.querySelectorAll('.ck-row-chk:checked')].map(cb => cb.value);
  if (!ids.length) return;
  if (!await modalConfirm({
    title: `Approve ${ids.length} tasks?`,
    message: 'All selected tasks will be approved sequentially.',
    confirmText: 'Approve All'
  })) return;

  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      await api.makerchecker.approve(id);
      el.querySelector(`tr[data-task-id="${id}"]`)?.remove();
      ok++;
    } catch {
      fail++;
    }
  }
  if (fail) toast('warn', `${ok} approved, ${fail} failed`, '');
  else      toast('success', `${ok} tasks approved`, '');
  updateSelectedCount(el);
}

async function bulkReject(c, el) {
  const ids = [...el.querySelectorAll('.ck-row-chk:checked')].map(cb => cb.value);
  if (!ids.length) return;
  if (!await modalConfirm({
    title: `Reject ${ids.length} tasks?`,
    message: 'All selected tasks will be rejected sequentially.',
    danger: true,
    confirmText: 'Reject All'
  })) return;

  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      await api.makerchecker.reject(id);
      el.querySelector(`tr[data-task-id="${id}"]`)?.remove();
      ok++;
    } catch {
      fail++;
    }
  }
  if (fail) toast('warn', `${ok} rejected, ${fail} failed`, '');
  else      toast('warn', `${ok} tasks rejected`, '');
  updateSelectedCount(el);
}

// ════════════════════════════════════════════════════════════
// TASK DETAIL MODAL
// ════════════════════════════════════════════════════════════
function openTaskDetailModal(task) {
  const mid = 'task-detail-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';

  // Pretty-print JSON of pending change
  let jsonPreview = '—';
  try {
    if (task.commandAsJson) {
      const parsed = JSON.parse(task.commandAsJson);
      jsonPreview = JSON.stringify(parsed, null, 2);
    } else {
      jsonPreview = JSON.stringify(task, null, 2);
    }
  } catch {
    jsonPreview = String(task.commandAsJson || task);
  }

  modalEl.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header">
        <h3>Task #${task.id} — ${escapeHtml(task.actionName || task.action || 'Unknown')}</h3>
        <button data-close-modal>&times;</button>
      </div>
      <div class="modal-body">
        <div class="grid-2">
          <div>
            <dl class="dl-grid">
              <dt>Action</dt><dd>${escapeHtml(task.actionName || task.action || '—')}</dd>
              <dt>Entity</dt><dd>${escapeHtml(task.entityName || task.entity || '—')}</dd>
              <dt>Resource ID</dt><dd>${escapeHtml(String(task.resourceId || task.entityId || '—'))}</dd>
              <dt>Office</dt><dd>${escapeHtml(task.officeName || '—')}</dd>
            </dl>
          </div>
          <div>
            <dl class="dl-grid">
              <dt>Maker</dt><dd>${escapeHtml(task.maker || '—')}</dd>
              <dt>Made On</dt><dd>${escapeHtml(typeof task.madeOnDate === 'object' ? fmtDate(task.madeOnDate) : (task.madeOnDate || '—'))}</dd>
              <dt>Checker</dt><dd>${escapeHtml(task.checker || '—')}</dd>
              <dt>URL</dt><dd><code style="font-size:11px">${escapeHtml(task.url || task.resourceURL || '—')}</code></dd>
            </dl>
          </div>
        </div>

        <h4 class="mt-3">Pending Change Payload</h4>
        <pre style="background:var(--surface-1); padding:12px; border-radius:4px; max-height:400px; overflow:auto; font-family:monospace; font-size:12px">${escapeHtml(jsonPreview)}</pre>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Close</button>
      </div>
    </div>`;

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );
}
// ════════════════════════════════════════════════════════════
// TAB 1 — LOAN APPROVALS
// ════════════════════════════════════════════════════════════
async function loadLoanApprovals(c) {
  const el = c.querySelector('#tk-1');
  el.innerHTML = '<div class="empty-state-row">Loading loan approvals…</div>';
  try {
    const res = await api.loans.list({ status: 'approvalPending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const canApprove = can('APPROVE_LOAN');

    const headerHtml = '<div class="section-header mb-2"><span class="text-muted">' +
      list.length + ' loan' + (list.length !== 1 ? 's' : '') + ' pending approval</span></div>';

    let bodyHtml;
    if (list.length) {
      const rows = list.map(function(l) {
        const approveBtn = canApprove
          ? '<button class="btn-mini btn-success" data-loan-approve="' + l.id + '">Approve</button>'
          : '';
        return '<tr>' +
          '<td><a href="#/loans?id=' + l.id + '">' + escapeHtml(l.accountNo) + '</a></td>' +
          '<td>' + escapeHtml(l.clientName || l.clientDisplayName || '—') + '</td>' +
          '<td>' + escapeHtml(l.loanProductName || '—') + '</td>' +
          '<td class="text-right">' + fmt(l.principal || l.approvedPrincipal || 0) + '</td>' +
          '<td>' + fmtDate(l.timeline?.submittedOnDate) + '</td>' +
          '<td class="text-right">' + approveBtn + '</td>' +
          '</tr>';
      }).join('');

      bodyHtml = '<table class="table"><thead><tr>' +
        '<th>Account</th><th>Client</th><th>Product</th>' +
        '<th class="text-right">Principal</th><th>Submitted</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      bodyHtml = '<div class="empty-state-row">No loans pending approval</div>';
    }

    el.innerHTML = headerHtml + bodyHtml;

    el.querySelectorAll('[data-loan-approve]').forEach(function(b) {
      b.addEventListener('click', async function() {
        try {
          await api.loans.approve(b.dataset.loanApprove, {
            approvedOnDate: today(),
            dateFormat: DATE_FORMAT,
            locale: LOCALE
          });
          b.closest('tr')?.remove();
          toast('success', 'Loan approved', '#' + b.dataset.loanApprove);
        } catch (e) {
          toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message);
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<div class="text-error">' + escapeHtml(e.detail?.defaultUserMessage || e.message) + '</div>';
  }
}

// ════════════════════════════════════════════════════════════
// TAB 2 — CLIENT APPROVALS
// ════════════════════════════════════════════════════════════
async function loadClientApprovals(c) {
  const el = c.querySelector('#tk-2');
  el.innerHTML = '<div class="empty-state-row">Loading client approvals…</div>';
  try {
    const res = await api.clients.list({ status: 'pending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const canActivate = can('ACTIVATE_CLIENT');

    const headerHtml = '<div class="section-header mb-2"><span class="text-muted">' +
      list.length + ' client' + (list.length !== 1 ? 's' : '') + ' pending activation</span></div>';

    let bodyHtml;
    if (list.length) {
      const rows = list.map(function(cl) {
        const activateBtn = canActivate
          ? '<button class="btn-mini btn-success" data-client-activate="' + cl.id + '">Activate</button>'
          : '';
        return '<tr>' +
          '<td><a href="#/client-detail?id=' + cl.id + '">' + escapeHtml(cl.accountNo) + '</a></td>' +
          '<td>' + escapeHtml(cl.displayName) + '</td>' +
          '<td>' + escapeHtml(cl.officeName || '—') + '</td>' +
          '<td>' + fmtDate(cl.submittedOnDate) + '</td>' +
          '<td class="text-right">' + activateBtn + '</td>' +
          '</tr>';
      }).join('');

      bodyHtml = '<table class="table"><thead><tr>' +
        '<th>Account</th><th>Name</th><th>Office</th><th>Submitted</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      bodyHtml = '<div class="empty-state-row">No clients pending activation</div>';
    }

    el.innerHTML = headerHtml + bodyHtml;

    el.querySelectorAll('[data-client-activate]').forEach(function(b) {
      b.addEventListener('click', async function() {
        try {
          await api.clients.activate(b.dataset.clientActivate, today());
          b.closest('tr')?.remove();
          toast('success', 'Client activated', '#' + b.dataset.clientActivate);
        } catch (e) {
          toast('error', 'Failed', e.detail?.defaultUserMessage || e.message);
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<div class="text-error">' + escapeHtml(e.detail?.defaultUserMessage || e.message) + '</div>';
  }
}

// ════════════════════════════════════════════════════════════
// TAB 3 — RESCHEDULE REQUESTS (Fineract limitation acknowledged)
// ════════════════════════════════════════════════════════════
async function loadRescheduleRequests(c) {
  const el = c.querySelector('#tk-3');
  el.innerHTML =
    '<div class="empty-state">' +
      '<i class="fa-solid fa-circle-info"></i>' +
      '<h3>Reschedule Requests are managed per-loan</h3>' +
      '<div class="text-muted mt-2" style="max-width:500px; margin:0 auto">' +
        'Fineract does not expose a system-wide list of pending reschedule requests. ' +
        'Each loan\'s <b>Reschedule</b> tab shows its own requests and allows approve/reject.' +
      '</div>' +
      '<div class="mt-3" style="display:flex; gap:8px; justify-content:center">' +
        '<button class="btn-primary" data-nav-loans><i class="fa-solid fa-list"></i> Go to Loans</button>' +
        '<button class="btn-secondary" data-nav-checker><i class="fa-solid fa-inbox"></i> Use Checker Inbox</button>' +
      '</div>' +
    '</div>';

  el.querySelector('[data-nav-loans]').addEventListener('click', function() {
    import('../router.js').then(function(r) { r.navigate('loans'); });
  });
  el.querySelector('[data-nav-checker]').addEventListener('click', function() {
    c.querySelector('[data-tab="tk-0"]').click();
  });
}

/* END OF FILE — js/pages/tasks.js */