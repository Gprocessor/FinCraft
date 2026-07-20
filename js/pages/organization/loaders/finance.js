/* FinCraft · pages/organization/loaders/finance.js — currencies, payment types, and funds tab loaders.
   Auto-split (2nd pass) from pages/organization/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openCurrencyEditModal, openFundModal, openPaymentTypeModal } from '../actions.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadCurrencies(c) {
  const el = c.querySelector('#og-5');
  try {
    const cur = await api.currencies.list();
    const list = Array.isArray(cur?.selectedCurrencyOptions) ? cur.selectedCurrencyOptions : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} currency${list.length !== 1 ? 'ies' : ''} configured</span>
        ${can('UPDATE_CURRENCY') ? `<button class="btn-primary" id="btn-edit-currencies"><i class="fa-solid fa-pen"></i> Edit Currencies</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Code</th><th>Name</th><th>Decimal Places</th></tr></thead>
          <tbody>${list.map(cu => `
            <tr>
              <td><b>${escapeHtml(cu.code)}</b></td>
              <td>${escapeHtml(cu.name)}</td>
              <td>${cu.decimalPlaces}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No currencies configured</div>'}`;

    el.querySelector('#btn-edit-currencies')?.addEventListener('click', () =>
      openCurrencyEditModal(() => loadCurrencies(c)));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadPaymentTypes(c) {
  const el = c.querySelector('#og-6');
  try {
    const pt = await api.paymentTypes.list();
    const list = Array.isArray(pt) ? pt : [];
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} payment type${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_PAYMENTTYPE') ? `<button class="btn-primary" id="btn-new-pt"><i class="fa-solid fa-plus"></i> Add Payment Type</button>` : ''}
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Description</th><th>Code</th><th>Is Cash</th><th>Position</th><th></th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td>${escapeHtml(p.name || '—')}</td>
            <td>${escapeHtml(p.description || '—')}</td>
            <td>${escapeHtml(p.codeName || '—')}</td>
            <td>${p.isCashPayment ? 'Yes' : 'No'}</td>
            <td>${p.position ?? '—'}</td>
            <td class="text-right">
              ${can('UPDATE_PAYMENTTYPE') ? `<button class="btn-mini" data-edit-pt="${p.id}" data-pt-name="${escapeHtml(p.name || '')}" data-pt-desc="${escapeHtml(p.description || '')}" data-pt-pos="${p.position || 0}" data-pt-cash="${p.isCashPayment ? 1 : 0}">Edit</button>` : ''}
              ${can('DELETE_PAYMENTTYPE') ? `<button class="btn-mini btn-danger" data-del-pt="${p.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-state-row">No payment types</td></tr>'}
        </tbody>
      </table>`;

    el.querySelector('#btn-new-pt')?.addEventListener('click', () => openPaymentTypeModal(null, () => loadPaymentTypes(c)));
    el.querySelectorAll('[data-edit-pt]').forEach(b => b.addEventListener('click', () =>
      openPaymentTypeModal({
        id: b.dataset.editPt,
        name: b.dataset.ptName,
        description: b.dataset.ptDesc,
        position: parseInt(b.dataset.ptPos) || 0,
        isCashPayment: b.dataset.ptCash === '1'
      }, () => loadPaymentTypes(c))));
    el.querySelectorAll('[data-del-pt]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete payment type?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.paymentTypes.delete(b.dataset.delPt);
        toast('success', 'Deleted', '');
        loadPaymentTypes(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadFunds(c) {
  const el = c.querySelector('#og-8');
  try {
    const res = await api.funds.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Funds</h3>
          <span class="text-muted">${list.length} fund${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_FUND') ? `<button class="btn-primary" id="btn-new-fund"><i class="fa-solid fa-plus"></i> New Fund</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Funds let you tag loans with the source of capital (donor, line of credit, etc.) for reporting and compliance.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Name</th><th>External ID</th><th></th></tr></thead>
          <tbody>${list.map(f => `
            <tr>
              <td>${escapeHtml(f.name || '—')}</td>
              <td>${escapeHtml(f.externalId || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_FUND') ? `<button class="btn-mini" data-edit-fund="${f.id}" data-fund-name="${escapeHtml(f.name || '')}" data-fund-ext="${escapeHtml(f.externalId || '')}">Edit</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No funds defined</div>'}`;

    el.querySelector('#btn-new-fund')?.addEventListener('click', () => openFundModal(null, () => loadFunds(c)));
    el.querySelectorAll('[data-edit-fund]').forEach(b => b.addEventListener('click', () =>
      openFundModal({
        id: b.dataset.editFund,
        name: b.dataset.fundName,
        externalId: b.dataset.fundExt
      }, () => loadFunds(c))));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
