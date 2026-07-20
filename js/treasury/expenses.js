/* FinCraft · treasury/expenses.js — Phase 7: Expense Management Through Teller Or Bank.
   No separate petty-cash module (per the brief) — the teller/cashier already modeled in Fineract
   is the cash custodian for TELLER_CASH-sourced expenses, exactly as it is for Phase 6's loan
   disbursements. Lifecycle: PENDING -> APPROVED -> PAID, or PENDING -> REJECTED. REVERSED/
   CANCELLED are explicitly out of scope for this phase (see log §9, Deferred Work) — paying an
   expense is currently a one-way door, same as it is in most real cash-handling processes
   (a mispayment gets corrected by a manual adjusting entry, not an automated "undo"). */

import { api } from '../api.js';
import { requireThresholds } from './thresholds.js';
import { validateCashierCanPay } from './teller-balance.js';
import { recordTellerEvent } from './teller-events.js';
import { TreasuryReconciliationGapError } from './errors.js';

const REQUESTS_TABLE = 'dt_expense_requests';
const APPROVALS_TABLE = 'dt_expense_approvals';

const STATUS = Object.freeze({ PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', PAID: 'PAID' });
const PAYMENT_SOURCE = Object.freeze({ TELLER_CASH: 'TELLER_CASH', BANK: 'BANK' });

async function getExpense(officeId, expenseId) {
  const row = await api.treasury.getRow(REQUESTS_TABLE, officeId, expenseId);
  if (!row) throw new Error(`Expense ${expenseId} not found for office ${officeId}`);
  return row;
}

function assertStatus(expense, expected, action) {
  if (expense.status !== expected) {
    throw new Error(`Cannot ${action} expense ${expense.id}: status is ${expense.status}, expected ${expected}`);
  }
}

/**
 * @param {object} payload
 * @param {number} payload.officeId
 * @param {string} payload.expenseCategory
 * @param {number} payload.expenseGlAccountId
 * @param {number} payload.amount
 * @param {string} payload.currencyCode
 * @param {string} payload.requestedBy
 * @param {string} [payload.narration]
 * @param {string} [payload.receiptUrl]
 */
export async function createExpenseRequest(payload) {
  const required = ['officeId', 'expenseCategory', 'expenseGlAccountId', 'amount', 'currencyCode', 'requestedBy'];
  const missing = required.filter(f => payload[f] === undefined || payload[f] === null || payload[f] === '');
  if (missing.length) throw new Error(`createExpenseRequest: missing required field(s): ${missing.join(', ')}`);
  if (!(Number(payload.amount) > 0)) throw new Error('createExpenseRequest: amount must be a positive number');

  const row = {
    expense_category: payload.expenseCategory,
    expense_gl_account_id: payload.expenseGlAccountId,
    amount: Number(payload.amount),
    currency_code: payload.currencyCode,
    narration: payload.narration ?? null,
    requested_by: payload.requestedBy,
    receipt_url: payload.receiptUrl ?? null,
    status: STATUS.PENDING,
    payment_source: null, teller_id: null, cashier_id: null, bank_gl_account_id: null,
    fineract_je_transaction_id: null, paid_date: null,
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  };
  const result = await api.treasury.createRow(REQUESTS_TABLE, payload.officeId, row);
  return { officeId: payload.officeId, expenseId: result?.resourceId };
}

async function recordApproval(officeId, expenseId, action, approver, reason, actionDate) {
  return api.treasury.createRow(APPROVALS_TABLE, officeId, {
    expense_row_id: expenseId,
    action, approver,
    reason: reason ?? null,
    action_date: actionDate || new Date().toISOString().slice(0, 10),
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  });
}

export async function approveExpense(officeId, expenseId, approver) {
  const expense = await getExpense(officeId, expenseId);
  assertStatus(expense, STATUS.PENDING, 'approve');
  await api.treasury.updateRow(REQUESTS_TABLE, officeId, expenseId, { status: STATUS.APPROVED, locale: 'en', dateFormat: 'yyyy-MM-dd' });
  await recordApproval(officeId, expenseId, 'APPROVE', approver);
  return { officeId, expenseId, status: STATUS.APPROVED };
}

export async function rejectExpense(officeId, expenseId, approver, reason) {
  const expense = await getExpense(officeId, expenseId);
  assertStatus(expense, STATUS.PENDING, 'reject');
  await api.treasury.updateRow(REQUESTS_TABLE, officeId, expenseId, { status: STATUS.REJECTED, locale: 'en', dateFormat: 'yyyy-MM-dd' });
  await recordApproval(officeId, expenseId, 'REJECT', approver, reason);
  return { officeId, expenseId, status: STATUS.REJECTED };
}

/**
 * @param {number} officeId
 * @param {number} expenseId
 * @param {object} paymentPayload
 * @param {'TELLER_CASH'|'BANK'} paymentPayload.paymentSource
 * @param {string} paymentPayload.transactionDate  'YYYY-MM-DD'
 * @param {number} [paymentPayload.tellerId]        required if paymentSource === TELLER_CASH
 * @param {number} [paymentPayload.cashierId]        required if paymentSource === TELLER_CASH
 * @param {number} [paymentPayload.bankGlAccountId]  optional override of dt_treasury_thresholds' bank_gl_account_id
 * @param {string} [paymentPayload.performedBy]
 */
export async function payExpense(officeId, expenseId, paymentPayload) {
  const expense = await getExpense(officeId, expenseId);
  assertStatus(expense, STATUS.APPROVED, 'pay');

  const { paymentSource, transactionDate } = paymentPayload;
  if (paymentSource !== PAYMENT_SOURCE.TELLER_CASH && paymentSource !== PAYMENT_SOURCE.BANK) {
    throw new Error(`payExpense: paymentSource must be TELLER_CASH or BANK, got "${paymentSource}"`);
  }

  if (paymentSource === PAYMENT_SOURCE.TELLER_CASH) {
    return payFromTeller(officeId, expense, paymentPayload);
  }
  return payFromBank(officeId, expense, paymentPayload);
}

async function payFromTeller(officeId, expense, { tellerId, cashierId, transactionDate, performedBy }) {
  if (!tellerId || !cashierId) throw new Error('payExpense (TELLER_CASH): tellerId and cashierId are both required');

  const t = await requireThresholds(officeId); // for cash_at_tellers_gl_account_id
  await validateCashierCanPay(officeId, tellerId, cashierId, expense.amount); // Phase 4 guard, exact error message

  // Dr Expense GL / Cr Cash At Tellers GL
  const je = await api.journalEntries.create({
    officeId, transactionDate,
    currencyCode: expense.currency_code,
    debits: [{ glAccountId: expense.expense_gl_account_id, amount: expense.amount, comments: expense.narration || undefined }],
    credits: [{ glAccountId: t.cashAtTellersGlAccountId, amount: expense.amount }],
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  });

  try {
    await recordTellerEvent({
      officeId, tellerId, cashierId,
      transactionType: 'EXPENSE_PAYMENT',
      amount: expense.amount,
      currencyCode: expense.currency_code,
      transactionDate,
      fineractEntityType: 'JOURNALENTRY',
      fineractEntityId: expense.id,
      fineractTransactionId: String(je?.transactionId ?? ''),
      narration: expense.narration,
      createdBy: performedBy
    });
    await api.treasury.updateRow('dt_expense_requests', officeId, expense.id, {
      status: STATUS.PAID, payment_source: PAYMENT_SOURCE.TELLER_CASH,
      teller_id: tellerId, cashier_id: cashierId,
      fineract_je_transaction_id: String(je?.transactionId ?? ''),
      paid_date: transactionDate, locale: 'en', dateFormat: 'yyyy-MM-dd'
    });
    return { officeId, expenseId: expense.id, status: STATUS.PAID, fineractTransactionId: je?.transactionId };
  } catch (afterJeErr) {
    throw new TreasuryReconciliationGapError(
      `Expense ${expense.id} payment of ${expense.amount} posted a journal entry in Fineract (transactionId=${je?.transactionId}) but recording the teller event / expense status afterwards failed. Reconcile manually.`,
      { fineractTransactionId: je?.transactionId, cause: afterJeErr }
    );
  }
}

async function payFromBank(officeId, expense, { transactionDate, bankGlAccountId }) {
  const glAccountId = bankGlAccountId ?? (await requireThresholds(officeId)).bankGlAccountId;

  // Dr Expense GL / Cr Bank GL. No teller event — this path never touches a cashier's cash.
  const je = await api.journalEntries.create({
    officeId, transactionDate,
    currencyCode: expense.currency_code,
    debits: [{ glAccountId: expense.expense_gl_account_id, amount: expense.amount, comments: expense.narration || undefined }],
    credits: [{ glAccountId, amount: expense.amount }],
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  });

  try {
    await api.treasury.updateRow('dt_expense_requests', officeId, expense.id, {
      status: STATUS.PAID, payment_source: PAYMENT_SOURCE.BANK, bank_gl_account_id: glAccountId,
      fineract_je_transaction_id: String(je?.transactionId ?? ''),
      paid_date: transactionDate, locale: 'en', dateFormat: 'yyyy-MM-dd'
    });
    return { officeId, expenseId: expense.id, status: STATUS.PAID, fineractTransactionId: je?.transactionId };
  } catch (afterJeErr) {
    throw new TreasuryReconciliationGapError(
      `Expense ${expense.id} payment of ${expense.amount} posted a journal entry in Fineract (transactionId=${je?.transactionId}) but marking the expense PAID afterwards failed. Reconcile manually.`,
      { fineractTransactionId: je?.transactionId, cause: afterJeErr }
    );
  }
}

export { STATUS as EXPENSE_STATUS, PAYMENT_SOURCE };
