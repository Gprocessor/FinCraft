/* FinCraft · pages/shares/list.js — renderList — the share accounts list view.
   Auto-split from the original monolithic pages/shares.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml, fmt, num, sb } from '../../utils.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Shares</h1>
        <div class="text-muted">Share accounts portfolio</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_SHAREACCOUNT') ? `<button class="btn-primary" data-modal="newShareModal"><i class="fa-solid fa-plus"></i> New Share Account</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" id="sh-active">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value" id="sh-pending">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Shares</div><div class="kpi-value" id="sh-total-shares">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Value</div><div class="kpi-value" id="sh-total-value">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="sh-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
        <select id="sh-status" class="form-control">
          <option value="">All Status</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
        </select>
        <select id="sh-product" class="form-control"><option value="">All Products</option></select>
        <button class="btn-secondary" id="sh-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Client</th><th>Product</th>
          <th class="text-right">Shares</th>
          <th class="text-right">Unit Price</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody id="sh-rows">
          <tr><td colspan="7" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="sh-pagination" class="pagination-bar"></div>
    </div>`;

  // Product filter
  api.shareProducts.list().then(p => {
    const sel = c.querySelector('#sh-product');
    (Array.isArray(p) ? p : []).forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id; opt.textContent = prod.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allAccounts = [], totalRecords = 0, currentOffset = 0, pageSize = DEFAULT_PAGE_SIZE;

  async function load(offset = 0) {
    c.querySelector('#sh-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: pageSize, offset };
      const status = c.querySelector('#sh-status')?.value;
      const prod = c.querySelector('#sh-product')?.value;
      if (status) params.status = status;
      if (prod) params.productId = prod;

      const res = await api.shares.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;

      const q = c.querySelector('#sh-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(s =>
        (s.accountNo || '').toLowerCase().includes(q) ||
        (s.clientName || '').toLowerCase().includes(q));

      allAccounts = list;
      currentOffset = offset;

      const activeCount = list.filter(s => s.status?.value === 'Active').length;
      const pendingCount = list.filter(s => s.status?.value === 'Submitted and pending approval').length;
      const totalShares = list.reduce((sum, s) => sum + (s.totalApprovedShares || 0), 0);
      const totalValue = list.reduce((sum, s) => sum + ((s.totalApprovedShares || 0) * (s.shareValue || s.unitPrice || 0)), 0);

      c.querySelector('#sh-active').textContent = num(activeCount);
      c.querySelector('#sh-pending').textContent = num(pendingCount);
      c.querySelector('#sh-total-shares').textContent = num(totalShares);
      c.querySelector('#sh-total-value').textContent = fmt(totalValue);

      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#sh-rows').innerHTML =
        `<tr><td colspan="7" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
    }
  }

  function drawPagination() {
    renderPagination(c.querySelector('#sh-pagination'), {
      total: totalRecords, offset: currentOffset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; load(newOffset); }
    });
  }

  function draw(rows) {
    c.querySelector('#sh-rows').innerHTML = rows.map(s => {
      const status = s.status?.value || '—';
      const isPending = status === 'Submitted and pending approval';
      const isApproved = status === 'Approved';
      return `
        <tr>
          <td><a href="#" data-view-share="${s.id}">${escapeHtml(s.accountNo || `#${s.id}`)}</a></td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.productName || s.shareProductName || '—')}</td>
          <td class="text-right">${num(s.totalApprovedShares || 0)}</td>
          <td class="text-right">${fmt(s.shareValue || s.unitPrice || 0)}</td>
          <td>${sb(status)}</td>
          <td class="text-right">
            ${isPending  && can('APPROVE_SHAREACCOUNT')  ? `<button class="btn-mini btn-success" data-sh-approve="${s.id}">Approve</button>`  : ''}
            ${isApproved && can('ACTIVATE_SHAREACCOUNT') ? `<button class="btn-mini btn-success" data-sh-activate="${s.id}">Activate</button>` : ''}
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-state-row">No share accounts found</td></tr>';

    c.querySelectorAll('[data-view-share]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('shares', { id: b.dataset.viewShare }));
    }));
    c.querySelectorAll('[data-sh-approve]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.shApprove;
      const approvedDate = today();
      try {
        await api.shares.approve(id, {
          approvedDate, dateFormat: DATE_FORMAT, locale: LOCALE
        });
        let activated = false;
        try {
          await api.shares.activate(id, { activatedDate: approvedDate, dateFormat: DATE_FORMAT, locale: LOCALE });
          activated = true;
        } catch (actErr) {
          toast('warn', 'Approved, but activation failed', extractFineractError(actErr));
        }
        toast('success', activated ? 'Share account approved & activated' : 'Share account approved', '#' + id);
        load(currentOffset);
      } catch (e) { toast('error', 'Approval failed', extractFineractError(e)); }
    }));
    c.querySelectorAll('[data-sh-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.shares.activate(b.dataset.shActivate, {
          activatedDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Share account activated', '#' + b.dataset.shActivate);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
    }));
  }

  await load();

  let t;
  c.querySelector('#sh-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#sh-status', '#sh-product'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#sh-export').addEventListener('click', () => {
    const rows = allAccounts.map(s => [
      s.accountNo, s.clientName, s.productName || s.shareProductName,
      s.totalApprovedShares || 0, s.shareValue || s.unitPrice || 0, s.status?.value
    ].join(','));
    const csv = ['Account,Client,Product,Shares,UnitPrice,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'shares.csv'; a.click();
    toast('success', 'Exported', 'shares.csv downloaded');
  });
}
