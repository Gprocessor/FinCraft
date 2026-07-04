/* FinCraft · pages/tasks/checker-inbox.js — maker-checker inbox: row wiring, bulk approve/reject, task detail modal.
   Auto-split from the original monolithic pages/tasks.js for maintainability. */

import { api } from '../../api.js';
import { today } from '../../config.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, fmtDate, num } from '../../utils.js';
import { can } from './shared.js';

export async function loadCheckerInbox(c) {
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

function openTaskDetailModal(task) {
  const mid = 'task-detail-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');

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
