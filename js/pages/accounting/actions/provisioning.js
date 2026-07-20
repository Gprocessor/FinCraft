/* FinCraft · pages/accounting/actions/provisioning.js — provisioning entry and financial activity modals.
   Auto-split from the original monolithic pages/accounting/actions.js for maintainability. */

import { api } from '../../../api.js';
import { LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { dynModal, glList, v, vi } from '../shared.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openProvisioningModal(onSuccess, existingId) {
  const glAccounts = await glList();
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  let existing = null;
  if (existingId) {
    try { existing = await api.provisioning.getCriteria(existingId); }
    catch (e) { toast('error', 'Failed to load criteria', extractFineractError(e)); return; }
  }
  const defs = existing?.provisioningCriteriaDefinition || existing?.definitions || [];

  const mid = 'prov-' + Date.now();
  const el = dynModal(mid, existing ? 'Edit Provisioning Criteria' : 'New Provisioning Criteria', `
    <label>Criteria name * <input id="pc-name" class="form-control" value="${escapeHtml(existing?.criteriaName || existing?.name || '')}" required/></label>

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
        ${defs.length ? defs.map((d, i) => provRow(glOptsHtml, i, d)).join('') : provRow(glOptsHtml, 0)}
      </tbody>
    </table>
    <button class="btn-secondary btn-sm mt-2" id="pc-add-row"><i class="fa-solid fa-plus"></i> Add category</button>`, true);

  let pIdx = defs.length || 1;
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
      if (existing) await api.provisioning.updateCriteria(existingId, { criteriaName, definitions, locale: LOCALE });
      else          await api.provisioning.createCriteria({ criteriaName, definitions, locale: LOCALE });
      el.remove();
      toast('success', existing ? 'Provisioning criteria updated' : 'Provisioning criteria created', criteriaName);
      onSuccess();
    } catch (e) { toast('error', existing ? 'Update failed' : 'Create failed', extractFineractError(e)); }
  });
}

export function provRow(glOptsHtml, idx, existing) {
  const glOpts = (selectedId) => glOptsHtml.replace(
    new RegExp(`value="${selectedId}"`),
    `value="${selectedId}" selected`
  );
  const liabilityId = existing?.liabilityAccount?.id ?? existing?.liabilityAccount;
  const expenseId = existing?.expenseAccount?.id ?? existing?.expenseAccount;
  return `
    <tr>
      <td><input class="form-control" placeholder="Name" value="${existing?.categoryName ? escapeHtml(existing.categoryName) : ''}"/></td>
      <td><input type="number" class="form-control" placeholder="0" value="${existing?.minimumAgeDays ?? ''}"/></td>
      <td><input type="number" class="form-control" placeholder="—" value="${existing?.maximumAgeDays ?? ''}"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0" value="${existing?.minBalancePercentage ?? ''}"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0" value="${existing?.provisioningPercentage ?? ''}"/></td>
      <td><select class="form-control"><option value="">— GL —</option>${liabilityId ? glOpts(liabilityId) : glOptsHtml}</select></td>
      <td><select class="form-control"><option value="">— GL —</option>${expenseId ? glOpts(expenseId) : glOptsHtml}</select></td>
      <td><button class="btn-mini btn-danger" data-remove-row>&times;</button></td>
    </tr>`;
}

export async function openProvisioningCategoryModal(onSuccess, existing) {
  const isEdit = !!existing;
  const mid = 'pcat-' + Date.now();
  const el = dynModal(mid, isEdit ? 'Edit Provisioning Category' : 'New Provisioning Category', `
    <label>Category name * <input id="pcat-name" class="form-control" value="${escapeHtml(existing?.categoryName || '')}" required/></label>
    <label class="full mt-2">Description <textarea id="pcat-desc" class="form-control" rows="2">${escapeHtml(existing?.categoryDescription || '')}</textarea></label>`);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const categoryName = v(el, 'pcat-name');
    if (!categoryName) { toast('warn', 'Enter a category name', ''); return; }
    // FLAGGED, NOT VERIFIED: payload field names (categoryName/categoryDescription) assumed by
    // analogy with the read-side ProvisioningCategoryData shape; not cross-checked against the
    // ProvisioningCategoryApiConstants source, since ProvisioningCategoryApiResource wasn't captured
    // with body/param details in fineract_api_raw.json.
    const payload = { categoryName };
    const desc = v(el, 'pcat-desc'); if (desc) payload.categoryDescription = desc;
    try {
      if (isEdit) await api.provisioningCategory.update(existing.id, payload);
      else        await api.provisioningCategory.create(payload);
      el.remove();
      toast('success', isEdit ? 'Category updated' : 'Category created', categoryName);
      onSuccess?.();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e)); }
  });
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
    } catch (e) { toast('error', 'Create failed', extractFineractError(e)); }
  });
}
