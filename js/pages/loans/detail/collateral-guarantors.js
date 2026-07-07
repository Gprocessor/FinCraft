/* FinCraft · pages/loans/detail/collateral-guarantors.js — collateral, guarantors, originators, and external asset owner tab loaders.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openAddGuarantorModal, openAddLoanCollateralModal, openAttachOriginatorModal, openEAOTransferModal, openEditGuarantorModal, openEditLoanCollateralModal } from '../actions.js';

export async function loadLoanCollateral(c, loanId) {
  const wrap = c.querySelector('#ln-coll-wrap');
  wrap.innerHTML = `
    ${can('CREATE_COLLATERAL') ? `
      <div class="section-header mb-2">
        <h3>Loan Collateral</h3>
        <button class="btn-primary btn-sm" id="ln-add-collateral"><i class="fa-solid fa-plus"></i> Add Collateral</button>
      </div>` : '<h3>Loan Collateral</h3>'}
    <div id="ln-coll-list"><div class="empty-state-row">Loading…</div></div>`;

  // Need clientId to load the client's collateral pool — pull from cached loan
  let clientId = null;
  try {
    const l = await api.loans.get(loanId, 'all');
    clientId = l.clientId;
  } catch {}

  wrap.querySelector('#ln-add-collateral')?.addEventListener('click', () =>
    openAddLoanCollateralModal(loanId, clientId, () => loadLoanCollateral(c, loanId)));

  const listEl = wrap.querySelector('#ln-coll-list');
  try {
    const res = await api.loans.listCollaterals(loanId);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Type</th><th>Description</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Value</th>
          <th class="text-right">Pledged Value</th>
          <th></th>
        </tr></thead>
        <tbody>${list.map(col => `
          <tr>
            <td>${escapeHtml(col.collateralType?.name || col.type || col.collateralName || '—')}</td>
            <td>${escapeHtml(col.description || '—')}</td>
            <td class="text-right">${fmt(col.quantity || 0)}</td>
            <td class="text-right">${fmt(col.value || col.basePrice || 0)}</td>
            <td class="text-right">${fmt(col.pctToBase ? (col.value * col.pctToBase / 100) : 0)}</td>
            <td class="text-right">
              ${can('UPDATE_COLLATERAL') ? `<button class="btn-mini" data-edit-col="${col.id}">Edit</button>` : ''}
              ${can('DELETE_COLLATERAL') ? `<button class="btn-mini btn-danger" data-del-col="${col.id}">Remove</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="text-muted mt-2 small">
        <i class="fa-solid fa-circle-info"></i> Collateral is drawn from the client's pre-registered collateral pool.
      </div>` : '<div class="empty-state-row">No collateral pledged for this loan</div>';

    listEl.querySelectorAll('[data-edit-col]').forEach(b => b.addEventListener('click', () =>
      openEditLoanCollateralModal(loanId, b.dataset.editCol, () => loadLoanCollateral(c, loanId))));
    listEl.querySelectorAll('[data-del-col]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove collateral?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.loans.deleteCollateral(loanId, b.dataset.delCol);
        toast('success', 'Collateral removed', '');
        loadLoanCollateral(c, loanId);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadLoanGuarantors(c, loanId) {
  const wrap = c.querySelector('#ln-guar-wrap');
  wrap.innerHTML = `
    ${can('CREATE_GUARANTOR') ? `
      <div class="section-header mb-2">
        <h3>Guarantors</h3>
        <button class="btn-primary btn-sm" id="ln-add-guarantor"><i class="fa-solid fa-user-plus"></i> Add Guarantor</button>
      </div>` : '<h3>Guarantors</h3>'}
    <div id="ln-guar-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-guarantor')?.addEventListener('click', () =>
    openAddGuarantorModal(loanId, () => loadLoanGuarantors(c, loanId)));

  const listEl = wrap.querySelector('#ln-guar-list');
  try {
    const res = await api.loans.guarantors(loanId);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Type</th>
          <th class="text-right">Amount</th>
          <th>Mobile</th><th></th>
        </tr></thead>
        <tbody>${list.map(g => {
          const name = g.clientName || g.entityDisplayName ||
            [g.firstname, g.lastname].filter(Boolean).join(' ') || '—';
          return `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(g.guarantorType?.value || '—')}</td>
              <td class="text-right">${fmt(g.amount || 0)}</td>
              <td>${escapeHtml(g.mobileNumber || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_GUARANTOR') ? `<button class="btn-mini" data-edit-guar="${g.id}">Edit</button>` : ''}
                ${can('DELETE_GUARANTOR') ? `<button class="btn-mini btn-danger" data-del-guar="${g.id}">Remove</button>` : ''}
              </td>
            </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No guarantors on file</div>';

    listEl.querySelectorAll('[data-edit-guar]').forEach(b => b.addEventListener('click', () =>
      openEditGuarantorModal(loanId, b.dataset.editGuar, () => loadLoanGuarantors(c, loanId))));
    listEl.querySelectorAll('[data-del-guar]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove guarantor?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.loans.deleteGuarantor(loanId, b.dataset.delGuar);
        toast('success', 'Guarantor removed', '');
        loadLoanGuarantors(c, loanId);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadLoanOriginators(c, loanId) {
  const wrap = c.querySelector('#ln-orig-wrap');
  wrap.innerHTML = `
    ${can('CREATE_LOANORIGINATOR') ? `
      <div class="section-header mb-2">
        <h3>Loan Originators</h3>
        <button class="btn-primary btn-sm" id="ln-attach-orig"><i class="fa-solid fa-plus"></i> Attach Originator</button>
      </div>` : '<h3>Loan Originators</h3>'}
    <div class="text-muted small mb-2">
      Originators identify the entity that originally underwrote the loan — used for assignment, securitization, and reporting.
    </div>
    <div id="ln-orig-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-attach-orig')?.addEventListener('click', () =>
    openAttachOriginatorModal(loanId, () => loadLoanOriginators(c, loanId)));

  const listEl = wrap.querySelector('#ln-orig-list');
  try {
    const r = await api.loans.originators(loanId);
    const list = Array.isArray(r) ? r : (r?.originators || r?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Type</th>
          <th>External ID</th><th>Attached On</th><th></th>
        </tr></thead>
        <tbody>${list.map(o => `
          <tr>
            <td>${escapeHtml(o.name || o.originatorName || '—')}</td>
            <td>${escapeHtml(o.type?.value || o.originatorType || '—')}</td>
            <td>${escapeHtml(o.externalId || '—')}</td>
            <td>${fmtDate(o.attachedOn || o.createdOn) || '—'}</td>
            <td class="text-right">
              ${can('DELETE_LOANORIGINATOR') ? `<button class="btn-mini btn-danger" data-detach-orig="${o.originatorId || o.id}">Detach</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No originators attached to this loan</div>';

    listEl.querySelectorAll('[data-detach-orig]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Detach originator?', danger: true, confirmText: 'Detach' })) return;
      try {
        await api.loans.detachOriginator(loanId, b.dataset.detachOrig);
        toast('success', 'Originator detached', '');
        loadLoanOriginators(c, loanId);
      } catch (e) { toast('error', 'Detach failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch {
    listEl.innerHTML = '<div class="empty-state-row text-muted">Originators feature not available on this tenant</div>';
  }
}

export async function loadLoanEAO(c, loanId) {
  const wrap = c.querySelector('#ln-eao-wrap');
  wrap.innerHTML = `
    <div class="section-header mb-2">
      <h3>External Asset Owner Transfers</h3>
      <div>
        ${can('CREATE_EXTERNAL_ASSET_OWNER_TRANSFER') ? `<button class="btn-primary btn-sm" id="ln-eao-transfer"><i class="fa-solid fa-arrow-right-from-bracket"></i> Transfer to Owner</button>` : ''}
        ${can('CREATE_EXTERNAL_ASSET_OWNER_TRANSFER') ? `<button class="btn-secondary btn-sm" id="ln-eao-buyback"><i class="fa-solid fa-arrow-right-to-bracket"></i> Buy-back</button>` : ''}
      </div>
    </div>
    <div class="text-muted small mb-2">
      Securitization records — track loans that have been sold to external asset owners and later bought back.
    </div>
    <div id="ln-eao-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-eao-transfer')?.addEventListener('click', () =>
    openEAOTransferModal(loanId, 'transfer', () => loadLoanEAO(c, loanId)));
  wrap.querySelector('#ln-eao-buyback')?.addEventListener('click', () =>
    openEAOTransferModal(loanId, 'buyback', () => loadLoanEAO(c, loanId)));

  const listEl = wrap.querySelector('#ln-eao-list');
  try {
    const r = await api.loans.eaoList(loanId);
    const list = Array.isArray(r) ? r : (r?.transfers || r?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Transfer ID</th><th>Owner</th>
          <th>Effective Date</th><th>Status</th>
          <th class="text-right">Transfer Amount</th>
          <th>Type</th>
        </tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td>${escapeHtml(t.transferExternalId || t.id || '—')}</td>
            <td>${escapeHtml(t.owner?.name || t.externalAssetOwner?.name || '—')}</td>
            <td>${fmtDate(t.effectiveFrom || t.transferDate) || '—'}</td>
            <td>${sb(t.status?.value || t.status || '—')}</td>
            <td class="text-right">${fmt(t.purchasePriceRatio ? (t.totalPrincipalOutstanding * t.purchasePriceRatio) : t.amount || 0)}</td>
            <td>${escapeHtml(t.transferType || (t.buyBackDate ? 'Buy-back' : 'Transfer'))}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No external asset owner transfers</div>';
  } catch {
    listEl.innerHTML = '<div class="empty-state-row text-muted">External Asset Owners feature not enabled on this tenant</div>';
  }
}
