/* FinCraft · pages/charges/actions.js — the charge create/edit modal.
   Auto-split from the original monolithic pages/charges.js for maintainability. */

import { api } from '../../api.js';
import { LOCALE } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { APPLIES_TO_OPTIONS } from './shared.js';

export async function openChargeFormModal(existing, onSuccess) {
  // Fetch template for dropdowns
  let tpl = {};
  try { tpl = await api.charges.template(); } catch {}

  const isEdit = !!existing;
  const mid = 'ch-form-' + Date.now();

  const currencies     = tpl.currencyOptions      || [];
  const appliesTo      = tpl.chargeAppliesToOptions || APPLIES_TO_OPTIONS;
  const calcTypes      = tpl.chargeCalculationTypeOptions || [];
  const timeTypes      = tpl.chargeTimeTypeOptions || [];
  const paymentModes   = tpl.chargePaymentModeOptions || [];
  const incomeAccounts = tpl.incomeOrLiabilityAccountOptions?.incomeAccountOptions || tpl.incomeAccountOptions || [];
  const taxGroups      = tpl.taxGroupOptions || [];

  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${isEdit ? 'Edit Charge' : 'New Charge'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Name * <input id="cf-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
            <label>Applies To *
              <select id="cf-applies" class="form-control" required ${isEdit ? 'disabled' : ''}>
                <option value="">Select…</option>
                ${appliesTo.map(o => `<option value="${o.id}" ${existing?.chargeAppliesTo?.id === o.id ? 'selected' : ''}>${escapeHtml(o.name || o.value)}</option>`).join('')}
              </select>
            </label>
            <label>Currency *
              <select id="cf-currency" class="form-control" required>
                <option value="">Select…</option>
                ${currencies.map(co => `<option value="${co.code}" ${existing?.currency?.code === co.code ? 'selected' : ''}>${escapeHtml(co.code + ' — ' + co.name)}</option>`).join('')}
              </select>
            </label>
            <label>Amount * <input type="number" step="0.01" id="cf-amount" class="form-control" value="${existing?.amount ?? ''}" required/></label>
            <label>Calculation Type *
              <select id="cf-calc" class="form-control" required>
                <option value="">Select…</option>
                ${calcTypes.map(o => `<option value="${o.id}" ${existing?.chargeCalculationType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value || o.name)}</option>`).join('')}
              </select>
            </label>
            <label>Time Type *
              <select id="cf-time" class="form-control" required>
                <option value="">Select…</option>
                ${timeTypes.map(o => `<option value="${o.id}" ${existing?.chargeTimeType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value || o.name)}</option>`).join('')}
              </select>
            </label>
            <label>Payment Mode
              <select id="cf-paymode" class="form-control">
                <option value="">—</option>
                ${paymentModes.map(o => `<option value="${o.id}" ${existing?.chargePaymentMode?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value || o.name)}</option>`).join('')}
              </select>
            </label>
            <label>Min Cap <input type="number" step="0.01" id="cf-min" class="form-control" value="${existing?.minCap ?? ''}"/></label>
            <label>Max Cap <input type="number" step="0.01" id="cf-max" class="form-control" value="${existing?.maxCap ?? ''}"/></label>
            <label>Fee Interval <input type="number" id="cf-interval" class="form-control" value="${existing?.feeInterval ?? ''}"/></label>
            <label>Income Account
              <select id="cf-income" class="form-control">
                <option value="">— No mapping —</option>
                ${incomeAccounts.map(a => `<option value="${a.id}" ${(existing?.incomeOrLiabilityAccount?.id || existing?.incomeAccount?.id) === a.id ? 'selected' : ''}>${escapeHtml((a.glCode ? a.glCode + ' — ' : '') + (a.name || ''))}</option>`).join('')}
              </select>
            </label>
            <label>Tax Group
              <select id="cf-tax" class="form-control">
                <option value="">— No tax —</option>
                ${taxGroups.map(g => `<option value="${g.id}" ${existing?.taxGroup?.id === g.id ? 'selected' : ''}>${escapeHtml(g.name || '—')}</option>`).join('')}
              </select>
            </label>
            <label class="checkbox-row"><input type="checkbox" id="cf-penalty" ${existing?.penalty ? 'checked' : ''}/> Penalty charge (not a fee)</label>
            <label class="checkbox-row"><input type="checkbox" id="cf-active" ${existing?.active !== false ? 'checked' : ''}/> Active</label>
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Applies-To cannot be changed after creation.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="cf-save">${isEdit ? 'Save Changes' : 'Create Charge'}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  el.querySelector('#cf-save').addEventListener('click', async () => {
    const payload = { locale: LOCALE };
    payload.name = el.querySelector('#cf-name').value.trim();
    if (!isEdit) payload.chargeAppliesTo = parseInt(el.querySelector('#cf-applies').value);
    payload.currencyCode = el.querySelector('#cf-currency').value;
    payload.amount = parseFloat(el.querySelector('#cf-amount').value);
    payload.chargeCalculationType = parseInt(el.querySelector('#cf-calc').value);
    payload.chargeTimeType = parseInt(el.querySelector('#cf-time').value);
    const paymode = el.querySelector('#cf-paymode').value;
    if (paymode) payload.chargePaymentMode = parseInt(paymode);
    const minCap = parseFloat(el.querySelector('#cf-min').value);
    if (isFinite(minCap)) payload.minCap = minCap;
    const maxCap = parseFloat(el.querySelector('#cf-max').value);
    if (isFinite(maxCap)) payload.maxCap = maxCap;
    const interval = parseInt(el.querySelector('#cf-interval').value);
    if (isFinite(interval)) payload.feeInterval = interval;
    const income = el.querySelector('#cf-income').value;
    if (income) payload.incomeAccountId = parseInt(income);
    const tax = el.querySelector('#cf-tax').value;
    if (tax) payload.taxGroupId = parseInt(tax);
    payload.penalty = el.querySelector('#cf-penalty').checked;
    payload.active  = el.querySelector('#cf-active').checked;

    // Validation
    if (!payload.name) { toast('warn', 'Enter a name', ''); return; }
    if (!isEdit && !payload.chargeAppliesTo) { toast('warn', 'Select Applies-To', ''); return; }
    if (!payload.currencyCode) { toast('warn', 'Select a currency', ''); return; }
    if (isNaN(payload.amount)) { toast('warn', 'Enter an amount', ''); return; }
    if (!payload.chargeCalculationType) { toast('warn', 'Select calculation type', ''); return; }
    if (!payload.chargeTimeType) { toast('warn', 'Select time type', ''); return; }

    try {
      if (isEdit) await api.charges.update(existing.id, payload);
      else        await api.charges.create(payload);
      el.remove();
      toast('success', isEdit ? 'Charge updated' : 'Charge created', payload.name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
