/* FinCraft · pages/clients/list.js — the list/table view for this entity.
   Redesigned around the cv-* (clients-view.css) component set: warm paper-white cards,
   pill filters, hashed avatar colours, and a fully clickable row. */

import { api } from '../../api.js';
import { escapeHtml, fmtDate, num } from '../../utils.js';
import { toast } from '../../ui.js';
import { today } from '../../config.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can, cvAvatar, cvClientType, cvPill, cvStatusTone } from './shared.js';

export async function renderList(c) {
  c.innerHTML = `
  <div class="cv-page">
    <div class="cv-page-head">
      <div>
        <h1>Clients</h1>
        <div class="cv-sub"><span id="clients-count">—</span> clients across all offices</div>
      </div>
      <div class="cv-detail-actions">
        ${can('CREATE_CLIENT') ? `
          <button class="cv-btn-ghost" data-modal="bulkImportModal"><i class="fa-solid fa-file-arrow-up"></i> Bulk Import</button>
          <button class="cv-btn-solid" data-modal="newClientModal"><i class="fa-solid fa-plus"></i> New Client</button>` : ''}
      </div>
    </div>

    <div class="cv-toolbar">
      <div class="cv-search"><i class="fa-solid fa-magnifying-glass"></i>
        <input id="cf-search" placeholder="Search name, number or email…" autocomplete="off"/>
      </div>
      <select id="cf-status" class="cv-select">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="closed">Closed</option>
        <option value="rejected">Rejected</option>
        <option value="withdrawn">Withdrawn</option>
      </select>
      <select id="cf-type" class="cv-select">
        <option value="">All types</option>
        <option value="1">Individual</option>
        <option value="2">Business</option>
      </select>
      <button class="cv-btn-ghost" id="cf-more"><i class="fa-solid fa-filter"></i> More filters</button>
      <button class="cv-btn-ghost" id="cf-export"><i class="fa-solid fa-download"></i> Export CSV</button>
    </div>

    <div class="cv-toolbar" id="cf-more-row" hidden>
      <select id="cf-office" class="cv-select"><option value="">All Offices</option></select>
    </div>

    <div class="cv-table-wrap">
      <table class="cv-table">
        <thead><tr>
          <th>Customer</th><th>Number</th><th>Type</th><th>Branch</th>
          <th>Officer</th><th>Status</th><th>Onboarded</th><th></th>
        </tr></thead>
        <tbody id="clients-rows">
          <tr><td colspan="8" class="empty-state-row">Loading clients…</td></tr>
        </tbody>
      </table>
      <div id="cf-pagination" class="pagination-bar"></div>
    </div>
  </div>`;

  // Office filter (tucked behind "More filters")
  api.offices.list().then(offices => {
    const sel = c.querySelector('#cf-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  c.querySelector('#cf-more').addEventListener('click', () => {
    const row = c.querySelector('#cf-more-row');
    row.hidden = !row.hidden;
  });

  let allClients = [], totalRecords = 0, currentOffset = 0, pageSize = DEFAULT_PAGE_SIZE;

  async function loadClients(offset = 0) {
    c.querySelector('#clients-rows').innerHTML =
      '<tr><td colspan="8" class="empty-state-row">Loading…</td></tr>';
    try {
      const q       = c.querySelector('#cf-search')?.value?.trim() || '';
      const status  = c.querySelector('#cf-status')?.value || '';
      const officeId = c.querySelector('#cf-office')?.value || '';
      const params = { limit: pageSize, offset };
      if (q) params.displayName = q;
      if (status) params.status = status.toLowerCase();
      if (officeId) params.officeId = officeId;

      const res = await api.clients.list(params);
      allClients = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? allClients.length;
      currentOffset = offset;
      c.querySelector('#clients-count').textContent = num(totalRecords);
      draw(allClients);
      drawPagination();
    } catch (e) {
      c.querySelector('#clients-rows').innerHTML =
        `<tr><td colspan="8" class="text-error">${escapeHtml(e.message || 'Failed to load clients')}</td></tr>`;
    }
  }

  function drawPagination() {
    renderPagination(c.querySelector('#cf-pagination'), {
      total: totalRecords, offset: currentOffset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; loadClients(newOffset); }
    });
  }

  function draw(rows) {
    const typeFilter = c.querySelector('#cf-type')?.value || '';
    const filtered = typeFilter
      ? rows.filter(cl => String(cl.legalForm?.id ?? (/entity/i.test(cl.legalForm?.value || '') ? 2 : 1)) === typeFilter)
      : rows;

    c.querySelector('#clients-rows').innerHTML = filtered.map(cl => {
      const type = cvClientType(cl);
      return `
      <tr class="cv-row" data-view-client="${cl.id}">
        <td>
          <div class="cv-name-cell">
            ${cvAvatar(cl, 'sm')}
            <div class="cv-name-txt">
              <b>${escapeHtml(cl.displayName || '—')}</b>
              ${cl.emailAddress ? `<div class="cv-email">${escapeHtml(cl.emailAddress)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="cv-mono">${escapeHtml(cl.accountNo || String(cl.id))}</td>
        <td>${cvPill(type, type === 'Business' ? 'blue' : 'slate')}</td>
        <td>${escapeHtml(cl.officeName || '—')}</td>
        <td class="cv-muted">${escapeHtml(cl.staffName || 'Unassigned')}</td>
        <td>${cvPill(cl.status?.value || '—', cvStatusTone(cl.status?.value))}</td>
        <td class="cv-muted">${fmtDate(cl.activationDate) || '—'}</td>
        <td class="text-right" onclick="event.stopPropagation()">
          ${(cl.status?.value === 'Pending' && can('ACTIVATE_CLIENT')) ?
            `<button class="btn-mini btn-success" data-activate-client="${cl.id}">Activate</button>` :
            `<i class="fa-solid fa-chevron-right cv-chevron"></i>`}
        </td>
      </tr>`;
    }).join('') ||
      `<tr><td colspan="8" class="empty-state-row">No clients match</td></tr>`;

    c.querySelectorAll('[data-view-client]').forEach(row => row.addEventListener('click', () => {
      import('../../router.js').then(r => r.navigate('client-detail', { id: row.dataset.viewClient }));
    }));
    c.querySelectorAll('[data-activate-client]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.clients.activate(b.dataset.activateClient, today());
        toast('success', 'Client activated', `#${b.dataset.activateClient} is now Active`);
        loadClients(currentOffset);
      } catch (e) {
        toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message);
      }
    }));
  }

  await loadClients();

  let searchTimer;
  c.querySelector('#cf-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadClients(0), 400);
  });
  ['#cf-status', '#cf-office'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => loadClients(0));
  });
  c.querySelector('#cf-type')?.addEventListener('change', () => draw(allClients));

  c.querySelector('#cf-export').addEventListener('click', () => {
    const rows = allClients.map(cl =>
      [cl.accountNo, cl.displayName, cl.officeName, cl.staffName, cl.status?.value, cl.activationDate].join(','));
    const csv = ['Account,Name,Office,Officer,Status,Since', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'clients.csv'; a.click();
    toast('success', 'Exported', 'clients.csv downloaded');
  });
}
