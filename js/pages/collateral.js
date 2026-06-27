import { LOCALE } from '../config.js';

/* FinCraft · collateral.js — Master collateral catalog (permission-gated, tabbed) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

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
        <h1>Collateral</h1>
        <div class="text-muted">Master catalog of collateral types pledged against loans</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_COLLATERAL_PRODUCT') ? `<button class="btn-primary" id="col-new"><i class="fa-solid fa-plus"></i> New Collateral Type</button>` : ''}
      </div>
    </div>

    <div class="kpi-grid mb-4">
      <div class="kpi-card"><div class="kpi-label">Total Types</div><div class="kpi-value" id="col-total">—</div></div>
      <div class="kpi-card"><div class="kpi-label">High Quality</div><div class="kpi-value" id="col-high">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Currencies</div><div class="kpi-value" id="col-curr">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Base Price</div><div class="kpi-value" id="col-avg">—</div></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="col-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="col-currency" class="form-control"><option value="">All Currencies</option></select>
        <select id="col-quality" class="form-control">
          <option value="">All Qualities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <button class="btn-secondary" id="col-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Name</th><th>Quality</th><th>Currency</th>
          <th class="text-right">Base Price</th>
          <th class="text-right">% to Base</th>
          <th>Unit Type</th><th></th>
        </tr></thead>
        <tbody id="col-rows">
          <tr><td colspan="7" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  let allCollaterals = [];

  async function load() {
    c.querySelector('#col-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const res = await api.collateralManagement.list();
      let list = Array.isArray(res) ? res : (res?.pageItems || []);

      const q = c.querySelector('#col-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(col => (col.name || '').toLowerCase().includes(q));

      const currF = c.querySelector('#col-currency')?.value;
      if (currF) list = list.filter(col => (col.currency?.code || '') === currF);

      const qualityF = c.querySelector('#col-quality')?.value;
      if (qualityF) list = list.filter(col => (col.quality || '').toUpperCase() === qualityF);

      allCollaterals = list;

      // Populate currency filter once
      const currSel = c.querySelector('#col-currency');
      if (currSel.options.length === 1) {
        const currencies = [...new Set(list.map(col => col.currency?.code).filter(Boolean))];
        currencies.forEach(code => {
          const opt = document.createElement('option');
          opt.value = code; opt.textContent = code;
          currSel.appendChild(opt);
        });
      }

      const highQ = list.filter(col => (col.quality || '').toUpperCase() === 'HIGH').length;
      const currs = new Set(list.map(col => col.currency?.code).filter(Boolean)).size;
      const avg = list.length ? list.reduce((sum, col) => sum + (col.basePrice || 0), 0) / list.length : 0;

      c.querySelector('#col-total').textContent = num(list.length);
      c.querySelector('#col-high').textContent  = num(highQ);
      c.querySelector('#col-curr').textContent  = num(currs);
      c.querySelector('#col-avg').textContent   = fmt(avg);

      draw(list);
    } catch (e) {
      c.querySelector('#col-rows').innerHTML =
        `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function draw(rows) {
    c.querySelector('#col-rows').innerHTML = rows.length ? rows.map(col => {
      const quality = (col.quality || '').toUpperCase();
      const qualityBadge = quality === 'HIGH'   ? '<span class="badge b-success">High</span>'
                        : quality === 'MEDIUM' ? '<span class="badge b-warning">Medium</span>'
                        : quality === 'LOW'    ? '<span class="badge b-danger">Low</span>'
                        : '<span class="badge">—</span>';
      return `
        <tr>
          <td>${col.id}">${escapeHtml(col.name || '—')}</a></td>
          <td>${qualityBadge}</td>
          <td>${escapeHtml(col.currency?.code || '—')}</td>
          <td class="text-right">${fmt(col.basePrice || 0)}</td>
          <td class="text-right">${num(col.pctToBase || 0)}%</td>
          <td>${escapeHtml(col.unitType || '—')}</td>
          <td class="text-right">
            ${can('UPDATE_COLLATERAL_PRODUCT') ? `<button class="btn-mini" data-col-edit="${col.id}">Edit</button>` : ''}
            ${can('DELETE_COLLATERAL_PRODUCT') ? `<button class="btn-mini btn-danger" data-col-del="${col.id}">Delete</button>` : ''}
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty-state-row">No collateral types defined</td></tr>';

    c.querySelectorAll('[data-col-edit]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.collateralManagement.get(b.dataset.colEdit);
        openCollateralFormModal(existing, load);
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));
    c.querySelectorAll('[data-col-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete collateral type?',
        message: 'This will fail if any client has pledged this collateral on an active loan.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.collateralManagement.delete(b.dataset.colDel);
        toast('success', 'Collateral deleted', '');
        load();
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#col-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(load, 400);
  });
  ['#col-currency', '#col-quality'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', load);
  });

  c.querySelector('#col-new')?.addEventListener('click', () => openCollateralFormModal(null, load));

  c.querySelector('#col-export').addEventListener('click', () => {
    const rows = allCollaterals.map(col => [
      col.name, col.quality, col.currency?.code, col.basePrice,
      col.pctToBase, col.unitType
    ].join(','));
    const csv = ['Name,Quality,Currency,BasePrice,PctToBase,UnitType', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'collateral.csv'; a.click();
    toast('success', 'Exported', 'collateral.csv downloaded');
  });
}

// ============================================================
// DETAIL VIEW (tabbed)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading collateral…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No collateral selected</div>'; return; }

  try {
    const col = await api.collateralManagement.get(id);

    const canEdit   = can('UPDATE_COLLATERAL_PRODUCT');
    const canDelete = can('DELETE_COLLATERAL_PRODUCT');

    const quality = (col.quality || '').toUpperCase();
    const qualityBadge = quality === 'HIGH'   ? '<span class="badge b-success">High Quality</span>'
                      : quality === 'MEDIUM' ? '<span class="badge b-warning">Medium Quality</span>'
                      : quality === 'LOW'    ? '<span class="badge b-danger">Low Quality</span>'
                      : '<span class="badge">Unrated</span>';
    const effectiveValue = (col.basePrice || 0) * (col.pctToBase || 0) / 100;

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(col.name || '—')}</h1>
          <div class="text-muted">
            ${qualityBadge}
            · ${escapeHtml(col.currency?.code || '—')} ${fmt(col.basePrice || 0)} base
            · ${num(col.pctToBase || 0)}% loan-to-value
            · ${escapeHtml(col.unitType || 'units')}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-collateral"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit   ? `<button class="btn-secondary" id="btn-col-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canDelete ? `<button class="btn-danger" id="btn-col-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="col-tabs">
          <button class="tab" data-coltab="overview">Overview</button>
          <button class="tab" data-coltab="valuation">Valuation Guide</button>
          <button class="tab" data-coltab="usage">Usage</button>
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-colpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Collateral Definition</h3>
              <dl class="dl-grid">
                <dt>Name</dt><dd>${escapeHtml(col.name || '—')}</dd>
                <dt>Quality</dt><dd>${qualityBadge}</dd>
                <dt>Unit Type</dt><dd>${escapeHtml(col.unitType || '—')}</dd>
                <dt>Currency</dt><dd>${escapeHtml(col.currency?.code || '—')} (${escapeHtml(col.currency?.name || '—')})</dd>
              </dl>
            </div>
            <div>
              <h3>Valuation</h3>
              <dl class="dl-grid">
                <dt>Base Price per Unit</dt><dd class="text-right">${fmt(col.basePrice || 0)}</dd>
                <dt>% to Base (LTV)</dt><dd class="text-right">${num(col.pctToBase || 0)}%</dd>
                <dt>Effective Pledged Value per Unit</dt><dd class="text-right"><b>${fmt(effectiveValue)}</b></dd>
              </dl>
              <div class="text-muted small mt-2">
                <i class="fa-solid fa-circle-info"></i> Loans pledged against this collateral can borrow up to
                <b>${num(col.pctToBase || 0)}%</b> of the appraised value.
              </div>
            </div>
          </div>
        </div>

        <!-- Valuation Guide -->
        <div class="tab-panel" data-colpanel="valuation" hidden>
          <div id="col-val-wrap"></div>
        </div>

        <!-- Usage -->
        <div class="tab-panel" data-colpanel="usage" hidden>
          <div id="col-usage-wrap"><div class="empty-state-row">Loading…</div></div>
        </div>
      </div>`;

    // Tab switching
    const tabs = c.querySelectorAll('[data-coltab]');
    const panels = c.querySelectorAll('[data-colpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      valuation: () => renderValuationGuide(c, col),
      usage:     () => loadCollateralUsage(c, col)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.coltab === name));
      panels.forEach(p => p.hidden = p.dataset.colpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `collaterals?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.coltab)));
    switchTab(initialTab || 'overview');

    // Toolbar handlers
    c.querySelector('#back-to-collateral').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('collaterals'));
    });
    c.querySelector('#btn-col-edit')?.addEventListener('click', () =>
      openCollateralFormModal(col, () => location.reload()));
    c.querySelector('#btn-col-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete collateral type?',
        message: 'This will fail if any client has pledged this collateral on an active loan.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.collateralManagement.delete(id);
        toast('success', 'Collateral deleted', '');
        import('../router.js').then(r => r.navigate('collaterals'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load collateral</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

// ============================================================
// VALUATION GUIDE TAB
// ============================================================
function renderValuationGuide(c, col) {
  const wrap = c.querySelector('#col-val-wrap');
  const basePrice = col.basePrice || 0;
  const pct = col.pctToBase || 0;

  const examples = [1, 5, 10, 50, 100].map(qty => ({
    qty,
    appraised: qty * basePrice,
    loanable: qty * basePrice * pct / 100
  }));

  wrap.innerHTML = `
    <h3>How this collateral is valued</h3>
    <div class="text-muted small mb-3">
      When a client pledges <b>${escapeHtml(col.name || 'this collateral')}</b> on a loan,
      Fineract calculates the pledged value as <code>quantity × basePrice × (pctToBase / 100)</code>.
    </div>

    <table class="table">
      <thead><tr>
        <th>Quantity (${escapeHtml(col.unitType || 'units')})</th>
        <th class="text-right">Appraised Value</th>
        <th class="text-right">Loanable Value (${num(pct)}%)</th>
        <th class="text-right">Difference</th>
      </tr></thead>
      <tbody>
        ${examples.map(ex => `
          <tr>
            <td>${ex.qty}</td>
            <td class="text-right">${fmt(ex.appraised)}</td>
            <td class="text-right"><b>${fmt(ex.loanable)}</b></td>
            <td class="text-right text-muted">${fmt(ex.appraised - ex.loanable)}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="msg-banner b-info mt-3">
      <i class="fa-solid fa-circle-info"></i>
      <b>Note:</b> Per Fineract's collateral management module, the actual pledged amount per loan
      is checked at the time the loan is created and re-checked when collateral is added or removed.
    </div>`;
}

// ============================================================
// USAGE TAB
// ============================================================
async function loadCollateralUsage(c, col) {
  const wrap = c.querySelector('#col-usage-wrap');
  wrap.innerHTML = `
    <h3>Loans Using This Collateral</h3>
    <div class="text-muted small mb-2">
      Showing recent loans that have pledged this collateral type.
    </div>
    <div id="col-loans-list"><div class="empty-state-row">Searching loans…</div></div>`;

  const listEl = wrap.querySelector('#col-loans-list');
  try {
    const res = await api.loans.list({ status: 'active', limit: 100 });
    const loans = Array.isArray(res) ? res : (res?.pageItems || []);

    const BATCH = 5;
    const matching = [];
    for (let i = 0; i < loans.length; i += BATCH) {
      const batch = loans.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(l => api.loans.listCollaterals(l.id))
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          const cols = Array.isArray(r.value) ? r.value : [];
          const hit = cols.find(coll =>
            coll.collateral?.id === col.id ||
            coll.collateralName === col.name ||
            coll.collateralType?.id === col.id);
          if (hit) {
            matching.push({
              loan: batch[idx],
              pledged: hit
            });
          }
        }
      });
    }

    if (!matching.length) {
      listEl.innerHTML = '<div class="empty-state-row">No active loans currently use this collateral</div>';
      return;
    }

    listEl.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Loan</th><th>Client</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Pledged Value</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${matching.map(m => `
          <tr>
            <td>${m.loan.id}">${escapeHtml(m.loan.accountNo || `#${m.loan.id}`)}</a></td>
            <td>${escapeHtml(m.loan.clientName || '—')}</td>
            <td class="text-right">${num(m.pledged.quantity || 0)}</td>
            <td class="text-right">${fmt((m.pledged.quantity || 0) * (col.basePrice || 0) * (col.pctToBase || 0) / 100)}</td>
            <td>${sb(m.loan.status?.value || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="text-muted small mt-2">
        <i class="fa-solid fa-circle-info"></i>
        Search limited to the most recent 100 active loans.
        Full audit would require running a custom report.
      </div>`;
  } catch (e) {
    listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ============================================================
// CREATE / EDIT COLLATERAL MODAL
// ============================================================
async function openCollateralFormModal(existing, onSuccess) {
  let tpl = {};
  try { tpl = await api.collateralManagement.template(); } catch {}
  const currencies = tpl.currencyOptions || [];

  const isEdit = !!existing;
  const mid = 'col-form-' + Date.now();

  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
