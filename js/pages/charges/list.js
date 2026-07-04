/* FinCraft · pages/charges/list.js — renderList — the charges list view.
   Auto-split from the original monolithic pages/charges.js for maintainability. */

import { api } from '../../api.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, num } from '../../utils.js';
import { openChargeFormModal } from './actions.js';
import { APPLIES_TO_OPTIONS, can } from './shared.js';

export async function renderList(c) {
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
        <td><a href="#" data-view-charge="${ch.id}">${escapeHtml(ch.name || '—')}</a></td>
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

    c.querySelectorAll('[data-view-charge]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('charges', { id: b.dataset.viewCharge }));
    }));
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
