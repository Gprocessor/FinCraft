import { LOCALE } from '../config.js';
/* FinCraft · search.js — Global search results page
   Enhanced: shared recent searches with palette, deep-link bookmarkable URL,
   tabbed by resource type, copy-to-link */

import { api } from '../api.js';
import { store } from '../store.js';
import { num, ini, sb, escapeHtml, fmtDate, fmt } from '../utils.js';
import { toast } from '../ui.js';

import { extractFineractError } from '../ui/dom-helpers.js';
const can = (code) => store.hasPermission(code);

const RESOURCES = [
  { id: 'clients', label: 'Clients',  icon: 'fa-user',                   permission: 'READ_CLIENT' },
  { id: 'loans',   label: 'Loans',    icon: 'fa-hand-holding-dollar',    permission: 'READ_LOAN' },
  { id: 'groups',  label: 'Groups',   icon: 'fa-people-group',           permission: 'READ_GROUP' },
  { id: 'savings', label: 'Savings',  icon: 'fa-piggy-bank',             permission: 'READ_SAVINGSACCOUNT' },
  { id: 'centers', label: 'Centers',  icon: 'fa-building-columns',       permission: 'READ_CENTER' }
];

const RECENT_KEY = 'fincraft.recentSearches';
const MAX_RECENT = 10;

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
export async function render(c, params = {}) {
  const initialQuery = params.q || params.query || '';
  const initialResource = params.resource || '';

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Global Search</h1>
        <div class="page-subtitle">Search across clients, loans, groups, savings, and centers</div>
      </div>
      <div class="page-actions">
        <button class="btn-ghost btn-sm" id="srch-copy" title="Copy link">
          <i class="fa-solid fa-link"></i> Copy Link
        </button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="search-bar" style="flex:1;min-width:280px">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="srch-input" placeholder="Search clients, loans, groups, savings, centers…"
                 autocomplete="off" value="${escapeHtml(initialQuery)}" autofocus/>
        </div>
        <select id="srch-resource" class="form-control" style="max-width:180px">
          <option value="">All resources</option>
          ${RESOURCES.filter(r => can(r.permission)).map(r =>
            `<option value="${r.id}" ${initialResource === r.id ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
          ).join('')}
        </select>
        <button class="btn-primary btn-sm" id="srch-go">
          <i class="fa-solid fa-magnifying-glass"></i> Search
        </button>
      </div>
    </div>

    <div id="srch-recent"></div>

    <div id="srch-results" class="mt-3">
      ${initialQuery.length >= 2
        ? '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Searching…</h3></div>'
        : '<div class="empty-state"><i class="fa-solid fa-magnifying-glass empty-state-icon"></i><h3>Start typing to search</h3><p>Search across all entity types or filter by resource.</p></div>'
      }
    </div>
  `;

  const inputEl    = c.querySelector('#srch-input');
  const resourceEl = c.querySelector('#srch-resource');
  const resultsEl  = c.querySelector('#srch-results');
  const recentEl   = c.querySelector('#srch-recent');

  renderRecentSearches(recentEl, (q, r) => {
    inputEl.value = q;
    if (r) resourceEl.value = r;
    runSearch(q, r);
  });

  if (initialQuery.length >= 2) runSearch(initialQuery, initialResource);

  // Search button
  c.querySelector('#srch-go').addEventListener('click', () => {
    const q = inputEl.value.trim();
    runSearch(q, resourceEl.value);
  });

  // Enter key
  inputEl.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch(inputEl.value.trim(), resourceEl.value);
    }
  });

  // Live search on type (debounced)
  let debounceTimer;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = inputEl.value.trim();
    if (q.length < 2) {
      resultsEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass empty-state-icon"></i><h3>Type at least 2 characters</h3></div>';
      return;
    }
    debounceTimer = setTimeout(() => runSearch(q, resourceEl.value), 350);
  });

  // Resource filter change
  resourceEl.addEventListener('change', () => {
    const q = inputEl.value.trim();
    if (q.length >= 2) runSearch(q, resourceEl.value);
  });

  // Copy link
  c.querySelector('#srch-copy').addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => toast('success', 'Link copied', ''))
        .catch(() => toast('warn', 'Copy failed', 'Please copy the URL manually'));
    } else {
      toast('warn', 'Copy not supported', url);
    }
  });

  // ────────────────────────────────────────────────────────
  // RUN SEARCH
  // ────────────────────────────────────────────────────────
  async function runSearch(query, resource) {
    if (!query || query.length < 2) {
      resultsEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass empty-state-icon"></i><h3>Type at least 2 characters</h3></div>';
      return;
    }
    resultsEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Searching…</h3></div>';

    // Update URL so page is bookmarkable
    const urlParams = new URLSearchParams();
    urlParams.set('q', query);
    if (resource) urlParams.set('resource', resource);
    history.replaceState(null, '', `#search?${urlParams.toString()}`);

    try {
      const res = await api.search.search(query, resource || 'clients,loans,groups,savings,centers');
      const items = Array.isArray(res) ? res : (res?.pageItems || []);

      saveRecentSearch(query, resource);
      renderRecentSearches(recentEl, (q, r) => {
        inputEl.value = q;
        if (r) resourceEl.value = r;
        runSearch(q, r);
      });

      drawResults(resultsEl, items, query);
    } catch (e) {
      resultsEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation empty-state-icon"></i><h3>Search failed</h3><p>${escapeHtml(extractFineractError(e) || '')}</p></div>`;
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
        <i class="fa-solid fa-magnifying-glass empty-state-icon"></i>
        <h3>No results for "${escapeHtml(query)}"</h3>
        <p>Try a different keyword, account number, or external ID.</p>
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
    <div class="mb-3 text-muted">
      ${num(items.length)} result${items.length !== 1 ? 's' : ''} for "<b>${escapeHtml(query)}</b>"
    </div>
    ${Object.entries(grouped).map(([type, list]) => `
      <div class="card mb-3">
        <div class="card-header">
          <h3 class="card-title">
            <i class="fa-solid ${getResourceIcon(type)} text-teal" style="margin-right:6px"></i>
            ${escapeHtml(type)} <span class="text-muted">(${list.length})</span>
          </h3>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th></th>
              <th>Name / Account</th>
              <th>External ID</th>
              <th>Status</th>
              <th>Office</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${list.map(item => {
                const iconCls = getResourceIcon(item.entityType);
                const name    = item.entityName || item.entityAccountNo || '—';
                const route   = getResourceRoute(item.entityType, item.entityId || item.parentId);
                return `
                  <tr class="clickable" data-go-route="${route}">
                    <td><i class="fa-solid ${iconCls}" style="color:var(--brand-teal)"></i></td>
                    <td>
                      <b>${escapeHtml(name)}</b>
                      ${item.entityAccountNo ? `<div class="text-muted small mono">${escapeHtml(item.entityAccountNo)}</div>` : ''}
                    </td>
                    <td class="mono">${escapeHtml(item.entityExternalId || '—')}</td>
                    <td>${item.entityStatus ? sb(item.entityStatus.value || item.entityStatus) : '—'}</td>
                    <td>${escapeHtml(item.parentName || item.entityOfficeName || '—')}</td>
                    <td class="text-right">
                      <button class="btn-ghost btn-xs"><i class="fa-solid fa-arrow-right"></i></button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('')}
  `;

  // Wire row clicks
  el.querySelectorAll('[data-go-route]').forEach(row =>
    row.addEventListener('click', () => {
      const route = row.dataset.goRoute;
      if (route) location.hash = route.startsWith('#/') ? route.slice(1) : route;
    })
  );
}

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

function getResourceRoute(type, id) {
  const t = (type || '').toUpperCase();
  if (t === 'CLIENT')  return `#/client-detail?id=${id}`;
  if (t === 'LOAN')    return `#/loans?id=${id}`;
  if (t === 'GROUP')   return `#/groups?id=${id}`;
  if (t === 'SAVING' || t === 'SAVINGS') return `#/savings?id=${id}`;
  if (t === 'CENTER')  return `#/centers?id=${id}`;
  return '#/';
}

// ════════════════════════════════════════════════════════════
// RECENT SEARCHES (shared with palette via localStorage)
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
    if (!recent.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="card mb-3" style="background:var(--bg-card-alt)">
        <div class="card-body" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="text-muted small">Recent:</span>
          ${recent.map((r, i) => `
            <button class="btn-secondary btn-xs" data-recent-idx="${i}">
              <i class="fa-solid fa-clock-rotate-left" style="font-size:9px"></i>
              ${escapeHtml(r.query)}
              ${r.resource ? `<span class="text-muted" style="font-size:10px"> · ${escapeHtml(r.resource)}</span>` : ''}
            </button>
          `).join('')}
          <button class="btn-ghost btn-xs ml-auto" id="srch-clear-recent">
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
      </div>`;
    el.querySelectorAll('[data-recent-idx]').forEach(b =>
      b.addEventListener('click', () => {
        const r = recent[parseInt(b.dataset.recentIdx, 10)];
        if (r) onClick(r.query, r.resource);
      })
    );
    el.querySelector('#srch-clear-recent').addEventListener('click', () => {
      localStorage.removeItem(RECENT_KEY);
      el.innerHTML = '';
      toast('success', 'Recent searches cleared', '');
    });
  } catch { el.innerHTML = ''; }
}