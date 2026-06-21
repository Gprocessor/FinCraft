/* FinCraft · search.js — Live API */
import { api } from '../api.js';
import { ini, sb, escapeHtml } from '../utils.js';
import { debounce } from '../utils.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Search</h1><div class="page-subtitle">Find clients, loans, groups across the platform</div></div>
    </div>
    <div class="card">
      <input id="g-search" class="form-control" placeholder="Type to search clients, loans, groups…" autofocus />
      <div id="g-results" class="mt-4"><div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><div>Type to search</div></div></div>
    </div>
  </div>`;

  const search = debounce(async (q) => {
    if (!q || q.length < 2) {
      c.querySelector('#g-results').innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><div>Type at least 2 characters to search</div></div>';
      return;
    }
    c.querySelector('#g-results').innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Searching…</div></div>';
    try {
      const res = await api.search.search(q, 'clients,loans,groups');
      const results = Array.isArray(res) ? res : [];
      if (!results.length) {
        c.querySelector('#g-results').innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-question"></i><div>No matches for "${escapeHtml(q)}"</div></div>`;
        return;
      }
      const clients = results.filter(r => r.entityType === 'CLIENT');
      const loans   = results.filter(r => r.entityType === 'LOAN');
      const groups  = results.filter(r => r.entityType === 'GROUP');

      const section = (title, icon, items, rowFn) => !items.length ? '' : `
        <div class="card-header mt-4"><h3 class="card-title"><i class="fa-solid ${icon}"></i> ${title} <span class="badge">${items.length}</span></h3></div>
        <div class="tbl-wrap"><table class="tbl"><tbody>${items.map(rowFn).join('')}</tbody></table></div>`;

      c.querySelector('#g-results').innerHTML =
        section('Clients', 'fa-users', clients, x => `<tr>
          <td><div class="avatar">${ini(x.entityName)}</div></td>
          <td><b>${escapeHtml(x.entityName)}</b></td>
          <td class="mono">${escapeHtml(x.entityAccountNo || `#${x.entityId}`)}</td>
          <td>${sb(x.entityStatus?.value || '—')}</td></tr>`)
        + section('Loans', 'fa-hand-holding-dollar', loans, x => `<tr>
          <td class="mono">${escapeHtml(x.entityAccountNo || `#${x.entityId}`)}</td>
          <td>${escapeHtml(x.entityName)}</td>
          <td>${sb(x.entityStatus?.value || '—')}</td></tr>`)
        + section('Groups', 'fa-people-group', groups, x => `<tr>
          <td>${escapeHtml(x.entityName)}</td>
          <td class="mono">${escapeHtml(x.entityAccountNo || `#${x.entityId}`)}</td>
          <td>${sb(x.entityStatus?.value || '—')}</td></tr>`)
        || `<div class="empty-state"><i class="fa-solid fa-circle-question"></i><div>No matches for "${escapeHtml(q)}"</div></div>`;
    } catch (e) {
      c.querySelector('#g-results').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    }
  }, 400);

  c.querySelector('#g-search').addEventListener('input', e => search(e.target.value.trim()));
}
