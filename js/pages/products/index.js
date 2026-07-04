/* FinCraft · pages/products/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/products.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml, fmt, sb } from '../../utils.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { openDelinquencyModal, openFDProductModal, openFloatingRateModal, openLoanProductModal, openProductMixModal, openRDProductModal, openSavingsProductModal, openShareProductModal, openTaxModal } from './actions.js';
import { loadProductMixList } from './loaders.js';
import { TABS, _glCache, can, resetGlCache } from './shared.js';

export async function render(c) {
  resetGlCache();

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
