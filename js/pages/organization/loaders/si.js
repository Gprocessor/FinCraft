/* FinCraft · pages/organization/loaders/si.js — standing instructions tab loader.
   Auto-split (2nd pass) from pages/organization/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, fmt, sb } from '../../../utils.js';
import { openStandingInstructionModal } from '../actions.js';

export async function loadStandingInstructions(c) {
  const el = c.querySelector('#og-7');
  try {
    const res = await api.standingInstructions.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} instruction${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_STANDINGINSTRUCTION') ? `<button class="btn-primary" id="btn-new-si"><i class="fa-solid fa-plus"></i> New Instruction</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>From Account</th><th>To Account</th>
            <th class="text-right">Amount</th><th>Recurrence</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(si => `
            <tr>
              <td>${escapeHtml(si.name || '—')}</td>
              <td>${escapeHtml(si.fromAccount?.accountNo || si.fromAccountNumber || '—')}</td>
              <td>${escapeHtml(si.toAccount?.accountNo || si.toAccountNumber || '—')}</td>
              <td class="text-right">${fmt(si.amount || 0)}</td>
              <td>${escapeHtml(si.recurrenceType?.value || '—')}</td>
              <td>${sb(si.status?.value || 'Active')}</td>
              <td class="text-right">
                <!-- No delete: DELETE_STANDINGINSTRUCTION is a real permission code, but StandingInstructionApiResource
                     has no DELETE method at all in Fineract (only template/create/update/retrieveAll/retrieveOne). -->
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No standing instructions</div>'}`;

    el.querySelector('#btn-new-si')?.addEventListener('click', () => openStandingInstructionModal(() => loadStandingInstructions(c)));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
