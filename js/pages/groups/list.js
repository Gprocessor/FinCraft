/* FinCraft · pages/groups/list.js — the list/table view for this entity.
   Auto-split from the original monolithic pages/groups.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { api } from '../../api.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { toast } from '../../ui.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Groups</h1>
        <div class="text-muted">JLG / Solidarity / Savings groups · <span id="grp-count">—</span> total</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_GROUP') ? `<button class="btn-primary" data-modal="newGroupModal"><i class="fa-solid fa-plus"></i> New Group</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="grp-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="grp-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
        <select id="grp-office" class="form-control"><option value="">All Offices</option></select>
        <button class="btn-secondary" id="grp-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Group Name</th><th>Office</th>
          <th>Staff</th><th>Members</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="grp-rows">
          <tr><td colspan="7" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="grp-pagination" class="pagination-bar"></div>
    </div>`;

  api.offices.list().then(offices => {
    const sel = c.querySelector('#grp-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allGroups = [], totalRecords = 0, currentOffset = 0, pageSize = DEFAULT_PAGE_SIZE;

  async function load(offset = 0) {
    c.querySelector('#grp-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const officeId = c.querySelector('#grp-office')?.value;
      const status   = c.querySelector('#grp-status')?.value;
      const q        = c.querySelector('#grp-search')?.value?.trim();
      const params   = { limit: pageSize, offset, paged: true };
      if (officeId) params.officeId = officeId;
      if (q) params.name = q;

      const res = await api.groups.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;
      // Status is client-side filterable since Fineract GET /groups doesn't accept status directly
      if (status) list = list.filter(g => (g.status?.value || '').toLowerCase() === status);
      allGroups = list;
      currentOffset = offset;
      c.querySelector('#grp-count').textContent = num(totalRecords);
      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#grp-rows').innerHTML =
        `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    renderPagination(c.querySelector('#grp-pagination'), {
      total: totalRecords, offset: currentOffset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; load(newOffset); }
    });
  }

  function draw(rows) {
    c.querySelector('#grp-rows').innerHTML = rows.map(g => `
      <tr>
        <td><a href="#" data-view-group="${g.id}">${escapeHtml(g.accountNo || `G${g.id}`)}</a></td>
        <td>${escapeHtml(g.name || '—')}</td>
        <td>${escapeHtml(g.officeName || '—')}</td>
        <td>${escapeHtml(g.staffName || '—')}</td>
        <td>${(g.clientMembers || []).length || g.activeClientMembers || '—'}</td>
        <td>${sb(g.status?.value || '—')}</td>
        <td class="text-right">
          ${(g.status?.value === 'Pending' && can('ACTIVATE_GROUP'))
            ? `<button class="btn-mini btn-success" data-grp-activate="${g.id}">Activate</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-state-row">No groups found</td></tr>';

    c.querySelectorAll('[data-view-group]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('groups', { id: b.dataset.viewGroup }));
    }));
    c.querySelectorAll('[data-grp-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.groups.activate(b.dataset.grpActivate, {
          activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Group activated', `#${b.dataset.grpActivate}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#grp-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#grp-status', '#grp-office'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#grp-export').addEventListener('click', () => {
    const rows = allGroups.map(g => [
      g.accountNo, g.name, g.officeName, g.staffName,
      (g.clientMembers || []).length, g.status?.value
    ].join(','));
    const csv = ['Account,Name,Office,Staff,Members,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'groups.csv'; a.click();
    toast('success', 'Exported', 'groups.csv downloaded');
  });
}
