/* FinCraft · pages/accounting/loaders/rules.js — accounting rules and opening balances tab loaders.
   Auto-split from the original monolithic pages/accounting/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { today } from '../../../config.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { openAccountingRuleModal, openingBalanceRow, submitOpeningBalances } from '../actions.js';
import { can, glList } from '../shared.js';

export async function loadAccountingRules(c) {
  const el = c.querySelector('#acc-3');
  try {
    const rules = await api.accountingRules.list();
    const list = Array.isArray(rules) ? rules : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Accounting Rules</h3>
        <div>
          <span class="text-muted mr-2">${list.length} rule${list.length !== 1 ? 's' : ''}</span>
          ${can('CREATE_ACCOUNTINGRULE') ? `<button class="btn-primary" id="btn-new-rule"><i class="fa-solid fa-plus"></i> Add Rule</button>` : ''}
        </div>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Office</th>
            <th>Debit Tags / Accounts</th>
            <th>Credit Tags / Accounts</th>
            <th></th>
          </tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td>${escapeHtml(r.name || '—')}</td>
              <td>${escapeHtml(r.officeName || 'All')}</td>
              <td>${(r.debitAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td>${(r.creditAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td class="text-right">
                ${can('UPDATE_ACCOUNTINGRULE') ? `<button class="btn-mini" data-edit-rule="${r.id}">Edit</button>` : ''}
                ${can('DELETE_ACCOUNTINGRULE') ? `<button class="btn-mini btn-danger" data-del-rule="${r.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No accounting rules</div>'}`;

    el.querySelector('#btn-new-rule')?.addEventListener('click', () =>
      openAccountingRuleModal(null, () => loadAccountingRules(c)));
    el.querySelectorAll('[data-edit-rule]').forEach(b => b.addEventListener('click', () =>
      openAccountingRuleModal(b.dataset.editRule, () => loadAccountingRules(c))));
    el.querySelectorAll('[data-del-rule]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete accounting rule?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.accountingRules.delete(b.dataset.delRule);
        toast('success', 'Rule deleted', '');
        loadAccountingRules(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadOpeningBalances(c) {
  const el = c.querySelector('#acc-4');
  try {
    const officesRes = await api.offices.list().catch(() => []);
    const offices = Array.isArray(officesRes) ? officesRes : [];
    const glAccounts = await glList();

    el.innerHTML = `
      <h3>Define Opening Balances</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Set initial GL balances for a new office or accounting period start.
      </div>

      <div class="form-grid">
        <label>Office *
          <select id="ob-office" class="form-control" required>
            <option value="">Select office…</option>
            ${offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </label>
        <label>Transaction date * <input type="date" id="ob-date" class="form-control" value="${today()}" required/></label>
        <label class="full">Comments <textarea id="ob-comments" class="form-control" rows="2"></textarea></label>
      </div>

      <h4 class="mt-3">Credit accounts (balances to set)</h4>
      <div id="ob-credits">${openingBalanceRow(glAccounts, 'c', 0)}</div>
      <button class="btn-secondary btn-sm mt-2" id="ob-add-credit"><i class="fa-solid fa-plus"></i> Add credit row</button>

      <h4 class="mt-3">Debit accounts</h4>
      <div id="ob-debits">${openingBalanceRow(glAccounts, 'd', 0)}</div>
      <button class="btn-secondary btn-sm mt-2" id="ob-add-debit"><i class="fa-solid fa-plus"></i> Add debit row</button>

      <div class="mt-3">
        ${can('CREATE_JOURNALENTRY') ? `<button class="btn-primary" id="ob-submit">Submit Opening Balances</button>` : ''}
      </div>`;

    let cIdx = 1, dIdx = 1;
    el.querySelector('#ob-add-credit').addEventListener('click', () => {
      el.querySelector('#ob-credits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts, 'c', cIdx++));
    });
    el.querySelector('#ob-add-debit').addEventListener('click', () => {
      el.querySelector('#ob-debits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts, 'd', dIdx++));
    });
    el.querySelector('#ob-submit')?.addEventListener('click', () => submitOpeningBalances(el));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}
