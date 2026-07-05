/* FinCraft · pages/centers/list.js — renderList — the centers list view.
   Auto-split from the original monolithic pages/centers.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Centers</h1>
        <div class="text-muted">Center hierarchy · <span id="ctr-count">—</span> total</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_CENTER') ? `<button class="btn-primary" data-modal="newCenterModal"><i class="fa-solid fa-plus"></i> New Center</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="ctr-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="ctr-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
        <select id="ctr-office" class="form-control"><option value="">All Offices</option></select>
        <button class="btn-secondary" id="ctr-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Name</th><th>Office</th>
          <th>Staff</th><th>Groups</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="ctr-rows">
          <tr><td colspan="7" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="ctr-pagination" class="pagination-bar"></div>
    </div>`;

  // Office filter
  api.offices.list().then(offices => {
    const sel = c.querySelector('#ctr-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allCenters = [], totalRecords = 0, currentOffset = 0, pageSize = DEFAULT_PAGE_SIZE;

  async function load(offset = 0) {
    c.querySelector('#ctr-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const officeId = c.querySelector('#ctr-office')?.value;
      const status   = c.querySelector('#ctr-status')?.value;
      const q        = c.querySelector('#ctr-search')?.value?.trim();
      const params   = { limit: pageSize, offset, paged: true };
      if (officeId) params.officeId = officeId;
      if (q) params.name = q;

      const res = await api.centers.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;
      if (status) list = list.filter(s => (s.status?.value || '').toLowerCase() === status);
      allCenters = list;
      currentOffset = offset;
      c.querySelector('#ctr-count').textContent = num(totalRecords);
      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#ctr-rows').innerHTML =
        `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    renderPagination(c.querySelector('#ctr-pagination'), {
      total: totalRecords, offset: currentOffset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; load(newOffset); }
    });
  }

  function draw(rows) {
    c.querySelector('#ctr-rows').innerHTML = rows.map(s => `
      <tr>
        <td><a href="#" data-view-center="${s.id}">${escapeHtml(s.accountNo || `C${s.id}`)}</a></td>
        <td>${escapeHtml(s.name || '—')}</td>
        <td>${escapeHtml(s.officeName || '—')}</td>
        <td>${escapeHtml(s.staffName || '—')}</td>
        <td>${(s.groupMembers || []).length || s.totalCollected || '—'}</td>
        <td>${sb(s.status?.value || '—')}</td>
        <td class="text-right">
          ${(s.status?.value === 'Pending' && can('ACTIVATE_CENTER'))
            ? `<button class="btn-mini btn-success" data-ctr-activate="${s.id}">Activate</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-state-row">No centers found</td></tr>';

    c.querySelectorAll('[data-view-center]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('centers', { id: b.dataset.viewCenter }));
    }));
    c.querySelectorAll('[data-ctr-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.centers.activate(b.dataset.ctrActivate, {
          activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Center activated', `#${b.dataset.ctrActivate}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#ctr-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#ctr-status', '#ctr-office'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#ctr-export').addEventListener('click', () => {
    const rows = allCenters.map(s => [
      s.accountNo, s.name, s.officeName, s.staffName,
      (s.groupMembers || []).length, s.status?.value
    ].join(','));
    const csv = ['Account,Name,Office,Staff,Groups,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'centers.csv'; a.click();
    toast('success', 'Exported', 'centers.csv downloaded');
  });
}
