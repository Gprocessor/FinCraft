/* FinCraft · ui.js — App shell, modals, toasts, tabs, shortcuts, form handlers
   All submit-* actions call the real Fineract API via api.js. No mock data.
   Design parity with FinCraft.html reference (deep navy + electric teal). */
import { store } from './store.js';
import { navigate, PAGE_REGISTRY } from './router.js';
import { escapeHtml } from './utils.js';
import { api } from './api.js';
import { LOCALE, DATE_FORMAT, today } from './config.js';

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
  const need = def.requiredPermission;
  if (need == null) return true;
  const perms = store.get('perms') || [];
  if (perms.length === 0) return true;
  const codes = Array.isArray(need) ? need : [need];
  return codes.some(c => store.hasPermission(c));
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
    <aside class="sidebar" id="sidebar">
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

      <main class="content-area" id="contentArea">
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

  // Load modal HTML once
  fetch('./views/modals.html')
    .then(r => r.ok ? r.text() : '')
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

// ════════════════════════════════════════════════════════════
// EXPORTED HELPERS — breadcrumb, active nav, toast, modal, etc.
// ════════════════════════════════════════════════════════════
export function setBreadcrumb(parts) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  if (!Array.isArray(parts) || !parts.length) { el.textContent = ''; return; }
  el.textContent = parts[parts.length - 1];
}

export function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
}

export function toast(type, title, msg, durationMs = 4500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  const iconMap = {
    success: 'fa-circle-check',
    warn:    'fa-triangle-exclamation',
    warning: 'fa-triangle-exclamation',
    error:   'fa-circle-xmark',
    info:    'fa-circle-info'
  };
  const cls = type === 'warn' ? 'warning' : type;
  const icon = iconMap[type] || 'fa-circle-info';
  t.className = `toast ${cls}`;
  t.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div style="flex:1">
      <div class="toast-title">${escapeHtml(title || '')}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
    dismiss-toast
      <i class="fa-solid fa-xmark"></i>
    </button>`;
  c.appendChild(t);
  t.querySelector('[data-action="dismiss-toast"]').addEventListener('click', () => t.remove());
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = 'all .2s';
    setTimeout(() => t.remove(), 200);
  }, durationMs);
}

export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) { console.warn('[modal not found]', id); return null; }
  m.classList.add('open');
  setTimeout(() => m.querySelector('input,select,textarea,button')?.focus(), 50);
  return m;
}

export function closeModal(id) {
  const m = (typeof id === 'string') ? document.getElementById(id) : id;
  m?.classList.remove('open');
}

export function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

/** Generic entity detail panel reused by Centers, Groups, etc. */
export async function showEntityDetail({ title, fetchFn, renderBody, onMount }) {
  const titleEl = document.getElementById('edm-title');
  const bodyEl  = document.getElementById('edm-body');
  const footEl  = document.getElementById('edm-foot');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';
  if (footEl) footEl.innerHTML = '<button class="btn-ghost" data-close-modal>Close</button>';
  openModal('entityDetailModal');
  const refresh = () => showEntityDetail({ title, fetchFn, renderBody, onMount });
  try {
    const data = await fetchFn();
    bodyEl.innerHTML = renderBody(data);
    if (onMount) onMount(bodyEl, data, refresh);
  } catch (e) {
    bodyEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation empty-state-icon"></i><h3>${escapeHtml(e.message || String(e))}</h3></div>`;
  }
}

export function tab(btn, panelId) {
  const tabs = btn.closest('.tabs');
  const root = btn.closest('.card, .modal, .page, body');
  tabs?.querySelectorAll('.tab, .tab-btn').forEach(t => t.classList.toggle('active', t === btn));
  root?.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
}

export function dropdownToggle(id) {
  const d = document.getElementById(id);
  if (!d) return;
  const wasOpen = d.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) d.classList.add('open');
}

export const sidebar = {
  toggle() {
    const shell   = document.getElementById('appShell');
    const sidebarEl = document.getElementById('sidebar');
    if (!shell || !sidebarEl) return;
    if (window.innerWidth <= 720) {
      sidebarEl.classList.remove('collapsed');
      shell.classList.toggle('nav-open');
    } else {
      const next = store.get('sidebar') === 'collapsed' ? 'expanded' : 'collapsed';
      store.set('sidebar', next);
      sidebarEl.classList.toggle('collapsed', next === 'collapsed');
    }
  },
  close() {
    document.getElementById('appShell')?.classList.remove('nav-open');
  }
};

export const theme = {
  toggle() {
    const next = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.set('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    const icon = document.querySelector('#themeBtn i');
    if (icon) icon.className = `fa-solid fa-${next === 'light' ? 'sun' : 'moon'}`;
  }
};

export function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const id = 'cfm_' + Date.now();
    const root = document.getElementById('modalRoot') || document.body;
    root.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="modal-overlay open">
        <div class="modal modal-sm">
          <div class="modal-head">
            <h3 class="modal-title">${escapeHtml(title)}</h3>
            <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body"><p class="text-muted">${escapeHtml(message)}</p></div>
          <div class="modal-foot">
            <button class="btn-ghost" data-close-modal>Cancel</button>
            <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`);
    const el = document.getElementById(id);
    el.querySelector('[data-confirm]').addEventListener('click', () => { el.remove(); resolve(true); });
    el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { el.remove(); resolve(false); }));
    el.addEventListener('click', (e) => { if (e.target === el) { el.remove(); resolve(false); } });
  });
}

// ════════════════════════════════════════════════════════════
// SHARED HELPERS (form data, submitting state, error extract)
// ════════════════════════════════════════════════════════════
function formData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((v, k) => {
    // Multi-select: collect into array
    if (obj[k] !== undefined) {
      if (Array.isArray(obj[k])) obj[k].push(v);
      else obj[k] = [obj[k], v];
    } else {
      obj[k] = v;
    }
  });
  return obj;
}

function setSubmitting(btn, loading = true) {
  if (!btn) return;
  btn._origHtml = btn._origHtml || btn.innerHTML;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing…'
    : btn._origHtml;
}

function extractFineractError(e) {
  if (!e) return 'Unknown error';
  if (e.detail?.errors?.[0]?.defaultUserMessage) return e.detail.errors[0].defaultUserMessage;
  if (e.detail?.defaultUserMessage) return e.detail.defaultUserMessage;
  if (e.detail?.errors?.[0]?.developerMessage) return e.detail.errors[0].developerMessage;
  if (e.detail?.developerMessage) return e.detail.developerMessage;
  if (typeof e.detail === 'string') return e.detail;
  return e.message || 'API error';
}

function collectJournalRows(selector) {
  const rows = [];
  document.querySelectorAll(`${selector} tr`).forEach(row => {
    const acct = row.querySelector('[data-je-account]')?.value;
    const amt  = parseFloat(row.querySelector('[data-je-amount]')?.value);
    if (acct && !isNaN(amt) && amt > 0) {
      rows.push({ glAccountId: parseInt(acct), amount: amt });
    }
  });
  return rows;
}

// ════════════════════════════════════════════════════════════
// MODAL DROPDOWN POPULATION (offices, staff, products, etc.)
// ════════════════════════════════════════════════════════════
async function populateModalDropdowns() {
  const results = await Promise.allSettled([
    api.offices.list(),
    api.staff.list(),
    api.loanProducts.list(),
    api.savingsProducts.list(),
    api.fdProducts.list(),
    api.rdProducts.list(),
    api.clients.template(),
    api.currencies.list(),
    api.glAccounts.list(),
    api.financialActivityAccounts.list()
  ]);
  const get = (i, fb = []) => results[i].status === 'fulfilled' ? (results[i].value ?? fb) : fb;

  const offices   = Array.isArray(get(0)) ? get(0) : [];
  const staff     = Array.isArray(get(1)) ? get(1) : (get(1)?.pageItems || []);
  const loanProds = Array.isArray(get(2)) ? get(2) : [];
  const savProds  = Array.isArray(get(3)) ? get(3) : [];
  const fdProds   = Array.isArray(get(4)) ? get(4) : [];
  const rdProds   = Array.isArray(get(5)) ? get(5) : [];
  const clientTpl = get(6, {});
  const currList  = get(7)?.selectedCurrencyOptions || get(7)?.currencyOptions || [];
  const glList    = Array.isArray(get(8)) ? get(8) : [];
  const faList    = Array.isArray(get(9)) ? get(9) : [];

  // Offices
  document.querySelectorAll('[data-populate="offices"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select office…</option>' +
      offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  });
  const parentSel = document.getElementById('office-parent-sel');
  if (parentSel) parentSel.innerHTML = '<option value="">— Root office —</option>' +
    offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  const holidayOffices = document.getElementById('holiday-offices-sel');
  if (holidayOffices) holidayOffices.innerHTML =
    offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  // Staff
  document.querySelectorAll('[data-populate="staff"]').forEach(sel => {
    sel.innerHTML = '<option value="">Unassigned</option>' +
      staff.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('');
  });

  // Products
  document.querySelectorAll('[data-populate="loanProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      loanProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="savingsProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      savProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="fdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      fdProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="rdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      rdProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });

  // Gender (client template)
  const genderOpts = clientTpl?.genderOptions || [];
  document.querySelectorAll('[data-populate="gender"]').forEach(sel => {
    sel.innerHTML = '<option value="">— Not specified —</option>' +
      genderOpts.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  });

  // Currencies (loan + savings product modals)
  const currOpts = currList.length
    ? currList.map(c => `<option value="${c.code}">${escapeHtml(c.code + ' — ' + c.name)}</option>`).join('')
    : '<option value="">No currencies configured</option>';
  ['lp-currency', 'sp-currency'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select currency…</option>' + currOpts;
  });

  // GL accounts
  const glOpts = glList.length
    ? glList.map(g => `<option value="${g.id}">${escapeHtml((g.glCode ? g.glCode + ' — ' : '') + g.name)}</option>`).join('')
    : '<option value="">No GL accounts found</option>';
  ['acc-rule-debit', 'acc-rule-credit', 'fa-glaccount-sel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select account…</option>' + glOpts;
  });

  // Financial activities
  const faEl = document.getElementById('fa-activity-sel');
  if (faEl) faEl.innerHTML = '<option value="">Select activity…</option>' +
    faList.map(a => `<option value="${a.financialActivityData?.id || a.id}">${escapeHtml(a.financialActivityData?.name || a.name || '—')}</option>`).join('');
}
document.addEventListener('fc:modals-loaded', populateModalDropdowns);

// ════════════════════════════════════════════════════════════
// GLOBAL CLICK HANDLER — nav, modals, actions, tabs
// ════════════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-nav],[data-modal],[data-close-modal],[data-action],[data-tab]');
  if (!t) {
    if (!e.target.closest('.dropdown')) closeAllDropdowns();
    return;
  }

  // Tabs
  if (t.matches('[data-tab]')) { tab(t, t.dataset.tab); return; }

  // Navigation
  if (t.dataset.nav) {
    // Support "page?id=N" shorthand
    const [page, query] = t.dataset.nav.split('?');
    const params = {};
    if (query) {
      query.split('&').forEach(kv => {
        const [k, v] = kv.split('=');
        if (k) params[k] = decodeURIComponent(v || '');
      });
    }
    navigate(page, params);
    closeAllDropdowns();
    sidebar.close();
    return;
  }

  // Open modal
  if (t.dataset.modal) {
    const modalId = t.dataset.modal;
    const modalEl = openModal(modalId);
    if (modalEl) {
      // Forward any extra data-* context (e.g. data-loan-id) onto the modal
      Object.entries(t.dataset).forEach(([k, v]) => { if (k !== 'modal') modalEl.dataset[k] = v; });
      if (modalId === 'runReportModal') {
        const nameEl = modalEl.querySelector('#run-report-name');
        if (nameEl) nameEl.textContent = t.dataset.report || '—';
        const out = modalEl.querySelector('#rep-output');
        if (out) out.innerHTML = '';
      }
      if (modalId === 'repaymentModal' && modalEl.dataset.loanId) {
        const loanIdInput = modalEl.querySelector('#rp-loanid');
        if (loanIdInput) loanIdInput.value = modalEl.dataset.loanId;
      }
    }
    return;
  }

  // Close modal
  if (t.hasAttribute('data-close-modal')) {
    const m = t.closest('.modal-overlay');
    if (m) m.classList.remove('open');
    return;
  }

  // Named actions
  const action = t.dataset.action;
  if (!action) return;
  switch (action) {
    case 'toggle-theme':     theme.toggle();              break;
    case 'toggle-sidebar':   sidebar.toggle();            break;
    case 'toggle-user-menu': dropdownToggle('userMenu');  break;
    case 'open-cmd':         import('./cmd.js').then(m => m.openCmd()); break;
    case 'logout':           import('./auth.js').then(m => m.logout()); break;
    case 'dismiss-toast':    t.closest('.toast')?.remove(); break;
    default:
      // All submit-* and other form actions handled by handleAction
      handleAction(action, t);
  }
});

// Click outside any open modal-overlay closes it
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('modal-overlay')) e.target.classList.remove('open');
});

// ════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS — fixed === comparisons
// ════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  // Ctrl+K — command palette
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    import('./cmd.js').then(m => m.openCmd());
    return;
  }
  // ESC — close everything
  if (e.key === 'Escape') {
    closeAllModals();
    closeAllDropdowns();
    import('./cmd.js').then(m => m.closeCmd?.());
    return;
  }
  // Ctrl+Shift+N — New Client
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openModal('newClientModal');
    return;
  }
  // Ctrl+Shift+L — New Loan
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    openModal('newLoanModal');
    return;
  }
  // ? — shortcut help
  if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    toast('info', 'Shortcuts', 'Ctrl+K palette · Ctrl+Shift+N new client · Ctrl+Shift+L new loan · ESC close');
  }
});

// ════════════════════════════════════════════════════════════
// FORM SUBMIT HANDLERS — all wired to live Fineract API
// ════════════════════════════════════════════════════════════
async function handleAction(action, btn) {
  switch (action) {

    // ── CLIENTS ───────────────────────────────────────────
    case 'submit-client': {
      const f = formData('newClientForm');
      if (!f.officeId || !f.submittedOnDate) {
        toast('warn', 'Missing fields', 'Office and submitted date are required'); return;
      }
      const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
      payload.officeId = parseInt(f.officeId);
      payload.legalFormId = parseInt(f.legalFormId || '1');
      payload.submittedOnDate = f.submittedOnDate;
      if (f.legalFormId === '2') {
        if (!f.fullname) { toast('warn', 'Full name required', ''); return; }
        payload.fullname = f.fullname;
      } else {
        if (!f.firstname || !f.lastname) { toast('warn', 'First & last name required', ''); return; }
        payload.firstname = f.firstname;
        payload.lastname = f.lastname;
        if (f.middlename) payload.middlename = f.middlename;
        if (f.dateOfBirth) payload.dateOfBirth = f.dateOfBirth;
        if (f.genderId) payload.genderId = parseInt(f.genderId);
      }
      if (f.mobileNo) payload.mobileNo = f.mobileNo;
      if (f.externalId) payload.externalId = f.externalId;
      if (f.staffId) payload.staffId = parseInt(f.staffId);
      if (f.activationDate) { payload.activationDate = f.activationDate; payload.active = true; }
      if (f.isStaff === 'on' || f.isStaff === 'true') payload.isStaff = true;

      setSubmitting(btn, true);
      try {
        const r = await api.clients.create(payload);
        toast('success', 'Client created', `ID #${r.resourceId || r.clientId || ''}`);
        closeModal('newClientModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── LOANS ──────────────────────────────────────────────
    case 'submit-loan': {
      const f = formData('newLoanForm');
      const form = document.getElementById('newLoanForm');
      if (!f.clientId || !f.productId || !f.principal) {
        toast('warn', 'Required fields', 'Client, product and principal are required'); return;
      }
      const tpl = form?.dataset?.tpl ? JSON.parse(form.dataset.tpl) : {};
      const payload = {
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        loanType: f.loanType || 'individual',
        principal: parseFloat(f.principal),
        numberOfRepayments: parseInt(f.numberOfRepayments) || tpl.numberOfRepayments || 12,
        repaymentEvery: parseInt(f.repaymentEvery) || 1,
        repaymentFrequencyType: parseInt(f.repaymentFrequencyType ?? tpl.repaymentFrequencyType ?? 2),
        interestRatePerPeriod: parseFloat(f.interestRate) || tpl.interestRatePerPeriod || 0,
        interestRateFrequencyType: tpl.interestRateFrequencyType ?? 2,
        amortizationType: tpl.amortizationType ?? 1,
        interestType: tpl.interestType ?? 0,
        interestCalculationPeriodType: tpl.interestCalculationPeriodType ?? 1,
        transactionProcessingStrategyCode: tpl.transactionProcessingStrategyCode || 'mifos-standard-strategy',
        submittedOnDate: f.submittedOnDate,
        expectedDisbursementDate: f.expectedDisbursementDate
      };
      if (f.loanOfficerId) payload.loanOfficerId = parseInt(f.loanOfficerId);
      if (f.purpose) payload.loanPurposeId = f.purpose;
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.loans.create(payload);
        toast('success', 'Loan application submitted', `Loan #${r.loanId || r.resourceId}`);
        closeModal('newLoanModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Loan create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── SAVINGS ────────────────────────────────────────────
    case 'submit-savings': {
      const f = formData('newSavingsForm');
      if (!f.clientId || !f.productId) { toast('warn', 'Required', 'Client and product required'); return; }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        submittedOnDate: f.submittedOnDate
      };
      if (f.staffId) payload.fieldOfficerId = parseInt(f.staffId);
      if (f.nominalAnnualInterestRate) payload.nominalAnnualInterestRate = parseFloat(f.nominalAnnualInterestRate);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.savings.create(payload);
        toast('success', 'Savings application submitted', `#${r.savingsId || r.resourceId}`);
        closeModal('newSavingsModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── FIXED DEPOSIT ──────────────────────────────────────
    case 'submit-fd': {
      const f = formData('newFDForm');
      if (!f.clientId || !f.productId || !f.depositAmount || !f.depositPeriod) {
        toast('warn', 'Required', 'Client, product, amount and period are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        depositAmount: parseFloat(f.depositAmount),
        depositPeriod: parseInt(f.depositPeriod),
        depositPeriodFrequencyId: parseInt(f.depositPeriodFrequencyId || 2),
        submittedOnDate: f.submittedOnDate
      };
      if (f.fieldOfficerId) payload.fieldOfficerId = parseInt(f.fieldOfficerId);
      if (f.expectedFirstDepositOnDate) payload.expectedFirstDepositOnDate = f.expectedFirstDepositOnDate;
      if (f.maturityInstructionId) payload.maturityInstructionId = parseInt(f.maturityInstructionId);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.fixedDeposits.create(payload);
        toast('success', 'FD application submitted', `#${r.savingsId || r.resourceId}`);
        closeModal('newFDModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── RECURRING DEPOSIT ─────────────────────────────────
    case 'submit-rd': {
      const f = formData('newRDForm');
      if (!f.clientId || !f.productId || !f.mandatoryRecommendedDepositAmount) {
        toast('warn', 'Required', 'Client, product and deposit amount required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        mandatoryRecommendedDepositAmount: parseFloat(f.mandatoryRecommendedDepositAmount),
        recurringDepositFrequency: parseInt(f.recurringDepositFrequency || 1),
        recurringDepositFrequencyTypeId: parseInt(f.recurringDepositFrequencyTypeId || 2),
        depositPeriod: parseInt(f.depositPeriod || 12),
        depositPeriodFrequencyId: parseInt(f.depositPeriodFrequencyId || 2),
        submittedOnDate: f.submittedOnDate
      };
      if (f.fieldOfficerId) payload.fieldOfficerId = parseInt(f.fieldOfficerId);
      if (f.expectedFirstDepositOnDate) payload.expectedFirstDepositOnDate = f.expectedFirstDepositOnDate;
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.recurringDeposits.create(payload);
        toast('success', 'RD application submitted', `#${r.savingsId || r.resourceId}`);
        closeModal('newRDModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── SHARE ACCOUNT ──────────────────────────────────────
    case 'submit-share': {
      const f = formData('newShareForm');
      if (!f.clientId || !f.productId || !f.requestedShares) {
        toast('warn', 'Required', 'Client, product and shares are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        requestedShares: parseInt(f.requestedShares),
        unitPrice: parseFloat(f.unitPrice) || 1,
        submittedDate: f.submittedDate
      };
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.shares.create(payload);
        toast('success', 'Share application submitted', `#${r.resourceId || r.savingsId}`);
        closeModal('newShareModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── GROUP ──────────────────────────────────────────────
    case 'submit-group': {
      const f = formData('newGroupForm');
      if (!f.name || !f.officeId || !f.submittedOnDate) {
        toast('warn', 'Required', 'Name, office and submitted date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        officeId: parseInt(f.officeId),
        submittedOnDate: f.submittedOnDate
      };
      if (f.staffId) payload.staffId = parseInt(f.staffId);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.groups.create(payload);
        toast('success', 'Group created', f.name);
        closeModal('newGroupModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── CENTER ─────────────────────────────────────────────
    case 'submit-center': {
      const f = formData('newCenterForm');
      if (!f.name || !f.officeId || !f.submittedOnDate) {
        toast('warn', 'Required', 'Name, office and submitted date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        officeId: parseInt(f.officeId),
        submittedOnDate: f.submittedOnDate
      };
      if (f.staffId) payload.staffId = parseInt(f.staffId);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        await api.centers.create(payload);
        toast('success', 'Center created', f.name);
        closeModal('newCenterModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── OFFICE ─────────────────────────────────────────────
    case 'submit-office': {
      const f = formData('newOfficeForm');
      if (!f.name || !f.parentId || !f.openingDate) {
        toast('warn', 'Required', 'Name, parent and opening date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        parentId: parseInt(f.parentId),
        openingDate: f.openingDate
      };
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        await api.offices.create(payload);
        toast('success', 'Office created', f.name);
        closeModal('newOfficeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── STAFF ──────────────────────────────────────────────
    case 'submit-staff': {
      const f = formData('newStaffForm');
      if (!f.firstname || !f.lastname || !f.officeId) {
        toast('warn', 'Required', 'First name, last name and office are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        firstname: f.firstname,
        lastname: f.lastname,
        officeId: parseInt(f.officeId),
        isLoanOfficer: f.isLoanOfficer === 'true',
        isActive: f.isActive !== 'false'
      };
      if (f.mobileNo) payload.mobileNo = f.mobileNo;
      if (f.joiningDate) payload.joiningDate = f.joiningDate;

      setSubmitting(btn, true);
      try {
        await api.staff.create(payload);
        toast('success', 'Staff created', `${f.firstname} ${f.lastname}`);
        closeModal('newStaffModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── TELLER ─────────────────────────────────────────────
    case 'submit-teller': {
      const f = formData('newTellerForm');
      if (!f.name || !f.officeId || !f.startDate) {
        toast('warn', 'Required', 'Name, office and start date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        officeId: parseInt(f.officeId),
        startDate: f.startDate,
        status: f.status || 'ACTIVE'
      };
      if (f.endDate) payload.endDate = f.endDate;
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.tellers.create(payload);
        toast('success', 'Teller created', f.name);
        closeModal('newTellerModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── HOLIDAY ────────────────────────────────────────────
    case 'submit-holiday': {
      const f = formData('newHolidayForm');
      const officeIds = Array.from(document.querySelectorAll('#holiday-offices-sel option:checked')).map(o => parseInt(o.value));
      if (!f.name || !f.fromDate || !f.toDate || !officeIds.length) {
        toast('warn', 'Required', 'Name, dates and at least one office are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        fromDate: f.fromDate,
        toDate: f.toDate,
        reschedulingType: 2,
        offices: officeIds.map(id => ({ officeId: id }))
      };
      if (f.repaymentsRescheduledTo) payload.repaymentsRescheduledTo = f.repaymentsRescheduledTo;
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.holidays.create(payload);
        toast('success', 'Holiday created', f.name);
        closeModal('newHolidayModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── PAYMENT TYPE ───────────────────────────────────────
    case 'submit-paymenttype': {
      const f = formData('newPaymentTypeForm');
      if (!f.name) { toast('warn', 'Name required', ''); return; }
      const payload = {
        name: f.name,
        description: f.description || undefined,
        isCashPayment: f.isCashPayment === 'true',
        position: parseInt(f.position) || 0
      };

      setSubmitting(btn, true);
      try {
        await api.paymentTypes.create(payload);
        toast('success', 'Payment type created', f.name);
        closeModal('newPaymentTypeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── CHARGE ─────────────────────────────────────────────
    case 'submit-charge': {
      const f = formData('newChargeForm');
      if (!f.name || !f.amount || !f.currencyCode) {
        toast('warn', 'Required', 'Name, amount and currency are required'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        amount: parseFloat(f.amount),
        currencyCode: f.currencyCode,
        chargeAppliesTo: parseInt(f.chargeAppliesTo),
        chargeTimeType: parseInt(f.chargeTimeType),
        chargeCalculationType: parseInt(f.chargeCalculationType),
        penalty: f.penalty === 'true',
        active: f.active !== 'false'
      };

      setSubmitting(btn, true);
      try {
        await api.charges.create(payload);
        toast('success', 'Charge created', f.name);
        closeModal('newChargeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── GL ACCOUNT ─────────────────────────────────────────
    case 'submit-gl': {
      const f = formData('glAccountForm');
      if (!f.name || !f.glCode || !f.type || !f.usage) {
        toast('warn', 'Required', 'Name, code, type and usage are required'); return;
      }
      const payload = {
        name: f.name,
        glCode: f.glCode,
        type: parseInt(f.type),
        usage: parseInt(f.usage),
        manualEntries: f.manualEntries === 'on' || f.manualEntries === 'true'
      };
      if (f.parentId) payload.parentId = parseInt(f.parentId);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.glAccounts.create(payload);
        toast('success', 'GL account created', f.name);
        closeModal('glAccountModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── JOURNAL ENTRY ──────────────────────────────────────
    case 'submit-journal': {
      const f = formData('journalEntryForm');
      if (!f.officeId || !f.currencyCode || !f.transactionDate) {
        toast('warn', 'Required', 'Office, currency and date are required'); return;
      }
      const debits  = collectJournalRows('#je-debits-body');
      const credits = collectJournalRows('#je-credits-body');
      if (!debits.length || !credits.length) {
        toast('warn', 'Required', 'At least one debit and one credit row are required'); return;
      }
      const sumD = debits.reduce((s, r) => s + r.amount, 0);
      const sumC = credits.reduce((s, r) => s + r.amount, 0);
      if (Math.abs(sumD - sumC) > 0.001) {
        toast('warn', 'Unbalanced', `Debits (${sumD}) ≠ Credits (${sumC})`); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        officeId: parseInt(f.officeId),
        currencyCode: f.currencyCode,
        transactionDate: f.transactionDate,
        credits, debits
      };
      if (f.reference) payload.referenceNumber = f.reference;
      if (f.comments) payload.comments = f.comments;
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);

      setSubmitting(btn, true);
      try {
        await api.journalEntries.create(payload);
        toast('success', 'Journal entry posted', '');
        closeModal('journalEntryModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Post failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── REPAYMENT ──────────────────────────────────────────
    case 'submit-repayment': {
      const modal = document.getElementById('repaymentModal');
      const loanId = modal?.dataset?.loanId || modal?.querySelector('#rp-loanid')?.value;
      if (!loanId) { toast('warn', 'Loan required', 'Loan ID missing'); return; }
      const f = formData('repaymentForm');
      if (!f.transactionDate || !f.transactionAmount) {
        toast('warn', 'Required', 'Date and amount are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate,
        transactionAmount: parseFloat(f.transactionAmount)
      };
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);
      if (f.receiptNumber) payload.receiptNumber = f.receiptNumber;
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        await api.loans.repay(loanId, payload);
        toast('success', 'Repayment recorded', `Loan #${loanId}`);
        closeModal('repaymentModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Repayment failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── SAVINGS DEPOSIT / WITHDRAWAL ───────────────────────
    case 'submit-savings-deposit': {
      const modal = document.getElementById('savingsDepositModal');
      const accountId = modal?.dataset?.accountId;
      if (!accountId) { toast('warn', 'Account required', ''); return; }
      const f = formData('savingsDepositForm');
      if (!f.transactionType || !f.transactionAmount || !f.transactionDate) {
        toast('warn', 'Required', 'Type, amount and date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate,
        transactionAmount: parseFloat(f.transactionAmount)
      };
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);
      if (f.accountNumber) payload.accountNumber = f.accountNumber;
      if (f.checkNumber)   payload.checkNumber   = f.checkNumber;
      if (f.receiptNumber) payload.receiptNumber = f.receiptNumber;
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        if (f.transactionType === 'withdrawal') await api.savings.withdrawal(accountId, payload);
        else await api.savings.deposit(accountId, payload);
        toast('success', `${f.transactionType === 'withdrawal' ? 'Withdrawal' : 'Deposit'} posted`, '');
        closeModal('savingsDepositModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Transaction failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── ACCOUNT TRANSFER ───────────────────────────────────
    case 'submit-transfer': {
      const f = formData('newTransferForm');
      if (!f.fromOfficeId || !f.fromClientId || !f.fromAccountId ||
          !f.toOfficeId   || !f.toClientId   || !f.toAccountId   ||
          !f.transferAmount || !f.transferDate) {
        toast('warn', 'Required', 'All transfer fields are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        fromOfficeId: parseInt(f.fromOfficeId),
        fromClientId: parseInt(f.fromClientId),
        fromAccountId: parseInt(f.fromAccountId),
        fromAccountType: parseInt(f.fromAccountType || 2),
        toOfficeId: parseInt(f.toOfficeId),
        toClientId: parseInt(f.toClientId),
        toAccountId: parseInt(f.toAccountId),
        toAccountType: parseInt(f.toAccountType || 2),
        transferAmount: parseFloat(f.transferAmount),
        transferDate: f.transferDate,
        transferDescription: f.transferDescription || 'Account transfer'
      };

      setSubmitting(btn, true);
      try {
        await api.transfers.create(payload);
        toast('success', 'Transfer completed', '');
        closeModal('newTransferModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Transfer failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── USER ───────────────────────────────────────────────
    case 'submit-user': {
      const f = formData('newUserForm');
      if (!f.username || !f.email || !f.firstname || !f.lastname || !f.officeId) {
        toast('warn', 'Required', 'Username, email, name and office required'); return;
      }
      const rolesSel = document.getElementById('newuser-roles');
      const roles = rolesSel ? Array.from(rolesSel.selectedOptions).map(o => parseInt(o.value)) : [];
      if (!roles.length) { toast('warn', 'Roles required', 'Select at least one role'); return; }
      const payload = {
        username: f.username,
        email: f.email,
        firstname: f.firstname,
        lastname: f.lastname,
        officeId: parseInt(f.officeId),
        roles
      };
      if (f.sendPasswordToEmail === 'on' || f.sendPasswordToEmail === 'true') {
        payload.sendPasswordToEmail = true;
      } else {
        if (!f.password || f.password !== f.repeatPassword) {
          toast('warn', 'Passwords mismatch', 'Passwords must match'); return;
        }
        payload.password = f.password;
        payload.repeatPassword = f.repeatPassword;
        payload.sendPasswordToEmail = false;
      }

      setSubmitting(btn, true);
      try {
        await api.users.create(payload);
        toast('success', 'User created', f.username);
        closeModal('newUserModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── ACCOUNTING RULE ────────────────────────────────────
    case 'submit-acc-rule': {
      const f = formData('newAccRuleForm');
      if (!f.name || !f.debitAccountId || !f.creditAccountId) {
        toast('warn', 'Required', 'Name and accounts required'); return;
      }
      const payload = {
        name: f.name,
        debitAccountId: parseInt(f.debitAccountId),
        creditAccountId: parseInt(f.creditAccountId)
      };
      if (f.officeId) payload.officeId = parseInt(f.officeId);
      if (f.description) payload.description = f.description;
      if (f.tags) payload.tags = f.tags;

      setSubmitting(btn, true);
      try {
        await api.accountingRules.create(payload);
        toast('success', 'Accounting rule created', f.name);
        closeModal('newAccRuleModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── PROVISIONING CRITERIA ──────────────────────────────
    case 'submit-prov-criteria': {
      const form = document.getElementById('newProvCriteriaForm');
      if (!form) return;
      const criteriaName = form.querySelector('[name="criteriaName"]')?.value?.trim();
      if (!criteriaName) { toast('warn', 'Required', 'Criteria name required'); return; }
      const names  = Array.from(form.querySelectorAll('[name="pc_name[]"]')).map(i => i.value.trim());
      const mins   = Array.from(form.querySelectorAll('[name="pc_min[]"]')).map(i => parseInt(i.value));
      const maxs   = Array.from(form.querySelectorAll('[name="pc_max[]"]')).map(i => parseInt(i.value));
      const amts   = Array.from(form.querySelectorAll('[name="pc_minamount[]"]')).map(i => parseFloat(i.value) || 0);
      const pcts   = Array.from(form.querySelectorAll('[name="pc_pct[]"]')).map(i => parseFloat(i.value));
      const definitions = names.map((n, i) => ({
        categoryId: i + 1,
        categoryName: n,
        minAge: mins[i],
        maxAge: maxs[i],
        minimumAmount: amts[i],
        provisioningPercentage: pcts[i]
      })).filter(d => d.categoryName);

      setSubmitting(btn, true);
      try {
        await api.provisioning.createCriteria({
          criteriaName,
          provisioningcriteria: definitions
        });
        toast('success', 'Criteria created', criteriaName);
        closeModal('newProvCriteriaModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── FINANCIAL ACTIVITY MAPPING ─────────────────────────
    case 'submit-fa-account': {
      const f = formData('newFAAccountForm');
      if (!f.financialActivityId || !f.glAccountId) {
        toast('warn', 'Required', 'Activity and GL account required'); return;
      }
      const payload = {
        financialActivityId: parseInt(f.financialActivityId),
        glAccountId: parseInt(f.glAccountId)
      };

      setSubmitting(btn, true);
      try {
        await api.financialActivityAccounts.create(payload);
        toast('success', 'Mapping saved', '');
        closeModal('newFAAccountModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── STANDING INSTRUCTION ───────────────────────────────
    case 'submit-si': {
      const f = formData('newSIForm');
      if (!f.name || !f.fromClientId || !f.fromAccountId || !f.toClientId || !f.toAccountId ||
          !f.amount || !f.validFrom) {
        toast('warn', 'Required', 'All instruction fields required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        fromClientId: parseInt(f.fromClientId),
        fromAccountId: parseInt(f.fromAccountId),
        fromAccountType: parseInt(f.fromAccountType || 2),
        toClientId: parseInt(f.toClientId),
        toAccountId: parseInt(f.toAccountId),
        toAccountType: parseInt(f.toAccountType || 2),
        amount: parseFloat(f.amount),
        transferType: parseInt(f.transferType || 1),
        validFrom: f.validFrom,
        recurrenceType: parseInt(f.recurrenceType || 1),
        recurrenceFrequency: parseInt(f.recurrenceFrequency || 3),
        recurrenceInterval: parseInt(f.recurrenceInterval || 1),
        instructionType: parseInt(f.instructionType || 1),
        priority: parseInt(f.priority || 3),
        status: parseInt(f.status || 1)
      };
      if (f.validTill) payload.validTill = f.validTill;
      if (f.recurrenceOnMonthDay) payload.recurrenceOnMonthDay = parseInt(f.recurrenceOnMonthDay);

      setSubmitting(btn, true);
      try {
        await api.standingInstructions.create(payload);
        toast('success', 'Standing instruction created', f.name);
        closeModal('newSIModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── LOAN PRODUCT ───────────────────────────────────────
    case 'submit-loan-product': {
      const f = formData('newLoanProductForm');
      if (!f.name || !f.shortName || !f.currencyCode || !f.principal ||
          !f.numberOfRepayments || !f.interestRatePerPeriod) {
        toast('warn', 'Required', 'Fill in all required loan product fields'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        shortName: f.shortName,
        currencyCode: f.currencyCode,
        digitsAfterDecimal: parseInt(f.digitsAfterDecimal) || 2,
        principal: parseFloat(f.principal),
        numberOfRepayments: parseInt(f.numberOfRepayments),
        repaymentEvery: parseInt(f.repaymentEvery) || 1,
        repaymentFrequencyType: parseInt(f.repaymentFrequencyType || 2),
        interestRatePerPeriod: parseFloat(f.interestRatePerPeriod),
        interestRateFrequencyType: parseInt(f.interestRateFrequencyType || 2),
        amortizationType: parseInt(f.amortizationType || 1),
        interestType: parseInt(f.interestType || 0),
        interestCalculationPeriodType: parseInt(f.interestCalculationPeriodType || 1),
        transactionProcessingStrategyCode: f.transactionProcessingStrategyCode || 'mifos-standard-strategy',
        accountingRule: parseInt(f.accountingRule || 1)
      };
      if (f.minPrincipal) payload.minPrincipal = parseFloat(f.minPrincipal);
      if (f.maxPrincipal) payload.maxPrincipal = parseFloat(f.maxPrincipal);
      if (f.graceOnPrincipalPayment) payload.graceOnPrincipalPayment = parseInt(f.graceOnPrincipalPayment);
      if (f.graceOnInterestPayment)  payload.graceOnInterestPayment  = parseInt(f.graceOnInterestPayment);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.loanProducts.create(payload);
        toast('success', 'Loan product created', f.name);
        closeModal('newLoanProductModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── SAVINGS PRODUCT ────────────────────────────────────
    case 'submit-savings-product': {
      const f = formData('newSavingsProductForm');
      if (!f.name || !f.shortName || !f.currencyCode || !f.nominalAnnualInterestRate) {
        toast('warn', 'Required', 'Fill in all required savings product fields'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        shortName: f.shortName,
        currencyCode: f.currencyCode,
        digitsAfterDecimal: parseInt(f.digitsAfterDecimal) || 2,
        nominalAnnualInterestRate: parseFloat(f.nominalAnnualInterestRate),
        interestCompoundingPeriodType: parseInt(f.interestCompoundingPeriodType || 1),
        interestPostingPeriodType: parseInt(f.interestPostingPeriodType || 4),
        interestCalculationType: parseInt(f.interestCalculationType || 1),
        interestCalculationDaysInYearType: parseInt(f.interestCalculationDaysInYearType || 365),
        accountingRule: parseInt(f.accountingRule || 1)
      };
      if (f.minRequiredOpeningBalance) payload.minRequiredOpeningBalance = parseFloat(f.minRequiredOpeningBalance);
      if (f.withdrawalFeeForTransfers) payload.withdrawalFeeForTransfers = parseFloat(f.withdrawalFeeForTransfers);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.savingsProducts.create(payload);
        toast('success', 'Savings product created', f.name);
        closeModal('newSavingsProductModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── LOAN WRITE-OFF ─────────────────────────────────────
    case 'submit-writeoff': {
      const modal = document.getElementById('writeOffModal');
      const loanId = modal?.dataset?.loanId;
      if (!loanId) { toast('warn', 'Loan required', ''); return; }
      const f = formData('writeOffForm');
      if (!f.transactionDate) { toast('warn', 'Date required', ''); return; }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate
      };
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        await api.loans.writeOff(loanId, payload);
        toast('success', 'Loan written off', `Loan #${loanId}`);
        closeModal('writeOffModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Write-off failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── LOAN RESCHEDULE ────────────────────────────────────
    case 'submit-reschedule': {
      const f = formData('rescheduleForm');
      if (!f.loanId || !f.rescheduleFromDate || !f.rescheduleReasonId) {
        toast('warn', 'Required', 'Loan, from-date and reason are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        loanId: parseInt(f.loanId),
        rescheduleFromDate: f.rescheduleFromDate,
        rescheduleReasonId: parseInt(f.rescheduleReasonId),
        submittedOnDate: today()
      };
      if (f.adjustedDueDate) payload.adjustedDueDate = f.adjustedDueDate;
      if (f.numberOfRepayments) payload.extraTerms = parseInt(f.numberOfRepayments);
      if (f.interestRatePerPeriod) payload.newInterestRate = parseFloat(f.interestRatePerPeriod);
      if (f.comments) payload.rescheduleReasonComment = f.comments;

      setSubmitting(btn, true);
      try {
        await api.loans.reschedule(payload);
        toast('success', 'Reschedule request submitted', '');
        closeModal('rescheduleModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Reschedule failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── BULK IMPORT ────────────────────────────────────────
    case 'submit-import': {
      const modal = document.getElementById('bulkImportModal');
      const entitySel = modal?.querySelector('[name="entity"]');
      const fileEl = document.getElementById('bulkImportFile');
      const file = fileEl?.files?.[0];
      if (!entitySel?.value) { toast('warn', 'Required', 'Select an entity type'); return; }
      if (!file) { toast('warn', 'Required', 'Choose a file to upload'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('locale', LOCALE);
      fd.append('dateFormat', DATE_FORMAT);

      setSubmitting(btn, true);
      try {
        await api.bulkImports.upload(entitySel.value, fd);
        toast('success', 'Import queued', file.name);
        closeModal('bulkImportModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Upload failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── SELF-SERVICE USER ──────────────────────────────────
    case 'submit-ss-user': {
      const f = formData('selfServiceUserForm');
      if (!f.clientId || !f.username || !f.email || !f.password) {
        toast('warn', 'Required', 'All fields required'); return;
      }
      if (f.password !== f.passwordRepeat) {
        toast('warn', 'Passwords mismatch', ''); return;
      }
      const payload = {
        clientId: parseInt(f.clientId),
        username: f.username,
        email: f.email,
        password: f.password,
        authenticationMode: 'email'
      };

      setSubmitting(btn, true);
      try {
        await api.selfService.register(payload);
        toast('success', 'Portal user created', f.username);
        closeModal('selfServiceUserModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Registration failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── CONFIG WIZARD ──────────────────────────────────────
    case 'submit-wizard': {
      const days = Array.from(document.querySelectorAll('#cw-days [data-cw-day]:checked'))
        .map(cb => ({ Sun:'SU', Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA' }[cb.dataset.cwDay]));
      const currencies = Array.from(document.querySelectorAll('#cw-currencies option:checked')).map(o => o.value);

      const requests = [];
      if (days.length) {
        requests.push({
          requestId: 1,
          relativeUrl: 'workingdays',
          method: 'PUT',
          body: {
            recurrence: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days.join(',')}`,
            repaymentRescheduleType: 1,
            locale: LOCALE
          }
        });
      }
      if (currencies.length) {
        requests.push({
          requestId: 2,
          relativeUrl: 'currencies',
          method: 'PUT',
          body: { currencies }
        });
      }
      if (!requests.length) { toast('warn', 'Nothing to save', ''); return; }

      setSubmitting(btn, true);
      try {
        await api.batch.submit(requests, true);
        toast('success', 'Configuration saved', '');
        closeModal('configWizardModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── RUN REPORT ─────────────────────────────────────────
    case 'run-report': {
      const modal = document.getElementById('runReportModal');
      const reportName = modal?.dataset?.report || document.getElementById('run-report-name')?.textContent;
      if (!reportName || reportName === '—') { toast('warn', 'Report required', ''); return; }
      const params = {};
      const from = modal?.querySelector('#rep-from')?.value;
      const to   = modal?.querySelector('#rep-to')?.value;
      const fmt  = modal?.querySelector('#rep-fmt')?.value || 'JSON';
      const officeSel = modal?.querySelector('[data-populate="offices"]');
      if (from) params.R_fromDate = from;
      if (to) params.R_toDate = to;
      if (officeSel?.value) params.R_officeId = officeSel.value;
      const out = modal?.querySelector('#rep-output');
      if (out) out.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Running…</h3></div>';

      setSubmitting(btn, true);
      try {
        if (fmt === 'JSON') {
          const r = await api.runReports.run(reportName, params);
          const headers = (r.columnHeaders || []).map(h => `<th>${escapeHtml(h.columnName)}</th>`).join('');
          const rows = (r.data || []).map(d => `<tr>${(d.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('');
          if (out) out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows || '<tr><td>No data</td></tr>'}</tbody></table></div>`;
        } else {
          const res = await api.runReports.run(reportName, { ...params, 'output-type': fmt }, { raw: true });
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = reportName.replace(/\s+/g, '_') + '.' + fmt.toLowerCase();
          a.click();
          if (out) out.innerHTML = `<div class="msg-banner b-success"><i class="fa-solid fa-check"></i> ${fmt} downloaded</div>`;
        }
        toast('success', 'Report ready', reportName);
      } catch (e) {
        toast('error', 'Report failed', extractFineractError(e));
        if (out) out.innerHTML = `<div class="msg-banner b-danger">${escapeHtml(extractFineractError(e))}</div>`;
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── AD-HOC QUERY ───────────────────────────────────────
    case 'run-sql': {
      const queryName = document.getElementById('sqlQuery')?.value?.trim();
      if (!queryName) { toast('warn', 'Query required', 'Enter a registered report name'); return; }
      const out = document.getElementById('sqlResult');
      if (out) out.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Running…</h3></div>';

      setSubmitting(btn, true);
      try {
        const r = await api.runReports.run(queryName, {});
        const headers = (r.columnHeaders || []).map(h => `<th>${escapeHtml(h.columnName)}</th>`).join('');
        const rows = (r.data || []).map(d => `<tr>${(d.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('');
        if (out) out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows || '<tr><td>No data</td></tr>'}</tbody></table></div>`;
      } catch (e) {
        if (out) out.innerHTML = `<div class="msg-banner b-danger">${escapeHtml(extractFineractError(e))}</div>`;
      } finally { setSubmitting(btn, false); }
      return;
    }

    // ── REMITTANCE STEPPER ─────────────────────────────────
    case 'remit-next': {
      import('./remit.js').then(m => m.Remit.next());
      return;
    }
    case 'remit-back': {
      import('./remit.js').then(m => m.Remit.back());
      return;
    }

    default:
      console.warn('[handleAction] unknown action:', action);
      toast('warn', 'Unknown action', action);
  }
}