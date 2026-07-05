/* FinCraft · pages/clients/list.js — the list/table view for this entity.
   Auto-split from the original monolithic pages/clients.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml, fmtDate, ini, num, sb } from '../../utils.js';
import { toast } from '../../ui.js';
import { today } from '../../config.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Clients</h1>
        <div class="text-muted"><span id="clients-count">—</span> clients across all offices</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_CLIENT') ? `
          <button class="btn-secondary" data-modal="bulkImportModal"><i class="fa-solid fa-file-arrow-up"></i> Bulk Import</button>
          <button class="btn-primary" data-modal="newClientModal"><i class="fa-solid fa-plus"></i> New Client</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="cf-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="cf-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <select id="cf-office" class="form-control"><option value="">All Offices</option></select>
        <button class="btn-secondary" id="cf-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th></th><th>Name</th><th>Account</th><th>Office</th>
          <th>Officer</th><th>Status</th><th>Since</th><th></th>
        </tr></thead>
        <tbody id="clients-rows">
          <tr><td colspan="8" class="empty-state-row">Loading clients…</td></tr>
        </tbody>
      </table>
      <div id="cf-pagination" class="pagination-bar"></div>
    </div>`;

  // Office filter
  api.offices.list().then(offices => {
    const sel = c.querySelector('#cf-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

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
    c.querySelector('#clients-rows').innerHTML = rows.map(cl => `
      <tr>
        <td><div class="avatar">${ini(cl.displayName)}</div></td>
        <td><a href="#" data-view-client="${cl.id}"><b>${escapeHtml(cl.displayName || '—')}</b></a></td>
        <td>${escapeHtml(cl.accountNo || String(cl.id))}</td>
        <td>${escapeHtml(cl.officeName || '—')}</td>
        <td>${escapeHtml(cl.staffName || 'Unassigned')}</td>
        <td>${sb(cl.status?.value || cl.status || '—')}</td>
        <td>${fmtDate(cl.activationDate)}</td>
        <td class="text-right">
          ${(cl.status?.value === 'Pending' && can('ACTIVATE_CLIENT')) ?
            `<button class="btn-mini btn-success" data-activate-client="${cl.id}">Activate</button>` : ''}
        </td>
      </tr>`).join('') ||
      '<tr><td colspan="8" class="empty-state-row">No clients match</td></tr>';

    c.querySelectorAll('[data-view-client]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('client-detail', { id: b.dataset.viewClient }));
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
