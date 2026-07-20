/* FinCraft · pages/notifications/activity.js — my-activity tab loader.
   Auto-split from the original monolithic pages/notifications.js for maintainability. */

import { api } from '../../api.js';
import { today } from '../../config.js';
import { store } from '../../store.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { openAuditDetailModal } from './audit.js';
import { buildEntityLink } from './feed.js';
import { timeAgo } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function loadMyActivity(c) {
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
        <p>${escapeHtml(extractFineractError(e) || '')}</p>
      </div>`;
  }
}
