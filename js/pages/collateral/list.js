/* FinCraft · pages/collateral/list.js — renderList — the collateral types list view.
   Auto-split from the original monolithic pages/collateral.js for maintainability. */

import { api } from '../../api.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, num } from '../../utils.js';
import { openCollateralFormModal } from './actions.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function renderList(c) {
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
        `<tr><td colspan="7" class="text-error">${escapeHtml(extractFineractError(e))}</td></tr>`;
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
          <td><a href="#" data-view-collateral="${col.id}">${escapeHtml(col.name || '—')}</a></td>
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

    c.querySelectorAll('[data-view-collateral]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('collaterals', { id: b.dataset.viewCollateral }));
    }));
    c.querySelectorAll('[data-col-edit]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.collateralManagement.get(b.dataset.colEdit);
        openCollateralFormModal(existing, load);
      } catch (e) { toast('error', 'Could not load', extractFineractError(e)); }
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
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
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
