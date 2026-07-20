/* FinCraft · pages/deposits/list.js — the list/table view for this entity.
   Auto-split from the original monolithic pages/deposits.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { api } from '../../api.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../utils.js';
import { toast } from '../../ui.js';
import { renderPagination, DEFAULT_PAGE_SIZE } from '../../ui/pagination.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Deposits</h1>
        <div class="text-muted">Fixed & Recurring Deposits</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_RECURRINGDEPOSITACCOUNT') ? `<button class="btn-secondary" data-modal="newRDModal"><i class="fa-solid fa-plus"></i> New RD</button>` : ''}
        ${can('CREATE_FIXEDDEPOSITACCOUNT')     ? `<button class="btn-primary" data-modal="newFDModal"><i class="fa-solid fa-plus"></i> New FD</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="dep-list-tabs">
        <button class="tab active" data-deptype="fd">Fixed Deposits</button>
        <button class="tab" data-deptype="rd">Recurring Deposits</button>
      </div>

      <!-- FD Panel -->
      <div class="tab-panel active" data-deppanel="fd">
        <div class="filter-bar">
          <input id="fd-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
          <select id="fd-status" class="form-control">
            <option value="">All Status</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="prematureClosed">Premature Closed</option>
          </select>
          <button class="btn-secondary" id="fd-export"><i class="fa-solid fa-download"></i> Export</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>Account</th><th>Client</th><th>Product</th>
            <th class="text-right">Principal</th><th>Maturity</th>
            <th class="text-right">Rate</th><th>Status</th><th></th>
          </tr></thead>
          <tbody id="fd-rows"><tr><td colspan="8" class="empty-state-row">Loading…</td></tr></tbody>
        </table>
        <div id="fd-pagination" class="pagination-bar"></div>
      </div>

      <!-- RD Panel -->
      <div class="tab-panel" data-deppanel="rd" hidden>
        <div class="filter-bar">
          <input id="rd-search" class="form-control" placeholder="Search account or client…" autocomplete="off"/>
          <select id="rd-status" class="form-control">
            <option value="">All Status</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          <button class="btn-secondary" id="rd-export"><i class="fa-solid fa-download"></i> Export</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>Account</th><th>Client</th><th>Product</th>
            <th class="text-right">Per Period</th><th>Maturity</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody id="rd-rows"><tr><td colspan="7" class="empty-state-row">Loading…</td></tr></tbody>
        </table>
        <div id="rd-pagination" class="pagination-bar"></div>
      </div>
    </div>`;

  // Tab switching
  c.querySelectorAll('[data-deptype]').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('[data-deptype]').forEach(t => t.classList.toggle('active', t === tab));
    c.querySelectorAll('[data-deppanel]').forEach(p => p.hidden = p.dataset.deppanel !== tab.dataset.deptype);
  }));

  let fdRows = [], rdRows = [];
  let pageSize = DEFAULT_PAGE_SIZE;
  let fdTotal = 0, fdOffset = 0;
  let rdTotal = 0, rdOffset = 0;

  function drawPagination(elId, total, offset, onPage) {
    renderPagination(c.querySelector(`#${elId}`), {
      total, offset, pageSize,
      onChange: (newOffset, newSize) => { pageSize = newSize; onPage(newOffset); }
    });
  }

  async function loadFD(offset = 0) {
    c.querySelector('#fd-rows').innerHTML = '<tr><td colspan="8" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: pageSize, offset };
      const status = c.querySelector('#fd-status')?.value;
      if (status) params.status = status;
      const res = await api.fixedDeposits.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      fdTotal = Array.isArray(res) ? list.length : (res?.totalFilteredRecords ?? list.length);
      fdOffset = offset;
      const q = c.querySelector('#fd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q));
      fdRows = list;
      c.querySelector('#fd-rows').innerHTML = list.length ? list.map(d => {
        const isPending  = d.status?.value === 'Submitted and pending approval';
        const isApproved = d.status?.value === 'Approved';
        return `
          <tr>
            <td><a href="#" data-view-fd="${d.id}">${escapeHtml(d.accountNo || `#${d.id}`)}</a></td>
            <td>${escapeHtml(d.clientName || '—')}</td>
            <td>${escapeHtml(d.depositProductName || '—')}</td>
            <td class="text-right">${fmt(d.depositAmount || 0)}</td>
            <td>${fmtDate(d.maturityDate) || '—'}</td>
            <td class="text-right">${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</td>
            <td>${sb(d.status?.value || '—')}</td>
            <td class="text-right">
              ${isPending  && can('APPROVE_FIXEDDEPOSITACCOUNT')  ? `<button class="btn-mini btn-success" data-fd-approve="${d.id}">Approve</button>`  : ''}
              ${isApproved && can('ACTIVATE_FIXEDDEPOSITACCOUNT') ? `<button class="btn-mini btn-success" data-fd-activate="${d.id}">Activate</button>` : ''}
            </td>
          </tr>`;
      }).join('') : '<tr><td colspan="8" class="empty-state-row">No fixed deposits</td></tr>';

      drawPagination('fd-pagination', fdTotal, fdOffset, loadFD);

      c.querySelectorAll('[data-view-fd]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault();
        import('../../router.js').then(r => r.navigate('deposits', { id: b.dataset.viewFd, type: 'fd' }));
      }));
      c.querySelectorAll('[data-fd-approve]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.fdApprove;
        const approvedOnDate = today();
        try {
          await api.fixedDeposits.approve(id, {
            approvedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE
          });
          let activated = false;
          try {
            await api.fixedDeposits.activate(id, { activatedOnDate: approvedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            activated = true;
          } catch (actErr) {
            toast('warn', 'Approved, but activation failed', extractFineractError(actErr));
          }
          toast('success', activated ? 'FD approved & activated' : 'FD approved', '#' + id);
          loadFD(fdOffset);
        } catch (e) { toast('error', 'Approval failed', extractFineractError(e)); }
      }));
      c.querySelectorAll('[data-fd-activate]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.fixedDeposits.activate(b.dataset.fdActivate, {
            activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'FD activated', '#' + b.dataset.fdActivate);
          loadFD(fdOffset);
        } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
      }));
    } catch (e) {
      c.querySelector('#fd-rows').innerHTML = `<tr><td colspan="8" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
    }
  }

  async function loadRD(offset = 0) {
    c.querySelector('#rd-rows').innerHTML = '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: pageSize, offset };
      const status = c.querySelector('#rd-status')?.value;
      if (status) params.status = status;
      const res = await api.recurringDeposits.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      rdTotal = Array.isArray(res) ? list.length : (res?.totalFilteredRecords ?? list.length);
      rdOffset = offset;
      const q = c.querySelector('#rd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q));
      rdRows = list;
      c.querySelector('#rd-rows').innerHTML = list.length ? list.map(d => {
        const isPending  = d.status?.value === 'Submitted and pending approval';
        const isApproved = d.status?.value === 'Approved';
        return `
          <tr>
            <td><a href="#" data-view-rd="${d.id}">${escapeHtml(d.accountNo || `#${d.id}`)}</a></td>
            <td>${escapeHtml(d.clientName || '—')}</td>
            <td>${escapeHtml(d.depositProductName || '—')}</td>
            <td class="text-right">${fmt(d.mandatoryRecommendedDepositAmount || 0)}</td>
            <td>${fmtDate(d.maturityDate) || '—'}</td>
            <td>${sb(d.status?.value || '—')}</td>
            <td class="text-right">
              ${isPending  && can('APPROVE_RECURRINGDEPOSITACCOUNT')  ? `<button class="btn-mini btn-success" data-rd-approve="${d.id}">Approve</button>`  : ''}
              ${isApproved && can('ACTIVATE_RECURRINGDEPOSITACCOUNT') ? `<button class="btn-mini btn-success" data-rd-activate="${d.id}">Activate</button>` : ''}
            </td>
          </tr>`;
      }).join('') : '<tr><td colspan="7" class="empty-state-row">No recurring deposits</td></tr>';

      drawPagination('rd-pagination', rdTotal, rdOffset, loadRD);

      c.querySelectorAll('[data-view-rd]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault();
        import('../../router.js').then(r => r.navigate('deposits', { id: b.dataset.viewRd, type: 'rd' }));
      }));
      c.querySelectorAll('[data-rd-approve]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.rdApprove;
        const approvedOnDate = today();
        try {
          await api.recurringDeposits.approve(id, {
            approvedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE
          });
          let activated = false;
          try {
            await api.recurringDeposits.activate(id, { activatedOnDate: approvedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            activated = true;
          } catch (actErr) {
            toast('warn', 'Approved, but activation failed', extractFineractError(actErr));
          }
          toast('success', activated ? 'RD approved & activated' : 'RD approved', '#' + id);
          loadRD(rdOffset);
        } catch (e) { toast('error', 'Approval failed', extractFineractError(e)); }
      }));
      c.querySelectorAll('[data-rd-activate]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.recurringDeposits.activate(b.dataset.rdActivate, {
            activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
          });
          toast('success', 'RD activated', '#' + b.dataset.rdActivate);
          loadRD(rdOffset);
        } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
      }));
    } catch (e) {
      c.querySelector('#rd-rows').innerHTML = `<tr><td colspan="7" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
    }
  }

  await Promise.all([loadFD(), loadRD()]);

  let ft, rt;
  c.querySelector('#fd-search').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => loadFD(0), 400); });
  c.querySelector('#fd-status').addEventListener('change', () => loadFD(0));
  c.querySelector('#rd-search').addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(() => loadRD(0), 400); });
  c.querySelector('#rd-status').addEventListener('change', () => loadRD(0));

  c.querySelector('#fd-export').addEventListener('click', () => {
    const rows = fdRows.map(d =>
      [d.accountNo, d.clientName, d.depositProductName, d.depositAmount, d.maturityDate, d.status?.value].join(','));
    const csv = ['Account,Client,Product,Principal,Maturity,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'fixed_deposits.csv'; a.click();
    toast('success', 'Exported', 'fixed_deposits.csv');
  });

  c.querySelector('#rd-export').addEventListener('click', () => {
    const rows = rdRows.map(d =>
      [d.accountNo, d.clientName, d.depositProductName, d.mandatoryRecommendedDepositAmount, d.maturityDate, d.status?.value].join(','));
    const csv = ['Account,Client,Product,Per Period,Maturity,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'recurring_deposits.csv'; a.click();
    toast('success', 'Exported', 'recurring_deposits.csv');
  });
}
