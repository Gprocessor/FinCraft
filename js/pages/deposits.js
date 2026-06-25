import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · deposits.js — Full FD & RD lifecycle */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Deposits</h1><div class="page-subtitle">Fixed &amp; Recurring Deposits</div></div>
      <div class="flex gap-2">
        <button class="btn-ghost" data-modal="newRDModal"><i class="fa-solid fa-plus"></i> New RD</button>
        <button class="btn-primary" data-modal="newFDModal"><i class="fa-solid fa-plus"></i> New FD</button>
      </div>
    </div>
    <div class="card">
      <div class="tabs">
        <button class="tab active" data-tab="fd-pane">Fixed Deposits</button>
        <button class="tab" data-tab="rd-pane">Recurring Deposits</button>
      </div>

      <div id="fd-pane" class="tab-panel active">
        <div class="filter-bar">
          <input class="form-control" id="fd-search" placeholder="Search account or client…"/>
          <select class="form-control" id="fd-status">
            <option value="">All Status</option>
            <option value="submittedAndPendingApproval">Pending</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="prematureClosed">Premature Closed</option>
          </select>
          <span style="flex:1"></span>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Principal</th><th>Maturity</th><th>Interest</th><th>Status</th><th></th></tr></thead>
          <tbody id="fd-rows"><tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>

      <div id="rd-pane" class="tab-panel">
        <div class="filter-bar">
          <input class="form-control" id="rd-search" placeholder="Search account or client…"/>
          <select class="form-control" id="rd-status">
            <option value="">All Status</option>
            <option value="submittedAndPendingApproval">Pending</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          <span style="flex:1"></span>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Deposit/period</th><th>Maturity</th><th>Status</th><th></th></tr></thead>
          <tbody id="rd-rows"><tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>
    </div>
  </div>`;

  // Tab switching
  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
  }));

  async function loadFD() {
    c.querySelector('#fd-rows').innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#fd-status')?.value;
      if (status) params.status = status;
      const res  = await api.fixedDeposits.list(params);
      let list   = Array.isArray(res) ? res : (res?.pageItems || []);
      const q    = c.querySelector('#fd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) || (d.clientName || '').toLowerCase().includes(q));

      c.querySelector('#fd-rows').innerHTML = list.map(d => `
        <tr>
          <td class="mono">${escapeHtml(d.accountNo || `#${d.id}`)}</td>
          <td>${escapeHtml(d.clientName || '—')}</td>
          <td>${escapeHtml(d.depositProductName || '—')}</td>
          <td class="mono">${fmt(d.depositAmount || 0)}</td>
          <td>${fmtDate(d.maturityDate) || '—'}</td>
          <td>${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</td>
          <td>${sb(d.status?.value || '—')}</td>
          <td><button class="btn-ghost btn-sm" data-fd-view="${d.id}"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`).join('')
        || '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-vault"></i><div>No fixed deposits</div></div></td></tr>';

      c.querySelectorAll('[data-fd-view]').forEach(b =>
        b.addEventListener('click', () => renderDepositDetail(document.getElementById('contentArea'), 'fixedDeposits', b.dataset.fdView, loadFD)));
    } catch (e) {
      c.querySelector('#fd-rows').innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div></td></tr>`;
    }
  }

  async function loadRD() {
    c.querySelector('#rd-rows').innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params = { limit: 100 };
      const status = c.querySelector('#rd-status')?.value;
      if (status) params.status = status;
      const res  = await api.recurringDeposits.list(params);
      let list   = Array.isArray(res) ? res : (res?.pageItems || []);
      const q    = c.querySelector('#rd-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(d =>
        (d.accountNo || '').toLowerCase().includes(q) || (d.clientName || '').toLowerCase().includes(q));

      c.querySelector('#rd-rows').innerHTML = list.map(d => `
        <tr>
          <td class="mono">${escapeHtml(d.accountNo || `#${d.id}`)}</td>
          <td>${escapeHtml(d.clientName || '—')}</td>
          <td>${escapeHtml(d.depositProductName || '—')}</td>
          <td class="mono">${fmt(d.mandatoryRecommendedDepositAmount || 0)}/period</td>
          <td>${fmtDate(d.maturityDate) || '—'}</td>
          <td>${sb(d.status?.value || '—')}</td>
          <td><button class="btn-ghost btn-sm" data-rd-view="${d.id}"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`).join('')
        || '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-vault"></i><div>No recurring deposits</div></div></td></tr>';

      c.querySelectorAll('[data-rd-view]').forEach(b =>
        b.addEventListener('click', () => renderDepositDetail(document.getElementById('contentArea'), 'recurringDeposits', b.dataset.rdView, loadRD)));
    } catch (e) {
      c.querySelector('#rd-rows').innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div></td></tr>`;
    }
  }

  await Promise.all([loadFD(), loadRD()]);

  let ft, rt;
  c.querySelector('#fd-search').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(loadFD, 400); });
  c.querySelector('#fd-status').addEventListener('change', loadFD);
  c.querySelector('#rd-search').addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(loadRD, 400); });
  c.querySelector('#rd-status').addEventListener('change', loadRD);
}

// ============================================================
// DEPOSIT DETAIL (shared for FD + RD)
// ============================================================
async function renderDepositDetail(c, apiGroup, id, onListRefresh) {
  const isFD   = apiGroup === 'fixedDeposits';
  const label  = isFD ? 'Fixed Deposit' : 'Recurring Deposit';
  const apiObj = api[apiGroup];

  c.innerHTML = `<div class="page active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`;
  try {
    const d      = await apiObj.get(id, { associations: 'all' });
    const status = d.status?.value || '';

    const isPending  = status === 'Submitted and pending approval';
    const isApproved = status === 'Approved';
    const isActive   = status === 'Active';
    const isMatured  = status === 'Matured';

    c.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div>
          <h1 class="page-title">${label} #${escapeHtml(d.accountNo || id)}</h1>
          <div class="page-subtitle">${escapeHtml(d.clientName || '—')} · ${escapeHtml(d.depositProductName || '—')}</div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost" id="back-to-deposits"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${isPending  ? `<button class="btn-primary btn-sm" id="btn-dep-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${isPending  ? `<button class="btn-ghost btn-sm" id="btn-dep-reject"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${isApproved ? `<button class="btn-primary btn-sm" id="btn-dep-activate"><i class="fa-solid fa-bolt"></i> Activate</button>` : ''}
          ${isApproved ? `<button class="btn-ghost btn-sm" id="btn-dep-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${(isActive || isMatured) ? `<button class="btn-ghost btn-sm" id="btn-dep-calc"><i class="fa-solid fa-calculator"></i> Calc Interest</button>` : ''}
          ${(isActive || isMatured) ? `<button class="btn-ghost btn-sm" id="btn-dep-post"><i class="fa-solid fa-paper-plane"></i> Post Interest</button>` : ''}
          ${!isFD && isActive ? `<button class="btn-primary btn-sm" id="btn-dep-deposit"><i class="fa-solid fa-plus-circle"></i> Make Deposit</button>` : ''}
          ${isActive   ? `<button class="btn-ghost btn-sm" id="btn-dep-premature"><i class="fa-solid fa-door-open"></i> Premature Close</button>` : ''}
          ${isMatured  ? `<button class="btn-primary btn-sm" id="btn-dep-close"><i class="fa-solid fa-check-circle"></i> Close (Matured)</button>` : ''}
        </div>
      </div>

      <div class="tabs mb-4">
        <button class="tab active" data-tab="dep-tab-overview">Overview</button>
        <button class="tab" data-tab="dep-tab-transactions">Transactions</button>
        <button class="tab" data-tab="dep-tab-charges">Charges</button>
      </div>

      <div class="tab-panel active" id="dep-tab-overview">
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title mb-4">Deposit Details</h3>
            <div class="form-grid">
              <label><span class="form-label">Status</span><div>${escapeHtml(status)}</div></label>
              <label><span class="form-label">Client</span><div>${escapeHtml(d.clientName || '—')}</div></label>
              <label><span class="form-label">Deposit Amount</span><div class="mono">${fmt(d.depositAmount ?? d.mandatoryRecommendedDepositAmount ?? 0)}</div></label>
              <label><span class="form-label">Maturity Amount</span><div class="mono">${fmt(d.maturityAmount || 0)}</div></label>
              <label><span class="form-label">Interest Rate</span><div>${num(d.interestRate ?? d.nominalAnnualInterestRate ?? 0)}%</div></label>
              <label><span class="form-label">Maturity Date</span><div>${fmtDate(d.maturityDate) || '—'}</div></label>
              <label><span class="form-label">Submitted</span><div>${fmtDate(d.timeline?.submittedOnDate) || '—'}</div></label>
              <label><span class="form-label">Activated</span><div>${fmtDate(d.timeline?.activatedOnDate) || '—'}</div></label>
            </div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="dep-tab-transactions">
        <div class="card">
          <h3 class="card-title mb-4">Transactions</h3>
          <div id="dep-tx-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="dep-tab-charges">
        <div class="card">
          <h3 class="card-title mb-4">Charges</h3>
          <div id="dep-charges-list"></div>
        </div>
      </div>
    </div>`;

    c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
    }));

    c.querySelector('#back-to-deposits').addEventListener('click', () =>
      import('../router.js').then(r => r.navigate('deposits')));

    const refresh = () => renderDepositDetail(c, apiGroup, id, onListRefresh);

    // ---- Approve ----
    c.querySelector('#btn-dep-approve')?.addEventListener('click', async () => {
      if (!confirm(`Approve this ${label}?`)) return;
      try {
        await apiObj.approve(id, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Approved', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Approval failed', e.message); }
    });

    // ---- Reject ----
    c.querySelector('#btn-dep-reject')?.addEventListener('click', () =>
      openDepositCommandModal({ id, apiObj, command: 'reject', label: 'Reject', dateField: 'rejectedOnDate', onSuccess: () => { onListRefresh?.(); import('../router.js').then(r => r.navigate('deposits')); } }));

    // ---- Undo Approval ----
    c.querySelector('#btn-dep-undo-approval')?.addEventListener('click', async () => {
      if (!confirm('Undo approval?')) return;
      try {
        await apiObj.undoApproval(id);
        toast('success', 'Approval undone', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Failed', e.message); }
    });

    // ---- Activate ----
    c.querySelector('#btn-dep-activate')?.addEventListener('click', async () => {
      if (!confirm(`Activate this ${label}?`)) return;
      try {
        await apiObj.activate(id, { activatedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Activated', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Activation failed', e.message); }
    });

    // ---- Calculate Interest ----
    c.querySelector('#btn-dep-calc')?.addEventListener('click', async () => {
      try {
        await apiObj.calculateInterest(id);
        toast('success', 'Interest calculated', 'Ready to post'); refresh();
      } catch (e) { toast('error', 'Calculate failed', e.message); }
    });

    // ---- Post Interest ----
    c.querySelector('#btn-dep-post')?.addEventListener('click', async () => {
      if (!confirm('Post interest to this account?')) return;
      try {
        await apiObj.postInterest(id);
        toast('success', 'Interest posted', `#${id}`); refresh();
      } catch (e) { toast('error', 'Post failed', e.message); }
    });

    // ---- RD Make Deposit ----
    c.querySelector('#btn-dep-deposit')?.addEventListener('click', () =>
      openRDDepositModal(id, refresh));

    // ---- Premature Close ----
    c.querySelector('#btn-dep-premature')?.addEventListener('click', () =>
      openDepositCommandModal({ id, apiObj, command: 'premature', label: 'Premature Close', dateField: 'closedOnDate', danger: true,
        onSuccess: () => { onListRefresh?.(); import('../router.js').then(r => r.navigate('deposits')); } }));

    // ---- Close (matured) ----
    c.querySelector('#btn-dep-close')?.addEventListener('click', () =>
      openDepositCommandModal({ id, apiObj, command: 'close', label: 'Close Account', dateField: 'closedOnDate',
        onSuccess: () => { onListRefresh?.(); import('../router.js').then(r => r.navigate('deposits')); } }));

    // ---- Load sub-tabs ----
    loadDepositTransactions(c, d.transactions || []);
    loadDepositCharges(c, d.charges || []);

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load deposit</b></div><div class="text-muted mt-2">${escapeHtml(e.message)}</div></div></div>`;
  }
}

// ============================================================
// GENERIC DEPOSIT COMMAND MODAL (approve/reject/close/premature)
// ============================================================
function openDepositCommandModal({ id, apiObj, command, label, dateField, danger = false, onSuccess }) {
  const mid = `dep-cmd-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">${label}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Date *</span>
              <input type="date" id="depcmd-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Note</span>
              <textarea id="depcmd-note" class="form-control" rows="2" placeholder="Optional"></textarea></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="depcmd-confirm">${label}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#depcmd-confirm').addEventListener('click', async () => {
    const date = el.querySelector('#depcmd-date').value;
    const note = el.querySelector('#depcmd-note').value.trim();
    if (!date) { toast('warn', 'Select a date', ''); return; }
    const payload = { [dateField]: date, dateFormat: DATE_FORMAT, locale: LOCALE, ...(note && { note }) };
    try {
      await apiObj[command](id, payload);
      el.remove();
      toast('success', label + ' successful', `#${id}`);
      onSuccess?.();
    } catch (e) { toast('error', label + ' failed', e.message); }
  });
}

// ============================================================
// RD DEPOSIT MODAL
// ============================================================
function openRDDepositModal(id, onSuccess) {
  const mid = `rd-dep-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Make RD Deposit</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Transaction date *</span>
              <input type="date" id="rddep-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Amount *</span>
              <input type="number" id="rddep-amount" min="0.01" step="0.01" class="form-control" required placeholder="0.00"/></label>
            <label class="full"><span class="form-label">Payment type</span>
              <select id="rddep-paytype" class="form-control"><option value="">— Cash —</option></select></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="rddep-confirm"><i class="fa-solid fa-check"></i> Deposit</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#rddep-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option'); opt.value = pt.id; opt.textContent = pt.name; sel.appendChild(opt);
    });
  }).catch(() => {});
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#rddep-confirm').addEventListener('click', async () => {
    const transactionDate   = el.querySelector('#rddep-date').value;
    const transactionAmount = parseFloat(el.querySelector('#rddep-amount').value);
    const paymentTypeId     = el.querySelector('#rddep-paytype').value;
    if (!transactionDate || isNaN(transactionAmount)) { toast('warn', 'Fill required fields', ''); return; }
    try {
      await api.recurringDeposits.deposit(id, {
        transactionDate, transactionAmount, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Deposit made', fmt(transactionAmount));
      onSuccess?.();
    } catch (e) { toast('error', 'Deposit failed', e.message); }
  });
}

// ============================================================
// SUB-TAB LOADERS
// ============================================================
function loadDepositTransactions(c, transactions) {
  const el = c.querySelector('#dep-tx-list');
  if (!el) return;
  const list = [...transactions].reverse().slice(0, 50);
  el.innerHTML = list.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th></tr></thead>
        <tbody>${list.map(t => {
          const d = Array.isArray(t.date) ? t.date.join('-') : (t.valueDate || t.date);
          return `<tr>
            <td>${escapeHtml(String(d || '—'))}</td>
            <td>${escapeHtml(t.transactionType?.value || '—')}</td>
            <td class="mono">${fmt(t.amount || 0)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-receipt"></i><div>No transactions yet</div></div>';
}

function loadDepositCharges(c, charges) {
  const el = c.querySelector('#dep-charges-list');
  if (!el) return;
  el.innerHTML = charges.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${charges.map(ch => `<tr>
          <td>${escapeHtml(ch.name || '—')}</td>
          <td class="mono">${fmt(ch.amount || 0)}</td>
          <td>${ch.paid ? '<span class="badge b-success">Paid</span>' : '<span class="badge b-warn">Pending</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="empty-state"><i class="fa-solid fa-receipt"></i><div>No charges</div></div>';
}
