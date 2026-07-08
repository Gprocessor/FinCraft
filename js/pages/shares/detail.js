/* FinCraft · pages/shares/detail.js — renderDetail and its tab loaders (requests, charges, dividends, notes, documents).
   Auto-split from the original monolithic pages/shares.js for maintainability. */

import { api } from '../../api.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, fmtDate, num, sb } from '../../utils.js';
import { openApplyAdditionalSharesModal, openCloseShareModal, openEditShareModal, openRedeemSharesModal, openShareSimpleCmd } from './actions.js';
import { can } from './shared.js';
import { enhanceScrollableTabs } from '../../ui/scrollable-tabs.js';

export async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading share account…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No account selected</div>'; return; }

  try {
    const s = await api.shares.get(id, { associations: 'all' });
    const status = s.status?.value || '';

    const isPending = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive = status === 'Active';

    const canApprove        = isPending  && can('APPROVE_SHAREACCOUNT');
    const canUndoApproval   = isApproved && can('UNDOAPPROVAL_SHAREACCOUNT');
    const canReject         = isPending  && can('REJECT_SHAREACCOUNT');
    // FLAGGED, NOT VERIFIED: no WITHDRAW_SHAREACCOUNT permission exists anywhere in the 961-code Fineract set.
    // ShareAccountsApiResource wasn't captured by the source-derived API map either, so the real gate can't be
    // confirmed statically. Falling back to CREATE_SHAREACCOUNT (matches the single-generic-permission command
    // dispatch pattern used by ClientsApiResource/GroupsApiResource) as a best-effort placeholder — confirm
    // against a live server before relying on this for access control.
    const canWithdrawApp    = isPending  && can('CREATE_SHAREACCOUNT');
    const canActivate       = isApproved && can('ACTIVATE_SHAREACCOUNT');
    const canApplyAdditional= isActive   && can('APPLYADDITIONALSHARES_SHAREACCOUNT');
    const canRedeem         = isActive   && can('REDEEMSHARES_SHAREACCOUNT');
    const canClose          = isActive   && can('CLOSE_SHAREACCOUNT');
    const canEdit           = isPending  && can('UPDATE_SHAREACCOUNT');
    // FLAGGED, NOT VERIFIED: same situation as canWithdrawApp above — no DELETE_SHAREACCOUNT code exists.
    const canDelete         = isPending  && can('CREATE_SHAREACCOUNT');

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
          <button class="tab" data-shtab="notes">Notes</button>
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
    enhanceScrollableTabs(c.querySelector('#sh-tabs'));
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
      import('../../router.js').then(r => r.navigate('shares'));
    });

    // -------- Toolbar (lifecycle) --------
    c.querySelector('#btn-sh-edit')?.addEventListener('click', () => openEditShareModal(s));
    c.querySelector('#btn-sh-approve')?.addEventListener('click', () => openShareSimpleCmd({
      id, command: 'approve', label: 'Approve Share Account', dateField: 'approvedDate'
    }));
    c.querySelector('#btn-sh-undo-approval')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo approval?', confirmText: 'Undo' })) return;
      try { await api.shares.undoApproval(id); toast('success', 'Approval undone', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
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
        import('../../router.js').then(r => r.navigate('shares'));
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
                ${isPending && can('APPROVEADDITIONALSHARES_SHAREACCOUNT')
                  ? `<button class="btn-mini btn-success" data-req-approve="${r.id}">Approve</button>` : ''}
                ${isPending && can('REJECTADDITIONALSHARES_SHAREACCOUNT')
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

async function loadShareCharges(c, id) {
  const wrap = c.querySelector('#sh-charges-wrap');
  // NOTE: Fineract has no /accounts/share/{id}/charges sub-resource — share
  // account charges are only ever set via the account create/update JSON
  // body (as `charges: [...]`), never through a nested REST path. The
  // previous version of this tab called a fabricated endpoint that always
  // returned 404. Until this is rebuilt against create/update payloads,
  // show an explicit notice rather than a silently-broken UI.
  wrap.innerHTML = `
    <h3>Account Charges</h3>
    <div class="msg-banner b-warning">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Share account charges aren't exposed as a separate API in this Fineract version —
      they can only be set when the account is created or updated. This tab has been
      disabled to avoid failed requests; use the account's Edit form to manage charges instead.
    </div>`;
}

async function loadShareDividends(c, productId) {
  const wrap = c.querySelector('#sh-div-wrap');
  wrap.innerHTML = `
    <div class="section-header">
      <h3>Dividend Records</h3>
      ${can('CREATE_DIVIDEND_SHAREPRODUCT') ? `<button class="btn-primary btn-sm" id="sh-div-declare"><i class="fa-solid fa-plus"></i> Declare Dividend</button>` : ''}
    </div>
    <div class="text-muted small mb-2">
      Dividends are declared at the share product level; shown here for this account's product.
    </div>
    <div id="sh-div-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sh-div-list');
  if (!productId) {
    listEl.innerHTML = '<div class="empty-state-row text-muted">Product ID not available</div>';
    return;
  }

  async function reload() { loadShareDividends(c, productId); }

  wrap.querySelector('#sh-div-declare')?.addEventListener('click', () =>
    openDeclareDividendModal(productId, null, reload));

  try {
    const res = await api.shares.dividends(productId);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Dividend Date</th>
          <th class="text-right">Amount</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(d => {
          const approved = d.approved || d.status?.value === 'Approved';
          return `
          <tr>
            <td>${d.id}</td>
            <td>${fmtDate(d.dividendPeriodStartDate || d.dividendDate) || '—'}</td>
            <td class="text-right">${fmt(d.amount || d.dividendAmount || 0)}</td>
            <td>${sb(d.status?.value || (approved ? 'Approved' : 'Pending'))}</td>
            <td class="text-right">
              ${!approved && can('UPDATE_SHAREPRODUCT') ? `<button class="btn-mini" data-edit-div="${d.id}">Edit</button>` : ''}
              ${!approved && can('APPROVE_DIVIDEND_SHAREPRODUCT') ? `<button class="btn-mini btn-success" data-approve-div="${d.id}">Approve</button>` : ''}
              ${!approved && can('DELETE_DIVIDEND_SHAREPRODUCT') ? `<button class="btn-mini btn-danger" data-del-div="${d.id}">Delete</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No dividends declared yet</div>';

    listEl.querySelectorAll('[data-edit-div]').forEach(b => b.addEventListener('click', async () => {
      let record = null;
      try { record = await api.shares.getDividend(productId, b.dataset.editDiv); }
      catch (e) { toast('error', 'Failed to load dividend', e.detail?.defaultUserMessage || e.message); return; }
      openDeclareDividendModal(productId, record, reload);
    }));
    listEl.querySelectorAll('[data-approve-div]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Approve this dividend?', confirmText: 'Approve' })) return;
      try { await api.shares.approveDividend(productId, b.dataset.approveDiv); toast('success', 'Dividend approved', ''); reload(); }
      catch (e) { toast('error', 'Approve failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-del-div]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete this dividend?', danger: true, confirmText: 'Delete' })) return;
      try { await api.shares.deleteDividend(productId, b.dataset.delDiv); toast('success', 'Dividend deleted', ''); reload(); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state-row text-muted">Could not load dividends (${escapeHtml(e.message)})</div>`;
  }
}

async function openDeclareDividendModal(productId, existing, onSuccess) {
  const mid = 'sh-div-modal-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${existing ? 'Edit' : 'Declare'} Dividend</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Dividend period start date * <input type="date" id="div-start" class="form-control" value="${existing?.dividendPeriodStartDate || ''}" required/></label>
          <label class="mt-2">Dividend period end date * <input type="date" id="div-end" class="form-control" value="${existing?.dividendPeriodEndDate || ''}" required/></label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="div-amount" class="form-control" value="${existing?.amount ?? existing?.dividendAmount ?? ''}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="div-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#div-save').addEventListener('click', async () => {
    const dividendPeriodStartDate = el.querySelector('#div-start').value;
    const dividendPeriodEndDate = el.querySelector('#div-end').value;
    const amount = parseFloat(el.querySelector('#div-amount').value);
    if (!dividendPeriodStartDate || !dividendPeriodEndDate || !isFinite(amount)) {
      toast('warn', 'Fill in all fields with a valid amount', ''); return;
    }
    const payload = { dividendPeriodStartDate, dividendPeriodEndDate, amount };
    try {
      if (existing) await api.shares.updateDividend(productId, existing.id, payload);
      else          await api.shares.postDividend(productId, payload);
      el.remove(); toast('success', existing ? 'Dividend updated' : 'Dividend declared', ''); onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function loadShareNotes(c, id) {
  const wrap = c.querySelector('#sh-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="sh-note-list"><div class="empty-state-row">Loading…</div></div>
      <div class="mt-3">
        <textarea id="sh-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="sh-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>`;

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
