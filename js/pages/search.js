import { LOCALE } from '../config.js';

/* FinCraft · search.js — Global search results page (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { num, ini, sb, escapeHtml, fmtDate, fmt } from '../utils.js';
import { toast } from '../ui.js';

const can = (code) => store.hasPermission(code);

// Resource types the user can search
const RESOURCES = [
  { id: 'clients',   label: 'Clients',   icon: 'fa-users',                permission: 'READ_CLIENT' },
  { id: 'loans',     label: 'Loans',     icon: 'fa-hand-holding-dollar',  permission: 'READ_LOAN' },
  { id: 'groups',    label: 'Groups',    icon: 'fa-people-group',         permission: 'READ_GROUP' },
  { id: 'savings',   label: 'Savings',   icon: 'fa-piggy-bank',           permission: 'READ_SAVINGSACCOUNT' },
  { id: 'centers',   label: 'Centers',   icon: 'fa-building-columns',     permission: 'READ_CENTER' }
];

const RECENT_KEY = 'recentSearches';
const MAX_RECENT = 10;

export async function render(c, params = {}) {
  // Pull query from URL params if passed
  const initialQuery = params.q || params.query || '';
  const initialResource = params.resource || '';

  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Global Search</h1>
        <div class="text-muted">Search across clients, loans, groups, savings, and centers</div>
      </div>
    </div>

    <div class="card">
      <div class="filter-bar mb-3" style="gap:12px">
        <input id="srch-input" class="form-control" placeholder="Type to search (account no, name, external ID)…"
               value="${escapeHtml(initialQuery)}" autocomplete="off" style="font-size:16px"/>
        <select id="srch-resource" class="form-control" style="max-width:200px">
          <option value="">All resources</option>
          ${RESOURCES.filter(r => can(r.permission)).map(r =>
            `<option value="${r.id}" ${initialResource === r.id ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
          ).join('')}
        </select>
        <button class="btn-primary" id="srch-go"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
      </div>

      <div id="srch-recent" class="mb-3"></div>
      <div id="srch-results"></div>
    </div>`;

  const inputEl = c.querySelector('#srch-input');
  const resourceEl = c.querySelector('#srch-resource');
  const resultsEl = c.querySelector('#srch-results');
  const recentEl = c.querySelector('#srch-recent');

  renderRecentSearches(recentEl, (q, r) => {
    inputEl.value = q;
    if (r) resourceEl.value = r;
    runSearch(q, r);
  });

  // Auto-run if URL has query
  if (initialQuery.length >= 2) {
    runSearch(initialQuery, initialResource);
  }

  // Search button
  c.querySelector('#srch-go').addEventListener('click', () => {
    const q = inputEl.value.trim();
    const resource = resourceEl.value;
    runSearch(q, resource);
  });

  // Enter key
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = inputEl.value.trim();
      const resource = resourceEl.value;
      runSearch(q, resource);
    }
  });

  // Live search on type (debounced)
  let debounceTimer;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = inputEl.value.trim();
    if (q.length < 2) {
      resultsEl.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(() => {
      const resource = resourceEl.value;
      runSearch(q, resource);
    }, 350);
  });

  resourceEl.addEventListener('change', () => {
    const q = inputEl.value.trim();
    if (q.length >= 2) runSearch(q, resourceEl.value);
  });

  async function runSearch(query, resource) {
    if (!query || query.length < 2) {
      resultsEl.innerHTML = '<div class="empty-state-row">Type at least 2 characters to search</div>';
      return;
    }

    resultsEl.innerHTML = '<div class="empty-state-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Searching…</div>';

    // Update URL so page is bookmarkable
    const urlParams = new URLSearchParams();
    urlParams.set('q', query);
    if (resource) urlParams.set('resource', resource);
    location.hash = `search?${urlParams.toString()}`;

    try {
      const params = { query };
      if (resource) params.resource = resource;
      const res = await api.search.search(query, params);
      const items = Array.isArray(res) ? res : (res?.pageItems || []);

      saveRecentSearch(query, resource);
      renderRecentSearches(recentEl, (q, r) => {
        inputEl.value = q;
        if (r) resourceEl.value = r;
        runSearch(q, r);
      });

      drawResults(resultsEl, items, query);
    } catch (e) {
      resultsEl.innerHTML = `<div class="text-error">Search failed: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }
}

// ════════════════════════════════════════════════════════════
// RESULTS RENDERER
// ════════════════════════════════════════════════════════════
function drawResults(el, items, query) {
  if (!items.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>No results for "${escapeHtml(query)}"</h3>
        <div class="text-muted mt-2">Try a different keyword, account number, or external ID.</div>
      </div>`;
    return;
  }

  // Group by entity type
  const grouped = {};
  items.forEach(item => {
    const type = (item.entityType || 'Other').toUpperCase();
    (grouped[type] ||= []).push(item);
  });

  el.innerHTML = `
    <div class="section-header mb-2">
      <span class="text-muted">${num(items.length)} result${items.length !== 1 ? 's' : ''} for "<b>${escapeHtml(query)}</b>"</span>
    </div>
    ${Object.entries(grouped).map(([type, list]) => `
      <h4 class="mt-3">${escapeHtml(type)} (${list.length})</h4>
      <table class="table">
        <thead><tr>
          <th></th><th>Name / Account</th><th>External ID</th><th>Status</th><th>Office</th><th></th>
        </tr></thead>
        <tbody>${list.map(item => {
          const iconClass = getResourceIcon(item.entityType);
          const name = item.entityName || item.entityAccountNo || '—';
          const route = getResourceRoute(item.entityType, item.entityId || item.parentId);
          return `
            <tr>
              <td><div class="avatar" style="background:var(--accent); color:#fff"><i class="fa-solid ${iconClass}"></i></div></td>
              <td>
                <b>${route}">${escapeHtml(name)}</a></b>
                ${item.entityAccountNo ? `<div class="text-muted small">${escapeHtml(item.entityAccountNo)}</div>` : ''}
              </td>
              <td><code>${escapeHtml(item.entityExternalId || '—')}</code></td>
              <td>${item.entityStatus ? sb(item.entityStatus.value || item.entityStatus) : '—'}</td>
              <td>${escapeHtml(item.parentName || item.officeName || '—')}</td>
              <td class="text-right">
                <button class="btn-mini" data-go-route="${route}">View</button>
              </td>
            </tr>`;
        }).join('')}</tbody>
      </table>`).join('')}`;

  el.querySelectorAll('[data-go-route]').forEach(b => b.addEventListener('click', () => {
    location.hash = b.dataset.goRoute.replace('#/', '');
  }));
}

// Map entity type to icon
function getResourceIcon(type) {
  const map = {
    CLIENT: 'fa-user',
    LOAN: 'fa-hand-holding-dollar',
    GROUP: 'fa-people-group',
    SAVING: 'fa-piggy-bank',
    SAVINGS: 'fa-piggy-bank',
    CENTER: 'fa-building-columns'
  };
  return map[(type || '').toUpperCase()] || 'fa-circle';
}

// Map entity type to route
function getResourceRoute(type, id) {
  const t = (type || '').toUpperCase();
  if (t === 'CLIENT') return `#/client-detail?id=${id}`;
  if (t === 'LOAN')   return `#/loans?id=${id}`;
  if (t === 'GROUP')  return `#/groups?id=${id}`;
  if (t === 'SAVING' || t === 'SAVINGS') return `#/savings?id=${id}`;
  if (t === 'CENTER') return `#/centers?id=${id}`;
  return '#/';
}

// ════════════════════════════════════════════════════════════
// RECENT SEARCHES (localStorage)
// ════════════════════════════════════════════════════════════
function saveRecentSearch(query, resource) {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const entry = { query, resource: resource || null, ts: Date.now() };
    const filtered = recent.filter(r => !(r.query === query && r.resource === entry.resource));
    filtered.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {}
}

function renderRecentSearches(el, onClick) {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!recent.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-clock"></i> Recent searches:
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        ${recent.map((r, i) => `
          <button class="btn-secondary btn-sm" data-recent-idx="${i}">
            ${escapeHtml(r.query)}
            ${r.resource ? `<span class="text-muted">· ${escapeHtml(r.resource)}</span>` : ''}
          </button>`).join('')}
        <button class="btn-mini" id="srch-clear-recent">Clear</button>
      </div>`;

    el.querySelectorAll('[data-recent-idx]').forEach(b => b.addEventListener('click', () => {
      const r = recent[parseInt(b.dataset.recentIdx)];
      if (r) onClick(r.query, r.resource);
    }));

    el.querySelector('#srch-clear-recent').addEventListener('click', () => {
      localStorage.removeItem(RECENT_KEY);
      el.innerHTML = '';
      toast('success', 'Recent searches cleared', '');
    });
  } catch {
    el.innerHTML = '';
  }
}