import { LOCALE, DATE_FORMAT } from '../config.js';

/* FinCraft · charges.js — Master charges catalog (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

// Fineract `chargeAppliesTo` enum values
const APPLIES_TO_OPTIONS = [
  { id: 1, name: 'Loan' },
  { id: 2, name: 'Savings' },
  { id: 3, name: 'Client' },
  { id: 4, name: 'Group' },
  { id: 5, name: 'Share' },
  { id: 7, name: 'Share Account' }
];

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Charges</h1>
        <div class="text-muted">Master catalog of fees, penalties, and product-applicable charges</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_CHARGE') ? `<button class="btn-primary" id="ch-new"><i class="fa-solid fa-plus"></i> New Charge</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value" id="ch-active">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Inactive</div><div class="kpi-value" id="ch-inactive">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Penalty Charges</div><div class="kpi-value" id="ch-penalty">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value" id="ch-total">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="ch-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="ch-applies" class="form-control">
          <option value="">All Applies-To</option>
          ${APPLIES_TO_OPTIONS.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
        </select>
        <select id="ch-active-filter" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select id="ch-penalty-filter" class="form-control">
          <option value="">Fee + Penalty</option>
          <option value="fee">Fee only</option>
          <option value="penalty">Penalty only</option>
        </select>
        <button class="btn-secondary" id="ch-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Name</th><th>Applies To</th><th>Currency</th>
          <th class="text-right">Amount</th>
          <th>Calculation</th><th>Timing</th>
          <th>Penalty</th><th>Active</th><th></th>
        </tr></thead>
        <tbody id="ch-rows">
          <tr><td colspan="9" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  let allCharges = [];

  async function load() {
    c.querySelector('#ch-rows').innerHTML =
      '<tr><td colspan="9" class="empty-state-row">Loading…</td></tr>';
    try {
      const appliesTo = c.querySelector('#ch-applies')?.value;
      const params = {};
      if (appliesTo) params.chargeAppliesTo = appliesTo;
      const res = await api.charges.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);

      // Client-side filters
      const q = c.querySelector('#ch-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(ch => (ch.name || '').toLowerCase().includes(q));

      const activeF = c.querySelector('#ch-active-filter')?.value;
      if (activeF === 'active')   list = list.filter(ch => ch.active);
      if (activeF === 'inactive') list = list.filter(ch => !ch.active);

      const penaltyF = c.querySelector('#ch-penalty-filter')?.value;
      if (penaltyF === 'penalty') list = list.filter(ch => ch.penalty);
      if (penaltyF === 'fee')     list = list.filter(ch => !ch.penalty);

      allCharges = list;

      // KPIs (computed across the unfiltered server result for accuracy)
      const allRes = await api.charges.list({});
      const all = Array.isArray(allRes) ? allRes : (allRes?.pageItems || []);
      c.querySelector('#ch-active').textContent   = num(all.filter(ch => ch.active).length);
      c.querySelector('#ch-inactive').textContent = num(all.filter(ch => !ch.active).length);
      c.querySelector('#ch-penalty').textContent  = num(all.filter(ch => ch.penalty).length);
      c.querySelector('#ch-total').textContent    = num(all.length);

      draw(list);
    } catch (e) {
      c.querySelector('#ch-rows').innerHTML =
        `<tr><td colspan="9" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function draw(rows) {
    c.querySelector('#ch-rows').innerHTML = rows.length ? rows.map(ch => `
      <tr>
        <td>${ch.id}">${escapeHtml(ch.name || '—')}</a></td>
        <td>${escapeHtml(ch.chargeAppliesTo?.value || '—')}</td>
        <td>${escapeHtml(ch.currency?.code || '—')}</td>
        <td class="text-right">${fmt(ch.amount || 0)}</td>
        <td>${escapeHtml(ch.chargeCalculationType?.value || '—')}</td>
        <td>${escapeHtml(ch.chargeTimeType?.value || '—')}</td>
        <td>${ch.penalty ? '<span class="badge b-warning">Penalty</span>' : '<span class="badge b-info">Fee</span>'}</td>
        <td>${ch.active ? '<span class="badge b-success">Active</span>' : '<span class="badge">Inactive</span>'}</td>
        <td class="text-right">
          ${can('UPDATE_CHARGE') && !ch.active
            ? `<button class="btn-mini btn-success" data-ch-activate="${ch.id}">Activate</button>` : ''}
          ${can('UPDATE_CHARGE') && ch.active
            ? `<button class="btn-mini" data-ch-deactivate="${ch.id}">Deactivate</button>` : ''}
        </td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty-state-row">No charges match</td></tr>';

    c.querySelectorAll('[data-ch-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.charges.update(b.dataset.chActivate, { active: true });
        toast('success', 'Charge activated', '');
        load();
      } catch (e) { toast('error', 'Activate failed', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-ch-deactivate]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Deactivate charge?', confirmText: 'Deactivate' })) return;
      try {
        await api.charges.update(b.dataset.chDeactivate, { active: false });
        toast('success', 'Charge deactivated', '');
        load();
      } catch (e) { toast('error', 'Deactivate failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#ch-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(load, 400);
  });
  ['#ch-applies', '#ch-active-filter', '#ch-penalty-filter'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', load);
  });

  c.querySelector('#ch-new')?.addEventListener('click', () => openChargeFormModal(null, load));

  c.querySelector('#ch-export').addEventListener('click', () => {
    const rows = allCharges.map(ch => [
      ch.name, ch.chargeAppliesTo?.value, ch.currency?.code, ch.amount,
      ch.chargeCalculationType?.value, ch.chargeTimeType?.value,
      ch.penalty ? 'Yes' : 'No', ch.active ? 'Yes' : 'No'
    ].join(','));
    const csv = ['Name,AppliesTo,Currency,Amount,Calc,Timing,Penalty,Active', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'charges.csv'; a.click();
    toast('success', 'Exported', 'charges.csv downloaded');
  });
}

// ============================================================
// DETAIL VIEW (tabbed)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading charge…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No charge selected</div>'; return; }

  try {
    const ch = await api.charges.get(id);

    const canEdit   = can('UPDATE_CHARGE');
    const canDelete = can('DELETE_CHARGE');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(ch.name || '—')}</h1>
          <div class="text-muted">
            ${escapeHtml(ch.chargeAppliesTo?.value || '—')}
            · ${escapeHtml(ch.currency?.code || '—')} ${fmt(ch.amount || 0)}
            · ${ch.penalty ? '<span class="badge b-warning">Penalty</span>' : '<span class="badge b-info">Fee</span>'}
            · ${ch.active ? '<span class="badge b-success">Active</span>' : '<span class="badge">Inactive</span>'}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-charges"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit ? `<button class="btn-secondary" id="btn-ch-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canEdit && !ch.active ? `<button class="btn-success" id="btn-ch-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canEdit && ch.active ? `<button class="btn-warning" id="btn-ch-deactivate"><i class="fa-solid fa-circle-pause"></i> Deactivate</button>` : ''}
          ${canDelete ? `<button class="btn-danger" id="btn-ch-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="ch-tabs">
          <button class="tab" data-chtab="overview">Overview</button>
          <button class="tab" data-chtab="usage">Usage</button>
          <button class="tab" data-chtab="tax">Tax Linkage</button>
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-chpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Charge Definition</h3>
              <dl class="dl-grid">
                <dt>Name</dt><dd>${escapeHtml(ch.name || '—')}</dd>
                <dt>Applies To</dt><dd>${escapeHtml(ch.chargeAppliesTo?.value || '—')}</dd>
                <dt>Charge Type</dt><dd>${ch.penalty ? 'Penalty' : 'Fee'}</dd>
                <dt>Active</dt><dd>${ch.active ? 'Yes' : 'No'}</dd>
                <dt>Currency</dt><dd>${escapeHtml(ch.currency?.code || '—')} (${escapeHtml(ch.currency?.name || '—')})</dd>
                <dt>Amount</dt><dd class="text-right"><b>${fmt(ch.amount || 0)}</b></dd>
                <dt>Min Cap</dt><dd class="text-right">${fmt(ch.minCap || 0)}</dd>
                <dt>Max Cap</dt><dd class="text-right">${fmt(ch.maxCap || 0)}</dd>
              </dl>
            </div>
            <div>
              <h3>Behaviour</h3>
              <dl class="dl-grid">
                <dt>Calculation Type</dt><dd>${escapeHtml(ch.chargeCalculationType?.value || '—')}</dd>
                <dt>Time Type</dt><dd>${escapeHtml(ch.chargeTimeType?.value || '—')}</dd>
                <dt>Payment Mode</dt><dd>${escapeHtml(ch.chargePaymentMode?.value || '—')}</dd>
                <dt>Fee Interval</dt><dd>${num(ch.feeInterval || 0)}</dd>
                <dt>Fee Frequency</dt><dd>${escapeHtml(ch.feeFrequency?.value || '—')}</dd>
                <dt>Fee On Month-Day</dt><dd>${escapeHtml(ch.feeOnMonthDay?.day ? `${ch.feeOnMonthDay.day}/${ch.feeOnMonthDay.month || ''}` : '—')}</dd>
                <dt>Income Account</dt><dd>${escapeHtml(ch.incomeOrLiabilityAccount?.name || ch.incomeAccount?.name || '—')}</dd>
              </dl>
            </div>
          </div>
        </div>

        <!-- Usage -->
        <div class="tab-panel" data-chpanel="usage" hidden>
          <div id="ch-usage-wrap"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Tax Linkage -->
        <div class="tab-panel" data-chpanel="tax" hidden>
          <div id="ch-tax-wrap"><div class="empty-state-row">Loading…</div></div>
        </div>
      </div>`;

    // Tab switching
    const tabs = c.querySelectorAll('[data-chtab]');
    const panels = c.querySelectorAll('[data-chpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      usage: () => loadChargeUsage(c, ch),
      tax:   () => loadChargeTaxLinkage(c, ch)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.chtab === name));
      panels.forEach(p => p.hidden = p.dataset.chpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `charges?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.chtab)));
    switchTab(initialTab || 'overview');

    // Toolbar handlers
    c.querySelector('#back-to-charges').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('charges'));
    });
    c.querySelector('#btn-ch-edit')?.addEventListener('click', () => openChargeFormModal(ch, () => location.reload()));
    c.querySelector('#btn-ch-activate')?.addEventListener('click', async () => {
      try { await api.charges.update(id, { active: true }); toast('success', 'Activated', ''); location.reload(); }
      catch (e) { toast('error', 'Activate failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-ch-deactivate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Deactivate charge?', confirmText: 'Deactivate' })) return;
      try { await api.charges.update(id, { active: false }); toast('success', 'Deactivated', ''); location.reload(); }
      catch (e) { toast('error', 'Deactivate failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-ch-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete charge?',
        message: 'This will fail if any product or active account references this charge.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.charges.delete(id);
        toast('success', 'Charge deleted', '');
        import('../router.js').then(r => r.navigate('charges'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load charge</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// USAGE TAB
// ============================================================
async function loadChargeUsage(c, ch) {
  const wrap = c.querySelector('#ch-usage-wrap');
  wrap.innerHTML = `
    <h3>Product & Account Usage</h3>
    <div class="text-muted small mb-2">
      Products that include this charge in their default configuration.
    </div>
    <div id="ch-products"><div class="empty-state-row">Loading…</div></div>`;

  const wrapEl = wrap.querySelector('#ch-products');
  const appliesToId = ch.chargeAppliesTo?.id;

  try {
    let products = [];
    let label = 'Products';

    // Pull products of the matching type
    if (appliesToId === 1) {
      label = 'Loan Products';
      const r = await api.loanProducts.list();
      products = Array.isArray(r) ? r : [];
    } else if (appliesToId === 2) {
      label = 'Savings Products';
      const r = await api.savingsProducts.list();
      products = Array.isArray(r) ? r : [];
    } else if (appliesToId === 5 || appliesToId === 7) {
      label = 'Share Products';
      const r = await api.shareProducts.list();
      products = Array.isArray(r) ? r : [];
    }

    if (!products.length) {
      wrapEl.innerHTML = `<div class="empty-state-row">No ${label.toLowerCase()} reference this charge yet</div>`;
      return;
    }

    // For each product, check if it references this charge
    // The product list endpoint returns lean records; we'd need to fetch each for charges array.
    // To avoid N requests we just show the list of products of matching type with a "click to verify" hint.
    wrapEl.innerHTML = `
      <table class="table">
        <thead><tr><th>${label}</th><th>Currency</th><th>Active</th></tr></thead>
        <tbody>${products.map(p => `
          <tr>
            <td>${escapeHtml(p.name || '—')}</td>
            <td>${escapeHtml(p.currency?.code || '—')}</td>
            <td>${(p.status === 'loanProduct.active' || p.active !== false) ? sb('Active') : sb('Inactive')}</td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="text-muted small mt-2">
        <i class="fa-solid fa-circle-info"></i>
        Listed are all ${label.toLowerCase()} of matching applies-to type.
        Open each product to confirm specific charge linkage.
      </div>`;
  } catch (e) {
    wrapEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ============================================================
// TAX LINKAGE TAB
// ============================================================
async function loadChargeTaxLinkage(c, ch) {
  const wrap = c.querySelector('#ch-tax-wrap');
  wrap.innerHTML = `
    <h3>Tax Linkage</h3>
    <div class="text-muted small mb-2">
      Taxes applied on top of this charge when calculated on accounts.
    </div>
    <div id="ch-tax-content"><div class="empty-state-row">Loading…</div></div>`;

  const content = wrap.querySelector('#ch-tax-content');
  try {
    const taxGroupId = ch.taxGroup?.id;
    const taxGroupName = ch.taxGroup?.name;

    if (!taxGroupId) {
      content.innerHTML = '<div class="empty-state-row">No tax group linked to this charge</div>';
      return;
    }

    const group = await api.taxGroups.get(taxGroupId);
    const components = group?.taxAssociations || group?.taxComponents || [];

    content.innerHTML = `
      <dl class="dl-grid">
        <dt>Tax Group</dt><dd>${escapeHtml(taxGroupName || group?.name || '—')}</dd>
        <dt>Components</dt><dd>${components.length}</dd>
      </dl>
      ${components.length ? `
        <table class="table mt-3">
          <thead><tr>
            <th>Component</th>
            <th class="text-right">Percentage</th>
            <th>GL Account</th>
            <th>Start Date</th>
          </tr></thead>
          <tbody>${components.map(comp => {
            const tc = comp.taxComponent || comp;
            return `
              <tr>
                <td>${escapeHtml(tc.name || '—')}</td>
                <td class="text-right">${num(tc.percentage || 0)}%</td>
                <td>${escapeHtml(tc.creditAccount?.name || tc.glAccountName || '—')}</td>
                <td>${escapeHtml(tc.startDate || '—')}</td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : ''}`;
  } catch (e) {
    content.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ============================================================
// CREATE / EDIT CHARGE MODAL
// ============================================================
async function openChargeFormModal(existing, onSuccess) {
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
    <div class="modal-overlay open" id="${mid}">
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