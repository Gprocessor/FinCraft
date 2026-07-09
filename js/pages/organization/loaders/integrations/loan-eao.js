/* FinCraft · pages/organization/loaders/integrations/loan-eao.js — loan originators and external asset owners tab loaders.
   Auto-split from the original monolithic pages/organization/loaders/integrations.js for maintainability. */

import { api } from '../../../../api.js';
import { confirm as modalConfirm, toast } from '../../../../ui.js';
import { escapeHtml, num, sb } from '../../../../utils.js';
import { openExternalAssetOwnerModal, openLoanOriginatorModal } from '../../actions.js';
import { can } from '../../shared.js';

export async function loadLoanOriginators(c) {
  const el = c.querySelector('#og-10');
  try {
    const res = await api.loanOriginators.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Loan Originators</h3>
          <span class="text-muted">${list.length} originator${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_LOAN_ORIGINATOR') ? `<button class="btn-primary" id="btn-new-orig"><i class="fa-solid fa-plus"></i> New Originator</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Originators identify the entity (broker, partner, or external lender) that underwrote each loan — used for securitization and reporting.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>External ID</th><th>Type</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(o => `
            <tr>
              <td><b>${escapeHtml(o.name || o.displayName || '—')}</b></td>
              <td>${escapeHtml(o.externalId || '—')}</td>
              <td>${escapeHtml(o.type?.value || o.originatorType || '—')}</td>
              <td>${o.active !== false ? sb('Active') : sb('Inactive')}</td>
              <td class="text-right">
                ${can('UPDATE_LOAN_ORIGINATOR') ? `<button class="btn-mini" data-edit-orig="${o.id}">Edit</button>` : ''}
                ${can('DELETE_LOAN_ORIGINATOR') ? `<button class="btn-mini btn-danger" data-del-orig="${o.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-handshake"></i>
          <h3>No loan originators defined</h3>
          ${can('CREATE_LOAN_ORIGINATOR') ? `<div class="text-muted mt-2">Create your first originator using the button above.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-orig')?.addEventListener('click', () =>
      openLoanOriginatorModal(null, () => loadLoanOriginators(c)));

    el.querySelectorAll('[data-edit-orig]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.loanOriginators.get(b.dataset.editOrig);
        openLoanOriginatorModal(existing, () => loadLoanOriginators(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-orig]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete loan originator?',
        message: 'This will fail if any loans are linked to this originator.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.loanOriginators.delete(b.dataset.delOrig);
        toast('success', 'Originator deleted', '');
        loadLoanOriginators(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Loan originators not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadExternalAssetOwners(c) {
  const el = c.querySelector('#og-11');
  try {
    const res = await api.externalAssetOwners.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>External Asset Owners (Investors)</h3>
          <span class="text-muted">${list.length} owner${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_EXTERNAL_ASSET_OWNER') ? `<button class="btn-primary" id="btn-new-eao"><i class="fa-solid fa-plus"></i> New Owner</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        External Asset Owners are investors who can purchase securitized loan portfolios. Per-loan transfers and buy-backs are managed from each loan's detail page.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>External ID</th><th>Type</th><th>Active Transfers</th><th></th>
          </tr></thead>
          <tbody>${list.map(o => `
            <tr>
              <td><b>${escapeHtml(o.name || o.displayName || '—')}</b></td>
              <td>${escapeHtml(o.externalId || '—')}</td>
              <td>${escapeHtml(o.type?.value || o.ownerType || '—')}</td>
              <td>${num(o.activeTransfers || 0)}</td>
              <td class="text-right">
                <!-- No Edit/Delete: ExternalAssetOwnersApiResource has no GET-by-id, PUT, or DELETE at all —
                     confirmed via the source-derived API map (only bare list/create/search and the transfer
                     sub-paths exist). These always 404'd; removed rather than left as a dead end. -->
              </td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="text-muted small mt-2">
          <i class="fa-solid fa-circle-info"></i>
          To view loan transfers per owner, open the <b>External Asset Owners</b> tab on any individual loan.
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-building-columns"></i>
          <h3>No external asset owners defined</h3>
          ${can('CREATE_EXTERNAL_ASSET_OWNER') ? `<div class="text-muted mt-2">Create your first owner to enable loan securitization.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-eao')?.addEventListener('click', () =>
      openExternalAssetOwnerModal(null, () => loadExternalAssetOwners(c)));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">External Asset Owners not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
