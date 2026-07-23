/* FinCraft · pages/treasury/borrowings.js — the Borrowings view.
   Fourth WRITE screen in Phase 11 — a create form plus a per-borrowing action list, wrapping
   Phase 8's js/treasury/borrowings.js (orchestration) and borrowing-schedule.js (schedule math).
   Each borrowing's row shows its status/outstanding, exposes the one action valid for that status
   (PENDING -> Drawdown; ACTIVE -> expandable schedule with per-installment Accrue / Pay Interest /
   Repay Principal; CLOSED -> read-only), and reuses the same expandable-detail-row drill-down
   pattern as teller-console.js/expenses.js rather than introducing a modal.

   Accounting legs are all posted inside the Phase 8 service (Dr/Cr per the integration brief) —
   this screen only collects inputs and reports success/failure, keeping the exact same
   TreasuryReconciliationGapError "action required" treatment as every other treasury write screen. */

import { api } from '../../api.js';
import { toast, confirm } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import {
  createBorrowing, postBorrowingDrawdown, accrueInterest, payBorrowingInterest,
  repayBorrowingPrincipal, getBorrowingsDashboard, BORROWING_STATUS
} from '../../treasury/borrowings.js';
import { TreasuryReconciliationGapError } from '../../treasury/errors.js';
import { officeOptionsHtml, statusBadgeClass, fmtMoney } from './shared.js';

function today() { return new Date().toISOString().slice(0, 10); }

function reportActionError(err, ordinaryTitle) {
  if (err instanceof TreasuryReconciliationGapError) {
    toast('error', 'Reconciliation gap — action required', err.message);
  } else {
    toast('error', ordinaryTitle, err?.message || String(err));
  }
}

function fundingSourceSelect(id) {
  return `<select class="form-control" id="${id}"><option value="BANK">Bank</option><option value="VAULT">Vault</option></select>`;
}

function borrowingRowsHtml(borrowings) {
  if (!borrowings.length) return '<tr><td colspan="7" class="text-muted text-center">No borrowings recorded for this office yet</td></tr>';
  return borrowings
    .slice()
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .map(b => {
      let action = '<span class="text-muted">—</span>';
      if (b.status === BORROWING_STATUS.PENDING) {
        action = `<button class="btn-primary btn-sm" data-drawdown="${b.id}"><i class="fa-solid fa-hand-holding-dollar"></i> Draw Down</button>`;
      } else if (b.status === BORROWING_STATUS.ACTIVE) {
        action = `<button class="btn-secondary btn-sm" data-schedule="${b.id}"><i class="fa-solid fa-list-ol"></i> Schedule</button>`;
      }
      return `
        <tr>
          <td>#${b.id}</td>
          <td>${escapeHtml(b.lender_name || '')}<div class="text-muted">${escapeHtml(b.interest_method || '')} · ${escapeHtml(String(b.interest_rate ?? ''))}% · ${escapeHtml(String(b.tenor_months ?? ''))}m</div></td>
          <td class="text-right">${fmtMoney(b.principal_amount)}</td>
          <td class="text-right">${fmtMoney(b.outstanding_principal)}</td>
          <td>${escapeHtml(b.start_date || '')}</td>
          <td><span class="badge ${statusBadgeClass(b.status)}">${escapeHtml(b.status || '')}</span></td>
          <td class="text-right">${action}</td>
        </tr>
        <tr class="hidden" id="txb-detail-${b.id}"><td colspan="7"></td></tr>`;
    }).join('');
}

function detailRow(c, id) { return c.querySelector(`#txb-detail-${id}`); }
function detailCell(c, id) { return c.querySelector(`#txb-detail-${id} td`); }

function scheduleRowsHtml(schedule) {
  if (!schedule.length) return '<tr><td colspan="8" class="text-muted text-center">No schedule installments found</td></tr>';
  return schedule
    .slice()
    .sort((a, b) => (a.installment_no || 0) - (b.installment_no || 0))
    .map(s => {
      const interestRemaining = (Number(s.interest_due) || 0) - (Number(s.interest_paid) || 0);
      const principalRemaining = (Number(s.principal_due) || 0) - (Number(s.principal_paid) || 0);
      return `
        <tr>
          <td>${s.installment_no}</td>
          <td>${escapeHtml(s.due_date || '')}</td>
          <td class="text-right">${fmtMoney(s.principal_due)}</td>
          <td class="text-right">${fmtMoney(s.interest_due)}</td>
          <td><span class="badge ${statusBadgeClass(s.status)}">${escapeHtml(s.status || '')}</span></td>
          <td class="text-right">
            <button class="btn-secondary btn-sm" data-accrue="${s.id}" title="Dr Interest Expense / Cr Interest Payable"><i class="fa-solid fa-clock"></i> Accrue</button>
            <button class="btn-secondary btn-sm" data-payint="${s.id}" ${interestRemaining > 0.01 ? '' : 'disabled'}><i class="fa-solid fa-coins"></i> Pay Interest</button>
            <button class="btn-secondary btn-sm" data-repay="${s.id}" ${principalRemaining > 0.01 ? '' : 'disabled'}><i class="fa-solid fa-money-bill-transfer"></i> Repay Principal</button>
          </td>
        </tr>`;
    }).join('');
}

async function toggleSchedule(c, officeId, borrowingId) {
  const row = detailRow(c, borrowingId);
  if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  await renderScheduleInto(c, officeId, borrowingId);
}

/** Fetches this borrowing's schedule installments and (re)renders them into the already-open
 *  detail cell, wiring up each installment's accrue/pay/repay action. Kept separate from
 *  toggleSchedule so a post-action refresh can re-render the schedule in place, without the
 *  collapse-then-reopen flicker a double-toggle would cause. */
async function renderScheduleInto(c, officeId, borrowingId) {
  const cell = detailCell(c, borrowingId);
  cell.innerHTML = '<div class="empty-state-row">Loading schedule…</div>';

  let schedule = [];
  try {
    const rows = await api.treasury.queryRows('dt_office_borrowing_schedule', officeId);
    schedule = (Array.isArray(rows) ? rows : []).filter(r => r.borrowing_row_id === borrowingId);
  } catch (err) {
    cell.innerHTML = `<div class="text-muted">Failed to load schedule: ${escapeHtml(err?.message || String(err))}</div>`;
    return;
  }

  cell.innerHTML = `
    <table class="table">
      <thead><tr><th>#</th><th>Due Date</th><th class="text-right">Principal Due</th><th class="text-right">Interest Due</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${scheduleRowsHtml(schedule)}</tbody>
    </table>`;

  cell.querySelectorAll('[data-accrue]').forEach(btn => btn.addEventListener('click', async () => {
    const scheduleId = Number(btn.dataset.accrue);
    const ok = await confirm({ title: 'Accrue interest', message: `Post interest accrual for installment ${scheduleId}? (Dr Interest Expense / Cr Interest Payable)`, confirmText: 'Accrue' });
    if (!ok) return;
    btn.disabled = true;
    try {
      const r = await accrueInterest(officeId, borrowingId, scheduleId, { transactionDate: today() });
      toast('success', 'Interest accrued', `Accrual posted (Fineract transaction ${r.fineractTransactionId})`);
      await renderScheduleInto(c, officeId, borrowingId);
    } catch (err) { reportActionError(err, 'Accrual failed'); btn.disabled = false; }
  }));

  cell.querySelectorAll('[data-payint]').forEach(btn => btn.addEventListener('click', async () => {
    const scheduleId = Number(btn.dataset.payint);
    const ok = await confirm({ title: 'Pay interest', message: `Pay this installment's remaining interest? (Dr Interest Payable / Cr Bank/Vault)`, confirmText: 'Pay Interest' });
    if (!ok) return;
    btn.disabled = true;
    try {
      const r = await payBorrowingInterest(officeId, borrowingId, scheduleId, { transactionDate: today() });
      toast('success', 'Interest paid', `Paid ${fmtMoney(r.amountPaid)} (Fineract transaction ${r.fineractTransactionId})`);
      await renderScheduleInto(c, officeId, borrowingId);
    } catch (err) { reportActionError(err, 'Interest payment failed'); btn.disabled = false; }
  }));

  cell.querySelectorAll('[data-repay]').forEach(btn => btn.addEventListener('click', async () => {
    const scheduleId = Number(btn.dataset.repay);
    const ok = await confirm({ title: 'Repay principal', message: `Repay this installment's remaining principal? (Dr Borrowings Liability / Cr Bank/Vault)`, confirmText: 'Repay' });
    if (!ok) return;
    btn.disabled = true;
    try {
      const r = await repayBorrowingPrincipal(officeId, borrowingId, scheduleId, { transactionDate: today() });
      toast('success', 'Principal repaid', `Repaid ${fmtMoney(r.amountPaid)}. Outstanding: ${fmtMoney(r.outstandingPrincipal)} (Fineract transaction ${r.fineractTransactionId})`);
      // A repayment changes the parent borrowing's outstanding/status (and can auto-close it once
      // it hits zero), so refresh the whole list — this collapses the schedule back to the list
      // view, showing the updated outstanding figure and any PENDING->ACTIVE->CLOSED transition.
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Principal repayment failed'); btn.disabled = false; }
  }));
}

function openDrawdownForm(c, officeId, borrowingId) {
  const row = detailRow(c, borrowingId);
  if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  detailCell(c, borrowingId).innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Funding Destination</span>${fundingSourceSelect(`txb-dd-src-${borrowingId}`)}</label>
      <label><span class="form-label">Transaction Date</span>
        <input class="form-control" id="txb-dd-date-${borrowingId}" type="date" value="${today()}"/>
      </label>
      <button class="btn-primary btn-sm mt-2" id="txb-dd-go-${borrowingId}"><i class="fa-solid fa-hand-holding-dollar"></i> Confirm Drawdown</button>
    </div>`;
  c.querySelector(`#txb-dd-go-${borrowingId}`).addEventListener('click', async () => {
    const goBtn = c.querySelector(`#txb-dd-go-${borrowingId}`);
    const fundingSource = c.querySelector(`#txb-dd-src-${borrowingId}`).value;
    const transactionDate = c.querySelector(`#txb-dd-date-${borrowingId}`).value;
    if (!transactionDate) { toast('warn', 'Missing date', 'Select a transaction date'); return; }
    goBtn.disabled = true;
    try {
      const r = await postBorrowingDrawdown(officeId, borrowingId, { transactionDate, fundingSource });
      toast('success', 'Drawdown posted', `Borrowing #${borrowingId} is now ACTIVE (Fineract transaction ${r.fineractTransactionId})`);
      row.classList.add('hidden');
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Drawdown failed'); goBtn.disabled = false; }
  });
}

async function reloadList(c, officeId) {
  const listBody = c.querySelector('#txb-list-body');
  listBody.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading borrowings…</div></div>';
  let dash;
  try {
    dash = await getBorrowingsDashboard(officeId);
  } catch (err) {
    listBody.innerHTML = `<div class="empty-state">Failed to load borrowings: ${escapeHtml(err?.message || String(err))}</div>`;
    return;
  }
  listBody.innerHTML = `
    <div class="mb-3 text-muted">
      Active: <strong>${dash.activeCount}</strong> &nbsp;·&nbsp;
      Total Principal: <strong>${fmtMoney(dash.totalPrincipal)}</strong> &nbsp;·&nbsp;
      Total Outstanding: <strong>${fmtMoney(dash.totalOutstandingPrincipal)}</strong>
    </div>
    <table class="table">
      <thead><tr><th>ID</th><th>Lender</th><th class="text-right">Principal</th><th class="text-right">Outstanding</th><th>Start</th><th>Status</th><th class="text-right">Action</th></tr></thead>
      <tbody>${borrowingRowsHtml(dash.borrowings)}</tbody>
    </table>`;

  c.querySelectorAll('[data-drawdown]').forEach(btn => btn.addEventListener('click', () => openDrawdownForm(c, officeId, Number(btn.dataset.drawdown))));
  c.querySelectorAll('[data-schedule]').forEach(btn => btn.addEventListener('click', () => toggleSchedule(c, officeId, Number(btn.dataset.schedule))));
}

async function loadFormForOffice(c, officeId) {
  const body = c.querySelector('#txb-new-body');
  body.innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Lender Name *</span>
        <input class="form-control" id="txb-lender" placeholder="e.g. First Bank"/>
      </label>
      <label><span class="form-label">Lender Type</span>
        <input class="form-control" id="txb-lender-type" placeholder="e.g. Commercial Bank"/>
      </label>
      <label><span class="form-label">Principal Amount *</span>
        <input class="form-control" id="txb-principal" type="number" min="0.01" step="0.01" placeholder="0.00"/>
      </label>
      <label><span class="form-label">Interest Rate (annual %) *</span>
        <input class="form-control" id="txb-rate" type="number" min="0" step="0.01" placeholder="e.g. 12"/>
      </label>
      <label><span class="form-label">Interest Method *</span>
        <select class="form-control" id="txb-method">
          <option value="FLAT">Flat</option>
          <option value="REDUCING_BALANCE">Reducing Balance</option>
        </select>
      </label>
      <label><span class="form-label">Start Date *</span>
        <input class="form-control" id="txb-start" type="date" value="${today()}"/>
      </label>
      <label><span class="form-label">Tenor (months) *</span>
        <input class="form-control" id="txb-tenor" type="number" min="1" step="1" placeholder="e.g. 12"/>
      </label>
      <label><span class="form-label">Repayment Frequency *</span>
        <select class="form-control" id="txb-freq">
          <option value="MONTHLY">Monthly</option>
        </select>
      </label>
      <button class="btn-primary mt-2" id="txb-create"><i class="fa-solid fa-plus"></i> Create Borrowing</button>
    </div>`;

  c.querySelector('#txb-create').addEventListener('click', async () => {
    const btn = c.querySelector('#txb-create');
    const payload = {
      officeId,
      lenderName: c.querySelector('#txb-lender').value.trim(),
      lenderType: c.querySelector('#txb-lender-type').value.trim() || undefined,
      principalAmount: Number(c.querySelector('#txb-principal').value),
      interestRate: Number(c.querySelector('#txb-rate').value),
      interestMethod: c.querySelector('#txb-method').value,
      startDate: c.querySelector('#txb-start').value,
      tenorMonths: Number(c.querySelector('#txb-tenor').value),
      repaymentFrequency: c.querySelector('#txb-freq').value
    };

    if (!payload.lenderName) { toast('warn', 'Missing lender', 'Enter the lender name'); return; }
    if (!(payload.principalAmount > 0)) { toast('warn', 'Invalid principal', 'Enter a principal greater than zero'); return; }
    if (!(payload.interestRate >= 0)) { toast('warn', 'Invalid rate', 'Interest rate cannot be negative'); return; }
    if (!(payload.tenorMonths >= 1) || !Number.isInteger(payload.tenorMonths)) { toast('warn', 'Invalid tenor', 'Tenor must be a whole number of months (1 or more)'); return; }
    if (!payload.startDate) { toast('warn', 'Missing start date', 'Select a start date'); return; }

    btn.disabled = true;
    try {
      const { borrowingId, schedule } = await createBorrowing(payload);
      toast('success', 'Borrowing created', `Borrowing #${borrowingId} created with ${schedule.length} installments (PENDING drawdown)`);
      c.querySelector('#txb-lender').value = '';
      c.querySelector('#txb-lender-type').value = '';
      c.querySelector('#txb-principal').value = '';
      c.querySelector('#txb-rate').value = '';
      c.querySelector('#txb-tenor').value = '';
      await reloadList(c, officeId);
    } catch (err) {
      toast('error', 'Create failed', err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });

  await reloadList(c, officeId);
}

export async function borrowings(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Borrowings</h1>
        <div class="page-subtitle">Borrowed operating funds — drawdown, interest accrual/payment, and principal repayment</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3 class="card-title">Office</h3></div>
      <div class="card-body">
        <div class="form-grid">
          <label><span class="form-label">Office</span>
            <select class="form-control" id="txb-office"><option>Loading…</option></select>
          </label>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">New Borrowing</h3></div>
      <div class="card-body" id="txb-new-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Borrowings</h3></div>
      <div class="card-body" id="txb-list-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [];
  try { offices = await api.offices.list(); } catch (err) { toast('error', 'Failed to load offices', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];

  const officeSelect = c.querySelector('#txb-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#txb-new-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    c.querySelector('#txb-list-body').innerHTML = '';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadFormForOffice(c, offices[0].id);

  officeSelect.addEventListener('change', () => loadFormForOffice(c, Number(officeSelect.value)));
}
