/* FinCraft · pages/products/actions/savings-products.js — savings, fixed deposit, and recurring deposit product modals.
   Auto-split (2nd pass) from pages/products/actions.js for maintainability. */

import { LOCALE } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { glSelect, modal, populateGl, v, vb, vf, vi } from '../shared.js';
import { toast } from '../../../ui.js';

export async function openSavingsProductModal(productId, onSuccess) {
  const isEdit = !!productId;
  let tpl = {}, existing = {};
  try {
    tpl = await api.savingsProducts.template();
    if (isEdit) existing = await api.savingsProducts.get(productId);
  } catch {}

  const currencies   = (tpl.currencyOptions || []).map(o => `<option value="${o.code}" ${existing.currency?.code === o.code ? 'selected' : ''}>${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const intCalcTypes = (tpl.interestCalculationTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestCalculationType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const intCompTypes = (tpl.interestCompoundingPeriodTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestCompoundingPeriodType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const intPostTypes = (tpl.interestPostingPeriodTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestPostingPeriodType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const currentAccRule = existing.accountingRule?.id || existing.accountingRule || 1;
  const accountingTypes = `
    <option value="1" ${currentAccRule === 1 ? 'selected' : ''}>None</option>
    <option value="2" ${currentAccRule === 2 ? 'selected' : ''}>Cash</option>`;

  const mid = 'sp-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Savings Product' : 'New Savings Product', `
    <div class="form-grid">
      <label>Product name * <input id="sp-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Short name * <input id="sp-short" class="form-control" maxlength="4" value="${escapeHtml(existing.shortName || '')}" required/></label>
      <label class="full">Description <textarea id="sp-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea></label>
      <label>Currency *
        <select id="sp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select>
      </label>
      <label>Decimal places <input type="number" id="sp-decimals" class="form-control" value="${existing.digitsAfterDecimal ?? 2}"/></label>
      <label>Nominal annual rate (%) * <input type="number" step="0.01" id="sp-rate" class="form-control" value="${existing.nominalAnnualInterestRate ?? ''}" required/></label>
      <label>Interest compounding
        <select id="sp-compound" class="form-control">${intCompTypes || '<option value="1">Daily</option><option value="3" selected>Monthly</option>'}</select>
      </label>
      <label>Interest posting
        <select id="sp-posting" class="form-control">${intPostTypes || '<option value="4" selected>Monthly</option><option value="5">Quarterly</option>'}</select>
      </label>
      <label>Interest calculated using
        <select id="sp-calc" class="form-control">${intCalcTypes || '<option value="1" selected>Daily Balance</option>'}</select>
      </label>
      <label>Days in year
        <select id="sp-days" class="form-control">
          <option value="360" ${existing.interestCalculationDaysInYearType?.id === 360 ? 'selected' : ''}>360</option>
          <option value="365" ${(existing.interestCalculationDaysInYearType?.id || 365) === 365 ? 'selected' : ''}>365</option>
        </select>
      </label>
      <label>Min opening balance <input type="number" step="0.01" id="sp-min-bal" class="form-control" value="${existing.minRequiredOpeningBalance ?? ''}"/></label>
      <label>Lock-in period <input type="number" id="sp-lockin" class="form-control" value="${existing.lockinPeriodFrequency ?? ''}"/></label>
      <label>Lock-in period type
        <select id="sp-lockin-type" class="form-control">
          <option value="0">Days</option><option value="1">Weeks</option>
          <option value="2" selected>Months</option><option value="3">Years</option>
        </select>
      </label>
      <label class="checkbox-row"><input type="checkbox" id="sp-withdraw-fee" ${existing.withdrawalFeeForTransfers ? 'checked' : ''}/> Apply withdrawal fee for transfers</label>
      <label>Accounting rule <select id="sp-accounting" class="form-control">${accountingTypes}</select></label>
    </div>

    <div id="sp-gl-wrap" style="${currentAccRule !== 1 ? '' : 'display:none'}">
      <h4 class="mt-3">GL Account Mappings</h4>
      <div class="form-grid">
        ${glSelect('gl-sp-savings-ref', 'Savings Reference', true)}
        ${glSelect('gl-sp-savings-ctrl', 'Savings Control', true)}
        ${glSelect('gl-sp-interest-on-sav', 'Interest on Savings', true)}
        ${glSelect('gl-sp-income-fees', 'Income from Fees')}
        ${glSelect('gl-sp-income-penalties', 'Income from Penalties')}
        ${glSelect('gl-sp-overdraft-port', 'Overdraft Portfolio')}
      </div>
    </div>`, true);

  el.querySelector('#sp-accounting').addEventListener('change', (e) => {
    el.querySelector('#sp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  if (isEdit && existing.accountingMappings) {
    const m = existing.accountingMappings;
    const setSel = (id, val) => { const s = el.querySelector('#' + id); if (s && val) s.value = String(val); };
    setSel('gl-sp-savings-ref', m.savingsReferenceAccount?.id);
    setSel('gl-sp-savings-ctrl', m.savingsControlAccount?.id);
    setSel('gl-sp-interest-on-sav', m.interestOnSavingsAccount?.id);
    setSel('gl-sp-income-fees', m.incomeFromFeeAccount?.id);
    setSel('gl-sp-income-penalties', m.incomeFromPenaltyAccount?.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'sp-name');
    const shortName = v(el, 'sp-short');
    const currencyCode = v(el, 'sp-currency');
    const rate = vf(el, 'sp-rate');

    if (!name || !shortName || !currencyCode || rate === null) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const accountingRule = vi(el, 'sp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'sp-decimals') ?? 2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: vi(el, 'sp-compound') ?? 3,
      interestPostingPeriodType: vi(el, 'sp-posting') ?? 4,
      interestCalculationType: vi(el, 'sp-calc') ?? 1,
      interestCalculationDaysInYearType: vi(el, 'sp-days') ?? 365,
      accountingRule,
      description: v(el, 'sp-desc') || undefined,
      minRequiredOpeningBalance: vf(el, 'sp-min-bal') || undefined,
      lockinPeriodFrequency: vi(el, 'sp-lockin') || undefined,
      lockinPeriodFrequencyType: vi(el, 'sp-lockin-type') || undefined,
      withdrawalFeeForTransfers: vb(el, 'sp-withdraw-fee')
    };

    if (accountingRule !== 1) {
      const sr  = vi(el, 'gl-sp-savings-ref');
      const sc  = vi(el, 'gl-sp-savings-ctrl');
      const ios = vi(el, 'gl-sp-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.savingsReferenceAccountId = sr;
      payload.savingsControlAccountId = sc;
      payload.interestOnSavingsAccountId = ios;
      const fees = vi(el, 'gl-sp-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
      const pen  = vi(el, 'gl-sp-income-penalties'); if (pen) payload.incomeFromPenaltyAccountId = pen;
    }

    try {
      if (isEdit) await api.savingsProducts.update(productId, payload);
      else        await api.savingsProducts.create(payload);
      el.remove();
      toast('success', isEdit ? 'Savings product updated' : 'Savings product created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openFDProductModal(productId, onSuccess) {
  const isEdit = !!productId;
  let tpl = {}, existing = {};
  try {
    tpl = await api.fdProducts.template();
    if (isEdit) existing = await api.fdProducts.get(productId);
  } catch {}

  const currencies = (tpl.currencyOptions || []).map(o => `<option value="${o.code}" ${existing.currency?.code === o.code ? 'selected' : ''}>${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const intCompTypes = (tpl.interestCompoundingPeriodTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestCompoundingPeriodType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const intPostTypes = (tpl.interestPostingPeriodTypeOptions || []).map(o => `<option value="${o.id}" ${existing.interestPostingPeriodType?.id === o.id ? 'selected' : ''}>${escapeHtml(o.value)}</option>`).join('');
  const termPeriods = `
    <option value="0">Days</option><option value="1">Weeks</option>
    <option value="2" selected>Months</option><option value="3">Years</option>`;
  const currentAccRule = existing.accountingRule?.id || existing.accountingRule || 1;

  const mid = 'fd-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Fixed Deposit Product' : 'New Fixed Deposit Product', `
    <div class="form-grid">
      <label>Product name * <input id="fd-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Short name * <input id="fd-short" class="form-control" maxlength="4" value="${escapeHtml(existing.shortName || '')}" required/></label>
      <label class="full">Description <textarea id="fd-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea></label>
      <label>Currency *
        <select id="fd-currency" class="form-control" required><option value="">Select…</option>${currencies}</select>
      </label>
      <label>Decimal places <input type="number" id="fd-decimals" class="form-control" value="${existing.digitsAfterDecimal ?? 2}"/></label>
      <label>Nominal annual rate (%) * <input type="number" step="0.01" id="fd-rate" class="form-control" value="${existing.nominalAnnualInterestRate ?? ''}" required/></label>
      <label>Interest compounding <select id="fd-compound" class="form-control">${intCompTypes || '<option value="3" selected>Monthly</option>'}</select></label>
      <label>Interest posting <select id="fd-posting" class="form-control">${intPostTypes || '<option value="4" selected>Monthly</option>'}</select></label>
      <label>Min deposit amount * <input type="number" step="0.01" id="fd-min-deposit" class="form-control" value="${existing.minDepositAmount ?? ''}" required/></label>
      <label>Max deposit amount <input type="number" step="0.01" id="fd-max-deposit" class="form-control" value="${existing.maxDepositAmount ?? ''}"/></label>
      <label>Min deposit term * <input type="number" id="fd-min-term" class="form-control" value="${existing.minDepositTerm ?? ''}" required/></label>
      <label>Min term period <select id="fd-min-term-type" class="form-control">${termPeriods}</select></label>
      <label>Max deposit term <input type="number" id="fd-max-term" class="form-control" value="${existing.maxDepositTerm ?? ''}"/></label>
      <label>Max term period <select id="fd-max-term-type" class="form-control">${termPeriods}</select></label>
      <label class="checkbox-row"><input type="checkbox" id="fd-premature" ${existing.preClosurePenalApplicable ? 'checked' : ''}/> Allow premature withdrawal</label>
      <label>Penalty on premature (%) <input type="number" step="0.01" id="fd-premature-penalty" class="form-control" value="${existing.preClosurePenalInterest ?? ''}"/></label>
      <label>Accounting rule
        <select id="fd-accounting" class="form-control">
          <option value="1" ${currentAccRule === 1 ? 'selected' : ''}>None</option>
          <option value="2" ${currentAccRule === 2 ? 'selected' : ''}>Cash</option>
        </select>
      </label>
    </div>

    <div id="fd-gl-wrap" style="${currentAccRule !== 1 ? '' : 'display:none'}">
      <h4 class="mt-3">GL Account Mappings</h4>
      <div class="form-grid">
        ${glSelect('gl-fd-savings-ref', 'Savings Reference', true)}
        ${glSelect('gl-fd-savings-ctrl', 'Savings Control', true)}
        ${glSelect('gl-fd-interest-on-sav', 'Interest on Savings', true)}
        ${glSelect('gl-fd-income-fees', 'Income from Fees')}
      </div>
    </div>`, true);

  el.querySelector('#fd-accounting').addEventListener('change', (e) => {
    el.querySelector('#fd-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  if (isEdit && existing.accountingMappings) {
    const m = existing.accountingMappings;
    const setSel = (id, val) => { const s = el.querySelector('#' + id); if (s && val) s.value = String(val); };
    setSel('gl-fd-savings-ref', m.savingsReferenceAccount?.id);
    setSel('gl-fd-savings-ctrl', m.savingsControlAccount?.id);
    setSel('gl-fd-interest-on-sav', m.interestOnSavingsAccount?.id);
    setSel('gl-fd-income-fees', m.incomeFromFeeAccount?.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'fd-name');
    const shortName = v(el, 'fd-short');
    const currencyCode = v(el, 'fd-currency');
    const rate = vf(el, 'fd-rate');
    const minDeposit = vf(el, 'fd-min-deposit');
    const minTerm = vi(el, 'fd-min-term');

    if (!name || !shortName || !currencyCode || rate === null || !minDeposit || !minTerm) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const accountingRule = vi(el, 'fd-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'fd-decimals') ?? 2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: vi(el, 'fd-compound') ?? 3,
      interestPostingPeriodType: vi(el, 'fd-posting') ?? 4,
      interestCalculationType: 1,
      interestCalculationDaysInYearType: 365,
      minDepositAmount: minDeposit,
      maxDepositAmount: vf(el, 'fd-max-deposit') || undefined,
      minDepositTerm: minTerm,
      minDepositTermTypeId: vi(el, 'fd-min-term-type') ?? 2,
      maxDepositTerm: vi(el, 'fd-max-term') || undefined,
      maxDepositTermTypeId: vi(el, 'fd-max-term-type') ?? 2,
      preClosurePenalApplicable: vb(el, 'fd-premature'),
      preClosurePenalInterest: vf(el, 'fd-premature-penalty') ?? 0,
      preClosurePenalInterestOnTypeId: 1,
      accountingRule,
      description: v(el, 'fd-desc') || undefined
    };

    if (accountingRule !== 1) {
      const sr = vi(el, 'gl-fd-savings-ref');
      const sc = vi(el, 'gl-fd-savings-ctrl');
      const ios = vi(el, 'gl-fd-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.savingsReferenceAccountId = sr;
      payload.savingsControlAccountId = sc;
      payload.interestOnSavingsAccountId = ios;
      const fees = vi(el, 'gl-fd-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
    }

    try {
      if (isEdit) await api.fdProducts.update(productId, payload);
      else        await api.fdProducts.create(payload);
      el.remove();
      toast('success', isEdit ? 'FD product updated' : 'FD product created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openRDProductModal(productId, onSuccess) {
  const isEdit = !!productId;
  let tpl = {}, existing = {};
  try {
    tpl = await api.rdProducts.template();
    if (isEdit) existing = await api.rdProducts.get(productId);
  } catch {}

  const currencies = (tpl.currencyOptions || []).map(o => `<option value="${o.code}" ${existing.currency?.code === o.code ? 'selected' : ''}>${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const termPeriods = `
    <option value="0">Days</option><option value="1">Weeks</option>
    <option value="2" selected>Months</option><option value="3">Years</option>`;
  const currentAccRule = existing.accountingRule?.id || existing.accountingRule || 1;

  const mid = 'rd-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Recurring Deposit Product' : 'New Recurring Deposit Product', `
    <div class="form-grid">
      <label>Product name * <input id="rdp-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Short name * <input id="rdp-short" class="form-control" maxlength="4" value="${escapeHtml(existing.shortName || '')}" required/></label>
      <label class="full">Description <textarea id="rdp-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea></label>
      <label>Currency *
        <select id="rdp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select>
      </label>
      <label>Decimal places <input type="number" id="rdp-decimals" class="form-control" value="${existing.digitsAfterDecimal ?? 2}"/></label>
      <label>Nominal annual rate (%) * <input type="number" step="0.01" id="rdp-rate" class="form-control" value="${existing.nominalAnnualInterestRate ?? ''}" required/></label>
      <label>Mandatory deposit amount * <input type="number" step="0.01" id="rdp-deposit" class="form-control" value="${existing.mandatoryRecommendedDepositAmount ?? ''}" required/></label>
      <label>Deposit every <input type="number" id="rdp-deposit-every" class="form-control" value="${existing.depositPeriod ?? 1}"/></label>
      <label>Deposit period <select id="rdp-deposit-period" class="form-control">${termPeriods}</select></label>
      <label>Min deposit term * <input type="number" id="rdp-min-term" class="form-control" value="${existing.minDepositTerm ?? ''}" required/></label>
      <label>Min term period <select id="rdp-min-term-type" class="form-control">${termPeriods}</select></label>
      <label>Max deposit term <input type="number" id="rdp-max-term" class="form-control" value="${existing.maxDepositTerm ?? ''}"/></label>
      <label>Max term period <select id="rdp-max-term-type" class="form-control">${termPeriods}</select></label>
      <label class="checkbox-row"><input type="checkbox" id="rdp-premature" ${existing.preClosurePenalApplicable ? 'checked' : ''}/> Allow premature withdrawal</label>
      <label>Accounting rule
        <select id="rdp-accounting" class="form-control">
          <option value="1" ${currentAccRule === 1 ? 'selected' : ''}>None</option>
          <option value="2" ${currentAccRule === 2 ? 'selected' : ''}>Cash</option>
        </select>
      </label>
    </div>

    <div id="rdp-gl-wrap" style="${currentAccRule !== 1 ? '' : 'display:none'}">
      <h4 class="mt-3">GL Account Mappings</h4>
      <div class="form-grid">
        ${glSelect('gl-rdp-savings-ref', 'Savings Reference', true)}
        ${glSelect('gl-rdp-savings-ctrl', 'Savings Control', true)}
        ${glSelect('gl-rdp-interest-on-sav', 'Interest on Savings', true)}
      </div>
    </div>`, true);

  el.querySelector('#rdp-accounting').addEventListener('change', (e) => {
    el.querySelector('#rdp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  if (isEdit && existing.accountingMappings) {
    const m = existing.accountingMappings;
    const setSel = (id, val) => { const s = el.querySelector('#' + id); if (s && val) s.value = String(val); };
    setSel('gl-rdp-savings-ref', m.savingsReferenceAccount?.id);
    setSel('gl-rdp-savings-ctrl', m.savingsControlAccount?.id);
    setSel('gl-rdp-interest-on-sav', m.interestOnSavingsAccount?.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'rdp-name');
    const shortName = v(el, 'rdp-short');
    const currencyCode = v(el, 'rdp-currency');
    const rate = vf(el, 'rdp-rate');
    const deposit = vf(el, 'rdp-deposit');
    const minTerm = vi(el, 'rdp-min-term');

    if (!name || !shortName || !currencyCode || rate === null || !deposit || !minTerm) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const accountingRule = vi(el, 'rdp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'rdp-decimals') ?? 2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: 3,
      interestPostingPeriodType: 4,
      interestCalculationType: 1,
      interestCalculationDaysInYearType: 365,
      mandatoryRecommendedDepositAmount: deposit,
      depositAmount: deposit,
      depositPeriod: vi(el, 'rdp-deposit-every') || 1,
      depositPeriodFrequencyId: vi(el, 'rdp-deposit-period') ?? 2,
      minDepositTerm: minTerm,
      minDepositTermTypeId: vi(el, 'rdp-min-term-type') ?? 2,
      maxDepositTerm: vi(el, 'rdp-max-term') || undefined,
      maxDepositTermTypeId: vi(el, 'rdp-max-term-type') ?? 2,
      preClosurePenalApplicable: vb(el, 'rdp-premature'),
      accountingRule,
      description: v(el, 'rdp-desc') || undefined
    };

    if (accountingRule !== 1) {
      const sr = vi(el, 'gl-rdp-savings-ref');
      const sc = vi(el, 'gl-rdp-savings-ctrl');
      const ios = vi(el, 'gl-rdp-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.savingsReferenceAccountId = sr;
      payload.savingsControlAccountId = sc;
      payload.interestOnSavingsAccountId = ios;
    }

    try {
      if (isEdit) await api.rdProducts.update(productId, payload);
      else        await api.rdProducts.create(payload);
      el.remove();
      toast('success', isEdit ? 'RD product updated' : 'RD product created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}
