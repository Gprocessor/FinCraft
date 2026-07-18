/* FinCraft · ui/shell.js — nav structure, app shell bootstrap, global search, notif badge.
   Auto-split from the original monolithic ui.js for maintainability. */

import { store } from '../store.js';
import { navigate, PAGE_REGISTRY, isAllowed } from '../router.js';
import { escapeHtml } from '../utils.js';
import { api } from '../api.js';
import { sidebar } from './core.js';

// ════════════════════════════════════════════════════════════
// NAV STRUCTURE — mirrors FinCraft.html reference exactly
// ════════════════════════════════════════════════════════════
const NAV_GROUPS = [
  { title: 'Overview',           items: ['dashboard','analytics','tasks','navigation','search'] },
  { title: 'Clients & Accounts', items: ['clients','groups','centers','loans','savings','deposits','shares','collaterals','collections','transfers','remittances'] },
  { title: 'Finance',            items: ['accounting','reports','surveys'] },
  { title: 'Admin',              items: ['products','organization','system','users','templates','self-service','notifications'] }
];

/** Permission-aware nav visibility.
 *  If perms array is empty (server didn't return any), show everything so the
 *  authenticated user isn't left with a blank sidebar. Per-action permission
 *  checks inside each page still apply. */
function _isNavVisible(pageKey) {
  const def = PAGE_REGISTRY[pageKey];
  if (!def) return false;
  if (def.requiredPermission == null) return true;
  const perms = store.get('perms') || [];
  if (perms.length === 0) return true;
  return isAllowed(def);
}

// ════════════════════════════════════════════════════════════
// APP SHELL — full rebuild matching FinCraft.html design
// ════════════════════════════════════════════════════════════
export function mountAppShell() {
  const shell = document.getElementById('appShell');
  if (!shell) return;
  if (shell.dataset.mounted) { shell.removeAttribute('hidden'); return; }
  shell.dataset.mounted = '1';
  shell.classList.add('app-shell');
  shell.removeAttribute('hidden');

  const auth = store.get('auth') || {};
  const username = auth.username || 'user';
  const initial = (username[0] || 'U').toUpperCase();
  const tenant = auth.tenantId || 'default';
  const office = auth.officeName ? escapeHtml(auth.officeName) : '';

  // ---------- Sidebar HTML ----------
  const navHtml = NAV_GROUPS.map(g => {
    const items = g.items
      .filter(key => PAGE_REGISTRY[key])
      .filter(key => _isNavVisible(key))
      .map(key => {
        const def = PAGE_REGISTRY[key];
        const icon = def.icon || 'fa-circle-info';
        const badge = key === 'tasks'
          ? '<span class="nav-badge" id="tasksBadge" hidden>0</span>'
          : (key === 'notifications'
              ? '<span class="nav-badge red" id="notifDot" hidden></span>'
              : '');
        return `
          <button class="nav-item" data-nav="${key}" data-nav-key="${key}">
            <i class="fa-solid ${icon}"></i>
            <span>${escapeHtml(def.label)}</span>
            ${badge}
          </button>`;
      }).join('');
    if (!items) return '';
    return `
      <div class="nav-section">
        <div class="nav-section-label">${escapeHtml(g.title)}</div>
        ${items}
      </div>`;
  }).join('');

  // ---------- Full shell HTML ----------
  shell.innerHTML = `
    <a href="#contentArea" class="skip-link">Skip to main content</a>
    <aside class="sidebar" id="sidebar" role="navigation" aria-label="Main navigation">
      <div class="sidebar-brand" data-nav="dashboard">
        <div class="brand-icon">F</div>
        <div class="brand-text">
          <div class="brand-name">FinCraft</div>
          <div class="brand-sub">Fineract Platform</div>
        </div>
      </div>
      <div class="sidebar-scroll">${navHtml}</div>
      <div class="sidebar-footer">
        <div class="user-card" data-nav="profile">
          <div class="user-avatar">${escapeHtml(initial)}</div>
          <div class="user-info">
            <div class="user-name">${escapeHtml(username)}</div>
            <div class="user-role">${escapeHtml(tenant)} · ${office || 'Member'}</div>
          </div>
        </div>
      </div>
    </aside>

    <div class="main-area">
      <header class="topbar">
        <button class="topbar-btn" data-action="toggle-sidebar" title="Toggle sidebar">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="topbar-breadcrumb">
          <span class="text-muted">FinCraft</span>
          <i class="fa-solid fa-chevron-right" style="font-size:9px;opacity:.4"></i>
          <span class="crumb-current" id="breadcrumb">Dashboard</span>
        </div>
        <div style="position:relative;flex:1;max-width:280px;margin:0 auto">
          <div class="topbar-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="globalSearch" type="text" placeholder="Search clients, loans… (Ctrl+K)" autocomplete="off"/>
          </div>
          <div class="search-results" id="globalSearchResults" hidden></div>
        </div>
        <div class="topbar-tenant" title="Tenant">
          <i class="fa-solid fa-server" style="font-size:10px"></i>
          <span class="tenant-id">${escapeHtml(tenant)}</span>
        </div>
        <div class="flex gap-1">
          <button class="topbar-btn" data-action="open-cmd" title="Command palette (Ctrl+K)">
            <i class="fa-solid fa-terminal"></i>
          </button>
          <button class="topbar-btn" data-modal="quickModal" title="Quick action">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button class="topbar-btn" data-nav="notifications" title="Notifications" style="position:relative">
            <i class="fa-solid fa-bell"></i>
            <div class="topbar-badge" id="notifBadgeDot" hidden></div>
          </button>
          <button class="topbar-btn" id="themeBtn" data-action="toggle-theme" title="Toggle theme">
            <i class="fa-solid fa-${store.get('theme') === 'light' ? 'sun' : 'moon'}"></i>
          </button>
          <div class="dropdown" id="userMenu">
            <button class="topbar-btn" data-action="toggle-user-menu" title="Account">
              <i class="fa-solid fa-circle-user" style="font-size:17px"></i>
            </button>
            <div class="dropdown-menu">
              <div class="dropdown-header">Signed in as <b>${escapeHtml(username)}</b></div>
              <button class="dropdown-item" data-nav="profile"><i class="fa-solid fa-id-card"></i> My Profile</button>
              <button class="dropdown-item" data-nav="settings"><i class="fa-solid fa-gear"></i> Settings</button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" data-action="logout"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
            </div>
          </div>
        </div>
      </header>

      <main class="content-area" id="contentArea" role="main" tabindex="-1">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </main>
    </div>

    <div class="nav-scrim" id="navScrim"></div>
  `;

  // Toast container outside the grid so it overlays freely
  if (!document.getElementById('toastContainer')) {
    const tc = document.createElement('div');
    tc.id = 'toastContainer';
    tc.className = 'toast-container';
    tc.setAttribute('aria-live', 'assertive');
    document.body.appendChild(tc);
  }

  // Command palette container (used by cmd.js)
  if (!document.getElementById('cmdPalette')) {
    const cp = document.createElement('div');
    cp.id = 'cmdPalette';
    cp.className = 'cmd-palette';
    cp.hidden = true;
    cp.innerHTML = `
      <div class="cmd-box">
        <div class="cmd-input-row">
          <i class="fa-solid fa-terminal"></i>
          <input id="cmdInput" class="cmd-input" placeholder="Type a command or search…" autocomplete="off"/>
          <span class="cmd-hint">ESC to close</span>
        </div>
        <div class="cmd-results" id="cmdResults"></div>
        <div class="cmd-footer">
          <div class="cmd-key"><kbd>↑↓</kbd> Navigate</div>
          <div class="cmd-key"><kbd>↵</kbd> Select</div>
          <div class="cmd-key"><kbd>ESC</kbd> Close</div>
        </div>
      </div>`;
    document.body.appendChild(cp);
  }

  // Apply persisted sidebar state on desktop
  if (window.innerWidth > 720 && store.get('sidebar') === 'collapsed') {
    document.getElementById('sidebar')?.classList.add('collapsed');
  }
  document.documentElement.setAttribute('data-theme', store.get('theme') || 'dark');

  // Mobile scrim closes the drawer
  document.getElementById('navScrim')?.addEventListener('click', () => sidebar.close());

  // Load modal HTML once. views/modals.html used to be a single 1,345-line file; it's
  // now split into views/modals/<domain>.html partials (one per js/api/<domain>.js
  // domain, same idea as api/index.js assembling FineractAPIFull from domain modules).
  // All partials are fetched in parallel and concatenated in a fixed order so modal
  // markup always ends up in the same relative position in #modalRoot as before.
  const MODAL_PARTIALS = [
    'clients', 'loans', 'savings-deposits', 'shares', 'groups-centers',
    'accounting', 'organization', 'admin', 'products', 'integrations', 'system'
  ];
  Promise.all(
    MODAL_PARTIALS.map(name =>
      fetch(`./views/modals/${name}.html`).then(r => r.ok ? r.text() : '').catch(() => '')
    )
  )
    .then(htmlParts => htmlParts.join('\n'))
    .then(html => {
      const root = document.getElementById('modalRoot');
      if (root && !root.dataset.loaded) {
        root.innerHTML = html;
        root.dataset.loaded = '1';
        document.dispatchEvent(new CustomEvent('fc:modals-loaded'));
      }
    })
    .catch(() => {});

  _wireGlobalSearch();
  _refreshNotifBadge();

  // Re-render nav whenever perms change
  store.subscribe('perms', () => { _gateNavByPerms(); _refreshNotifBadge(); });
}

function _gateNavByPerms() {
  document.querySelectorAll('[data-nav-key]').forEach(btn => {
    const key = btn.dataset.navKey;
    btn.style.display = _isNavVisible(key) ? '' : 'none';
  });
}

// ════════════════════════════════════════════════════════════
// GLOBAL SEARCH (debounced /search call)
// ════════════════════════════════════════════════════════════
function _wireGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const box   = document.getElementById('globalSearchResults');
  if (!input || !box) return;
  let timer;
  const close = () => { box.hidden = true; box.innerHTML = ''; };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      try {
        const res = await api.search.search(q);
        const items = Array.isArray(res) ? res : (res?.pageItems || []);
        if (!items.length) {
          box.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-3);font-size:13px">No matches for "${escapeHtml(q)}"</div>`;
          box.hidden = false; return;
        }
        box.innerHTML = items.slice(0, 8).map(r => {
          const type = (r.entityType || '').toLowerCase();
          const id   = r.entityId || r.id;
          const icon = type === 'client' ? 'fa-user'
                     : type === 'loan'   ? 'fa-hand-holding-dollar'
                     : type === 'group'  ? 'fa-people-group'
                     : 'fa-magnifying-glass';
          const route = type === 'client' ? `client-detail?id=${id}`
                      : type === 'loan'   ? `loans?id=${id}`
                      : type === 'group'  ? `groups?id=${id}`
                      : 'search';
          return `
            <button class="sr-item" data-nav="${route}">
              <div class="sr-icon" style="background:rgba(0,201,177,.1);color:var(--brand-teal)">
                <i class="fa-solid ${icon}"></i>
              </div>
              <div>
                <div class="sr-type">${escapeHtml(r.entityType || '')}</div>
                <div class="sr-name">${escapeHtml(r.entityAccountNo || r.entityName || '—')}</div>
              </div>
            </button>`;
        }).join('');
        box.hidden = false;
      } catch (e) {
        box.innerHTML = `<div style="padding:14px;text-align:center;color:var(--clr-danger);font-size:13px">Search failed: ${escapeHtml(e.message || '')}</div>`;
        box.hidden = false;
      }
    }, 250);
  });

  input.addEventListener('blur',  () => setTimeout(close, 150));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) box.hidden = false; });
}

async function _refreshNotifBadge() {
  const dot = document.getElementById('notifBadgeDot');
  if (!dot) return;
  try {
    const r = await api.notifications.list({ isRead: false, limit: 1 });
    const count = r?.totalFilteredRecords ?? (Array.isArray(r) ? r.length : (r?.pageItems?.length || 0));
    dot.hidden = !(count > 0);
  } catch {}
}

