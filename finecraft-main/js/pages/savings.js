/* FinCraft · savings.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml } from '../utils.js';
import { toast, showEntityDetail, openModal } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Savings</h1><div class="page-subtitle">Savings accounts portfolio</div></div>
      <button class="btn-primary" data-modal="newSavingsModal"><i class="fa-solid fa-plus"></i> New Savings</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Total Accounts</div><div class="value" id="sv-count">—</div></div>
      <div class="stat-card c-info"><div class="label">Total Balance</div><div class="value" id="sv-balance">—</div></div>
      <div class="stat-card"><div class="label">Avg Balance</div><div class="value" id="sv-avg">—</div></div>
      <div class="stat-card c-warn"><div class="label">Records</div><div class="value" id="sv-total">—</div></div>
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control" id="sv-search" placeholder="Search by account or client…" />
        <select class="form-control" id="sv-status">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="submitted and pending approval">Pending</option>
          <option value="approved">Approved</option>
          <option value="closed">Closed</option>
        </select>
        <select class="form-control" id="sv-product"><option value="">All Products</option></select>
        <span style="flex:1"></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Balance</th><th>Status</th><th></th></tr></thead>
        <tbody id="sv-rows"><tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  api.savingsProducts.list().then(p => {
    const sel = c.querySelector('#sv-product');
    (Array.isArray(p) ? p : []).forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id; opt.textContent = prod.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  async function load() {
    c.querySelector('#sv-rows').innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#sv-status')?.value;
      const prod = c.querySelector('#sv-product')?.value;
      if (status) params.status = status;
      if (prod) params.productId = prod;

      const res = await api.savings.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);

      const q = c.querySelector('#sv-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(s => (s.accountNo || '').toLowerCase().includes(q) || (s.clientName || '').toLowerCase().includes(q));

      const total = list.reduce((s, a) => s + (a.summary?.accountBalance || 0), 0);
      c.querySelector('#sv-count').textContent   = num(list.length);
      c.querySelector('#sv-total').textContent   = num(res?.totalFilteredRecords ?? list.length);
      c.querySelector('#sv-balance').textContent = fmt(total);
      c.querySelector('#sv-avg').textContent     = fmt(list.length ? total / list.length : 0);

      c.querySelector('#sv-rows').innerHTML = list.map(s => `
        <tr>
          <td class="mono">${escapeHtml(s.accountNo || `#${s.id}`)}</td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.savingsProductName || '—')}</td>
          <td class="mono">${fmt(s.summary?.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td>
          <td>
            <button class="btn-ghost btn-sm" data-sv-deposit="${s.id}" title="Deposit" style="${s.status?.value==='Active'?'':'display:none'}"><i class="fa-solid fa-plus-circle"></i></button>
            <button class="btn-ghost btn-sm" data-sv-view="${s.id}" title="View"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>`).join('')
        || '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-piggy-bank"></i><div>No accounts found</div></div></td></tr>';

      c.querySelectorAll('[data-sv-view]').forEach(b => b.addEventListener('click', () => viewSavings(b.dataset.svView, load)));
      c.querySelectorAll('[data-sv-deposit]').forEach(b => b.addEventListener('click', () => {
        const modal = openModal('savingsDepositModal');
        if (modal) modal.dataset.accountId = b.dataset.svDeposit;
      }));
    } catch (e) {
      c.querySelector('#sv-rows').innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || 'Failed')}</div></div></td></tr>`;
    }
  }

  await load();
  let t;
  c.querySelector('#sv-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 400); });
  c.querySelector('#sv-status').addEventListener('change', load);
  c.querySelector('#sv-product').addEventListener('change', load);
}

// Fineract: GET /savingsaccounts/{id}?associations=all returns summary, transactions, charges
function viewSavings(id, onChange) {
  showEntityDetail({
    title: `Savings #${id}`,
    fetchFn: () => api.savings.get(id, { associations: 'all' }),
    renderBody: (s) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Client</span><span class="info-value">${escapeHtml(s.clientName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Product</span><span class="info-value">${escapeHtml(s.savingsProductName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(s.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(s.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">Balance</span><span class="info-value mono">${fmt(s.summary?.accountBalance ?? 0)}</span></div>
        <div class="info-item"><span class="info-label">Available Balance</span><span class="info-value mono">${fmt(s.summary?.availableBalance ?? 0)}</span></div>
      </div>
      <h4 class="mt-4 mb-2">Recent Transactions</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead>
        <tbody>${(s.transactions||[]).slice(-10).reverse().map(t => `<tr><td>${escapeHtml((Array.isArray(t.date)?t.date.join('-'):t.date)||'—')}</td><td>${escapeHtml(t.transactionType?.value||'—')}</td><td class="mono">${fmt(t.amount||0)}</td><td class="mono">${fmt(t.runningBalance||0)}</td></tr>`).join('')
          || '<tr><td colspan="4" class="text-center text-muted" style="padding:14px">No transactions yet</td></tr>'}</tbody>
      </table></div>
      <div class="mt-4 flex gap-2" id="edm-sv-actions"></div>`,
    onMount: (bodyEl, s) => {
      const actions = bodyEl.querySelector('#edm-sv-actions');
      if (s.status?.value === 'Active') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary btn-sm';
        btn.innerHTML = '<i class="fa-solid fa-plus-circle"></i> Deposit / Withdraw';
        btn.addEventListener('click', () => {
          const modal = openModal('savingsDepositModal');
          if (modal) modal.dataset.accountId = s.id;
        });
        actions.appendChild(btn);
      }
    }
  });
}
