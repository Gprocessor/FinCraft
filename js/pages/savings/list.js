/* FinCraft · pages/savings/list.js — the list/table view for this entity.
   Auto-split from the original monolithic pages/savings.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { api } from '../../api.js';
import { escapeHtml, fmt, num, sb } from '../../utils.js';
import { openModal, toast } from '../../ui.js';
import { can } from './shared.js';

export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Savings</h1>
        <div class="text-muted">Savings accounts portfolio</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_SAVINGSACCOUNT') ? `<button class="btn-primary" data-modal="newSavingsModal"><i class="fa-solid fa-plus"></i> New Savings</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Total Accounts</div><div class="kpi-value" id="sv-count">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Balance</div><div class="kpi-value" id="sv-balance">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Balance</div><div class="kpi-value" id="sv-avg">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Records</div><div class="kpi-value" id="sv-total">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="sv-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
        <select id="sv-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="closed">Closed</option>
        </select>
        <select id="sv-product" class="form-control"><option value="">All Products</option></select>
        <button class="btn-secondary" id="sv-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Client</th><th>Product</th>
          <th class="text-right">Balance</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="sv-rows">
          <tr><td colspan="6" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="sv-pagination" class="pagination-bar"></div>
    </div>`;

  api.savingsProducts.list().then(p => {
    const sel = c.querySelector('#sv-product');
    (Array.isArray(p) ? p : []).forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id; opt.textContent = prod.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allAccounts = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  // Portfolio-wide KPIs — Total Accounts / Total Balance / Avg Balance must reflect the whole
  // filtered portfolio, not just the current 50-row page. Fetched as one large, unpaginated
  // request (same status/product filters as the table) purely to compute these aggregates.
  async function loadKpis() {
    try {
      const status = c.querySelector('#sv-status')?.value;
      const prod   = c.querySelector('#sv-product')?.value;
      const params = { limit: 10000 };
      if (status) params.status = status;
      if (prod)   params.productId = prod;

      const res = await api.savings.list(params);
      const all = Array.isArray(res) ? res : (res?.pageItems || []);
      const total = all.reduce((sum, a) => sum + (a.summary?.accountBalance || 0), 0);

      c.querySelector('#sv-count').textContent   = num(all.length);
      c.querySelector('#sv-balance').textContent = fmt(total);
      c.querySelector('#sv-avg').textContent     = fmt(all.length ? total / all.length : 0);
    } catch (e) {
      ['#sv-count', '#sv-balance', '#sv-avg'].forEach(id => {
        const el = c.querySelector(id);
        if (el) el.textContent = '—';
      });
    }
  }

  async function load(offset = 0) {
    c.querySelector('#sv-rows').innerHTML =
      '<tr><td colspan="6" class="empty-state-row">Loading…</td></tr>';
    try {
      const status = c.querySelector('#sv-status')?.value;
      const prod   = c.querySelector('#sv-product')?.value;
      const params = { limit: PAGE_SIZE, offset };
      if (status) params.status = status;
      if (prod)   params.productId = prod;

      const res = await api.savings.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;

      const q = c.querySelector('#sv-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(s =>
        (s.accountNo || '').toLowerCase().includes(q) ||
        (s.clientName || '').toLowerCase().includes(q));

      allAccounts = list;
      currentOffset = offset;

      c.querySelector('#sv-total').textContent   = num(totalRecords);

      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#sv-rows').innerHTML =
        `<tr><td colspan="6" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#sv-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="sv-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="sv-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#sv-prev')?.addEventListener('click', () => load(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#sv-next')?.addEventListener('click', () => load(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#sv-rows').innerHTML = rows.map(s => {
      const status     = s.status?.value || '—';
      const isPending  = status === 'Submitted and pending approval';
      const isApproved = status === 'Approved';
      const isActive   = status === 'Active';
      return `
        <tr>
          <td><a href="#" data-view-savings="${s.id}">${escapeHtml(s.accountNo || `#${s.id}`)}</a></td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.savingsProductName || '—')}</td>
          <td class="text-right">${fmt(s.summary?.accountBalance ?? 0)}</td>
          <td>${sb(status)}</td>
          <td class="text-right">
            ${isPending  && can('APPROVE_SAVINGSACCOUNT')  ? `<button class="btn-mini btn-success" data-sv-approve="${s.id}">Approve</button>`  : ''}
            ${isApproved && can('ACTIVATE_SAVINGSACCOUNT') ? `<button class="btn-mini btn-success" data-sv-activate="${s.id}">Activate</button>` : ''}
            ${isActive   && can('DEPOSIT_SAVINGSACCOUNT')  ? `<button class="btn-mini" data-sv-deposit="${s.id}">Deposit</button>` : ''}
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state-row">No accounts found</td></tr>';

    c.querySelectorAll('[data-view-savings]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('savings', { id: b.dataset.viewSavings }));
    }));
    c.querySelectorAll('[data-sv-deposit]').forEach(b => b.addEventListener('click', () => {
      const modal = openModal('savingsDepositModal');
      if (modal) modal.dataset.accountId = b.dataset.svDeposit;
    }));
    c.querySelectorAll('[data-sv-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.savings.approve(b.dataset.svApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Account approved', `#${b.dataset.svApprove}`);
        load(currentOffset); loadKpis();
      } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-sv-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.savings.activate(b.dataset.svActivate, {
          activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Account activated', `#${b.dataset.svActivate}`);
        load(currentOffset); loadKpis();
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await Promise.all([load(), loadKpis()]);

  let t;
  c.querySelector('#sv-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#sv-status', '#sv-product'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => { load(0); loadKpis(); });
  });

  c.querySelector('#sv-export').addEventListener('click', () => {
    const rows = allAccounts.map(s =>
      [s.accountNo, s.clientName, s.savingsProductName, s.summary?.accountBalance ?? 0, s.status?.value].join(','));
    const csv = ['Account,Client,Product,Balance,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'savings.csv'; a.click();
    toast('success', 'Exported', 'savings.csv downloaded');
  });
}
