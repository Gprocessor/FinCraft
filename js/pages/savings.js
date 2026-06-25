import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · savings.js — Full savings lifecycle */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal } from '../ui.js';

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
      const prod   = c.querySelector('#sv-product')?.value;
      if (status) params.status = status;
      if (prod)   params.productId = prod;

      const res  = await api.savings.list(params);
      let list   = Array.isArray(res) ? res : (res?.pageItems || []);
      const q    = c.querySelector('#sv-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(s =>
        (s.accountNo || '').toLowerCase().includes(q) ||
        (s.clientName || '').toLowerCase().includes(q));

      const total = list.reduce((s, a) => s + (a.summary?.accountBalance || 0), 0);
      c.querySelector('#sv-count').textContent   = num(list.length);
      c.querySelector('#sv-total').textContent   = num(res?.totalFilteredRecords ?? list.length);
      c.querySelector('#sv-balance').textContent = fmt(total);
      c.querySelector('#sv-avg').textContent     = fmt(list.length ? total / list.length : 0);

      c.querySelector('#sv-rows').innerHTML = list.map(s => {
        const status = s.status?.value || '—';
        const isActive = status === 'Active';
        const isPending = status === 'Submitted and pending approval';
        const isApproved = status === 'Approved';
        return `<tr>
          <td class="mono">${escapeHtml(s.accountNo || `#${s.id}`)}</td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.savingsProductName || '—')}</td>
          <td class="mono">${fmt(s.summary?.accountBalance ?? 0)}</td>
          <td>${sb(status)}</td>
          <td>
            ${isPending  ? `<button class="btn-ghost btn-sm" data-sv-approve="${s.id}" title="Approve"><i class="fa-solid fa-check"></i></button>` : ''}
            ${isApproved ? `<button class="btn-ghost btn-sm" data-sv-activate="${s.id}" title="Activate"><i class="fa-solid fa-bolt"></i></button>` : ''}
            ${isActive   ? `<button class="btn-ghost btn-sm" data-sv-deposit="${s.id}" title="Deposit"><i class="fa-solid fa-plus-circle"></i></button>` : ''}
            <button class="btn-ghost btn-sm" data-sv-view="${s.id}" title="View"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-piggy-bank"></i><div>No accounts found</div></div></td></tr>';

      c.querySelectorAll('[data-sv-view]').forEach(b =>
        b.addEventListener('click', () => renderSavingsDetail(document.getElementById('contentArea'), b.dataset.svView, load)));
      c.querySelectorAll('[data-sv-deposit]').forEach(b => b.addEventListener('click', () => {
        const modal = openModal('savingsDepositModal');
        if (modal) modal.dataset.accountId = b.dataset.svDeposit;
      }));
      c.querySelectorAll('[data-sv-approve]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.savings.approve(b.dataset.svApprove, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
          toast('success', 'Account approved', `#${b.dataset.svApprove}`); load();
        } catch (e) { toast('error', 'Approval failed', e.message); }
      }));
      c.querySelectorAll('[data-sv-activate]').forEach(b => b.addEventListener('click', async () => {
        try {
          await api.savings.activate(b.dataset.svActivate, { activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
          toast('success', 'Account activated', `#${b.dataset.svActivate}`); load();
        } catch (e) { toast('error', 'Activation failed', e.message); }
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

// ============================================================
// SAVINGS DETAIL VIEW
// ============================================================
async function renderSavingsDetail(c, id, onListRefresh) {
  c.innerHTML = `<div class="page active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`;
  try {
    const s      = await api.savings.get(id, { associations: 'all' });
    const status = s.status?.value || '';

    const isPending  = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive   = status === 'Active';
    const isBlocked  = s.subStatus?.value === 'Block' || s.subStatus?.value === 'Blockdebit';

    c.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div>
          <h1 class="page-title">Savings #${escapeHtml(s.accountNo || id)}</h1>
          <div class="page-subtitle">${escapeHtml(s.clientName || '—')} · ${escapeHtml(s.savingsProductName || '—')}</div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost" id="back-to-savings"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${isPending  ? `<button class="btn-primary btn-sm" id="btn-sv-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${isApproved ? `<button class="btn-primary btn-sm" id="btn-sv-activate"><i class="fa-solid fa-bolt"></i> Activate</button>` : ''}
          ${isActive   ? `<button class="btn-primary btn-sm" id="btn-sv-deposit"><i class="fa-solid fa-plus-circle"></i> Deposit</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-sv-withdraw"><i class="fa-solid fa-minus-circle"></i> Withdraw</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-sv-hold"><i class="fa-solid fa-lock"></i> Hold Amount</button>` : ''}
          ${isActive && !isBlocked ? `<button class="btn-ghost btn-sm" id="btn-sv-block"><i class="fa-solid fa-ban"></i> Block</button>` : ''}
          ${isActive && isBlocked  ? `<button class="btn-ghost btn-sm" id="btn-sv-unblock"><i class="fa-solid fa-lock-open"></i> Unblock</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-sv-calc-int"><i class="fa-solid fa-calculator"></i> Calc Interest</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-sv-post-int"><i class="fa-solid fa-paper-plane"></i> Post Interest</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-sv-close"><i class="fa-solid fa-times-circle"></i> Close</button>` : ''}
        </div>
      </div>

      <div class="tabs mb-4">
        <button class="tab active" data-tab="sv-tab-overview">Overview</button>
        <button class="tab" data-tab="sv-tab-transactions">Transactions</button>
        <button class="tab" data-tab="sv-tab-charges">Charges</button>
        <button class="tab" data-tab="sv-tab-notes">Notes</button>
      </div>

      <div class="tab-panel active" id="sv-tab-overview">
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title mb-4">Account Details</h3>
            <div class="form-grid">
              <label><span class="form-label">Status</span><div>${escapeHtml(status)}</div></label>
              <label><span class="form-label">Sub-status</span><div>${escapeHtml(s.subStatus?.value || 'None')}</div></label>
              <label><span class="form-label">Balance</span><div class="mono">${fmt(s.summary?.accountBalance ?? 0)}</div></label>
              <label><span class="form-label">Available</span><div class="mono">${fmt(s.summary?.availableBalance ?? 0)}</div></label>
              <label><span class="form-label">Total Deposits</span><div class="mono">${fmt(s.summary?.totalDeposits ?? 0)}</div></label>
              <label><span class="form-label">Total Withdrawals</span><div class="mono">${fmt(s.summary?.totalWithdrawals ?? 0)}</div></label>
              <label><span class="form-label">Total Interest</span><div class="mono">${fmt(s.summary?.totalInterestEarned ?? 0)}</div></label>
              <label><span class="form-label">Activated</span><div>${fmtDate(s.timeline?.activatedOnDate) || '—'}</div></label>
            </div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="sv-tab-transactions">
        <div class="card">
          <h3 class="card-title mb-4">Transactions</h3>
          <div id="sv-tx-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="sv-tab-charges">
        <div class="card">
          <h3 class="card-title mb-4">Charges</h3>
          <div id="sv-charges-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="sv-tab-notes">
        <div class="card">
          <h3 class="card-title mb-4">Notes</h3>
          <div id="sv-note-list"><div class="text-muted" style="padding:8px 0">No notes yet</div></div>
          <div class="flex gap-2 mt-3">
            <input id="sv-note-input" class="form-control" placeholder="Add a note…" style="flex:1"/>
            <button class="btn-primary btn-sm" id="sv-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>
    </div>`;

    // ---- Tab switching ----
    c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
    }));

    c.querySelector('#back-to-savings').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('savings')));

    const refresh = () => renderSavingsDetail(c, id, onListRefresh);

    // ---- Approve ----
    c.querySelector('#btn-sv-approve')?.addEventListener('click', async () => {
      if (!confirm('Approve this savings account?')) return;
      try {
        await api.savings.approve(id, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Account approved', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Approval failed', e.message); }
    });

    // ---- Activate ----
    c.querySelector('#btn-sv-activate')?.addEventListener('click', async () => {
      if (!confirm('Activate this savings account?')) return;
      try {
        await api.savings.activate(id, { activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Account activated', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Activation failed', e.message); }
    });

    // ---- Deposit ----
    c.querySelector('#btn-sv-deposit')?.addEventListener('click', () => {
      const modal = openModal('savingsDepositModal');
      if (modal) modal.dataset.accountId = id;
    });

    // ---- Withdraw ----
    c.querySelector('#btn-sv-withdraw')?.addEventListener('click', () =>
      openSavingsTransactionModal({ id, type: 'withdrawal', label: 'Withdraw', onSuccess: refresh }));

    // ---- Hold Amount ----
    c.querySelector('#btn-sv-hold')?.addEventListener('click', () =>
      openHoldModal(id, refresh));

    // ---- Block / Unblock ----
    c.querySelector('#btn-sv-block')?.addEventListener('click', async () => {
      if (!confirm('Block this savings account? Debits and credits will be prevented.')) return;
      try {
        await api.savings.block(id);
        toast('success', 'Account blocked', `#${id}`); refresh();
      } catch (e) { toast('error', 'Block failed', e.message); }
    });
    c.querySelector('#btn-sv-unblock')?.addEventListener('click', async () => {
      if (!confirm('Unblock this account?')) return;
      try {
        await api.savings.unblock(id);
        toast('success', 'Account unblocked', `#${id}`); refresh();
      } catch (e) { toast('error', 'Unblock failed', e.message); }
    });

    // ---- Calculate Interest ----
    c.querySelector('#btn-sv-calc-int')?.addEventListener('click', async () => {
      try {
        await api.savings.calculateInterest(id);
        toast('success', 'Interest calculated', 'Ready to post'); refresh();
      } catch (e) { toast('error', 'Calculate failed', e.message); }
    });

    // ---- Post Interest ----
    c.querySelector('#btn-sv-post-int')?.addEventListener('click', async () => {
      if (!confirm('Post interest to this account?')) return;
      try {
        await api.savings.postInterest(id);
        toast('success', 'Interest posted', `#${id}`); refresh();
      } catch (e) { toast('error', 'Post failed', e.message); }
    });

    // ---- Close ----
    c.querySelector('#btn-sv-close')?.addEventListener('click', () =>
      openSavingsCloseModal(id, onListRefresh));

    // ---- Load sub-tabs ----
    loadSavingsTransactions(c, s.transactions || []);
    loadSavingsCharges(c, s.charges || []);
    loadSavingsNotes(c, id);

    c.querySelector('#sv-note-save').addEventListener('click', async () => {
      const inp  = c.querySelector('#sv-note-input');
      const note = inp.value.trim();
      if (!note) return;
      try {
        await api.notes.create('savings', id, { note });
        inp.value = ''; loadSavingsNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed', e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load account</b></div><div class="text-muted mt-2">${escapeHtml(e.message)}</div></div></div>`;
  }
}

function loadSavingsTransactions(c, transactions) {
  const el = c.querySelector('#sv-tx-list');
  if (!el) return;
  const list = [...transactions].reverse().slice(0, 50);
  el.innerHTML = list.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Ref</th></tr></thead>
        <tbody>${list.map(t => {
          const d = Array.isArray(t.date) ? t.date.join('-') : t.date;
          return `<tr>
            <td>${escapeHtml(d || '—')}</td>
            <td>${escapeHtml(t.transactionType?.value || '—')}</td>
            <td class="mono">${fmt(t.amount || 0)}</td>
            <td class="mono">${fmt(t.runningBalance || 0)}</td>
            <td class="mono text-muted">${escapeHtml(t.paymentDetail?.receiptNumber || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-receipt"></i><div>No transactions yet</div></div>';
}

function loadSavingsCharges(c, charges) {
  const el = c.querySelector('#sv-charges-list');
  if (!el) return;
  el.innerHTML = charges.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Amount</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
        <tbody>${charges.map(ch => `<tr>
          <td>${escapeHtml(ch.name || '—')}</td>
          <td class="mono">${fmt(ch.amount || 0)}</td>
          <td class="mono">${fmt(ch.amountDue || 0)}</td>
          <td class="mono">${fmt(ch.amountPaid || 0)}</td>
          <td>${ch.paid ? '<span class="badge b-success">Paid</span>' : '<span class="badge b-warn">Pending</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-receipt"></i><div>No charges</div></div>';
}

async function loadSavingsNotes(c, id) {
  const el = c.querySelector('#sv-note-list');
  if (!el) return;
  try {
    const notes = await api.notes.list('savings', id);
    const list  = Array.isArray(notes) ? notes : [];
    el.innerHTML = list.length
      ? list.map(n => `<div class="mb-2"><span class="text-muted" style="font-size:12px">${escapeHtml(n.createdByUsername || '—')} · ${fmtDate(n.createdOn) || '—'}</span><div>${escapeHtml(n.note || '')}</div></div>`).join('')
      : '<div class="text-muted" style="padding:8px 0">No notes yet</div>';
  } catch { /* silent */ }
}

// ============================================================
// SAVINGS TRANSACTION MODAL (withdraw)
// ============================================================
function openSavingsTransactionModal({ id, type, label, onSuccess }) {
  const mid = `sv-tx-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">${label}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Transaction date *</span>
              <input type="date" id="svtx-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Amount *</span>
              <input type="number" id="svtx-amount" min="0.01" step="0.01" class="form-control" required placeholder="0.00"/></label>
            <label class="full"><span class="form-label">Payment type</span>
              <select id="svtx-paytype" class="form-control"><option value="">— Cash —</option></select></label>
            <label class="full"><span class="form-label">Receipt number</span>
              <input id="svtx-receipt" class="form-control" placeholder="Optional"/></label>
            <label class="full"><span class="form-label">Note</span>
              <input id="svtx-note" class="form-control" placeholder="Optional"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="svtx-confirm"><i class="fa-solid fa-check"></i> ${label}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  // Populate payment types
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#svtx-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.id; opt.textContent = pt.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#svtx-confirm').addEventListener('click', async () => {
    const transactionDate   = el.querySelector('#svtx-date').value;
    const transactionAmount = parseFloat(el.querySelector('#svtx-amount').value);
    const paymentTypeId     = el.querySelector('#svtx-paytype').value;
    const receiptNumber     = el.querySelector('#svtx-receipt').value.trim();
    const note              = el.querySelector('#svtx-note').value.trim();
    if (!transactionDate || isNaN(transactionAmount)) { toast('warn', 'Fill required fields', ''); return; }
    const payload = { transactionDate, transactionAmount, dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) }),
      ...(receiptNumber && { receiptNumber }),
      ...(note && { note })
    };
    try {
      await api.savings.withdrawTx(id, payload);
      el.remove();
      toast('success', `${label} successful`, fmt(transactionAmount));
      onSuccess?.();
    } catch (e) { toast('error', `${label} failed`, e.message); }
  });
}

// ============================================================
// HOLD AMOUNT MODAL
// ============================================================
function openHoldModal(id, onSuccess) {
  const mid = `sv-hold-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Hold Amount</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Amount to hold *</span>
              <input type="number" id="hold-amount" min="0.01" step="0.01" class="form-control" required placeholder="0.00"/></label>
            <label class="full"><span class="form-label">Reason for hold</span>
              <input id="hold-reason" class="form-control" placeholder="Optional reason"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="hold-confirm"><i class="fa-solid fa-lock"></i> Hold Amount</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#hold-confirm').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#hold-amount').value);
    const reason = el.querySelector('#hold-reason').value.trim();
    if (isNaN(amount)) { toast('warn', 'Enter an amount', ''); return; }
    try {
      await api.savings.holdAmount(id, {
        transactionAmount: amount, transactionDate: today(),
        dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(reason && { reasonForBlock: reason })
      });
      el.remove();
      toast('success', 'Amount held', fmt(amount));
      onSuccess?.();
    } catch (e) { toast('error', 'Hold failed', e.message); }
  });
}

// ============================================================
// CLOSE SAVINGS MODAL
// ============================================================
function openSavingsCloseModal(id, onListRefresh) {
  const mid = `sv-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Close Savings Account</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Closed on *</span>
              <input type="date" id="svclose-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Payment type</span>
              <select id="svclose-paytype" class="form-control"><option value="">— Cash —</option></select></label>
            <label class="full"><span class="form-label">Note</span>
              <textarea id="svclose-note" class="form-control" rows="2" placeholder="Optional reason"></textarea></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-danger" id="svclose-confirm"><i class="fa-solid fa-times-circle"></i> Close Account</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#svclose-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option'); opt.value = pt.id; opt.textContent = pt.name; sel.appendChild(opt);
    });
  }).catch(() => {});
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#svclose-confirm').addEventListener('click', async () => {
    const closedOnDate  = el.querySelector('#svclose-date').value;
    const paymentTypeId = el.querySelector('#svclose-paytype').value;
    const note          = el.querySelector('#svclose-note').value.trim();
    if (!closedOnDate) { toast('warn', 'Select a date', ''); return; }
    try {
      await api.savings.close(id, {
        closedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) }),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Account closed', `#${id}`);
      onListRefresh?.();
      import('../router.js').then(r => r.navigate('savings'));
    } catch (e) { toast('error', 'Close failed', e.message); }
  });
}
