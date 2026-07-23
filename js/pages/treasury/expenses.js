/* FinCraft · pages/treasury/expenses.js — the Expense Management view.
   Third WRITE screen in Phase 11 — the first genuine multi-step lifecycle UI (request -> approve
   /reject -> pay), wrapping Phase 7's js/treasury/expenses.js. Structurally closer to Daily
   Reconciliation than to the single-form Cash Allocation/Loan Disbursement screens, so it pairs a
   "New Request" form with a per-office expenses list whose action buttons change with each row's
   status. Approve/Reject/Pay all use the same expandable-detail-row pattern as teller-console.js's
   events drill-down rather than a modal, so no new UI plumbing is introduced.

   PENDING  -> Approve (inline confirm) | Reject (inline reason)
   APPROVED -> Pay (inline TELLER_CASH/BANK form)
   PAID / REJECTED -> read-only. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { toast, confirm } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import {
  createExpenseRequest, approveExpense, rejectExpense, payExpense, EXPENSE_STATUS
} from '../../treasury/expenses.js';
import { TreasuryReconciliationGapError } from '../../treasury/errors.js';
import {
  officeOptionsHtml, glOptionsHtml, statusBadgeClass, fmtMoney,
  loadOfficeTellerCashierList, tellerCashierOptionsHtml
} from './shared.js';

function today() { return new Date().toISOString().slice(0, 10); }
function currentUser() { return (store.get('auth') || {}).username || 'unknown'; }

/** Surfaces a TreasuryReconciliationGapError with the distinct "action required" framing errors.js
 *  documents (real money already moved in Fineract), and everything else as an ordinary failure —
 *  same treatment as cash-allocation.js/loan-disbursement.js, so all three write screens behave
 *  identically when a partial failure happens. */
function reportActionError(err, ordinaryTitle) {
  if (err instanceof TreasuryReconciliationGapError) {
    toast('error', 'Reconciliation gap — action required', err.message);
  } else {
    toast('error', ordinaryTitle, err?.message || String(err));
  }
}

function expenseRowsHtml(expenses) {
  if (!expenses.length) return '<tr><td colspan="6" class="text-muted text-center">No expense requests recorded for this office yet</td></tr>';
  return expenses
    .slice()
    .sort((a, b) => (b.id || 0) - (a.id || 0)) // newest first
    .map(e => {
      const actions = [];
      if (e.status === EXPENSE_STATUS.PENDING) {
        actions.push(`<button class="btn-secondary btn-sm" data-approve="${e.id}"><i class="fa-solid fa-check"></i> Approve</button>`);
        actions.push(`<button class="btn-secondary btn-sm" data-reject="${e.id}"><i class="fa-solid fa-xmark"></i> Reject</button>`);
      } else if (e.status === EXPENSE_STATUS.APPROVED) {
        actions.push(`<button class="btn-primary btn-sm" data-pay="${e.id}"><i class="fa-solid fa-money-bill-wave"></i> Pay</button>`);
      }
      return `
        <tr>
          <td>#${e.id}</td>
          <td>${escapeHtml(e.expense_category || '')}<div class="text-muted">${escapeHtml(e.narration || '')}</div></td>
          <td class="text-right">${fmtMoney(e.amount, e.currency_code)}</td>
          <td>${escapeHtml(e.requested_by || '')}</td>
          <td><span class="badge ${statusBadgeClass(e.status)}">${escapeHtml(e.status || '')}</span></td>
          <td class="text-right">${actions.join(' ') || '<span class="text-muted">—</span>'}</td>
        </tr>
        <tr class="hidden" id="txe-detail-${e.id}"><td colspan="6"></td></tr>`;
    }).join('');
}

function detailCell(c, expenseId) {
  return c.querySelector(`#txe-detail-${expenseId} td`);
}
function detailRow(c, expenseId) {
  return c.querySelector(`#txe-detail-${expenseId}`);
}
function closeDetail(c, expenseId) {
  detailRow(c, expenseId)?.classList.add('hidden');
}

async function reloadList(c, officeId) {
  const listBody = c.querySelector('#txe-list-body');
  listBody.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading expenses…</div></div>';
  let expenses = [];
  try {
    const rows = await api.treasury.queryRows('dt_expense_requests', officeId);
    expenses = Array.isArray(rows) ? rows : [];
  } catch (err) {
    listBody.innerHTML = `<div class="empty-state">Failed to load expenses: ${escapeHtml(err?.message || String(err))}</div>`;
    return;
  }
  listBody.innerHTML = `
    <table class="table">
      <thead><tr><th>ID</th><th>Category</th><th class="text-right">Amount</th><th>Requested By</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${expenseRowsHtml(expenses)}</tbody>
    </table>`;
  wireRowActions(c, officeId);
}

function wireRowActions(c, officeId) {
  c.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
    const expenseId = Number(btn.dataset.approve);
    const ok = await confirm({ title: 'Approve expense', message: `Approve expense #${expenseId}? It can then be paid from teller cash or the bank.`, confirmText: 'Approve' });
    if (!ok) return;
    btn.disabled = true;
    try {
      await approveExpense(officeId, expenseId, currentUser());
      toast('success', 'Expense approved', `Expense #${expenseId} is now APPROVED`);
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Approval failed'); btn.disabled = false; }
  }));

  c.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
    const expenseId = Number(btn.dataset.reject);
    const row = detailRow(c, expenseId);
    if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    detailCell(c, expenseId).innerHTML = `
      <div class="form-grid">
        <label><span class="form-label">Rejection reason</span>
          <input class="form-control" id="txe-reject-reason-${expenseId}" placeholder="Why is this being rejected?"/>
        </label>
        <button class="btn-danger btn-sm mt-2" id="txe-reject-go-${expenseId}"><i class="fa-solid fa-ban"></i> Confirm Rejection</button>
      </div>`;
    c.querySelector(`#txe-reject-go-${expenseId}`).addEventListener('click', async () => {
      const reason = c.querySelector(`#txe-reject-reason-${expenseId}`).value.trim();
      if (!reason) { toast('warn', 'Reason required', 'Enter a reason for rejecting this expense'); return; }
      const goBtn = c.querySelector(`#txe-reject-go-${expenseId}`);
      goBtn.disabled = true;
      try {
        await rejectExpense(officeId, expenseId, currentUser(), reason);
        toast('success', 'Expense rejected', `Expense #${expenseId} was rejected`);
        closeDetail(c, expenseId);
        await reloadList(c, officeId);
      } catch (err) { reportActionError(err, 'Rejection failed'); goBtn.disabled = false; }
    });
  }));

  c.querySelectorAll('[data-pay]').forEach(btn => btn.addEventListener('click', () => openPayForm(c, officeId, Number(btn.dataset.pay))));
}

async function openPayForm(c, officeId, expenseId) {
  const row = detailRow(c, expenseId);
  if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  const cell = detailCell(c, expenseId);
  cell.innerHTML = '<div class="empty-state-row">Loading payment options…</div>';

  const tellerCashierList = await loadOfficeTellerCashierList(officeId).catch(() => []);
  cell.innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Payment Source</span>
        <select class="form-control" id="txe-src-${expenseId}">
          <option value="BANK">Bank</option>
          <option value="TELLER_CASH">Teller Cash</option>
        </select>
      </label>
      <label id="txe-tc-wrap-${expenseId}" class="hidden"><span class="form-label">Teller / Cashier</span>
        <select class="form-control" id="txe-tc-${expenseId}">${tellerCashierOptionsHtml(tellerCashierList)}</select>
      </label>
      <label><span class="form-label">Transaction Date</span>
        <input class="form-control" id="txe-date-${expenseId}" type="date" value="${today()}"/>
      </label>
      <button class="btn-primary btn-sm mt-2" id="txe-pay-go-${expenseId}"><i class="fa-solid fa-money-bill-wave"></i> Confirm Payment</button>
    </div>`;

  const srcSelect = c.querySelector(`#txe-src-${expenseId}`);
  const tcWrap = c.querySelector(`#txe-tc-wrap-${expenseId}`);
  const syncSource = () => tcWrap.classList.toggle('hidden', srcSelect.value !== 'TELLER_CASH');
  srcSelect.addEventListener('change', syncSource);
  syncSource();

  c.querySelector(`#txe-pay-go-${expenseId}`).addEventListener('click', async () => {
    const goBtn = c.querySelector(`#txe-pay-go-${expenseId}`);
    const paymentSource = srcSelect.value;
    const transactionDate = c.querySelector(`#txe-date-${expenseId}`).value;
    if (!transactionDate) { toast('warn', 'Missing date', 'Select a transaction date'); return; }

    const paymentPayload = { paymentSource, transactionDate, performedBy: currentUser() };
    if (paymentSource === 'TELLER_CASH') {
      const tcValue = c.querySelector(`#txe-tc-${expenseId}`).value;
      const [tellerId, cashierId] = tcValue.split(':').map(Number);
      if (!tellerId || !cashierId) { toast('warn', 'Select a teller/cashier', 'Teller cash payments need a cashier to pay from'); return; }
      paymentPayload.tellerId = tellerId;
      paymentPayload.cashierId = cashierId;
    }

    goBtn.disabled = true;
    try {
      const result = await payExpense(officeId, expenseId, paymentPayload);
      toast('success', 'Expense paid', `Expense #${expenseId} paid (Fineract transaction ${result.fineractTransactionId}).`);
      closeDetail(c, expenseId);
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Payment failed'); goBtn.disabled = false; }
  });
}

async function loadFormForOffice(c, officeId, glAccounts) {
  const body = c.querySelector('#txe-new-body');
  body.innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Expense Category *</span>
        <input class="form-control" id="txe-category" placeholder="e.g. Utilities, Fuel, Repairs"/>
      </label>
      <label><span class="form-label">Expense GL Account *</span>
        <select class="form-control" id="txe-gl">${glOptionsHtml(glAccounts, null, true)}</select>
      </label>
      <label><span class="form-label">Amount *</span>
        <input class="form-control" id="txe-amount" type="number" min="0.01" step="0.01" placeholder="0.00"/>
      </label>
      <label><span class="form-label">Currency Code *</span>
        <input class="form-control" id="txe-currency" maxlength="3" style="text-transform:uppercase" value="USD"/>
      </label>
      <label><span class="form-label">Narration</span>
        <input class="form-control" id="txe-narration" placeholder="Optional"/>
      </label>
      <button class="btn-primary mt-2" id="txe-create"><i class="fa-solid fa-plus"></i> Submit Request</button>
    </div>`;

  c.querySelector('#txe-create').addEventListener('click', async () => {
    const btn = c.querySelector('#txe-create');
    const expenseCategory = c.querySelector('#txe-category').value.trim();
    const expenseGlAccountId = c.querySelector('#txe-gl').value;
    const amount = Number(c.querySelector('#txe-amount').value);
    const currencyCode = c.querySelector('#txe-currency').value.trim().toUpperCase();
    const narration = c.querySelector('#txe-narration').value.trim();

    if (!expenseCategory) { toast('warn', 'Missing category', 'Enter an expense category'); return; }
    if (!expenseGlAccountId) { toast('warn', 'Missing GL account', 'Choose the expense GL account to debit'); return; }
    if (!(amount > 0)) { toast('warn', 'Invalid amount', 'Enter an amount greater than zero'); return; }
    if (!currencyCode || currencyCode.length !== 3) { toast('warn', 'Invalid currency', 'Currency code must be 3 letters (e.g. USD)'); return; }

    btn.disabled = true;
    try {
      const { expenseId } = await createExpenseRequest({
        officeId, expenseCategory, expenseGlAccountId: Number(expenseGlAccountId),
        amount, currencyCode, narration: narration || undefined, requestedBy: currentUser()
      });
      toast('success', 'Request submitted', `Expense #${expenseId} created (PENDING approval)`);
      c.querySelector('#txe-category').value = '';
      c.querySelector('#txe-amount').value = '';
      c.querySelector('#txe-narration').value = '';
      await reloadList(c, officeId);
    } catch (err) {
      toast('error', 'Request failed', err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });

  await reloadList(c, officeId);
}

export async function expenses(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Expense Management</h1>
        <div class="page-subtitle">Request, approve, and pay operational expenses through teller cash or the bank</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3 class="card-title">Office</h3></div>
      <div class="card-body">
        <div class="form-grid">
          <label><span class="form-label">Office</span>
            <select class="form-control" id="txe-office"><option>Loading…</option></select>
          </label>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">New Expense Request</h3></div>
      <div class="card-body" id="txe-new-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Expenses</h3></div>
      <div class="card-body" id="txe-list-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [], glAccounts = [];
  try {
    [offices, glAccounts] = await Promise.all([
      api.offices.list().catch(() => []),
      api.glAccounts.list().catch(() => [])
    ]);
  } catch (err) { toast('error', 'Failed to load offices/GL accounts', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];
  glAccounts = Array.isArray(glAccounts) ? glAccounts : [];

  const officeSelect = c.querySelector('#txe-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#txe-new-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    c.querySelector('#txe-list-body').innerHTML = '';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadFormForOffice(c, offices[0].id, glAccounts);

  officeSelect.addEventListener('change', () => loadFormForOffice(c, Number(officeSelect.value), glAccounts));
}
