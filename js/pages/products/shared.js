/* FinCraft · pages/products/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/products.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml } from '../../utils.js';
import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export let _glCache = null;

export async function glOptions() {
  if (!_glCache) {
    try {
      const res = await api.glAccounts.list({ manualEntriesAllowed: true });
      _glCache = Array.isArray(res) ? res : [];
    } catch { _glCache = []; }
  }
  return _glCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
}

export function glSelect(id, label, required = false) {
  return `
    <label>${label}${required ? ' *' : ''}
      <select id="${id}" class="form-control" ${required ? 'required' : ''}>
        <option value="">— Select GL account —</option>
      </select>
    </label>`;
}

export async function populateGl(el) {
  const opts = await glOptions();
  el.querySelectorAll('select[id^="gl-"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Select GL account —</option>' + opts;
    if (cur) sel.value = cur;
  });
}

export function modal(mid, title, bodyHtml, wide = false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal ${wide ? 'modal-lg' : 'modal-md'}">
        <div class="modal-header"><h3>${title}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);
  const elv = document.getElementById(mid);
  elv.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => elv.remove()));
  return elv;
}

export const v  = (el, id) => el.querySelector('#' + id)?.value?.trim() || '';

export const vi = (el, id) => { const n = parseInt(v(el, id)); return isNaN(n) ? null : n; };

export const vf = (el, id) => { const n = parseFloat(v(el, id)); return isNaN(n) ? null : n; };

export const vb = (el, id) => el.querySelector('#' + id)?.checked ?? false;

export const TABS = [
  'Loan Products',
  'Saving Products',
  'Fixed Deposits',
  'Recurring Deposits',
  'Share Products',
  'Product Mix',
  'Floating Rates',
  'Tax',
  'Delinquency'
];

export function resetGlCache() { _glCache = null; }
