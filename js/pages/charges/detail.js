/* FinCraft · pages/charges/detail.js — renderDetail, usage, and tax-linkage tab loaders.
   Auto-split from the original monolithic pages/charges.js for maintainability. */

import { api } from '../../api.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, num, sb } from '../../utils.js';
import { openChargeFormModal } from './actions.js';
import { can } from './shared.js';

export async function renderDetail(c, id, initialTab = 'overview') {
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
      import('../../router.js').then(r => r.navigate('charges'));
    });
    c.querySelector('#btn-ch-edit')?.addEventListener('click', () => openChargeFormModal(ch, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#btn-ch-activate')?.addEventListener('click', async () => {
      try { await api.charges.update(id, { active: true }); toast('success', 'Activated', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
      catch (e) { toast('error', 'Activate failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#btn-ch-deactivate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Deactivate charge?', confirmText: 'Deactivate' })) return;
      try { await api.charges.update(id, { active: false }); toast('success', 'Deactivated', ''); document.dispatchEvent(new CustomEvent('fc:reload')); }
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
        import('../../router.js').then(r => r.navigate('charges'));
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
