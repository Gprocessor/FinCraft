/* FinCraft · pages/notifications/feed.js — the notifications feed tab loader.
   Auto-split from the original monolithic pages/notifications.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num } from '../../utils.js';
import { ENTITY_ROUTES, _lastSeenNotifId, setLastSeenNotifId, timeAgo } from './shared.js';

export async function loadNotifications(c) {
  const el = c.querySelector('#nt-0');
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';

  try {
    const res = await api.notifications.list({ limit: 100, orderBy: 'createdAt', sortOrder: 'DESC' });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    if (list.length) setLastSeenNotifId(list[0].id);

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

export function buildEntityLink(objectType, objectId) {
  if (!objectType || !objectId) return null;
  const route = ENTITY_ROUTES[(objectType || '').toUpperCase()];
  if (!route) return null;
  return `#/${route}?id=${objectId}`;
}
