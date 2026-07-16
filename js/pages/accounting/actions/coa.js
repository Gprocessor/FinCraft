/* FinCraft · pages/accounting/actions/coa.js — GL account and accounting rule modals.
   Auto-split from the original monolithic pages/accounting/actions.js for maintainability. */

import { api } from '../../../api.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { dynModal, glList, v, vi } from '../shared.js';

export async function deleteGLAccountConfirm(id, name, onSuccess) {
  if (!await modalConfirm({
    title: 'Delete GL account' + (name ? ' "' + name + '"' : '') + '?',
    message: 'This only succeeds if the account has no journal entries, product mappings, or financial activity tags.',
    danger: true, confirmText: 'Delete'
  })) return;
  try {
    await api.glAccounts.delete(id);
    toast('success', 'GL account deleted', name || '');
    onSuccess?.();
  } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
}

export async function openGLAccountModal(onSuccess, existingId) {
  const isEdit = !!existingId;
  let tpl = {};
  try { tpl = await api.glAccounts.template(); } catch {}
  const types = (tpl.accountTypeOptions || [
    { id: 1, value: 'ASSET' }, { id: 2, value: 'LIABILITY' },
    { id: 3, value: 'EQUITY' }, { id: 4, value: 'INCOME' }, { id: 5, value: 'EXPENSE' }
  ]).map(t => `<option value="${t.id}">${escapeHtml(t.value)}</option>`).join('');
  const usages = (tpl.usageOptions || [
    { id: 1, value: 'DETAIL' }, { id: 2, value: 'HEADER' }
  ]).map(u => `<option value="${u.id}">${escapeHtml(u.value)}</option>`).join('');
  const parentOpts = (Array.isArray(tpl.allowedParents) ? tpl.allowedParents : [])
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.glCode})</option>`).join('');

  let existing = null;
  if (isEdit) {
    try { existing = await api.glAccounts.get(existingId); }
    catch (e) { toast('error', 'Failed to load account', e.detail?.defaultUserMessage || e.message); return; }
  }

  const mid = 'gl-acc-' + Date.now();
  const el = dynModal(mid, isEdit ? 'Edit GL Account' : 'Add GL Account', `
    <div class="form-grid">
      <label>Account name * <input id="gla-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
      <label>GL Code * <input id="gla-code" class="form-control" value="${escapeHtml(existing?.glCode || '')}" required/></label>
      <label>Account type *
        <select id="gla-type" class="form-control" required>
          <option value="">Select…</option>${types}
        </select>
      </label>
      <label>Usage *
        <select id="gla-usage" class="form-control" required>
          <option value="">Select…</option>${usages}
        </select>
      </label>
      <label>Parent account
        <select id="gla-parent" class="form-control">
          <option value="">— None (top-level) —</option>${parentOpts}
        </select>
      </label>
      <label class="full">Description <textarea id="gla-desc" class="form-control" rows="2">${escapeHtml(existing?.description || '')}</textarea></label>
      <label class="checkbox-row"><input type="checkbox" id="gla-manual" ${existing ? (existing.manualEntriesAllowed ? 'checked' : '') : 'checked'}/> Allow manual entries</label>
    </div>`);

  if (existing) {
    const typeId = existing.type?.id ?? existing.type;
    const usageId = existing.usage?.id ?? existing.usage;
    if (typeId) el.querySelector('#gla-type').value = String(typeId);
    if (usageId) el.querySelector('#gla-usage').value = String(usageId);
    const parentId = existing.parentId ?? existing.parent?.id;
    if (parentId) el.querySelector('#gla-parent').value = String(parentId);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'gla-name'), glCode = v(el, 'gla-code');
    const type = vi(el, 'gla-type'), usage = vi(el, 'gla-usage');
    if (!name || !glCode || !type || !usage) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    const payload = {
      name, glCode, type, usage,
      manualEntriesAllowed: el.querySelector('#gla-manual').checked
    };
    const desc = v(el, 'gla-desc'); if (desc) payload.description = desc;
    const parentId = vi(el, 'gla-parent'); if (parentId) payload.parentId = parentId;
    try {
      if (isEdit) await api.glAccounts.update(existingId, payload);
      else        await api.glAccounts.create(payload);
      el.remove();
      toast('success', isEdit ? 'GL account updated' : 'GL account created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAccountingRuleModal(ruleId, onSuccess) {
  const isEdit = !!ruleId;
  let tpl = null;
  try { tpl = await api.accountingRules.template(); } catch {}
  // Field names for this template aren't documented beyond the endpoint path,
  // so we only use it if it actually contains recognizable option arrays —
  // otherwise fall back to the generic offices/GL-accounts lists already used here.
  const tplOffices = tpl?.allowedOffices;
  const tplGl = tpl?.allowedAccounts || tpl?.glAccountOptions;
  const [officesRes, glAccounts] = await Promise.all([
    Array.isArray(tplOffices) && tplOffices.length ? Promise.resolve(tplOffices) : api.offices.list().catch(() => []),
    Array.isArray(tplGl) && tplGl.length ? Promise.resolve(tplGl) : glList()
  ]);
  const offices = Array.isArray(officesRes) ? officesRes : [];
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  const offOpts = offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  const mid = 'ar-' + Date.now();
  const el = dynModal(mid, isEdit ? 'Edit Accounting Rule' : 'Add Accounting Rule', `
    <div class="form-grid">
      <label>Rule name * <input id="ar-name" class="form-control" required/></label>
      <label>Office (blank = all)
        <select id="ar-office" class="form-control">
          <option value="">All Offices</option>${offOpts}
        </select>
      </label>
      <label class="full">Description <textarea id="ar-desc" class="form-control" rows="2"></textarea></label>
    </div>

    <h4 class="mt-3">Debit</h4>
    <label>Debit GL Account *
      <select id="ar-debit" class="form-control" required>
        <option value="">— Select account —</option>${glOptsHtml}
      </select>
    </label>

    <h4 class="mt-3">Credit</h4>
    <label>Credit GL Account *
      <select id="ar-credit" class="form-control" required>
        <option value="">— Select account —</option>${glOptsHtml}
      </select>
    </label>`);

  if (isEdit) {
    try {
      const rule = await api.accountingRules.get(ruleId);
      el.querySelector('#ar-name').value = rule.name || '';
      el.querySelector('#ar-desc').value = rule.description || '';
      if (rule.officeId) el.querySelector('#ar-office').value = String(rule.officeId);
      const debitId = rule.debitAccounts?.[0]?.id || rule.debitAccounts?.[0]?.glAccountId;
      const creditId = rule.creditAccounts?.[0]?.id || rule.creditAccounts?.[0]?.glAccountId;
      if (debitId)  el.querySelector('#ar-debit').value  = String(debitId);
      if (creditId) el.querySelector('#ar-credit').value = String(creditId);
    } catch {}
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'ar-name');
    const debitId = vi(el, 'ar-debit'), creditId = vi(el, 'ar-credit');
    if (!name || !debitId || !creditId) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    const payload = {
      name,
      debitAccountId: debitId,
      creditAccountId: creditId
    };
    const offId = vi(el, 'ar-office'); if (offId) payload.officeId = offId;
    const desc = v(el, 'ar-desc'); if (desc) payload.description = desc;
    try {
      if (isEdit) await api.accountingRules.update(ruleId, payload);
      else        await api.accountingRules.create(payload);
      el.remove();
      toast('success', isEdit ? 'Rule updated' : 'Rule created', name);
      onSuccess?.();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
