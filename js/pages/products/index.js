/* FinCraft · pages/products/index.js — render() entry point — orchestrates the pieces above.
   Converted from a 9-tab bar (which previously eagerly loaded all 9 product-type tables
   on every visit) to a card-grid hub — see js/ui/section-hub.js for the rationale.
   Only the selected product type now loads, on demand. */

import { api } from '../../api.js';
import { escapeHtml, fmt, sb } from '../../utils.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { openDelinquencyModal, openFDProductModal, openFloatingRateModal, openLoanProductModal, openProductMixModal, openRDProductModal, openSavingsProductModal, openShareProductModal, openTaxModal } from './actions.js';
import { loadProductMixList } from './loaders.js';
import { can, resetGlCache } from './shared.js';
import { renderSectionHub } from '../../ui/section-hub.js';

export async function render(c, params = {}) {
  resetGlCache();

  // Loader registry — Path B: Charges removed, Product Mix added at index 5
  const loaders = [
    {
      key: 0, label: 'Loan Product', perm: 'LOANPRODUCT', icon: 'fa-hand-holding-dollar', desc: 'Lending product definitions',
      fn: () => api.loanProducts.list(),
      cols: ['Name','Short Name','Principal','Rate'],
      row: p => [p.name, p.shortName, fmt(p.principal || 0), `${p.interestRatePerPeriod || 0}%`],
      newFn: () => openLoanProductModal(null, () => reload(0)),
      editFn: (id) => openLoanProductModal(id, () => reload(0)),
      deleteFn: (id) => api.loanProducts.delete(id)
    },
    {
      key: 1, label: 'Savings Product', perm: 'SAVINGSPRODUCT', icon: 'fa-piggy-bank', desc: 'Savings account product definitions',
      fn: () => api.savingsProducts.list(),
      cols: ['Name','Short Name','Nominal Rate'],
      row: p => [p.name, p.shortName, `${p.nominalAnnualInterestRate || 0}%`],
      newFn: () => openSavingsProductModal(null, () => reload(1)),
      editFn: (id) => openSavingsProductModal(id, () => reload(1)),
      deleteFn: (id) => api.savingsProducts.delete(id)
    },
    {
      key: 2, label: 'FD Product', perm: 'FIXEDDEPOSITPRODUCT', icon: 'fa-money-check-dollar', desc: 'Fixed deposit product definitions',
      fn: () => api.fdProducts.list(),
      cols: ['Name','Short Name','Min Deposit'],
      row: p => [p.name, p.shortName, fmt(p.minDepositAmount || 0)],
      newFn: () => openFDProductModal(null, () => reload(2)),
      editFn: (id) => openFDProductModal(id, () => reload(2)),
      deleteFn: (id) => api.fdProducts.delete(id)
    },
    {
      key: 3, label: 'RD Product', perm: 'RECURRINGDEPOSITPRODUCT', icon: 'fa-arrows-rotate', desc: 'Recurring deposit product definitions',
      fn: () => api.rdProducts.list(),
      cols: ['Name','Short Name','Mandatory Deposit'],
      row: p => [p.name, p.shortName, fmt(p.mandatoryRecommendedDepositAmount || 0)],
      newFn: () => openRDProductModal(null, () => reload(3)),
      editFn: (id) => openRDProductModal(id, () => reload(3)),
      deleteFn: (id) => api.rdProducts.delete(id)
    },
    {
      key: 4, label: 'Share Product', perm: 'SHAREPRODUCT', icon: 'fa-chart-pie', desc: 'Share account product definitions',
      fn: () => api.shareProducts.list(),
      cols: ['Name','Short Name','Unit Price'],
      row: p => [p.name, p.shortName, fmt(p.unitPrice || 0)],
      newFn: () => openShareProductModal(null, () => reload(4)),
      editFn: (id) => openShareProductModal(id, () => reload(4)),
      deleteFn: (id) => api.shareProducts.delete(id)
    },
    {
      key: 5, label: 'Product Mix', perm: 'LOANPRODUCT', icon: 'fa-shuffle', desc: 'Restricted loan product combinations',
      fn: () => loadProductMixList(),
      cols: ['Loan Product','Restricted Products'],
      row: p => [p.name, (p._mixCount > 0) ? `${p._mixCount} restricted` : '—'],
      newFn: () => openProductMixModal(null, () => reload(5)),
      editFn: (id) => openProductMixModal(id, () => reload(5)),
      deleteFn: (id) => api.productMix.delete(id),
      _customActions: true
    },
    {
      key: 6, label: 'Floating Rate', perm: 'FLOATINGRATE', icon: 'fa-chart-line', desc: 'Base lending rate definitions',
      fn: () => api.floatingRates.list(),
      cols: ['Name','Base Rate','Active'],
      row: p => [p.name, p.isBaseLendingRate ? 'Yes' : 'No', p.active !== false ? 'Yes' : 'No'],
      newFn: () => openFloatingRateModal(null, () => reload(6)),
      editFn: (id) => openFloatingRateModal(id, () => reload(6)),
      deleteFn: (id) => api.floatingRates.delete(id)
    },
    {
      key: 7, label: 'Tax', perm: 'TAXCOMPONENT', icon: 'fa-percent', desc: 'Tax components & groups',
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
      key: 8, label: 'Delinquency Bucket', perm: 'DELINQUENCY_BUCKET', icon: 'fa-triangle-exclamation', desc: 'Arrears classification buckets',
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
    if (!pane) return; // panel isn't mounted (user navigated away) — nothing to do
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

  const SECTIONS = loaders.map(cfg => ({
    key: 'p' + cfg.key,
    panelId: 'pr-' + cfg.key,
    label: cfg.label + (cfg.label.endsWith('s') ? '' : 's'),
    icon: cfg.icon,
    desc: cfg.desc,
    load: () => reload(cfg.key)
  }));

  renderSectionHub(c, {
    pageKey: 'products',
    title: 'Products',
    subtitle: 'Loan, savings, deposit, share & support catalogs',
    sections: SECTIONS,
    params,
    headerExtra: `<a href="#/charges" class="btn-secondary"><i class="fa-solid fa-tags"></i> Manage Charges</a>`
  });
}
