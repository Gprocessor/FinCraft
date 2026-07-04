/* FinCraft · pages/accounting/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/accounting.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml } from '../../utils.js';
import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const TABS = [
  'Chart of Accounts',
  'Journal Entries',
  'Frequent Postings',
  'Accounting Rules',
  'Opening Balances',
  'Run Accruals',
  'GL Closure',
  'Provisioning',
  'Financial Activities'
];

export let _glCache = null;

export async function glList() {
  if (!_glCache) {
    try {
      const r = await api.glAccounts.list();
      _glCache = Array.isArray(r) ? r : [];
    } catch { _glCache = []; }
  }
  return _glCache;
}

export async function populateJEFilters(container) {
  const offSel = container.querySelector('#je-f-office');
  const glSel  = container.querySelector('#je-f-glacct');
  if (!offSel && !glSel) return;

  // Loading state
  if (offSel) offSel.innerHTML = '<option value="">Loading offices…</option>';
  if (glSel)  glSel.innerHTML  = '<option value="">Loading GL accounts…</option>';

  try {
    const [offRes, glAccounts] = await Promise.all([
      api.offices.list().catch(() => []),
      glList()
    ]);
    const offices = Array.isArray(offRes) ? offRes : [];

    if (offSel) {
      offSel.innerHTML = '<option value="">All offices</option>' +
        offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
    }

    if (glSel) {
      // Group GL accounts by type for usability
      const byType = {};
      glAccounts.forEach(g => {
        const type = g.type?.value || g.type || 'OTHER';
        (byType[type] ||= []).push(g);
      });
      const typeOrder = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
      const sortedTypes = Object.keys(byType).sort((a, b) => {
        const ai = typeOrder.indexOf(a), bi = typeOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

      let html = '<option value="">All GL accounts</option>';
      sortedTypes.forEach(type => {
        html += `<optgroup label="${escapeHtml(type)}">`;
        byType[type].forEach(g => {
          const label = (g.glCode ? g.glCode + ' — ' : '') + (g.name || '—');
          html += `<option value="${g.id}">${escapeHtml(label)}</option>`;
        });
        html += '</optgroup>';
      });
      glSel.innerHTML = html;
    }
  } catch (e) {
    console.warn('[je-filters]', e);
    if (offSel) offSel.innerHTML = '<option value="">Failed to load offices</option>';
    if (glSel)  glSel.innerHTML  = '<option value="">Failed to load GL accounts</option>';
  }
}

export const v  = (el, id) => el.querySelector('#' + id)?.value?.trim() || '';

export const vi = (el, id) => { const n = parseInt(v(el, id)); return isNaN(n) ? null : n; };

export const vf = (el, id) => { const n = parseFloat(v(el, id)); return isNaN(n) ? null : n; };

export function dynModal(mid, title, body, wide = false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal ${wide ? 'modal-lg' : 'modal-md'}">
        <div class="modal-header"><h3>${title}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  return el;
}

export function resetGlCache() { _glCache = null; }
