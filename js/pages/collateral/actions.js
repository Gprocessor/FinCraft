/* FinCraft · pages/collateral/actions.js — the collateral type create/edit modal.
   Auto-split from the original monolithic pages/collateral.js for maintainability. */

import { api } from '../../api.js';
import { LOCALE } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { can } from './shared.js';

export async function openCollateralFormModal(existing, onSuccess) {
  let tpl = {};
  try { tpl = await api.collateralManagement.template(); } catch {}
  const currencies = tpl.currencyOptions || [];

  const isEdit = !!existing;
  const mid = 'col-form-' + Date.now();

  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>${isEdit ? 'Edit Collateral Type' : 'New Collateral Type'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Name * <input id="cf-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
            <label>Quality *
              <select id="cf-quality" class="form-control" required>
                <option value="">Select…</option>
                <option value="HIGH"   ${existing?.quality?.toUpperCase() === 'HIGH'   ? 'selected' : ''}>High</option>
                <option value="MEDIUM" ${existing?.quality?.toUpperCase() === 'MEDIUM' ? 'selected' : ''}>Medium</option>
                <option value="LOW"    ${existing?.quality?.toUpperCase() === 'LOW'    ? 'selected' : ''}>Low</option>
              </select>
            </label>
            <label>Unit Type *
              <input id="cf-unit" class="form-control" placeholder="e.g. grams, acres, units" value="${escapeHtml(existing?.unitType || '')}" required/>
            </label>
            <label>Currency *
              <select id="cf-currency" class="form-control" required>
                <option value="">Select…</option>
                ${currencies.map(co => `<option value="${co.code}" ${existing?.currency?.code === co.code ? 'selected' : ''}>${escapeHtml(co.code + ' — ' + co.name)}</option>`).join('')}
              </select>
            </label>
            <label>Base Price *
              <input type="number" step="0.01" id="cf-base" class="form-control" value="${existing?.basePrice ?? ''}" required/>
            </label>
            <label>% to Base (LTV) *
              <input type="number" step="0.01" id="cf-pct" class="form-control" value="${existing?.pctToBase ?? ''}" required min="0" max="100"/>
            </label>
          </div>
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            <b>% to Base</b> caps how much of the appraised value can be borrowed against this collateral.
            E.g. 80% means a $1,000 pledge supports up to $800 of loan principal.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="cf-save">${isEdit ? 'Save Changes' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  el.querySelector('#cf-save').addEventListener('click', async () => {
    const payload = { locale: LOCALE };
    payload.name = el.querySelector('#cf-name').value.trim();
    payload.quality = el.querySelector('#cf-quality').value;
    payload.unitType = el.querySelector('#cf-unit').value.trim();
    payload.currency = el.querySelector('#cf-currency').value;
    payload.basePrice = parseFloat(el.querySelector('#cf-base').value);
    payload.pctToBase = parseFloat(el.querySelector('#cf-pct').value);

    if (!payload.name)     { toast('warn', 'Enter a name', ''); return; }
    if (!payload.quality)  { toast('warn', 'Select quality', ''); return; }
    if (!payload.unitType) { toast('warn', 'Enter unit type', ''); return; }
    if (!payload.currency) { toast('warn', 'Select currency', ''); return; }
    if (isNaN(payload.basePrice) || payload.basePrice <= 0) { toast('warn', 'Enter base price', ''); return; }
    if (isNaN(payload.pctToBase) || payload.pctToBase < 0 || payload.pctToBase > 100) { toast('warn', 'Enter % between 0 and 100', ''); return; }

    try {
      if (isEdit) await api.collateralManagement.update(existing.id, payload);
      else        await api.collateralManagement.create(payload);
      el.remove();
      toast('success', isEdit ? 'Collateral updated' : 'Collateral created', payload.name);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}
