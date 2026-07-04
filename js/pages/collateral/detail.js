/* FinCraft · pages/collateral/detail.js — renderDetail, valuation guide, and usage tab loaders.
   Auto-split from the original monolithic pages/collateral.js for maintainability. */

import { api } from '../../api.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, num, sb } from '../../utils.js';
import { openCollateralFormModal } from './actions.js';
import { can } from './shared.js';

export async function renderDetail(c, id, initialTab = 'overview') {
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
      import('../../router.js').then(r => r.navigate('collaterals'));
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
        import('../../router.js').then(r => r.navigate('collaterals'));
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
            <td><a href="#" data-view-loan="${m.loan.id}">${escapeHtml(m.loan.accountNo || `#${m.loan.id}`)}</a></td>
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
    listEl.querySelectorAll('[data-view-loan]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('loans', { id: b.dataset.viewLoan }));
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
