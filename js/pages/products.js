/* FinCraft · products.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast, openModal } from '../ui.js';

const TABS = ['Loan Products','Saving Products','Fixed Deposits','Recurring Deposits','Share Products','Charges','Floating Rates','Tax Components','Delinquency'];

// data-action-button per tab: 'modal' opens a real Fineract-backed creation form;
// 'soon' is honest about the multi-step product builders not being implemented yet
// (loan/savings/FD/RD/share product definitions have 30-60+ configurable fields each
// in Fineract — building those is a dedicated task, not something to fake with a stub).
const NEW_BTN = [
  { mode: 'soon' },                          // Loan Products
  { mode: 'soon' },                          // Saving Products
  { mode: 'soon' },                          // Fixed Deposits
  { mode: 'soon' },                          // Recurring Deposits
  { mode: 'soon' },                          // Share Products
  { mode: 'modal', modal: 'newChargeModal' }, // Charges — simple enough to be fully wired now
  { mode: 'soon' },                          // Floating Rates
  { mode: 'soon' },                          // Tax Components/Groups
  { mode: 'soon' }                           // Delinquency Buckets
];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Products</h1><div class="page-subtitle">Loan, savings, deposit & share products</div></div>
    </div>
    <div class="card">
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="pr-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div id="pr-${i}" class="tab-panel ${i === 0 ? 'active' : ''}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`).join('')}
    </div>
  </div>`;

  const loaders = [
    { fn: () => api.loanProducts.list(),     key: 0, label: 'Loan Products',    cols: ['Name','Short Name','Principal','Terms','Rate'],   row: p => [p.name, p.shortName, fmt(p.principal || 0), `${p.numberOfRepayments || 0} repayments`, `${p.interestRatePerPeriod || 0}%`] },
    { fn: () => api.savingsProducts.list(),  key: 1, label: 'Saving Products',  cols: ['Name','Short Name','Nominal Rate','Interest Calc'], row: p => [p.name, p.shortName, `${p.nominalAnnualInterestRate || 0}%`, p.interestCalculationType?.value || '—'] },
    { fn: () => api.fdProducts.list(),       key: 2, label: 'FD Products',      cols: ['Name','Short Name','Min Deposit','Max Term'],       row: p => [p.name, p.shortName, fmt(p.minDepositAmount || 0), `${p.maxDepositTerm || 0} ${p.maxDepositTermType?.value || ''}`] },
    { fn: () => api.rdProducts.list(),       key: 3, label: 'RD Products',      cols: ['Name','Short Name','Mandatory Deposit'],            row: p => [p.name, p.shortName, fmt(p.mandatoryRecommendedDepositAmount || 0)] },
    { fn: () => api.shareProducts.list(),    key: 4, label: 'Share Products',   cols: ['Name','Short Name','Unit Price','Min Shares'],       row: p => [p.name, p.shortName, fmt(p.unitPrice || 0), num(p.minimumShares || 0)] },
    { fn: () => api.charges.list(),          key: 5, label: 'Charges',          cols: ['Name','Type','Amount','Currency'],                  row: p => [p.name, p.chargeTimeType?.value || '—', fmt(p.amount || 0), p.currency?.code || '—'] },
    { fn: () => api.floatingRates.list(),    key: 6, label: 'Floating Rates',   cols: ['Name','Is Base','Is Active'],                        row: p => [p.name, p.isBaseLendingRate ? 'Yes' : 'No', p.active !== false ? 'Active' : 'Inactive'] },
    { fn: async () => { const [tc, tg] = await Promise.all([api.taxComponents.list(), api.taxGroups.list()]); return [...(Array.isArray(tc)?tc:[]).map(x=>({...x,_type:'Component'})), ...(Array.isArray(tg)?tg:[]).map(x=>({...x,_type:'Group'}))]; },
      key: 7, label: 'Tax',               cols: ['Name','Type','Credit Account','Debit Account'],          row: p => [p.name, p._type, p.creditAccount?.name || '—', p.debitAccount?.name || '—'] },
    { fn: async () => { const [b,r] = await Promise.all([api.delinquencyBuckets.list(), api.delinquencyBuckets.ranges()]); return (Array.isArray(b)?b:[]).map(bk=>({...bk,_ranges:(Array.isArray(r)?r:[]).filter(x=>x.delinquencyBucketId===bk.id)})); },
      key: 8, label: 'Delinquency',       cols: ['Bucket Name','Ranges'],                                  row: p => [p.name, (p._ranges||[]).map(r=>`${r.classification || r.minimumAgeDays+'d'}`).join(', ') || '—'] }
  ];

  for (const { fn, key, label, cols, row } of loaders) {
    try {
      const res = await fn();
      const list = Array.isArray(res) ? res : [];
      const newBtn = NEW_BTN[key];
      c.querySelector(`#pr-${key}`).innerHTML = `
        <div class="flex justify-between mb-4">
          <span class="text-muted">${list.length} ${label.toLowerCase()}</span>
          <button class="btn-primary" data-new-product="${key}"><i class="fa-solid fa-plus"></i> New ${label.replace(/s$/, '')}</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>${cols.map(h => `<th>${h}</th>`).join('')}<th>Status</th></tr></thead>
          <tbody>${list.length
            ? list.map(p => `<tr>${row(p).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}<td>${p.active === false ? sb('Inactive') : sb('Active')}</td></tr>`).join('')
            : `<tr><td colspan="${cols.length + 1}"><div class="empty-state"><i class="fa-solid fa-cube"></i><div>No ${label.toLowerCase()}</div></div></td></tr>`
          }</tbody>
        </table></div>`;
    } catch (e) {
      c.querySelector(`#pr-${key}`).innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    }
  }

  c.querySelectorAll('[data-new-product]').forEach(b => b.addEventListener('click', () => {
    const cfg = NEW_BTN[parseInt(b.dataset.newProduct)];
    if (cfg.mode === 'modal') openModal(cfg.modal);
    else toast('info', 'Builder not built yet', `${TABS[parseInt(b.dataset.newProduct)]} need a full template-driven form (30+ fields) — planned as its own task.`);
  }));
}
