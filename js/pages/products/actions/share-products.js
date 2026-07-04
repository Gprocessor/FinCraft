/* FinCraft · pages/products/actions/share-products.js — share product modal.
   Auto-split (2nd pass) from pages/products/actions.js for maintainability. */

import { LOCALE } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { glSelect, modal, populateGl, v, vb, vf, vi } from '../shared.js';
import { toast } from '../../../ui.js';

export async function openShareProductModal(productId, onSuccess) {
  const isEdit = !!productId;
  let tpl = {}, existing = {};
  try {
    tpl = await api.shareProducts.template();
    if (isEdit) existing = await api.shareProducts.get(productId);
  } catch {}

  const currencies = (tpl.currencyOptions || []).map(o => `<option value="${o.code}" ${existing.currency?.code === o.code ? 'selected' : ''}>${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const currentAccRule = existing.accountingRule?.id || existing.accountingRule || 1;

  const mid = 'shp-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Share Product' : 'New Share Product', `
    <div class="form-grid">
      <label>Product name * <input id="shp-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Short name * <input id="shp-short" class="form-control" maxlength="4" value="${escapeHtml(existing.shortName || '')}" required/></label>
      <label class="full">Description <textarea id="shp-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea></label>
      <label>Currency *
        <select id="shp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select>
      </label>
      <label>Decimal places <input type="number" id="shp-decimals" class="form-control" value="${existing.digitsAfterDecimal ?? 2}"/></label>
      <label>Total shares issued * <input type="number" id="shp-total" class="form-control" value="${existing.totalShares ?? ''}" required/></label>
      <label>Unit price * <input type="number" step="0.01" id="shp-unit-price" class="form-control" value="${existing.unitPrice ?? ''}" required/></label>
      <label>Min shares per client <input type="number" id="shp-min-shares" class="form-control" value="${existing.minimumShares ?? ''}"/></label>
      <label>Nominal shares per client <input type="number" id="shp-nom-shares" class="form-control" value="${existing.nominalShares ?? ''}"/></label>
      <label>Max shares per client <input type="number" id="shp-max-shares" class="form-control" value="${existing.maximumShares ?? ''}"/></label>
      <label>Lock-in period (months) <input type="number" id="shp-lockin" class="form-control" value="${existing.lockinPeriodFrequency ?? ''}"/></label>
      <label class="checkbox-row"><input type="checkbox" id="shp-allow-dividends" ${existing.allowDividendCalculationForInactiveClients ? 'checked' : ''}/> Allow dividends for inactive clients</label>
      <label>Accounting rule
        <select id="shp-accounting" class="form-control">
          <option value="1" ${currentAccRule === 1 ? 'selected' : ''}>None</option>
          <option value="2" ${currentAccRule === 2 ? 'selected' : ''}>Cash</option>
        </select>
      </label>
    </div>

    <div id="shp-gl-wrap" style="${currentAccRule !== 1 ? '' : 'display:none'}">
      <h4 class="mt-3">GL Account Mappings</h4>
      <div class="form-grid">
        ${glSelect('gl-shp-shares-ref', 'Shares Reference', true)}
        ${glSelect('gl-shp-shares-susp', 'Shares Suspense', true)}
        ${glSelect('gl-shp-income-fees', 'Income from Fees')}
      </div>
    </div>`, true);

  el.querySelector('#shp-accounting').addEventListener('change', (e) => {
    el.querySelector('#shp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  if (isEdit && existing.accountingMappings) {
    const m = existing.accountingMappings;
    const setSel = (id, val) => { const s = el.querySelector('#' + id); if (s && val) s.value = String(val); };
    setSel('gl-shp-shares-ref', m.shareReference?.id);
    setSel('gl-shp-shares-susp', m.shareSuspense?.id);
    setSel('gl-shp-income-fees', m.shareEquity?.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'shp-name');
    const shortName = v(el, 'shp-short');
    const currencyCode = v(el, 'shp-currency');
    const totalShares = vi(el, 'shp-total');
    const unitPrice = vf(el, 'shp-unit-price');

    if (!name || !shortName || !currencyCode || !totalShares || !unitPrice) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const accountingRule = vi(el, 'shp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'shp-decimals') ?? 2,
      totalShares, unitPrice,
      minimumShares: vi(el, 'shp-min-shares') || undefined,
      nominalShares: vi(el, 'shp-nom-shares') || undefined,
      maximumShares: vi(el, 'shp-max-shares') || undefined,
      lockinPeriodFrequency: vi(el, 'shp-lockin') || undefined,
      lockinPeriodFrequencyType: vi(el, 'shp-lockin') ? 2 : undefined,
      allowDividendCalculationForInactiveClients: vb(el, 'shp-allow-dividends'),
      accountingRule,
      description: v(el, 'shp-desc') || undefined
    };

    if (accountingRule !== 1) {
      const sr = vi(el, 'gl-shp-shares-ref');
      const ss = vi(el, 'gl-shp-shares-susp');
      if (!sr || !ss) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.shareReferenceId = sr;
      payload.shareSuspenseId = ss;
      const fees = vi(el, 'gl-shp-income-fees'); if (fees) payload.shareEquityId = fees;
    }

    try {
      if (isEdit) await api.shareProducts.update(productId, payload);
      else        await api.shareProducts.create(payload);
      el.remove();
      toast('success', isEdit ? 'Share product updated' : 'Share product created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
