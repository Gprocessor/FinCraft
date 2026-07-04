/* FinCraft · pages/notifications/audit.js — audit trail tab loader and audit detail modal.
   Auto-split from the original monolithic pages/notifications.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml, fmtDate, num, sb } from '../../utils.js';
import { buildEntityLink } from './feed.js';
import { can, timeAgo } from './shared.js';

export async function loadAuditTrails(c) {
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

export async function openAuditDetailModal(auditId) {
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
