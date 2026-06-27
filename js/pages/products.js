import { LOCALE, DATE_FORMAT, today } from '../config.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

// ── shared GL picker helper (unchanged) ──────────────────────
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
  return `
    <label>${label}${required ? ' *' : ''}
      <select id="${id}" class="form-control" ${required ? 'required' : ''}>
        <option value="">— Select GL account —</option>
      </select>
    </label>`;
}

async function populateGl(el) {
  const opts = await glOptions();
  el.querySelectorAll('select[id^="gl-"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Select GL account —</option>' + opts;
    if (cur) sel.value = cur;
  });
}

function modal(mid, title, bodyHtml, wide = false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal ${wide ? 'modal-lg' : 'modal-md'}">
        <div class="modal-header"><h3>${title}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);
  const elv = document.getElementById(mid);
  elv.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => elv.remove()));
  return elv;
}

const v  = (el, id) => el.querySelector('#' + id)?.value?.trim() || '';
const vi = (el, id) => { const n = parseInt(v(el, id)); return isNaN(n) ? null : n; };
const vf = (el, id) => { const n = parseFloat(v(el, id)); return isNaN(n) ? null : n; };
const vb = (el, id) => el.querySelector('#' + id)?.checked ?? false;

// ── Tab layout (Charges removed, Product Mix added) ──────────
const TABS = [
  'Loan Products',
  'Saving Products',
  'Fixed Deposits',
  'Recurring Deposits',
  'Share Products',
  'Product Mix',
  'Floating Rates',
  'Tax',
  'Delinquency'
];

export async function render(c) {
  _glCache = null;

  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Products</h1>
        <div class="text-muted">Loan, savings, deposit, share & support catalogs</div>
      </div>
      <div class="page-actions">
        <a href="#/charges" class="btn-secondary"><i class="fa-solid fa-tags"></i> Manage Charges</a>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="prod-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="pr-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="pr-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
  }));

  // Loader registry — Path B: Charges removed, Product Mix added at index 5
  const loaders = [
    {
      key: 0, label: 'Loan Product', perm: 'LOANPRODUCT',
      fn: () => api.loanProducts.list(),
      cols: ['Name','Short Name','Principal','Rate'],
      row: p => [p.name, p.shortName, fmt(p.principal || 0), `${p.interestRatePerPeriod || 0}%`],
      newFn: () => openLoanProductModal(null, () => reload(0)),
      editFn: (id) => openLoanProductModal(id, () => reload(0)),
      deleteFn: (id) => api.loanProducts.delete(id)
    },
    {
      key: 1, label: 'Savings Product', perm: 'SAVINGSPRODUCT',
      fn: () => api.savingsProducts.list(),
      cols: ['Name','Short Name','Nominal Rate'],
      row: p => [p.name, p.shortName, `${p.nominalAnnualInterestRate || 0}%`],
      newFn: () => openSavingsProductModal(null, () => reload(1)),
      editFn: (id) => openSavingsProductModal(id, () => reload(1)),
      deleteFn: (id) => api.savingsProducts.delete(id)
    },
    {
      key: 2, label: 'FD Product', perm: 'FIXEDDEPOSITPRODUCT',
      fn: () => api.fdProducts.list(),
      cols: ['Name','Short Name','Min Deposit'],
      row: p => [p.name, p.shortName, fmt(p.minDepositAmount || 0)],
      newFn: () => openFDProductModal(null, () => reload(2)),
      editFn: (id) => openFDProductModal(id, () => reload(2)),
      deleteFn: (id) => api.fdProducts.delete(id)
    },
    {
      key: 3, label: 'RD Product', perm: 'RECURRINGDEPOSITPRODUCT',
      fn: () => api.rdProducts.list(),
      cols: ['Name','Short Name','Mandatory Deposit'],
      row: p => [p.name, p.shortName, fmt(p.mandatoryRecommendedDepositAmount || 0)],
      newFn: () => openRDProductModal(null, () => reload(3)),
      editFn: (id) => openRDProductModal(id, () => reload(3)),
      deleteFn: (id) => api.rdProducts.delete(id)
    },
    {
      key: 4, label: 'Share Product', perm: 'SHAREPRODUCT',
      fn: () => api.shareProducts.list(),
      cols: ['Name','Short Name','Unit Price'],
      row: p => [p.name, p.shortName, fmt(p.unitPrice || 0)],
      newFn: () => openShareProductModal(null, () => reload(4)),
      editFn: (id) => openShareProductModal(id, () => reload(4)),
      deleteFn: (id) => api.shareProducts.delete(id)
    },
    {
      key: 5, label: 'Product Mix', perm: 'LOANPRODUCT',
      fn: () => loadProductMixList(),
      cols: ['Loan Product','Restricted Products'],
      row: p => [p.name, (p._mixCount > 0) ? `${p._mixCount} restricted` : '—'],
      newFn: () => openProductMixModal(null, () => reload(5)),
      editFn: (id) => openProductMixModal(id, () => reload(5)),
      deleteFn: (id) => api.productMix.delete(id),
      _customActions: true
    },
    {
      key: 6, label: 'Floating Rate', perm: 'FLOATINGRATE',
      fn: () => api.floatingRates.list(),
      cols: ['Name','Base Rate','Active'],
      row: p => [p.name, p.isBaseLendingRate ? 'Yes' : 'No', p.active !== false ? 'Yes' : 'No'],
      newFn: () => openFloatingRateModal(null, () => reload(6)),
      editFn: (id) => openFloatingRateModal(id, () => reload(6)),
      deleteFn: (id) => api.floatingRates.delete(id)
    },
    {
      key: 7, label: 'Tax', perm: 'TAXCOMPONENT',
      fn: async () => {
        const [tc, tg] = await Promise.all([api.taxComponents.list(), api.taxGroups.list()]);
        return [
          ...(Array.isArray(tc) ? tc : []).map(x => ({ ...x, _type: 'Component' })),
          ...(Array.isArray(tg) ? tg : []).map(x => ({ ...x, _type: 'Group' }))
        ];
      },
      cols: ['Name','Type'],
      row: p => [p.name, p._type],
      newFn: () => openTaxModal(null, null, () => reload(7)),
      editFn: (id, item) => openTaxModal(item._type === 'Component' ? 'component' : 'group', id, () => reload(7)),
      // Tax CRUD: components/groups don't expose DELETE in Fineract — handled via deactivation
      deleteFn: null
    },
    {
      key: 8, label: 'Delinquency Bucket', perm: 'DELINQUENCY_BUCKET',
      fn: async () => {
        const [b, r] = await Promise.all([api.delinquencyBuckets.list(), api.delinquencyBuckets.ranges()]);
        return (Array.isArray(b) ? b : []).map(bk => ({
          ...bk,
          _ranges: (Array.isArray(r) ? r : []).filter(x => x.delinquencyBucketId === bk.id)
        }));
      },
      cols: ['Bucket Name', 'Ranges'],
      row: p => [
        p.name,
        (p._ranges || []).map(r => `${r.classification || r.minimumAgeDays + 'd'}`).join(', ') || '—'
      ],
      newFn: () => openDelinquencyModal(null, () => reload(8)),
      editFn: (id) => openDelinquencyModal(id, () => reload(8)),
      deleteFn: (id) => api.delinquencyBuckets.delete(id)
    }
  ];

  async function reload(key) {
    const cfg = loaders[key];
    const pane = c.querySelector('#pr-' + key);
    pane.innerHTML = '<div class="empty-state-row">Loading…</div>';
    try {
      const res = await cfg.fn();
      const list = Array.isArray(res) ? res : [];

      const canNew    = can('CREATE_' + cfg.perm);
      const canEdit   = can('UPDATE_' + cfg.perm);
      const canDelete = can('DELETE_' + cfg.perm) && !!cfg.deleteFn;

      pane.innerHTML = `
        <div class="section-header mb-2">
          <div>
            <h3>${cfg.label}s</h3>
            <span class="text-muted">${list.length} ${cfg.label.toLowerCase()}${list.length !== 1 ? 's' : ''}</span>
          </div>
          ${canNew ? `<button class="btn-primary" data-new-btn="${cfg.key}"><i class="fa-solid fa-plus"></i> New ${cfg.label}</button>` : ''}
        </div>

        <table class="table">
          <thead><tr>
            ${cfg.cols.map(h => `<th>${h}</th>`).join('')}
            <th>Active</th>
            <th></th>
          </tr></thead>
          <tbody>${list.length ? list.map((p, i) => `
            <tr>
              ${cfg.row(p).map(val => `<td>${escapeHtml(String(val ?? '—'))}</td>`).join('')}
              <td>${p.active === false ? sb('Inactive') : sb('Active')}</td>
              <td class="text-right">
                ${canEdit ? `<button class="btn-mini" data-edit-row="${i}">Edit</button>` : ''}
                ${canDelete ? `<button class="btn-mini btn-danger" data-del-row="${i}">Delete</button>` : ''}
              </td>
            </tr>`).join('') : `
            <tr><td colspan="${cfg.cols.length + 2}" class="empty-state-row">No ${cfg.label.toLowerCase()}s</td></tr>`}
          </tbody>
        </table>`;

      pane.querySelector(`[data-new-btn="${cfg.key}"]`)?.addEventListener('click', () => cfg.newFn());

      pane.querySelectorAll('[data-edit-row]').forEach(b => b.addEventListener('click', () => {
        const item = list[parseInt(b.dataset.editRow)];
        if (item) cfg.editFn(item.id, item);
      }));

      pane.querySelectorAll('[data-del-row]').forEach(b => b.addEventListener('click', async () => {
        const item = list[parseInt(b.dataset.delRow)];
        if (!item) return;
        if (!await modalConfirm({
          title: `Delete ${cfg.label.toLowerCase()}?`,
          message: 'This will fail if any account uses this product.',
          danger: true, confirmText: 'Delete'
        })) return;
        try {
          await cfg.deleteFn(item.id);
          toast('success', `${cfg.label} deleted`, item.name || '');
          reload(cfg.key);
        } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
      }));
    } catch (e) {
      pane.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
    }
  }

  await Promise.all(loaders.map(l => reload(l.key)));
}

/* ============================================================
   PRODUCT MIX HELPERS (used by tab #5)
   ============================================================ */
async function loadProductMixList() {
  // Mix is per loan product. List loan products and count their mix entries.
  const products = await api.loanProducts.list().catch(() => []);
  const list = Array.isArray(products) ? products : [];
  // For perf: don't pre-fetch every mix on list. Counts come from `productMixes` association if present
  return list.map(p => ({
    id: p.id,
    name: p.name,
    _mixCount: Array.isArray(p.productMixes) ? p.productMixes.length : 0
  }));
}

/* ============================================================
   P4-1 LOAN PRODUCT — now supports Edit
   ============================================================ */
async function openLoanProductModal(productId, onSuccess) {
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

/* ============================================================
   P4-2 SAVINGS PRODUCT — now supports Edit
   ============================================================ */
async function openSavingsProductModal(productId, onSuccess) {
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

/* ============================================================
   P4-3 FD PRODUCT — now supports Edit (same shape as create, fields pre-filled)
   ============================================================ */
async function openFDProductModal(productId, onSuccess) {
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


/* ============================================================
   P4-4 RD PRODUCT — now supports Edit
   ============================================================ */
async function openRDProductModal(productId, onSuccess) {
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

/* ============================================================
   P4-5 SHARE PRODUCT — now supports Edit
   ============================================================ */
async function openShareProductModal(productId, onSuccess) {
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

/* ============================================================
   P4-6 FLOATING RATE — now supports Edit + range editor
   ============================================================ */
async function openFloatingRateModal(rateId, onSuccess) {
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

/* ============================================================
   P4-8 TAX — now supports Edit (branches by type)
   ============================================================ */
async function openTaxModal(forceType, taxId, onSuccess) {
  const isEdit = !!taxId;
  const glOpts = await glOptions();

  // On edit, fetch the right entity based on forceType
  let existing = {};
  if (isEdit) {
    try {
      existing = forceType === 'component'
        ? await api.taxComponents.get(taxId)
        : await api.taxGroups.get(taxId);
    } catch {}
  }

  const initialType = forceType || 'component';
  const mid = 'tax-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Tax' : 'New Tax', `
    <label>Type *
      <select id="tax-type" class="form-control" ${isEdit ? 'disabled' : ''} required>
        <option value="component" ${initialType === 'component' ? 'selected' : ''}>Tax Component</option>
        <option value="group"     ${initialType === 'group' ? 'selected' : ''}>Tax Group</option>
      </select>
    </label>

    <div id="tax-component-wrap" style="${initialType === 'component' ? '' : 'display:none'}">
      <h4 class="mt-3">Component Details</h4>
      <div class="form-grid">
        <label>Component name * <input id="tc-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
        <label>Percentage * <input type="number" step="0.01" id="tc-pct" class="form-control" value="${existing.percentage ?? ''}" required/></label>
        <label>Start date * <input type="date" id="tc-start" class="form-control" value="${existing.startDate ? (Array.isArray(existing.startDate) ? existing.startDate.join('-') : existing.startDate) : today()}" required/></label>
        <label>Credit account *
          <select id="gl-tc-credit" class="form-control" required>
            <option value="">— Select GL account —</option>${glOpts}
          </select>
        </label>
        <label>Debit account *
          <select id="gl-tc-debit" class="form-control" required>
            <option value="">— Select GL account —</option>${glOpts}
          </select>
        </label>
      </div>
    </div>

    <div id="tax-group-wrap" style="${initialType === 'group' ? '' : 'display:none'}">
      <h4 class="mt-3">Group Details</h4>
      <div class="form-grid">
        <label>Group name * <input id="tg-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
        <label>Start date * <input type="date" id="tg-start" class="form-control" value="${today()}" required/></label>
      </div>
      <div class="text-muted small mt-2">
        <i class="fa-solid fa-circle-info"></i>
        Add tax components to this group after creation under the group's detail view (managed via API).
      </div>
    </div>`);

  el.querySelector('#tax-type').addEventListener('change', (e) => {
    el.querySelector('#tax-component-wrap').style.display = e.target.value === 'component' ? '' : 'none';
    el.querySelector('#tax-group-wrap').style.display = e.target.value === 'group' ? '' : 'none';
  });

  // Pre-fill component-specific GL fields on edit
  if (isEdit && initialType === 'component') {
    if (existing.creditAccount?.id) el.querySelector('#gl-tc-credit').value = String(existing.creditAccount.id);
    if (existing.debitAccount?.id)  el.querySelector('#gl-tc-debit').value  = String(existing.debitAccount.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const type = v(el, 'tax-type');
    try {
      if (type === 'component') {
        const name = v(el, 'tc-name');
        const pct = vf(el, 'tc-pct');
        const startDate = v(el, 'tc-start');
        const creditAccountId = vi(el, 'gl-tc-credit');
        const debitAccountId  = vi(el, 'gl-tc-debit');

        if (!name || pct === null || !startDate || !creditAccountId || !debitAccountId) {
          toast('warn', 'Fill required fields', '');
          return;
        }

        const payload = {
          name, percentage: pct, startDate,
          dateFormat: DATE_FORMAT, locale: LOCALE,
          creditAccountType: 2, creditAccountId,
          debitAccountType: 2, debitAccountId
        };

        if (isEdit) await api.taxComponents.update(taxId, payload);
        else        await api.taxComponents.create(payload);
      } else {
        const name = v(el, 'tg-name');
        const startDate = v(el, 'tg-start');

        if (!name || !startDate) {
          toast('warn', 'Fill required fields', '');
          return;
        }

        const payload = { name, startDate, dateFormat: DATE_FORMAT, locale: LOCALE };

        if (isEdit) await api.taxGroups.update(taxId, payload);
        else        await api.taxGroups.create(payload);
      }
      el.remove();
      toast('success', isEdit ? 'Tax updated' : 'Tax created', '');
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

/* ============================================================
   P4-9 DELINQUENCY BUCKET + RANGE — now supports Edit
   ============================================================ */
async function openDelinquencyModal(bucketId, onSuccess) {
  const isEdit = !!bucketId;
  let existing = {};
  let existingRanges = [];

  if (isEdit) {
    try {
      existing = await api.delinquencyBuckets.get(bucketId);
      const allRanges = await api.delinquencyBuckets.ranges();
      existingRanges = (Array.isArray(allRanges) ? allRanges : [])
        .filter(r => r.delinquencyBucketId === parseInt(bucketId));
    } catch {}
  }

  const rangeRow = (r = {}) => `
    <div class="dlq-range form-grid" style="margin-bottom:8px" ${r.id ? `data-range-id="${r.id}"` : ''}>
      <label>Classification * <input class="form-control dlq-class" value="${escapeHtml(r.classification || '')}" required/></label>
      <label>Min age (days) * <input type="number" class="form-control dlq-min" value="${r.minimumAgeDays ?? ''}" required/></label>
      <label>Max age (days) <input type="number" class="form-control dlq-max" value="${r.maximumAgeDays ?? ''}"/></label>
      <button type="button" class="btn-mini btn-danger dlq-remove">Remove</button>
    </div>`;

  const initialRangesHtml = existingRanges.length
    ? existingRanges.map(r => rangeRow(r)).join('')
    : rangeRow();

  const mid = 'dlq-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Delinquency Bucket' : 'New Delinquency Bucket', `
    <label>Bucket name * <input id="dlq-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>

    <h4 class="mt-3">Delinquency Ranges</h4>
    ${isEdit ? `<div class="msg-banner b-info mb-2">
      <i class="fa-solid fa-circle-info"></i>
      Existing ranges are pre-filled. Add new rows below to create additional ranges. Remove rows to mark for deletion.
    </div>` : ''}
    <div id="dlq-ranges">${initialRangesHtml}</div>
    <button class="btn-secondary btn-sm mt-2" id="dlq-add-range"><i class="fa-solid fa-plus"></i> Add Range</button>`);

  const wireRemove = () => {
    el.querySelectorAll('.dlq-remove').forEach(b => {
      if (!b.dataset.wired) {
        b.dataset.wired = '1';
        b.addEventListener('click', () => b.closest('.dlq-range').remove());
      }
    });
  };
  wireRemove();

  el.querySelector('#dlq-add-range').addEventListener('click', () => {
    el.querySelector('#dlq-ranges').insertAdjacentHTML('beforeend', rangeRow());
    wireRemove();
  });

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'dlq-name');
    if (!name) { toast('warn', 'Enter a bucket name', ''); return; }

    const rangesInForm = [...el.querySelectorAll('.dlq-range')].map(row => ({
      _existingId: row.dataset.rangeId ? parseInt(row.dataset.rangeId) : null,
      classification: row.querySelector('.dlq-class').value.trim(),
      minimumAgeDays: parseInt(row.querySelector('.dlq-min').value) || 0,
      maximumAgeDays: row.querySelector('.dlq-max').value
        ? parseInt(row.querySelector('.dlq-max').value)
        : undefined
    })).filter(r => r.classification);

    try {
      let workingBucketId;

      if (isEdit) {
        // Update bucket name
        await api.delinquencyBuckets.update(bucketId, { name });
        workingBucketId = parseInt(bucketId);

        // Reconcile ranges: delete removed, update existing, create new
        const formExistingIds = new Set(rangesInForm.filter(r => r._existingId).map(r => r._existingId));
        const removedRanges = existingRanges.filter(er => !formExistingIds.has(er.id));

        for (const er of removedRanges) {
          try { await api.delinquencyBuckets.deleteRange(er.id); } catch {}
        }
        for (const r of rangesInForm) {
          const body = {
            classification: r.classification,
            minimumAgeDays: r.minimumAgeDays,
            maximumAgeDays: r.maximumAgeDays,
            delinquencyBucketId: workingBucketId
          };
          if (r._existingId) {
            try { await api.delinquencyBuckets.updateRange(r._existingId, body); } catch {}
          } else {
            try { await api.delinquencyBuckets.createRange(body); } catch {}
          }
        }
      } else {
        // Create bucket then create ranges
        const created = await api.delinquencyBuckets.create({ name });
        workingBucketId = created.resourceId || created.id;
        await Promise.all(rangesInForm.map(r =>
          api.delinquencyBuckets.createRange({
            classification: r.classification,
            minimumAgeDays: r.minimumAgeDays,
            maximumAgeDays: r.maximumAgeDays,
            delinquencyBucketId: workingBucketId
          })
        ));
      }

      el.remove();
      toast('success', isEdit ? 'Delinquency bucket updated' : 'Delinquency bucket created', name);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

/* ============================================================
   PRODUCT MIX MODAL (NEW — audit gap closed)
   ============================================================ */
async function openProductMixModal(loanProductId, onSuccess) {
  const isEdit = !!loanProductId;

  // Fetch all loan products to populate pickers
  let allProducts = [];
  try {
    const r = await api.loanProducts.list();
    allProducts = Array.isArray(r) ? r : [];
  } catch {}

  let primaryProduct = null;
  let restrictedIds = new Set();

  if (isEdit) {
    primaryProduct = allProducts.find(p => p.id === parseInt(loanProductId));
    try {
      const mix = await api.productMix.get(loanProductId);
      const restricted = mix?.restrictedProducts || mix?.productMixes || [];
      restrictedIds = new Set(restricted.map(rp => rp.restrictedProductId || rp.id));
    } catch {}
  }

  // Build select options (exclude primary product from restricted list)
  const restrictableOptions = allProducts
    .filter(p => !primaryProduct || p.id !== primaryProduct.id)
    .map(p => `
      <label class="checkbox-row" style="display:block; padding:6px 0">
        <input type="checkbox" class="mix-restrict" value="${p.id}" ${restrictedIds.has(p.id) ? 'checked' : ''}/>
        ${escapeHtml(p.name)} <span class="text-muted small">(${escapeHtml(p.shortName || '')})</span>
      </label>`).join('');

  const primaryPicker = isEdit
    ? `<input class="form-control" value="${escapeHtml(primaryProduct?.name || '')}" disabled/>`
    : `<select id="mix-primary" class="form-control" required>
         <option value="">Select…</option>
         ${allProducts.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
       </select>`;

  const mid = 'mix-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Product Mix' : 'New Product Mix', `
    <div class="msg-banner b-info mb-2">
      <i class="fa-solid fa-circle-info"></i>
      A product mix defines which other loan products a client cannot hold simultaneously with the primary product.
    </div>

    <label>Primary Loan Product *</label>
    ${primaryPicker}

    <h4 class="mt-3">Restricted Products</h4>
    <div class="text-muted small mb-2">Check products that cannot coexist with the primary product on the same client.</div>
    <div id="mix-restricted-list" style="max-height:300px; overflow:auto; border:1px solid var(--border); padding:8px; border-radius:4px">
      ${restrictableOptions || '<div class="text-muted">No other loan products available</div>'}
    </div>`, true);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const primaryId = isEdit ? parseInt(loanProductId) : vi(el, 'mix-primary');
    if (!primaryId) { toast('warn', 'Select primary product', ''); return; }

    const checked = [...el.querySelectorAll('.mix-restrict:checked')].map(cb => parseInt(cb.value));

    try {
      // Fineract product-mix payload uses `restrictedProducts: [id, id, ...]`
      const payload = { restrictedProducts: checked };
      if (isEdit) await api.productMix.update(primaryId, payload);
      else        await api.productMix.create(primaryId, payload);
      el.remove();
      toast('success', isEdit ? 'Product mix updated' : 'Product mix created', '');
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}
