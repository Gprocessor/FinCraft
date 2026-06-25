import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · products.js — Full product builders (Phase 4) */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast } from '../ui.js';

// ── shared GL picker helper ──────────────────────────────────
let _glCache = null;
async function glOptions() {
  if (!_glCache) {
    try {
      const res = await api.glAccounts.list({ manualEntriesAllowed: true });
      _glCache = Array.isArray(res) ? res : [];
    } catch { _glCache = []; }
  }
  return _glCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
}

function glSelect(id, label, required = false) {
  return `<label class="full"><span class="form-label">${label}${required ? ' *' : ''}</span>
    <select id="${id}" class="form-control" ${required ? 'required' : ''}><option value="">— Select GL account —</option></select></label>`;
}

async function populateGl(el) {
  const opts = await glOptions();
  el.querySelectorAll('select[id^="gl-"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Select GL account —</option>${opts}`;
    if (cur) sel.value = cur;
  });
}

function modal(mid, title, bodyHtml, wide = false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal${wide ? ' xl' : ' lg'}">
        <div class="modal-head">
          <h3 class="modal-title">${title}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save"><i class="fa-solid fa-check"></i> Save</button>
        </div>
      </div>
    </div>`);
  const elv = document.getElementById(mid);
  elv.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => elv.remove()));
  return elv;
}

function v(el, id) { return el.querySelector(`#${id}`)?.value?.trim() || ''; }
function vi(el, id) { const val = parseInt(v(el, id)); return isNaN(val) ? null : val; }
function vf(el, id) { const val = parseFloat(v(el, id)); return isNaN(val) ? null : val; }
function vb(el, id) { return el.querySelector(`#${id}`)?.checked ?? false; }

// ── Tab layout ───────────────────────────────────────────────
const TABS = ['Loan Products','Saving Products','Fixed Deposits','Recurring Deposits','Share Products','Charges','Floating Rates','Tax','Delinquency'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Products</h1><div class="page-subtitle">Loan, savings, deposit &amp; share products</div></div>
    </div>
    <div class="card">
      <div class="tabs" style="flex-wrap:wrap">${TABS.map((t, i) =>
        `<button class="tab${i === 0 ? ' active' : ''}" data-tab="pr-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) =>
        `<div id="pr-${i}" class="tab-panel${i === 0 ? ' active' : ''}">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
        </div>`).join('')}
    </div>
  </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
  }));

  const loaders = [
    { key: 0, label: 'Loan Product',      fn: () => api.loanProducts.list(),    cols: ['Name','Short Name','Principal','Rate'],           row: p => [p.name, p.shortName, fmt(p.principal||0), `${p.interestRatePerPeriod||0}%`], newFn: () => openLoanProductModal(reload) },
    { key: 1, label: 'Savings Product',   fn: () => api.savingsProducts.list(), cols: ['Name','Short Name','Nominal Rate'],               row: p => [p.name, p.shortName, `${p.nominalAnnualInterestRate||0}%`],                   newFn: () => openSavingsProductModal(reload) },
    { key: 2, label: 'FD Product',        fn: () => api.fdProducts.list(),      cols: ['Name','Short Name','Min Deposit'],                row: p => [p.name, p.shortName, fmt(p.minDepositAmount||0)],                              newFn: () => openFDProductModal(reload) },
    { key: 3, label: 'RD Product',        fn: () => api.rdProducts.list(),      cols: ['Name','Short Name','Mandatory Deposit'],          row: p => [p.name, p.shortName, fmt(p.mandatoryRecommendedDepositAmount||0)],             newFn: () => openRDProductModal(reload) },
    { key: 4, label: 'Share Product',     fn: () => api.shareProducts.list(),   cols: ['Name','Short Name','Unit Price'],                 row: p => [p.name, p.shortName, fmt(p.unitPrice||0)],                                     newFn: () => openShareProductModal(reload) },
    { key: 5, label: 'Charge',            fn: () => api.charges.list(),         cols: ['Name','Type','Amount'],                          row: p => [p.name, p.chargeTimeType?.value||'—', fmt(p.amount||0)],                        newFn: () => openChargeModal(reload) },
    { key: 6, label: 'Floating Rate',     fn: () => api.floatingRates.list(),   cols: ['Name','Base Rate','Active'],                     row: p => [p.name, p.isBaseLendingRate?'Yes':'No', p.active!==false?'Yes':'No'],            newFn: () => openFloatingRateModal(reload) },
    { key: 7, label: 'Tax',
      fn: async () => {
        const [tc, tg] = await Promise.all([api.taxComponents.list(), api.taxGroups.list()]);
        return [...(Array.isArray(tc)?tc:[]).map(x=>({...x,_type:'Component'})), ...(Array.isArray(tg)?tg:[]).map(x=>({...x,_type:'Group'}))];
      },
      cols: ['Name','Type'], row: p => [p.name, p._type],
      newFn: () => openTaxModal(reload) },
    { key: 8, label: 'Delinquency Bucket',
      fn: async () => {
        const [b, r] = await Promise.all([api.delinquencyBuckets.list(), api.delinquencyBuckets.ranges()]);
        return (Array.isArray(b)?b:[]).map(bk => ({...bk, _ranges: (Array.isArray(r)?r:[]).filter(x=>x.delinquencyBucketId===bk.id)}));
      },
      cols: ['Bucket Name','Ranges'], row: p => [p.name, (p._ranges||[]).map(r=>`${r.classification||r.minimumAgeDays+'d'}`).join(', ')||'—'],
      newFn: () => openDelinquencyModal(reload) }
  ];

  async function reload(key) {
    const cfg = loaders[key];
    const pane = c.querySelector(`#pr-${key}`);
    pane.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
    try {
      const res  = await cfg.fn();
      const list = Array.isArray(res) ? res : [];
      pane.innerHTML = `
        <div class="flex justify-between items-center mb-4">
          <span class="text-muted">${list.length} ${cfg.label.toLowerCase()}${list.length !== 1 ? 's' : ''}</span>
          <button class="btn-primary btn-sm" data-new-btn="${key}"><i class="fa-solid fa-plus"></i> New ${cfg.label}</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>${cfg.cols.map(h=>`<th>${h}</th>`).join('')}<th>Active</th></tr></thead>
          <tbody>${list.length
            ? list.map(p => `<tr>${cfg.row(p).map(val=>`<td>${escapeHtml(String(val??'—'))}</td>`).join('')}<td>${p.active===false?sb('Inactive'):sb('Active')}</td></tr>`).join('')
            : `<tr><td colspan="${cfg.cols.length+1}"><div class="empty-state"><i class="fa-solid fa-cube"></i><div>No ${cfg.label.toLowerCase()}s</div></div></td></tr>`
          }</tbody>
        </table></div>`;
      pane.querySelector(`[data-new-btn="${key}"]`)?.addEventListener('click', () => cfg.newFn());
    } catch (e) {
      pane.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    }
  }

  await Promise.all(loaders.map(l => reload(l.key)));
}

// ════════════════════════════════════════════════════════════
// P4-1  LOAN PRODUCT
// ════════════════════════════════════════════════════════════
async function openLoanProductModal(reload) {
  let tpl = {};
  try { tpl = await api.loanProducts.template(); } catch {}

  const amortTypes  = (tpl.amortizationTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const intTypes    = (tpl.interestTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const intCalcTypes= (tpl.interestCalculationPeriodTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const repayFreqs  = (tpl.repaymentFrequencyTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const currencies  = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const accountingTypes = `<option value="1">None</option><option value="2">Cash</option><option value="3">Accrual (Periodic)</option><option value="4">Accrual (Upfront)</option>`;

  const mid = `lp-modal-${Date.now()}`;
  const el = modal(mid, 'New Loan Product', `
    <div class="form-grid">
      <label><span class="form-label">Product name *</span><input id="lp-name" class="form-control" required/></label>
      <label><span class="form-label">Short name *</span><input id="lp-short" class="form-control" maxlength="4" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="lp-desc" class="form-control" rows="2"></textarea></label>
      <label><span class="form-label">Currency *</span><select id="lp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Decimal places</span><input id="lp-decimals" type="number" min="0" max="6" value="2" class="form-control"/></label>
      <label><span class="form-label">Principal (default) *</span><input id="lp-principal" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Min principal</span><input id="lp-min-principal" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Max principal</span><input id="lp-max-principal" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Repayments *</span><input id="lp-repayments" type="number" min="1" value="12" class="form-control" required/></label>
      <label><span class="form-label">Repayment every</span><input id="lp-repay-every" type="number" min="1" value="1" class="form-control"/></label>
      <label><span class="form-label">Repayment frequency</span><select id="lp-repay-freq" class="form-control">${repayFreqs||'<option value="2">Months</option>'}</select></label>
      <label><span class="form-label">Interest rate (%) *</span><input id="lp-rate" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Min interest rate</span><input id="lp-min-rate" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Max interest rate</span><input id="lp-max-rate" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Amortization type</span><select id="lp-amort" class="form-control">${amortTypes||'<option value="1">Equal Principal Payments</option><option value="0">Equal Installments</option>'}</select></label>
      <label><span class="form-label">Interest type</span><select id="lp-int-type" class="form-control">${intTypes||'<option value="0">Declining Balance</option><option value="1">Flat</option>'}</select></label>
      <label><span class="form-label">Interest calc period</span><select id="lp-int-calc" class="form-control">${intCalcTypes||'<option value="0">Daily</option><option value="1">Same as repayment</option>'}</select></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="lp-grace-principal"/> <span>Grace on principal</span></label>
      <label><span class="form-label">Grace principal periods</span><input id="lp-grace-principal-periods" type="number" min="0" value="0" class="form-control"/></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="lp-grace-interest"/> <span>Grace on interest</span></label>
      <label><span class="form-label">Grace interest periods</span><input id="lp-grace-interest-periods" type="number" min="0" value="0" class="form-control"/></label>
      <label class="full"><span class="form-label">Accounting rule</span><select id="lp-accounting" class="form-control">${accountingTypes}</select></label>
      <div class="full" id="lp-gl-wrap" style="display:none">
        <h4 class="mb-3" style="font-size:13px;font-weight:600">GL Account Mappings</h4>
        <div class="form-grid">
          ${glSelect('gl-lp-fund-source',   'Fund Source *', true)}
          ${glSelect('gl-lp-loan-portfolio','Loan Portfolio *', true)}
          ${glSelect('gl-lp-income-int',    'Income from Interest *', true)}
          ${glSelect('gl-lp-income-fees',   'Income from Fees')}
          ${glSelect('gl-lp-income-penalties','Income from Penalties')}
          ${glSelect('gl-lp-losses',        'Losses Written Off')}
          ${glSelect('gl-lp-interest-recv', 'Interest Receivable')}
          ${glSelect('gl-lp-fees-recv',     'Fees Receivable')}
        </div>
      </div>
    </div>`, true);

  // Show/hide GL section based on accounting rule
  el.querySelector('#lp-accounting').addEventListener('change', (e) => {
    el.querySelector('#lp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });

  await populateGl(el);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name         = v(el, 'lp-name');
    const shortName    = v(el, 'lp-short');
    const currencyCode = v(el, 'lp-currency');
    const principal    = vf(el, 'lp-principal');
    const repayments   = vi(el, 'lp-repayments');
    const rate         = vf(el, 'lp-rate');
    if (!name || !shortName || !currencyCode || !principal || !repayments || rate === null) {
      toast('warn', 'Fill required fields', ''); return;
    }
    const accountingRule = vi(el, 'lp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el, 'lp-decimals') ?? 2,
      principal, minPrincipal: vf(el,'lp-min-principal')||undefined,
      maxPrincipal: vf(el,'lp-max-principal')||undefined,
      numberOfRepayments: repayments,
      repaymentEvery: vi(el,'lp-repay-every')||1,
      repaymentFrequencyType: vi(el,'lp-repay-freq')||2,
      interestRatePerPeriod: rate,
      minInterestRatePerPeriod: vf(el,'lp-min-rate')||undefined,
      maxInterestRatePerPeriod: vf(el,'lp-max-rate')||undefined,
      interestRateFrequencyType: 2, // per year
      amortizationType: vi(el,'lp-amort')??1,
      interestType: vi(el,'lp-int-type')??0,
      interestCalculationPeriodType: vi(el,'lp-int-calc')??1,
      accountingRule,
      description: v(el,'lp-desc')||undefined
    };
    if (accountingRule !== 1) {
      const fs = vi(el,'gl-lp-fund-source'); const lp = vi(el,'gl-lp-loan-portfolio'); const ii = vi(el,'gl-lp-income-int');
      if (!fs || !lp || !ii) { toast('warn', 'Fill required GL accounts', ''); return; }
      payload.fundSourceAccountId           = fs;
      payload.loanPortfolioAccountId        = lp;
      payload.interestOnLoanAccountId       = ii;
      const fees = vi(el,'gl-lp-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
      const pen  = vi(el,'gl-lp-income-penalties'); if (pen) payload.incomeFromPenaltyAccountId = pen;
      const loss = vi(el,'gl-lp-losses'); if (loss) payload.writeOffAccountId = loss;
      const ir   = vi(el,'gl-lp-interest-recv'); if (ir) payload.receivableInterestAccountId = ir;
      const fr   = vi(el,'gl-lp-fees-recv'); if (fr) payload.receivableFeeAccountId = fr;
    }
    try {
      await api.loanProducts.create(payload);
      el.remove(); toast('success', 'Loan product created', name); reload(0);
    } catch (e) { toast('error', 'Create failed', e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-2  SAVINGS PRODUCT
// ════════════════════════════════════════════════════════════
async function openSavingsProductModal(reload) {
  let tpl = {};
  try { tpl = await api.savingsProducts.template(); } catch {}
  const currencies   = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const intCalcTypes = (tpl.interestCalculationTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const intCompTypes = (tpl.interestCompoundingPeriodTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const intPostTypes = (tpl.interestPostingPeriodTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const accountingTypes = `<option value="1">None</option><option value="2">Cash</option>`;

  const mid = `sp-modal-${Date.now()}`;
  const el = modal(mid, 'New Savings Product', `
    <div class="form-grid">
      <label><span class="form-label">Product name *</span><input id="sp-name" class="form-control" required/></label>
      <label><span class="form-label">Short name *</span><input id="sp-short" class="form-control" maxlength="4" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="sp-desc" class="form-control" rows="2"></textarea></label>
      <label><span class="form-label">Currency *</span><select id="sp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Decimal places</span><input id="sp-decimals" type="number" min="0" max="6" value="2" class="form-control"/></label>
      <label><span class="form-label">Nominal annual rate (%) *</span><input id="sp-rate" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Interest compounding</span><select id="sp-compound" class="form-control">${intCompTypes||'<option value="1">Daily</option><option value="3">Monthly</option><option value="6">Annually</option>'}</select></label>
      <label><span class="form-label">Interest posting</span><select id="sp-posting" class="form-control">${intPostTypes||'<option value="4">Monthly</option><option value="5">Quarterly</option>'}</select></label>
      <label><span class="form-label">Interest calculated using</span><select id="sp-calc" class="form-control">${intCalcTypes||'<option value="1">Daily Balance</option><option value="2">Average Daily Balance</option>'}</select></label>
      <label><span class="form-label">Days in year</span><select id="sp-days" class="form-control"><option value="360">360</option><option value="365" selected>365</option></select></label>
      <label><span class="form-label">Min opening balance</span><input id="sp-min-bal" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Lock-in period</span><input id="sp-lockin" type="number" min="0" class="form-control"/></label>
      <label><span class="form-label">Lock-in period type</span><select id="sp-lockin-type" class="form-control"><option value="0">Days</option><option value="1">Weeks</option><option value="2">Months</option><option value="3">Years</option></select></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="sp-withdraw-fee"/> <span>Apply withdrawal fee for transfers</span></label>
      <label class="full"><span class="form-label">Accounting rule</span><select id="sp-accounting" class="form-control">${accountingTypes}</select></label>
      <div class="full" id="sp-gl-wrap" style="display:none">
        <h4 class="mb-3" style="font-size:13px;font-weight:600">GL Account Mappings</h4>
        <div class="form-grid">
          ${glSelect('gl-sp-savings-ref',     'Savings Reference *', true)}
          ${glSelect('gl-sp-savings-ctrl',    'Savings Control *', true)}
          ${glSelect('gl-sp-interest-on-sav', 'Interest on Savings *', true)}
          ${glSelect('gl-sp-income-fees',     'Income from Fees')}
          ${glSelect('gl-sp-income-penalties','Income from Penalties')}
          ${glSelect('gl-sp-overdraft-port',  'Overdraft Portfolio')}
        </div>
      </div>
    </div>`, true);

  el.querySelector('#sp-accounting').addEventListener('change', (e) => {
    el.querySelector('#sp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });
  await populateGl(el);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'sp-name'); const shortName = v(el,'sp-short'); const currencyCode = v(el,'sp-currency'); const rate = vf(el,'sp-rate');
    if (!name || !shortName || !currencyCode || rate === null) { toast('warn','Fill required fields',''); return; }
    const accountingRule = vi(el,'sp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el,'sp-decimals')??2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: vi(el,'sp-compound')??3,
      interestPostingPeriodType: vi(el,'sp-posting')??4,
      interestCalculationType: vi(el,'sp-calc')??1,
      interestCalculationDaysInYearType: vi(el,'sp-days')??365,
      accountingRule,
      description: v(el,'sp-desc')||undefined,
      minRequiredOpeningBalance: vf(el,'sp-min-bal')||undefined,
      lockinPeriodFrequency: vi(el,'sp-lockin')||undefined,
      lockinPeriodFrequencyType: vi(el,'sp-lockin-type')||undefined,
      withdrawalFeeForTransfers: vb(el,'sp-withdraw-fee')
    };
    if (accountingRule !== 1) {
      const sr = vi(el,'gl-sp-savings-ref'); const sc = vi(el,'gl-sp-savings-ctrl'); const ios = vi(el,'gl-sp-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn','Fill required GL accounts',''); return; }
      payload.savingsReferenceAccountId = sr; payload.savingsControlAccountId = sc; payload.interestOnSavingsAccountId = ios;
      const fees = vi(el,'gl-sp-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
      const pen  = vi(el,'gl-sp-income-penalties'); if (pen) payload.incomeFromPenaltyAccountId = pen;
    }
    try {
      await api.savingsProducts.create(payload);
      el.remove(); toast('success','Savings product created',name); reload(1);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-3  FIXED DEPOSIT PRODUCT
// ════════════════════════════════════════════════════════════
async function openFDProductModal(reload) {
  let tpl = {};
  try { tpl = await api.fdProducts.template(); } catch {}
  const currencies   = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const intCompTypes = (tpl.interestCompoundingPeriodTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const intPostTypes = (tpl.interestPostingPeriodTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('');
  const termPeriods  = `<option value="0">Days</option><option value="1">Weeks</option><option value="2">Months</option><option value="3">Years</option>`;

  const mid = `fd-modal-${Date.now()}`;
  const el = modal(mid, 'New Fixed Deposit Product', `
    <div class="form-grid">
      <label><span class="form-label">Product name *</span><input id="fd-name" class="form-control" required/></label>
      <label><span class="form-label">Short name *</span><input id="fd-short" class="form-control" maxlength="4" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="fd-desc" class="form-control" rows="2"></textarea></label>
      <label><span class="form-label">Currency *</span><select id="fd-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Decimal places</span><input id="fd-decimals" type="number" min="0" max="6" value="2" class="form-control"/></label>
      <label><span class="form-label">Nominal annual rate (%) *</span><input id="fd-rate" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Interest compounding</span><select id="fd-compound" class="form-control">${intCompTypes||'<option value="3">Monthly</option><option value="6">Annually</option>'}</select></label>
      <label><span class="form-label">Interest posting</span><select id="fd-posting" class="form-control">${intPostTypes||'<option value="4">Monthly</option><option value="5">Quarterly</option>'}</select></label>
      <label><span class="form-label">Min deposit amount *</span><input id="fd-min-deposit" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Max deposit amount</span><input id="fd-max-deposit" type="number" min="0" step="0.01" class="form-control"/></label>
      <label><span class="form-label">Min deposit term *</span><input id="fd-min-term" type="number" min="1" class="form-control" required/></label>
      <label><span class="form-label">Min term period</span><select id="fd-min-term-type" class="form-control">${termPeriods}</select></label>
      <label><span class="form-label">Max deposit term</span><input id="fd-max-term" type="number" min="1" class="form-control"/></label>
      <label><span class="form-label">Max term period</span><select id="fd-max-term-type" class="form-control">${termPeriods}</select></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="fd-premature"/> <span>Allow premature withdrawal</span></label>
      <label><span class="form-label">Penalty on premature (%)</span><input id="fd-premature-penalty" type="number" min="0" step="0.01" value="0" class="form-control"/></label>
      <label class="full"><span class="form-label">Accounting rule</span><select id="fd-accounting" class="form-control"><option value="1">None</option><option value="2">Cash</option></select></label>
      <div class="full" id="fd-gl-wrap" style="display:none">
        <h4 class="mb-3" style="font-size:13px;font-weight:600">GL Account Mappings</h4>
        <div class="form-grid">
          ${glSelect('gl-fd-savings-ref',    'Savings Reference *', true)}
          ${glSelect('gl-fd-savings-ctrl',   'Savings Control *', true)}
          ${glSelect('gl-fd-interest-on-sav','Interest on Savings *', true)}
          ${glSelect('gl-fd-income-fees',    'Income from Fees')}
        </div>
      </div>
    </div>`, true);

  el.querySelector('#fd-accounting').addEventListener('change', (e) => {
    el.querySelector('#fd-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });
  await populateGl(el);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'fd-name'); const shortName = v(el,'fd-short'); const currencyCode = v(el,'fd-currency');
    const rate = vf(el,'fd-rate'); const minDeposit = vf(el,'fd-min-deposit'); const minTerm = vi(el,'fd-min-term');
    if (!name || !shortName || !currencyCode || rate === null || !minDeposit || !minTerm) { toast('warn','Fill required fields',''); return; }
    const accountingRule = vi(el,'fd-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el,'fd-decimals')??2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: vi(el,'fd-compound')??3,
      interestPostingPeriodType: vi(el,'fd-posting')??4,
      interestCalculationType: 1,
      interestCalculationDaysInYearType: 365,
      minDepositAmount: minDeposit,
      maxDepositAmount: vf(el,'fd-max-deposit')||undefined,
      minDepositTerm: minTerm,
      minDepositTermTypeId: vi(el,'fd-min-term-type')??2,
      maxDepositTerm: vi(el,'fd-max-term')||undefined,
      maxDepositTermTypeId: vi(el,'fd-max-term-type')??2,
      preClosurePenalApplicable: vb(el,'fd-premature'),
      preClosurePenalInterest: vf(el,'fd-premature-penalty')??0,
      preClosurePenalInterestOnTypeId: 1,
      accountingRule,
      description: v(el,'fd-desc')||undefined
    };
    if (accountingRule !== 1) {
      const sr = vi(el,'gl-fd-savings-ref'); const sc = vi(el,'gl-fd-savings-ctrl'); const ios = vi(el,'gl-fd-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn','Fill required GL accounts',''); return; }
      payload.savingsReferenceAccountId = sr; payload.savingsControlAccountId = sc; payload.interestOnSavingsAccountId = ios;
      const fees = vi(el,'gl-fd-income-fees'); if (fees) payload.incomeFromFeeAccountId = fees;
    }
    try {
      await api.fdProducts.create(payload);
      el.remove(); toast('success','FD product created',name); reload(2);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-4  RECURRING DEPOSIT PRODUCT
// ════════════════════════════════════════════════════════════
async function openRDProductModal(reload) {
  let tpl = {};
  try { tpl = await api.rdProducts.template(); } catch {}
  const currencies   = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const termPeriods  = `<option value="0">Days</option><option value="1">Weeks</option><option value="2" selected>Months</option><option value="3">Years</option>`;

  const mid = `rd-modal-${Date.now()}`;
  const el = modal(mid, 'New Recurring Deposit Product', `
    <div class="form-grid">
      <label><span class="form-label">Product name *</span><input id="rdp-name" class="form-control" required/></label>
      <label><span class="form-label">Short name *</span><input id="rdp-short" class="form-control" maxlength="4" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="rdp-desc" class="form-control" rows="2"></textarea></label>
      <label><span class="form-label">Currency *</span><select id="rdp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Decimal places</span><input id="rdp-decimals" type="number" min="0" max="6" value="2" class="form-control"/></label>
      <label><span class="form-label">Nominal annual rate (%) *</span><input id="rdp-rate" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Mandatory deposit amount *</span><input id="rdp-deposit" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Deposit every</span><input id="rdp-deposit-every" type="number" min="1" value="1" class="form-control"/></label>
      <label><span class="form-label">Deposit period</span><select id="rdp-deposit-period" class="form-control">${termPeriods}</select></label>
      <label><span class="form-label">Min deposit term *</span><input id="rdp-min-term" type="number" min="1" class="form-control" required/></label>
      <label><span class="form-label">Min term period</span><select id="rdp-min-term-type" class="form-control">${termPeriods}</select></label>
      <label><span class="form-label">Max deposit term</span><input id="rdp-max-term" type="number" min="1" class="form-control"/></label>
      <label><span class="form-label">Max term period</span><select id="rdp-max-term-type" class="form-control">${termPeriods}</select></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="rdp-premature"/> <span>Allow premature withdrawal</span></label>
      <label><span class="form-label">Accounting rule</span><select id="rdp-accounting" class="form-control"><option value="1">None</option><option value="2">Cash</option></select></label>
      <div class="full" id="rdp-gl-wrap" style="display:none">
        <div class="form-grid">
          ${glSelect('gl-rdp-savings-ref',    'Savings Reference *', true)}
          ${glSelect('gl-rdp-savings-ctrl',   'Savings Control *', true)}
          ${glSelect('gl-rdp-interest-on-sav','Interest on Savings *', true)}
        </div>
      </div>
    </div>`, true);

  el.querySelector('#rdp-accounting').addEventListener('change', e => {
    el.querySelector('#rdp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });
  await populateGl(el);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'rdp-name'); const shortName = v(el,'rdp-short'); const currencyCode = v(el,'rdp-currency');
    const rate = vf(el,'rdp-rate'); const deposit = vf(el,'rdp-deposit'); const minTerm = vi(el,'rdp-min-term');
    if (!name || !shortName || !currencyCode || rate === null || !deposit || !minTerm) { toast('warn','Fill required fields',''); return; }
    const accountingRule = vi(el,'rdp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el,'rdp-decimals')??2,
      nominalAnnualInterestRate: rate,
      interestCompoundingPeriodType: 3,
      interestPostingPeriodType: 4,
      interestCalculationType: 1,
      interestCalculationDaysInYearType: 365,
      mandatoryRecommendedDepositAmount: deposit,
      depositAmount: deposit,
      depositPeriod: vi(el,'rdp-deposit-every')||1,
      depositPeriodFrequencyId: vi(el,'rdp-deposit-period')??2,
      minDepositTerm: minTerm,
      minDepositTermTypeId: vi(el,'rdp-min-term-type')??2,
      maxDepositTerm: vi(el,'rdp-max-term')||undefined,
      maxDepositTermTypeId: vi(el,'rdp-max-term-type')??2,
      preClosurePenalApplicable: vb(el,'rdp-premature'),
      accountingRule,
      description: v(el,'rdp-desc')||undefined
    };
    if (accountingRule !== 1) {
      const sr = vi(el,'gl-rdp-savings-ref'); const sc = vi(el,'gl-rdp-savings-ctrl'); const ios = vi(el,'gl-rdp-interest-on-sav');
      if (!sr || !sc || !ios) { toast('warn','Fill required GL accounts',''); return; }
      payload.savingsReferenceAccountId = sr; payload.savingsControlAccountId = sc; payload.interestOnSavingsAccountId = ios;
    }
    try {
      await api.rdProducts.create(payload);
      el.remove(); toast('success','RD product created',name); reload(3);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-5  SHARE PRODUCT
// ════════════════════════════════════════════════════════════
async function openShareProductModal(reload) {
  let tpl = {};
  try { tpl = await api.shareProducts.template(); } catch {}
  const currencies = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');

  const mid = `shp-modal-${Date.now()}`;
  const el = modal(mid, 'New Share Product', `
    <div class="form-grid">
      <label><span class="form-label">Product name *</span><input id="shp-name" class="form-control" required/></label>
      <label><span class="form-label">Short name *</span><input id="shp-short" class="form-control" maxlength="4" required/></label>
      <label class="full"><span class="form-label">Description</span><textarea id="shp-desc" class="form-control" rows="2"></textarea></label>
      <label><span class="form-label">Currency *</span><select id="shp-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Decimal places</span><input id="shp-decimals" type="number" min="0" max="6" value="2" class="form-control"/></label>
      <label><span class="form-label">Total shares issued *</span><input id="shp-total" type="number" min="1" class="form-control" required/></label>
      <label><span class="form-label">Unit price *</span><input id="shp-unit-price" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label><span class="form-label">Min shares per client</span><input id="shp-min-shares" type="number" min="1" class="form-control"/></label>
      <label><span class="form-label">Nominal shares per client</span><input id="shp-nom-shares" type="number" min="1" class="form-control"/></label>
      <label><span class="form-label">Max shares per client</span><input id="shp-max-shares" type="number" min="1" class="form-control"/></label>
      <label><span class="form-label">Lock-in period (months)</span><input id="shp-lockin" type="number" min="0" class="form-control"/></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="shp-allow-dividends"/> <span>Allow dividends for inactive clients</span></label>
      <label class="full"><span class="form-label">Accounting rule</span><select id="shp-accounting" class="form-control"><option value="1">None</option><option value="2">Cash</option></select></label>
      <div class="full" id="shp-gl-wrap" style="display:none">
        <div class="form-grid">
          ${glSelect('gl-shp-shares-ref',  'Shares Reference *', true)}
          ${glSelect('gl-shp-shares-susp', 'Shares Suspense *', true)}
          ${glSelect('gl-shp-income-fees', 'Income from Fees')}
        </div>
      </div>
    </div>`, true);

  el.querySelector('#shp-accounting').addEventListener('change', e => {
    el.querySelector('#shp-gl-wrap').style.display = e.target.value !== '1' ? '' : 'none';
  });
  await populateGl(el);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'shp-name'); const shortName = v(el,'shp-short'); const currencyCode = v(el,'shp-currency');
    const totalShares = vi(el,'shp-total'); const unitPrice = vf(el,'shp-unit-price');
    if (!name || !shortName || !currencyCode || !totalShares || !unitPrice) { toast('warn','Fill required fields',''); return; }
    const accountingRule = vi(el,'shp-accounting') || 1;
    const payload = {
      name, shortName, currencyCode, locale: LOCALE,
      digitsAfterDecimal: vi(el,'shp-decimals')??2,
      totalShares, unitPrice,
      minimumShares: vi(el,'shp-min-shares')||undefined,
      nominalShares: vi(el,'shp-nom-shares')||undefined,
      maximumShares: vi(el,'shp-max-shares')||undefined,
      lockinPeriodFrequency: vi(el,'shp-lockin')||undefined,
      lockinPeriodFrequencyType: vi(el,'shp-lockin') ? 2 : undefined,
      allowDividendCalculationForInactiveClients: vb(el,'shp-allow-dividends'),
      accountingRule,
      description: v(el,'shp-desc')||undefined
    };
    if (accountingRule !== 1) {
      const sr = vi(el,'gl-shp-shares-ref'); const ss = vi(el,'gl-shp-shares-susp');
      if (!sr || !ss) { toast('warn','Fill required GL accounts',''); return; }
      payload.shareReferenceId = sr; payload.shareSuspenseId = ss;
      const fees = vi(el,'gl-shp-income-fees'); if (fees) payload.shareEquityId = fees;
    }
    try {
      await api.shareProducts.create(payload);
      el.remove(); toast('success','Share product created',name); reload(4);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-6  CHARGE
// ════════════════════════════════════════════════════════════
async function openChargeModal(reload) {
  let tpl = {};
  try { tpl = await api.charges.template(); } catch {}
  const currencies    = (tpl.currencyOptions||[]).map(o=>`<option value="${o.code}">${escapeHtml(o.name)} (${o.code})</option>`).join('');
  const chargeApplies = (tpl.chargeAppliesToOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || `<option value="1">Loan</option><option value="2">Savings</option><option value="3">Client</option><option value="4">Share</option>`;
  const chargeTime    = (tpl.chargeTimeTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || `<option value="1">Disbursement</option><option value="2">Specified due date</option><option value="4">Repayment</option>`;
  const chargeCalc    = (tpl.chargeCalculationTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || `<option value="1">Flat</option><option value="2">% of Amount</option>`;

  const mid = `chg-modal-${Date.now()}`;
  const el = modal(mid, 'New Charge', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Charge name *</span><input id="chg-name" class="form-control" required/></label>
      <label><span class="form-label">Applies to *</span><select id="chg-applies" class="form-control" required>${chargeApplies}</select></label>
      <label><span class="form-label">Currency *</span><select id="chg-currency" class="form-control" required><option value="">Select…</option>${currencies}</select></label>
      <label><span class="form-label">Charge time type *</span><select id="chg-time" class="form-control" required>${chargeTime}</select></label>
      <label><span class="form-label">Calculation type *</span><select id="chg-calc" class="form-control" required>${chargeCalc}</select></label>
      <label><span class="form-label">Amount *</span><input id="chg-amount" type="number" min="0" step="0.01" class="form-control" required/></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="chg-penalty"/> <span>Is a penalty charge</span></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="chg-active" checked/> <span>Active</span></label>
    </div>`);

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'chg-name'); const chargeAppliesTo = vi(el,'chg-applies'); const currencyCode = v(el,'chg-currency');
    const chargeTimeType = vi(el,'chg-time'); const chargeCalculationType = vi(el,'chg-calc'); const amount = vf(el,'chg-amount');
    if (!name || !chargeAppliesTo || !currencyCode || !chargeTimeType || !chargeCalculationType || amount === null) { toast('warn','Fill required fields',''); return; }
    try {
      await api.charges.create({ name, chargeAppliesTo, currencyCode, chargeTimeType, chargeCalculationType, amount,
        penalty: vb(el,'chg-penalty'), active: vb(el,'chg-active'), locale: LOCALE });
      el.remove(); toast('success','Charge created',name); reload(5);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-7  FLOATING RATE
// ════════════════════════════════════════════════════════════
function openFloatingRateModal(reload) {
  const mid = `fr-modal-${Date.now()}`;
  const el = modal(mid, 'New Floating Rate', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Rate name *</span><input id="fr-name" class="form-control" required/></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="fr-base"/> <span>Is base lending rate</span></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="fr-active" checked/> <span>Active</span></label>
      <div class="full">
        <h4 class="mb-2" style="font-size:13px;font-weight:600">Rate Periods</h4>
        <div id="fr-periods">
          <div class="fr-period form-grid" style="border:1px solid var(--color-border-secondary);border-radius:6px;padding:12px;margin-bottom:8px">
            <label><span class="form-label">From date *</span><input type="date" class="form-control fr-from" value="${today()}" required/></label>
            <label><span class="form-label">Interest rate (%) *</span><input type="number" class="form-control fr-rate" min="0" step="0.01" required/></label>
          </div>
        </div>
        <button type="button" class="btn-ghost btn-sm mt-2" id="fr-add-period"><i class="fa-solid fa-plus"></i> Add Period</button>
      </div>
    </div>`);

  el.querySelector('#fr-add-period').addEventListener('click', () => {
    el.querySelector('#fr-periods').insertAdjacentHTML('beforeend', `
      <div class="fr-period form-grid" style="border:1px solid var(--color-border-secondary);border-radius:6px;padding:12px;margin-bottom:8px">
        <label><span class="form-label">From date *</span><input type="date" class="form-control fr-from" value="${today()}" required/></label>
        <label><span class="form-label">Interest rate (%) *</span><input type="number" class="form-control fr-rate" min="0" step="0.01" required/></label>
        <label class="full" style="justify-content:flex-end"><button type="button" class="btn-ghost btn-sm fr-remove"><i class="fa-solid fa-trash"></i> Remove</button></label>
      </div>`);
    el.querySelectorAll('.fr-remove').forEach(b => b.addEventListener('click', () => b.closest('.fr-period').remove()));
  });

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'fr-name');
    if (!name) { toast('warn','Enter a rate name',''); return; }
    const ratePeriods = [...el.querySelectorAll('.fr-period')].map(row => ({
      fromDate: row.querySelector('.fr-from').value,
      interestRate: parseFloat(row.querySelector('.fr-rate').value)
    })).filter(p => p.fromDate && !isNaN(p.interestRate));
    if (!ratePeriods.length) { toast('warn','Add at least one rate period',''); return; }
    try {
      await api.floatingRates.create({ name, isBaseLendingRate: vb(el,'fr-base'), isActive: vb(el,'fr-active'),
        ratePeriods, locale: LOCALE, dateFormat: DATE_FORMAT });
      el.remove(); toast('success','Floating rate created',name); reload(6);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-8  TAX COMPONENT + TAX GROUP
// ════════════════════════════════════════════════════════════
async function openTaxModal(reload) {
  const glOpts = await glOptions();
  const mid = `tax-modal-${Date.now()}`;
  const el = modal(mid, 'New Tax', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Type *</span>
        <select id="tax-type" class="form-control">
          <option value="component">Tax Component</option>
          <option value="group">Tax Group</option>
        </select></label>
      <div id="tax-component-wrap" class="full form-grid">
        <label><span class="form-label">Component name *</span><input id="tc-name" class="form-control"/></label>
        <label><span class="form-label">Percentage *</span><input id="tc-pct" type="number" min="0" max="100" step="0.01" class="form-control"/></label>
        <label><span class="form-label">Start date *</span><input type="date" id="tc-start" class="form-control" value="${today()}"/></label>
        <label class="full"><span class="form-label">Credit account *</span>
          <select id="gl-tc-credit" class="form-control"><option value="">— Select GL account —</option>${glOpts}</select></label>
        <label class="full"><span class="form-label">Debit account *</span>
          <select id="gl-tc-debit" class="form-control"><option value="">— Select GL account —</option>${glOpts}</select></label>
      </div>
      <div id="tax-group-wrap" class="full form-grid" style="display:none">
        <label class="full"><span class="form-label">Group name *</span><input id="tg-name" class="form-control"/></label>
        <label class="full"><span class="form-label">Start date *</span><input type="date" id="tg-start" class="form-control" value="${today()}"/></label>
      </div>
    </div>`);

  el.querySelector('#tax-type').addEventListener('change', (e) => {
    el.querySelector('#tax-component-wrap').style.display = e.target.value === 'component' ? '' : 'none';
    el.querySelector('#tax-group-wrap').style.display     = e.target.value === 'group'     ? '' : 'none';
  });

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const type = v(el,'tax-type');
    try {
      if (type === 'component') {
        const name = v(el,'tc-name'); const pct = vf(el,'tc-pct'); const startDate = v(el,'tc-start');
        const creditAccountId = vi(el,'gl-tc-credit'); const debitAccountId = vi(el,'gl-tc-debit');
        if (!name || pct === null || !startDate || !creditAccountId || !debitAccountId) { toast('warn','Fill required fields',''); return; }
        await api.taxComponents.create({ name, percentage: pct, startDate, dateFormat: DATE_FORMAT, locale: LOCALE, creditAccountType: 2, creditAccountId, debitAccountType: 2, debitAccountId });
      } else {
        const name = v(el,'tg-name'); const startDate = v(el,'tg-start');
        if (!name || !startDate) { toast('warn','Fill required fields',''); return; }
        await api.taxGroups.create({ name, startDate, dateFormat: DATE_FORMAT, locale: LOCALE });
      }
      el.remove(); toast('success','Tax created',''); reload(7);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// P4-9  DELINQUENCY BUCKET + RANGE
// ════════════════════════════════════════════════════════════
function openDelinquencyModal(reload) {
  const mid = `dlq-modal-${Date.now()}`;
  const el = modal(mid, 'New Delinquency Bucket', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Bucket name *</span><input id="dlq-name" class="form-control" required/></label>
      <div class="full">
        <h4 class="mb-2" style="font-size:13px;font-weight:600">Delinquency Ranges</h4>
        <div id="dlq-ranges">
          <div class="dlq-range form-grid" style="border:1px solid var(--color-border-secondary);border-radius:6px;padding:12px;margin-bottom:8px">
            <label><span class="form-label">Classification *</span><input class="form-control dlq-class" placeholder="e.g. Standard"/></label>
            <label><span class="form-label">Min age (days) *</span><input type="number" class="form-control dlq-min" min="0"/></label>
            <label><span class="form-label">Max age (days)</span><input type="number" class="form-control dlq-max" min="0" placeholder="Leave blank for ∞"/></label>
          </div>
        </div>
        <button type="button" class="btn-ghost btn-sm mt-2" id="dlq-add-range"><i class="fa-solid fa-plus"></i> Add Range</button>
      </div>
    </div>`);

  el.querySelector('#dlq-add-range').addEventListener('click', () => {
    el.querySelector('#dlq-ranges').insertAdjacentHTML('beforeend', `
      <div class="dlq-range form-grid" style="border:1px solid var(--color-border-secondary);border-radius:6px;padding:12px;margin-bottom:8px">
        <label><span class="form-label">Classification *</span><input class="form-control dlq-class" placeholder="e.g. Substandard"/></label>
        <label><span class="form-label">Min age (days) *</span><input type="number" class="form-control dlq-min" min="0"/></label>
        <label><span class="form-label">Max age (days)</span><input type="number" class="form-control dlq-max" min="0" placeholder="Leave blank for ∞"/></label>
        <label style="justify-content:flex-end"><button type="button" class="btn-ghost btn-sm dlq-remove"><i class="fa-solid fa-trash"></i></button></label>
      </div>`);
    el.querySelectorAll('.dlq-remove').forEach(b => b.addEventListener('click', () => b.closest('.dlq-range').remove()));
  });

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'dlq-name');
    if (!name) { toast('warn','Enter a bucket name',''); return; }
    try {
      const bucket = await api.delinquencyBuckets.create({ name });
      const bucketId = bucket.resourceId || bucket.id;
      const ranges = [...el.querySelectorAll('.dlq-range')].map(row => ({
        classification: row.querySelector('.dlq-class').value.trim(),
        minimumAgeDays: parseInt(row.querySelector('.dlq-min').value)||0,
        maximumAgeDays: row.querySelector('.dlq-max').value ? parseInt(row.querySelector('.dlq-max').value) : undefined
      })).filter(r => r.classification);
      await Promise.all(ranges.map(r => api.delinquencyBuckets.createRange({ ...r, delinquencyBucketId: bucketId })));
      el.remove(); toast('success','Delinquency bucket created',name); reload(8);
    } catch (e) { toast('error','Create failed',e.message); }
  });
}
