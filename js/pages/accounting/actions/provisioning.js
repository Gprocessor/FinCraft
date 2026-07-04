/* FinCraft · pages/accounting/actions/provisioning.js — provisioning entry and financial activity modals.
   Auto-split from the original monolithic pages/accounting/actions.js for maintainability. */

import { api } from '../../../api.js';
import { LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { dynModal, glList, v, vi } from '../shared.js';

export async function openProvisioningModal(onSuccess) {
  const glAccounts = await glList();
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = 'prov-' + Date.now();
  const el = dynModal(mid, 'New Provisioning Criteria', `
    <label>Criteria name * <input id="pc-name" class="form-control" required/></label>

    <h4 class="mt-3">Provision Categories</h4>
    <table class="table">
      <thead><tr>
        <th>Category name</th>
        <th>Min days</th><th>Max days</th>
        <th>Min amount</th><th>Provision %</th>
        <th>Liability GL</th><th>Expense GL</th>
        <th></th>
      </tr></thead>
      <tbody id="pc-tbody">
        ${provRow(glOptsHtml, 0)}
      </tbody>
    </table>
    <button class="btn-secondary btn-sm mt-2" id="pc-add-row"><i class="fa-solid fa-plus"></i> Add category</button>`, true);

  let pIdx = 1;
  el.querySelector('#pc-add-row').addEventListener('click', () => {
    el.querySelector('#pc-tbody').insertAdjacentHTML('beforeend', provRow(glOptsHtml, pIdx++));
  });

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const criteriaName = v(el, 'pc-name');
    if (!criteriaName) { toast('warn', 'Enter criteria name', ''); return; }

    const definitions = [...el.querySelector('#pc-tbody').querySelectorAll('tr')].map(row => {
      const inputs = row.querySelectorAll('input,select');
      return {
        categoryName: inputs[0]?.value?.trim(),
        minimumAgeDays: parseInt(inputs[1]?.value) || 0,
        maximumAgeDays: parseInt(inputs[2]?.value) || undefined,
        minBalancePercentage: parseFloat(inputs[3]?.value) || 0,
        provisioningPercentage: parseFloat(inputs[4]?.value) || 0,
        liabilityAccount: parseInt(inputs[5]?.value) || undefined,
        expenseAccount: parseInt(inputs[6]?.value) || undefined
      };
    }).filter(d => d.categoryName);

    if (!definitions.length) { toast('warn', 'Add at least one provision category', ''); return; }

    try {
      await api.provisioning.createCriteria({ criteriaName, definitions, locale: LOCALE });
      el.remove();
      toast('success', 'Provisioning criteria created', criteriaName);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function provRow(glOptsHtml, idx) {
  return `
    <tr>
      <td><input class="form-control" placeholder="Name"/></td>
      <td><input type="number" class="form-control" placeholder="0"/></td>
      <td><input type="number" class="form-control" placeholder="—"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0"/></td>
      <td><select class="form-control"><option value="">— GL —</option>${glOptsHtml}</select></td>
      <td><select class="form-control"><option value="">— GL —</option>${glOptsHtml}</select></td>
      <td><button class="btn-mini btn-danger" onclick="this.closest('tr').remove()">&times;</button></td>
    </tr>`;
}

export async function openFAModal(actOpts, onSuccess) {
  const glAccounts = await glList();
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = 'fa-' + Date.now();
  const el = dynModal(mid, 'Add Financial Activity Mapping', `
    <div class="form-grid">
      <label>Financial activity *
        <select id="fa-activity" class="form-control" required>
          <option value="">Select activity…</option>${actOpts}
        </select>
      </label>
      <label>GL Account *
        <select id="fa-gl" class="form-control" required>
          <option value="">— Select GL account —</option>${glOptsHtml}
        </select>
      </label>
    </div>`);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const financialActivityId = vi(el, 'fa-activity'), glAccountId = vi(el, 'fa-gl');
    if (!financialActivityId || !glAccountId) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    try {
      await api.financialActivityAccounts.create({ financialActivityId, glAccountId });
      el.remove();
      toast('success', 'Mapping created', '');
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
