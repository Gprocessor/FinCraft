import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · shares.js — Full share account lifecycle (permission-gated, tabbed) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
async function renderList(c) {
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

  let allAccounts = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  async function load(offset = 0) {
    c.querySelector('#sh-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const params = { limit: PAGE_SIZE, offset };
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
        `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#sh-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="sh-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="sh-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#sh-prev')?.addEventListener('click', () => load(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#sh-next')?.addEventListener('click', () => load(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#sh-rows').innerHTML = rows.map(s => {
      const status = s.status?.value || '—';
      const isPending = status === 'Submitted and pending approval';
      const isApproved = status === 'Approved';
      return `
        <tr>
          <td>${s.id}">${escapeHtml(s.accountNo || `#${s.id}`)}</a></td>
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

    c.querySelectorAll('[data-sh-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.shares.approve(b.dataset.shApprove, {
          approvedDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Share account approved', '#' + b.dataset.shApprove);
        load(currentOffset);
      } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-sh-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.shares.activate(b.dataset.shActivate, {
          activatedDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Share account activated', '#' + b.dataset.shActivate);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
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

// ============================================================
// DETAIL VIEW (tabbed, permission-gated)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading share account…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No account selected</div>'; return; }

  try {
    const s = await api.shares.get(id, { associations: 'all' });
    const status = s.status?.value || '';

    const isPending = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive = status === 'Active';

    const canApprove        = isPending  && can('APPROVE_SHAREACCOUNT');
    const canUndoApproval   = isApproved && can('APPROVALUNDO_SHAREACCOUNT');
    const canReject         = isPending  && can('REJECT_SHAREACCOUNT');
    const canWithdrawApp    = isPending  && can('WITHDRAW_SHAREACCOUNT');
    const canActivate       = isApproved && can('ACTIVATE_SHAREACCOUNT');
    const canApplyAdditional= isActive   && can('APPLYADDITIONALSHARES_SHAREACCOUNT');
    const canRedeem         = isActive   && can('REDEEMSHARES_SHAREACCOUNT');
    const canClose          = isActive   && can('CLOSE_SHAREACCOUNT');
    const canEdit           = isPending  && can('UPDATE_SHAREACCOUNT');
    const canDelete         = isPending  && can('DELETE_SHAREACCOUNT');

    const totalApprovedShares = s.totalApprovedShares || 0;
    const totalPendingForApproval = s.totalPendingForApprovalShares || 0;
    const shareValue = s.shareValue || s.unitPrice || 0;
    const totalValue = totalApprovedShares * shareValue;

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>Share Account #${escapeHtml(s.accountNo || id)}</h1>
          <div class="text-muted">
            ${s.clientId ? `${s.clientId}">${escapeHtml(s.clientName || '—')}</a>` : escapeHtml(s.clientName || '—')}
            · ${escapeHtml(s.productName || s.shareProductName || '—')}
            · ${sb(status || '—')}
            ${s.externalId ? ` · ext: ${escapeHtml(s.externalId)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-shares"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit            ? `<button class="btn-secondary" id="btn-sh-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canApprove         ? `<button class="btn-success"   id="btn-sh-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${canUndoApproval    ? `<button class="btn-warning"   id="btn-sh-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${canReject          ? `<button class="btn-warning"   id="btn-sh-reject"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdrawApp     ? `<button class="btn-secondary" id="btn-sh-withdraw"><i class="fa-solid fa-rotate-left"></i> Withdraw</button>` : ''}
          ${canActivate        ? `<button class="btn-success"   id="btn-sh-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canApplyAdditional ? `<button class="btn-primary"   id="btn-sh-apply"><i class="fa-solid fa-plus"></i> Apply Shares</button>` : ''}
          ${canRedeem          ? `<button class="btn-warning"   id="btn-sh-redeem"><i class="fa-solid fa-minus"></i> Redeem Shares</button>` : ''}
          ${canClose           ? `<button class="btn-danger"    id="btn-sh-close"><i class="fa-solid fa-box-archive"></i> Close</button>` : ''}
          ${canDelete          ? `<button class="btn-danger"    id="btn-sh-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="sh-tabs">
          <button class="tab" data-shtab="overview">Overview</button>
          <button class="tab" data-shtab="requests">Share Requests</button>
          <button class="tab" data-shtab="charges">Charges</button>
          <button class="tab" data-shtab="dividends">Dividends</button>
          ${can('READ_NOTE') ? `<button class="tab" data-shtab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-shtab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-shpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Account Details</h3>
              <dl class="dl-grid">
                <dt>Status</dt><dd>${sb(status || '—')}</dd>
                <dt>Client</dt><dd>${escapeHtml(s.clientName || '—')}</dd>
                <dt>Product</dt><dd>${escapeHtml(s.productName || s.shareProductName || '—')}</dd>
                <dt>Currency</dt><dd>${escapeHtml(s.currency?.code || '—')}</dd>
                <dt>External ID</dt><dd>${escapeHtml(s.externalId || '—')}</dd>
              </dl>
              <h3 class="mt-3">Timeline</h3>
              <dl class="dl-grid">
                <dt>Submitted</dt><dd>${fmtDate(s.timeline?.submittedDate) || '—'}</dd>
                <dt>Approved</dt><dd>${fmtDate(s.timeline?.approvedDate) || '—'}</dd>
                <dt>Activated</dt><dd>${fmtDate(s.timeline?.activatedDate) || '—'}</dd>
                <dt>Closed</dt><dd>${fmtDate(s.timeline?.closedDate) || '—'}</dd>
              </dl>
            </div>
            <div>
              <h3>Share Holdings</h3>
              <dl class="dl-grid">
                <dt>Approved Shares</dt><dd class="text-right"><b>${num(totalApprovedShares)}</b></dd>
                <dt>Pending Approval</dt><dd class="text-right">${num(totalPendingForApproval)}</dd>
                <dt>Unit Price</dt><dd class="text-right">${fmt(shareValue)}</dd>
                <dt>Total Value</dt><dd class="text-right"><b>${fmt(totalValue)}</b></dd>
                <dt>Min Shares</dt><dd class="text-right">${num(s.minimumActivePeriod || s.minRequiredShares || 0)}</dd>
                <dt>Lock-in Period</dt><dd>${num(s.lockinPeriod || 0)} ${escapeHtml(s.lockPeriodType?.value || '')}</dd>
              </dl>
              ${s.summary ? `
                <h3 class="mt-3">Summary</h3>
                <dl class="dl-grid">
                  <dt>Total Charges</dt><dd class="text-right">${fmt(s.summary.totalChargesAmount || 0)}</dd>
                  <dt>Total Charges Paid</dt><dd class="text-right">${fmt(s.summary.totalChargesAmountPaid || 0)}</dd>
                  <dt>Total Charges Waived</dt><dd class="text-right">${fmt(s.summary.totalChargesAmountWaived || 0)}</dd>
                </dl>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Lazy panels -->
        <div class="tab-panel" data-shpanel="requests"  hidden><div id="sh-req-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-shpanel="charges"   hidden><div id="sh-charges-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-shpanel="dividends" hidden><div id="sh-div-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-shpanel="notes"     hidden><div id="sh-notes-wrap"><div class="empty-state-row">Loading…</div></div></div>
        <div class="tab-panel" data-shpanel="documents" hidden><div id="sh-docs-wrap"><div class="empty-state-row">Loading…</div></div></div>
      </div>`;

    // -------- Tab switching with deep-link --------
    const tabs = c.querySelectorAll('[data-shtab]');
    const panels = c.querySelectorAll('[data-shpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      requests:  () => loadShareRequests(c, id, s),
      charges:   () => loadShareCharges(c, id),
      dividends: () => loadShareDividends(c, s.productId || s.shareProductId),
      notes:     () => loadShareNotes(c, id),
      documents: () => loadShareDocuments(c, id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.shtab === name));
      panels.forEach(p => p.hidden = p.dataset.shpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `shares?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.shtab)));
    switchTab(initialTab || 'overview');

    // -------- Back --------
    c.querySelector('#back-to-shares').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('shares'));
    });

    // -------- Toolbar (lifecycle) --------
    c.querySelector('#btn-sh-edit')?.addEventListener('click', () => openEditShareModal(s));
    c.querySelector('#btn-sh-approve')?.addEventListener('click', () => openShareSimpleCmd({
      id, command: 'approve', label: 'Approve Share Account', dateField: 'approvedDate'
    }));
    c.querySelector('#btn-sh-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', confirmText: 'Undo' })) return;
      try { await api.shares.undoApproval(id); toast('success', 'Approval undone', ''); location.reload(); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-sh-reject')?.addEventListener('click', () => openShareSimpleCmd({
      id, command: 'reject', label: 'Reject Share Account', dateField: 'rejectedDate'
    }));
    c.querySelector('#btn-sh-withdraw')?.addEventListener('click', () => openShareSimpleCmd({
      id, command: 'withdrawApplication', label: 'Withdraw Application', dateField: 'withdrawnDate'
    }));
    c.querySelector('#btn-sh-activate')?.addEventListener('click', () => openShareSimpleCmd({
      id, command: 'activate', label: 'Activate Share Account', dateField: 'activatedDate'
    }));

    // -------- Toolbar (share operations) --------
    c.querySelector('#btn-sh-apply')?.addEventListener('click', () => openApplyAdditionalSharesModal(id, shareValue));
    c.querySelector('#btn-sh-redeem')?.addEventListener('click', () => openRedeemSharesModal(id, totalApprovedShares, shareValue));

    // -------- Toolbar (close / delete) --------
    c.querySelector('#btn-sh-close')?.addEventListener('click', () => openCloseShareModal(id));
    c.querySelector('#btn-sh-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete share account #' + (s.accountNo || id) + '?',
        message: 'Only possible while in Submitted/Pending status.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.shares.delete(id);
        toast('success', 'Account deleted', '');
        import('../router.js').then(r => r.navigate('shares'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load share account</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// SHARE REQUESTS TAB
// ============================================================
async function loadShareRequests(c, id, s) {
  const wrap = c.querySelector('#sh-req-wrap');
  wrap.innerHTML = `
    <h3>Share Purchase Requests</h3>
    <div class="text-muted small mb-2">
      Each share purchase (initial + additional applications) goes through its own approve/reject workflow.
    </div>
    <div id="sh-req-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sh-req-list');
  try {
    const fresh = await api.shares.get(id, { associations: 'purchasedShares' });
    const list = fresh.purchasedShares || [];

    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Request #</th><th>Date</th>
          <th class="text-right">Shares</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(r => {
          const stat = r.status?.value || (r.purchasedDate ? 'Approved' : 'Pending');
          const isPending = stat === 'Submitted and pending approval' || stat === 'Pending' || !r.purchasedDate;
          return `
            <tr>
              <td>${r.id}</td>
              <td>${fmtDate(r.purchasedDate || r.requestedDate) || '—'}</td>
              <td class="text-right">${num(r.numberOfShares || 0)}</td>
              <td class="text-right">${fmt(r.unitPrice || s.shareValue || 0)}</td>
              <td class="text-right">${fmt((r.numberOfShares || 0) * (r.unitPrice || s.shareValue || 0))}</td>
              <td>${sb(stat)}</td>
              <td class="text-right">
                ${isPending && can('APPROVESHARE_SHAREACCOUNT')
                  ? `<button class="btn-mini btn-success" data-req-approve="${r.id}">Approve</button>` : ''}
                ${isPending && can('REJECTSHARE_SHAREACCOUNT')
                  ? `<button class="btn-mini btn-warning" data-req-reject="${r.id}">Reject</button>` : ''}
              </td>
            </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No share requests yet</div>';

    listEl.querySelectorAll('[data-req-approve]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Approve share purchase request?', confirmText: 'Approve' })) return;
      try {
        await api.shares.approveShareReq(id, {
          requestedShares: [{ id: parseInt(b.dataset.reqApprove) }]
        });
        toast('success', 'Request approved', '#' + b.dataset.reqApprove);
        loadShareRequests(c, id, s);
      } catch (e) { toast('error', 'Approve failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-req-reject]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reject share purchase request?', danger: true, confirmText: 'Reject' })) return;
      try {
        await api.shares.rejectShareReq(id, {
          requestedShares: [{ id: parseInt(b.dataset.reqReject) }]
        });
        toast('success', 'Request rejected', '#' + b.dataset.reqReject);
        loadShareRequests(c, id, s);
      } catch (e) { toast('error', 'Reject failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ============================================================
// CHARGES TAB
// ============================================================
async function loadShareCharges(c, id) {
  const wrap = c.querySelector('#sh-charges-wrap');
  wrap.innerHTML = `
    ${can('CREATE_SHAREACCOUNTCHARGE') ? `
      <div class="section-header mb-2">
        <h3>Account Charges</h3>
        <button class="btn-primary btn-sm" id="sh-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>
      </div>` : '<h3>Account Charges</h3>'}
    <div id="sh-charges-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#sh-add-charge')?.addEventListener('click', () =>
    openApplyShareChargeModal(id, () => loadShareCharges(c, id)));

  const listEl = wrap.querySelector('#sh-charges-list');
  try {
    const res = await api.shares.charges(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Charge</th><th>Timing</th><th>Due</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Paid</th>
          <th class="text-right">Outstanding</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(ch => `
          <tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td>${escapeHtml(ch.chargeTimeType?.value || '—')}</td>
            <td>${fmtDate(ch.dueDate)}</td>
            <td class="text-right">${fmt(ch.amount || 0)}</td>
            <td class="text-right">${fmt(ch.amountPaid || 0)}</td>
            <td class="text-right">${fmt(ch.amountOutstanding || 0)}</td>
            <td>${sb(ch.paid ? 'Paid' : ch.waived ? 'Waived' : !ch.active ? 'Inactive' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.paid && !ch.waived && ch.active && can('PAY_SHAREACCOUNTCHARGE')
                ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.paid && !ch.waived && ch.active && can('WAIVE_SHAREACCOUNTCHARGE')
                ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${!ch.paid && ch.active && can('INACTIVATE_SHAREACCOUNTCHARGE')
                ? `<button class="btn-mini" data-inactivate-charge="${ch.id}">Inactivate</button>` : ''}
              ${can('DELETE_SHAREACCOUNTCHARGE')
                ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges on this account</div>';

    listEl.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      openPayShareChargeModal(id, b.dataset.payCharge, () => loadShareCharges(c, id))));
    listEl.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await api.shares.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Waived', ''); loadShareCharges(c, id); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-inactivate-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Inactivate charge?', confirmText: 'Inactivate' })) return;
      try { await api.shares.inactivateCharge(id, b.dataset.inactivateCharge); toast('success', 'Inactivated', ''); loadShareCharges(c, id); }
      catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.shares.deleteCharge(id, b.dataset.delCharge); toast('success', 'Deleted', ''); loadShareCharges(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// DIVIDENDS TAB
// ============================================================
async function loadShareDividends(c, productId) {
  const wrap = c.querySelector('#sh-div-wrap');
  wrap.innerHTML = `
    <h3>Dividend Records</h3>
    <div class="text-muted small mb-2">
      Dividend declarations are managed at the share product level. Shown here are dividends for this account's product.
    </div>
    <div id="sh-div-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sh-div-list');
  if (!productId) {
    listEl.innerHTML = '<div class="empty-state-row text-muted">Product ID not available</div>';
    return;
  }
  try {
    const res = await api.shares.dividends(productId);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Dividend Date</th>
          <th class="text-right">Amount</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${d.id}</td>
            <td>${fmtDate(d.dividendPeriodStartDate || d.dividendDate) || '—'}</td>
            <td class="text-right">${fmt(d.amount || d.dividendAmount || 0)}</td>
            <td>${sb(d.status?.value || (d.approved ? 'Approved' : 'Pending'))}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No dividends declared yet</div>';
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state-row text-muted">Could not load dividends (${escapeHtml(e.message)})</div>`;
  }
}

// ============================================================
// NOTES TAB
// ============================================================
async function loadShareNotes(c, id) {
  const wrap = c.querySelector('#sh-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="sh-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_NOTE') ? `
      <div class="mt-3">
        <textarea id="sh-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="sh-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>` : ''}`;

  wrap.querySelector('#sh-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#sh-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try { await api.notes.create('share', id, { note }); inp.value = ''; loadShareNotes(c, id); toast('success', 'Note added', ''); }
    catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#sh-note-list');
  try {
    const notes = await api.notes.list('share', id);
    const list = Array.isArray(notes) ? notes : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Note</th><th>By</th><th>Date</th></tr></thead>
        <tbody>${list.map(n => `
          <tr>
            <td>${escapeHtml(n.note || '—')}</td>
            <td>${escapeHtml(n.createdByUsername || '—')}</td>
            <td>${fmtDate(n.createdOn) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No notes yet</div>';
  } catch { listEl.innerHTML = '<div class="text-error">Could not load notes</div>'; }
}

// ============================================================
// DOCUMENTS TAB
// ============================================================
async function loadShareDocuments(c, id) {
  const wrap = c.querySelector('#sh-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="sh-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="sh-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#sh-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', ''); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload('shareaccounts', id, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadShareDocuments(c, id);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#sh-doc-list');
  try {
    const docs = await api.documents.list('shareaccounts', id);
    const list = Array.isArray(docs) ? docs : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Description</th><th>Type</th><th></th></tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${escapeHtml(d.name || '—')}</td>
            <td>${escapeHtml(d.description || '—')}</td>
            <td>${escapeHtml(d.type || d.fileName?.split('.').pop() || '—')}</td>
            <td class="text-right">
              <button class="btn-mini" data-doc-dl="${d.id}">Download</button>
              ${can('DELETE_DOCUMENT') ? `<button class="btn-mini btn-danger" data-doc-del="${d.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No documents yet</div>';

    listEl.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.documents.download('shareaccounts', id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `share-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try { await api.documents.delete('shareaccounts', id, b.dataset.docDel); toast('success', 'Deleted', ''); loadShareDocuments(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// EDIT SHARE ACCOUNT MODAL
// ============================================================
function openEditShareModal(s) {
  const mid = 'sh-edit-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Share Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Requested shares
              <input type="number" id="ed-shares" class="form-control" value="${s.totalApprovedShares || ''}"/>
            </label>
            <label>External ID
              <input id="ed-extid" class="form-control" value="${escapeHtml(s.externalId || '')}"/>
            </label>
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Editing only available before approval.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ed-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ed-save').addEventListener('click', async () => {
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
    const shares = parseInt(el.querySelector('#ed-shares').value);
    if (isFinite(shares)) payload.requestedShares = shares;
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext) payload.externalId = ext;
    try {
      await api.shares.update(s.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      location.reload();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPLY ADDITIONAL SHARES MODAL
// ============================================================
function openApplyAdditionalSharesModal(id, unitPrice) {
  const mid = 'sh-apply-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Additional Shares</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Number of shares * <input type="number" id="aa-shares" class="form-control" required min="1"/></label>
          <label class="mt-2">Application date * <input type="date" id="aa-date" class="form-control" value="${today()}" required/></label>
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            Estimated cost: <b id="aa-cost">${fmt(0)}</b> at ${fmt(unitPrice)} per share.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="aa-save">Submit Application</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#aa-shares').addEventListener('input', (e) => {
    const n = parseInt(e.target.value) || 0;
    el.querySelector('#aa-cost').textContent = fmt(n * unitPrice);
  });
  el.querySelector('#aa-save').addEventListener('click', async () => {
    const shares = parseInt(el.querySelector('#aa-shares').value);
    const date = el.querySelector('#aa-date').value;
    if (!shares || shares < 1) { toast('warn', 'Enter shares', ''); return; }
    try {
      await api.shares.applyAdditional(id, {
        requestedShares: shares,
        requestedDate: date,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Application submitted', shares + ' additional shares');
      location.reload();
    } catch (e) { toast('error', 'Application failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// REDEEM SHARES MODAL
// ============================================================
function openRedeemSharesModal(id, maxShares, unitPrice) {
  const mid = 'sh-redeem-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Redeem Shares</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">You currently hold <b>${num(maxShares)}</b> approved shares at ${fmt(unitPrice)} per share.</p>
          <label>Shares to redeem * <input type="number" id="rd-shares" class="form-control" required min="1" max="${maxShares}"/></label>
          <label class="mt-2">Redemption date * <input type="date" id="rd-date" class="form-control" value="${today()}" required/></label>
          <div class="msg-banner b-warning mt-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Estimated payout: <b id="rd-payout">${fmt(0)}</b>. Penalties may apply per product rules.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="rd-save">Redeem</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#rd-shares').addEventListener('input', (e) => {
    const n = parseInt(e.target.value) || 0;
    el.querySelector('#rd-payout').textContent = fmt(n * unitPrice);
  });
  el.querySelector('#rd-save').addEventListener('click', async () => {
    const shares = parseInt(el.querySelector('#rd-shares').value);
    const date = el.querySelector('#rd-date').value;
    if (!shares || shares < 1) { toast('warn', 'Enter shares', ''); return; }
    if (shares > maxShares) { toast('warn', 'Too many', 'Cannot redeem more than you hold'); return; }
    try {
      await api.shares.redeem(id, {
        requestedShares: shares,
        requestedDate: date,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Redemption submitted', shares + ' shares');
      location.reload();
    } catch (e) { toast('error', 'Redemption failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// CLOSE SHARE ACCOUNT MODAL
// ============================================================
function openCloseShareModal(id) {
  const mid = 'sh-close-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Share Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            All remaining shares will be redeemed at the current unit price.
          </div>
          <label>Closed on * <input type="date" id="cl-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="cl-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="cl-save">Close Account</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cl-save').addEventListener('click', async () => {
    const closedDate = el.querySelector('#cl-date').value;
    const note = el.querySelector('#cl-note').value.trim();
    const payload = {
      closedDate,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (note) payload.note = note;
    try {
      await api.shares.close(id, payload);
      el.remove();
      toast('success', 'Account closed', '');
      import('../router.js').then(r => r.navigate('shares'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// APPLY CHARGE MODAL
// ============================================================
async function openApplyShareChargeModal(id, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 7 });
    charges = Array.isArray(r) ? r : [];
    if (!charges.length) {
      const r2 = await api.charges.list({});
      charges = Array.isArray(r2) ? r2 : [];
    }
  } catch {}

  const mid = 'sh-applycharge-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Charge *
            <select id="ac-charge" class="form-control" required>
              <option value="">Select charge…</option>
              ${charges.map(ch => `<option value="${ch.id}" data-amount="${ch.amount}">${escapeHtml(ch.name)} (${fmt(ch.amount)})</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="ac-amount" class="form-control" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ac-save">Apply</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ac-charge').addEventListener('change', (e) => {
    el.querySelector('#ac-amount').value = e.target.selectedOptions[0]?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields', ''); return; }
    try {
      await api.shares.addCharge(id, {
        chargeId: parseInt(chargeId), amount,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// PAY CHARGE MODAL
// ============================================================
async function openPayShareChargeModal(id, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = 'sh-paycharge-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pc-save">Pay</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#pc-amount').value);
    const transactionDate = el.querySelector('#pc-date').value;
    const paymentTypeId = el.querySelector('#pc-pt').value;
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    const payload = {
      amount, transactionDate,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (paymentTypeId) payload.paymentTypeId = parseInt(paymentTypeId);
    try {
      await api.shares.payCharge(id, chargeId, payload);
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// GENERIC SIMPLE COMMAND MODAL (defensive — no computed keys)
// ============================================================
function openShareSimpleCmd({ id, command, label, dateField }) {
  const mid = 'sh-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="shc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="shc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="shc-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#shc-save').addEventListener('click', async () => {
    const date = el.querySelector('#shc-date').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }
    // Build payload without computed key syntax (defensive)
    const payload = {};
    payload[dateField] = date;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;
    const note = el.querySelector('#shc-note').value.trim();
    if (note) payload.note = note;
    try {
      const methodMap = {
        approve: 'approve',
        activate: 'activate',
        reject: 'reject',
        withdrawApplication: 'withdrawApplication',
        close: 'close'
      };
      const m = methodMap[command];
      if (m && typeof api.shares[m] === 'function') {
      await api.shares[m](id, payload);
      } else {
      await api.shares.command(id, command, payload);
      }
      el.remove();
      toast('success', label + ' successful', '#' + id);
      location.reload();
    } catch (e) { toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message); }
  });
}

/* FinCraft · shares.js — Full share account lifecycle (permission-gated, tabbed) */
