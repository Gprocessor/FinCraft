/* FinCraft · pages/products/actions/loan-products.js — loan product and floating rate modals.
   Auto-split (2nd pass) from pages/products/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { glSelect, modal, populateGl, v, vb, vf, vi } from '../shared.js';
import { toast } from '../../../ui.js';

export async function openLoanProductModal(productId, onSuccess) {
  const isEdit = !!productId;
  let tpl = {}, existing = {};
  try {
    tpl = await api.loanProducts.template();
    if (isEdit) existing = await api.loanProducts.get(productId);
  } catch {}

  const amortTypes      = (tpl.amortizationTypeOptions || []).map(o => `<option value="${o.id}" ${existing.amortizationType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const intTypes        = (tpl.interestTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const intCalcTypes    = (tpl.interestCalculationPeriodTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestCalculationPeriodType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const repayFreqs      = (tpl.repaymentFrequencyTypeOptions || []).map(o => `<option value="${o.id}" ${existing.repaymentFrequencyType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const currencies      = (tpl.currencyOptions || []).map(o => `<option value="${o.code}" ${existing.currency?.code === o.code ? 'selected' : ''}>${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const currentAccRule  = existing.accountingRule?.id || existing.accountingRule || 1;
  const accountingTypes = `
    <option value="1" ${currentAccRule === 1 ? 'selected' : ''}>None</option>
    <option value="2" ${currentAccRule === 2 ? 'selected' : ''}>Cash</option>
    <option value="3" ${currentAccRule === 3 ? 'selected' : ''}>Accrual (Periodic)</option>
    <option value="4" ${currentAccRule === 4 ? 'selected' : ''}>Accrual (Upfront)</option>`;

  const mid = 'lp-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Loan Product' : 'New Loan Product', `
    <div class="form-grid">
      <label>Product name * <input id="lp-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Short name * <input id="lp-short" class="form-control" maxlength="4" value="${escapeHtml(existing.shortName || '')}" required/></label>
      <label class="full">Description <textarea id="lp-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea></label>
      <label>Currency *
        <select id="lp-currency" class="form-control" required>
          <option value="">Select…</option>${currencies}
        </select>
      </label>
      <label>Decimal places <input type="number" id="lp-decimals" class="form-control" value="${existing.digitsAfterDecimal ?? 2}" min="0" max="6"/></label>
      <label>Principal (default) * <input type="number" step="0.01" id="lp-principal" class="form-control" value="${existing.principal ?? ''}" required/></label>
      <label>Min principal <input type="number" step="0.01" id="lp-min-principal" class="form-control" value="${existing.minPrincipal ?? ''}"/></label>
      <label>Max principal <input type="number" step="0.01" id="lp-max-principal" class="form-control" value="${existing.maxPrincipal ?? ''}"/></label>
      <label>Repayments * <input type="number" id="lp-repayments" class="form-control" value="${existing.numberOfRepayments ?? ''}" required/></label>
      <label>Repayment every <input type="number" id="lp-repay-every" class="form-control" value="${existing.repaymentEvery ?? 1}"/></label>
      <label>Repayment frequency
        <select id="lp-repay-freq" class="form-control">${repayFreqs || '<option value="2">Months</option>'}</select>
      </label>
      <label>Interest rate (%) * <input type="number" step="0.01" id="lp-rate" class="form-control" value="${existing.interestRatePerPeriod ?? ''}" required/></label>
      <label>Min interest rate <input type="number" step="0.01" id="lp-min-rate" class="form-control" value="${existing.minInterestRatePerPeriod ?? ''}"/></label>
      <label>Max interest rate <input type="number" step="0.01" id="lp-max-rate" class="form-control" value="${existing.maxInterestRatePerPeriod ?? ''}"/></label>
      <label>Amortization type
        <select id="lp-amort" class="form-control">${amortTypes || '<option value="0">Equal Principal Payments</option><option value="1" selected>Equal Installments</option>'}</select>
      </label>
      <label>Interest type
        <select id="lp-int-type" class="form-control">${intTypes || '<option value="0" selected>Declining Balance</option><option value="1">Flat</option>'}</select>
      </label>
      <label>Interest calc period
        <select id="lp-int-calc" class="form-control">${intCalcTypes || '<option value="0">Daily</option><option value="1" selected>Same as repayment</option>'}</select>
      </label>
      <label>Grace on principal <input type="number" id="lp-grace-pr" class="form-control" value="${existing.graceOnPrincipalPayment ?? 0}"/></label>
      <label>Grace on interest <input type="number" id="lp-grace-int" class="form-control" value="${existing.graceOnInterestPayment ?? 0}"/></label>
      <label>Accounting rule
        <select id="lp-accounting" class="form-control">${accountingTypes}</select>
      </label>
    </div>

    <div id="lp-gl-wrap" style="${currentAccRule !== 1 ? '' : 'display:none'}">
      <h4 class="mt-3">GL Account Mappings</h4>
      <div class="form-grid">
        ${glSelect('gl-lp-fund-source', 'Fund Source', true)}
        ${glSelect('gl-lp-loan-portfolio', 'Loan Portfolio', true)}
        ${glSelect('gl-lp-income-int', 'Income from Interest', true)}
        ${glSelect('gl-lp-income-fees', 'Income from Fees')}
        ${glSelect('gl-lp-income-penalties', 'Income from Penalties')}
        ${glSelect('gl-lp-losses', 'Losses Written Off')}
        ${glSelect('gl-lp-interest-recv', 'Interest Receivable')}
        ${glSelect('gl-lp-fees-recv', 'Fees Receivable')}
      </div>
    </div>`, true);

  el.querySelector('#lp-accounting').addEventListener('change', (e) => {
    el.querySelector('#lp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  // Pre-fill GL accounts on edit
  if (isEdit && existing.accountingMappings) {
    const m = existing.accountingMappings;
    const setSel = (id, val) => { const s = el.querySelector('#' + id); if (s && val) s.value = String(val); };
    setSel('gl-lp-fund-source', m.fundSourceAccount?.id);
    setSel('gl-lp-loan-portfolio', m.loanPortfolioAccount?.id);
    setSel('gl-lp-income-int', m.interestOnLoanAccount?.id);
    setSel('gl-lp-income-fees', m.incomeFromFeeAccount?.id);
    setSel('gl-lp-income-penalties', m.incomeFromPenaltyAccount?.id);
    setSel('gl-lp-losses', m.writeOffAccount?.id);
    setSel('gl-lp-interest-recv', m.receivableInterestAccount?.id);
    setSel('gl-lp-fees-recv', m.receivableFeeAccount?.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'lp-name');
    const shortName = v(el, 'lp-short');
    const currencyCode = v(el, 'lp-currency');
    const principal = vf(el, 'lp-principal');
    const repayments = vi(el, 'lp-repayments');
    const rate = vf(el, 'lp-rate');

    if (!name || !shortName || !currencyCode || principal === null || !repayments || rate === null) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const accountingRule = vi(el, 'lp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'lp-decimals') ?? 2,
      principal,
      minPrincipal: vf(el, 'lp-min-principal') || undefined,
      maxPrincipal: vf(el, 'lp-max-principal') || undefined,
      numberOfRepayments: repayments,
      repaymentEvery: vi(el, 'lp-repay-every') || 1,
      repaymentFrequencyType: vi(el, 'lp-repay-freq') || 2,
      interestRatePerPeriod: rate,
      minInterestRatePerPeriod: vf(el, 'lp-min-rate') || undefined,
      maxInterestRatePerPeriod: vf(el, 'lp-max-rate') || undefined,
      interestRateFrequencyType: 2,
      amortizationType: vi(el, 'lp-amort') ?? 1,
      interestType: vi(el, 'lp-int-type') ?? 0,
      interestCalculationPeriodType: vi(el, 'lp-int-calc') ?? 1,
      accountingRule,
      description: v(el, 'lp-desc') || undefined
    };

    if (accountingRule !== 1) {
      const fs = vi(el, 'gl-lp-fund-source');
      const lp = vi(el, 'gl-lp-loan-portfolio');
      const ii = vi(el, 'gl-lp-income-int');
      if (!fs || !lp || !ii) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.fundSourceAccountId = fs;
      payload.loanPortfolioAccountId = lp;
      payload.interestOnLoanAccountId = ii;
      const fees = vi(el, 'gl-lp-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
      const pen  = vi(el, 'gl-lp-income-penalties'); if (pen) payload.incomeFromPenaltyAccountId = pen;
      const loss = vi(el, 'gl-lp-losses'); if (loss) payload.writeOffAccountId = loss;
      const ir   = vi(el, 'gl-lp-interest-recv'); if (ir) payload.receivableInterestAccountId = ir;
      const fr   = vi(el, 'gl-lp-fees-recv'); if (fr) payload.receivableFeeAccountId = fr;
    }

    try {
      if (isEdit) await api.loanProducts.update(productId, payload);
      else        await api.loanProducts.create(payload);
      el.remove();
      toast('success', isEdit ? 'Loan product updated' : 'Loan product created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openFloatingRateModal(rateId, onSuccess) {
  const isEdit = !!rateId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.floatingRates.get(rateId); } catch {}
  }

  const ratePeriodRow = (period = {}) => `
    <div class="fr-period form-grid" style="margin-bottom:8px">
      <label>From date * <input type="date" class="form-control fr-from" value="${period.fromDate || today()}" required/></label>
      <label>Interest rate (%) * <input type="number" step="0.0001" class="form-control fr-rate" value="${period.interestRate ?? ''}" required/></label>
      ${!isEdit ? `<button type="button" class="btn-mini btn-danger fr-remove">Remove</button>` : ''}
    </div>`;

  const existingPeriods = Array.isArray(existing.ratePeriods) ? existing.ratePeriods : [];
  const periodsHtml = existingPeriods.length
    ? existingPeriods.map(p => ratePeriodRow(p)).join('')
    : ratePeriodRow();

  const mid = 'fr-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Floating Rate' : 'New Floating Rate', `
    <div class="form-grid">
      <label>Rate name * <input id="fr-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label class="checkbox-row"><input type="checkbox" id="fr-base" ${existing.isBaseLendingRate ? 'checked' : ''}/> Is base lending rate</label>
      <label class="checkbox-row"><input type="checkbox" id="fr-active" ${existing.isActive !== false ? 'checked' : ''}/> Active</label>
    </div>

    <h4 class="mt-3">Rate Periods</h4>
    ${isEdit ? `<div class="msg-banner b-info mb-2">
      <i class="fa-solid fa-circle-info"></i>
      Existing rate periods are read-only. Add a new period below to create a new rate change effective on a future date.
    </div>` : ''}
    <div id="fr-periods">${periodsHtml}</div>
    <button class="btn-secondary btn-sm mt-2" id="fr-add-period"><i class="fa-solid fa-plus"></i> Add Period</button>`);

  const wireRemove = () => {
    el.querySelectorAll('.fr-remove').forEach(b => {
      if (!b.dataset.wired) {
        b.dataset.wired = '1';
        b.addEventListener('click', () => b.closest('.fr-period').remove());
      }
    });
  };
  wireRemove();

  el.querySelector('#fr-add-period').addEventListener('click', () => {
    el.querySelector('#fr-periods').insertAdjacentHTML('beforeend', `
      <div class="fr-period form-grid" style="margin-bottom:8px">
        <label>From date * <input type="date" class="form-control fr-from" value="${today()}" required/></label>
        <label>Interest rate (%) * <input type="number" step="0.0001" class="form-control fr-rate" required/></label>
        <button type="button" class="btn-mini btn-danger fr-remove">Remove</button>
      </div>`);
    wireRemove();
  });

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'fr-name');
    if (!name) { toast('warn', 'Enter a rate name', ''); return; }

    const ratePeriods = [...el.querySelectorAll('.fr-period')].map(row => ({
      fromDate: row.querySelector('.fr-from').value,
      interestRate: parseFloat(row.querySelector('.fr-rate').value)
    })).filter(p => p.fromDate && !isNaN(p.interestRate));

    if (!ratePeriods.length) { toast('warn', 'Add at least one rate period', ''); return; }

    const payload = {
      name,
      isBaseLendingRate: vb(el, 'fr-base'),
      isActive: vb(el, 'fr-active'),
      ratePeriods,
      locale: LOCALE,
      dateFormat: DATE_FORMAT
    };

    try {
      if (isEdit) await api.floatingRates.update(rateId, payload);
      else        await api.floatingRates.create(payload);
      el.remove();
      toast('success', isEdit ? 'Floating rate updated' : 'Floating rate created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
