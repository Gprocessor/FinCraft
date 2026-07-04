/* FinCraft · pages/savings/detail/si.js — standing instructions tab loader.
   Auto-split from the original monolithic pages/savings/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, sb } from '../../../utils.js';
import { can } from '../shared.js';

export async function loadSavingsSI(c, id, savings) {
  const wrap = c.querySelector('#sv-si-wrap');
  wrap.innerHTML = `
    <div class="section-header mb-2">
      <h3>Standing Instructions</h3>
    </div>
    <div class="text-muted small mb-2">
      Recurring transfers that have this savings account as the source or destination.
    </div>
    <div id="sv-si-list"><div class="empty-state-row">Loading…</div></div>`;

  const listEl = wrap.querySelector('#sv-si-list');
  try {
    // Fineract doesn't filter SI by savings account directly — pull all for the client and filter
    const clientId = savings.clientId;
    if (!clientId) {
      listEl.innerHTML = '<div class="empty-state-row">Standing instructions only available on client-owned accounts</div>';
      return;
    }
    const res = await api.standingInstructions.list({ clientId, limit: 200 });
    const all = Array.isArray(res) ? res : (res?.pageItems || []);
    const list = all.filter(si =>
      si.fromAccount?.id === parseInt(id) ||
      si.toAccount?.id === parseInt(id) ||
      si.fromAccount?.accountNo === savings.accountNo ||
      si.toAccount?.accountNo === savings.accountNo);

    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>Name</th><th>From</th><th>To</th>
          <th class="text-right">Amount</th>
          <th>Type</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${escapeHtml(si.transferType?.value || si.instructionType?.value || '—')}</td>
            <td>${sb(si.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DELETE_STANDINGINSTRUCTION')
                ? `<button class="btn-mini btn-danger" data-del-si="${si.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions for this account</div>';

    listEl.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete standing instruction?', danger: true, confirmText: 'Delete' })) return;
      try { await api.standingInstructions.delete(b.dataset.delSi); toast('success', 'Deleted', ''); loadSavingsSI(c, id, savings); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
