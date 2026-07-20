/* FinCraft · tests/treasury-expenses.test.js
   Covers js/treasury/expenses.js by stubbing api.treasury / api.journalEntries. */
import assert from 'assert';
import { api } from '../js/api.js';
import { upsertThresholds } from '../js/treasury/thresholds.js';
import { recordTellerEvent } from '../js/treasury/teller-events.js';
import {
  createExpenseRequest, approveExpense, rejectExpense, payExpense, EXPENSE_STATUS
} from '../js/treasury/expenses.js';
import { TreasuryReconciliationGapError } from '../js/treasury/errors.js';

function installStubs({ jeShouldFail = false, failAfterJe = false } = {}) {
  const requestsByOffice = new Map();   // dt_expense_requests: officeId -> row[]
  const approvalsByOffice = new Map();  // dt_expense_approvals: officeId -> row[]
  const configByOffice = new Map();     // dt_treasury_thresholds: officeId -> row
  const eventsByOffice = new Map();     // dt_teller_operational_events: officeId -> row[]
  let nextId = 1;
  const calls = { createJe: 0 };

  const originalTreasury = api.treasury;
  const originalJournalEntries = api.journalEntries;

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      const id = nextId++;
      if (name === 'dt_expense_requests') { const l = requestsByOffice.get(officeId) || []; l.push({ id, ...row }); requestsByOffice.set(officeId, l); return { resourceId: id }; }
      if (name === 'dt_expense_approvals') { const l = approvalsByOffice.get(officeId) || []; l.push({ id, ...row }); approvalsByOffice.set(officeId, l); return { resourceId: id }; }
      if (name === 'dt_treasury_thresholds') { configByOffice.set(officeId, row); return { resourceId: officeId }; }
      if (name === 'dt_teller_operational_events') {
        if (failAfterJe) throw new Error('simulated post-JE datatable failure');
        const l = eventsByOffice.get(officeId) || []; l.push({ id, ...row }); eventsByOffice.set(officeId, l); return { resourceId: id };
      }
      throw new Error(`unexpected createRow on ${name}`);
    },
    async getRow(name, officeId, rowId) {
      if (name !== 'dt_expense_requests') throw new Error(`unexpected getRow on ${name}`);
      return (requestsByOffice.get(officeId) || []).find(r => r.id === rowId);
    },
    async updateRow(name, officeId, rowId, patch) {
      if (name === 'dt_expense_requests') {
        // Only the post-JE "mark PAID + store fineract_je_transaction_id" write should fail under
        // failAfterJe — the earlier approve/reject status write must keep working, or every test
        // using this flag would fail before it even reaches payExpense().
        if (failAfterJe && patch.fineract_je_transaction_id !== undefined) throw new Error('simulated post-JE status-update failure');
        const row = (requestsByOffice.get(officeId) || []).find(r => r.id === rowId);
        Object.assign(row, patch);
        return { resourceId: rowId };
      }
      throw new Error(`unexpected updateRow on ${name}`);
    },
    async updateConfig(name, officeId, row) { configByOffice.set(officeId, { ...configByOffice.get(officeId), ...row }); return { resourceId: officeId }; },
    async queryRows(name, officeId) {
      if (name === 'dt_treasury_thresholds') return configByOffice.get(officeId) || null;
      if (name === 'dt_teller_operational_events') return eventsByOffice.get(officeId) || [];
      return [];
    }
  };

  api.journalEntries = {
    ...originalJournalEntries,
    async create(body) {
      calls.createJe++;
      if (jeShouldFail) throw new Error('Fineract 400: unbalanced journal entry');
      return { officeId: body.officeId, transactionId: 'JE-STUB-999' };
    }
  };

  return {
    calls, requestsByOffice, approvalsByOffice, eventsByOffice,
    async seedCash(officeId, tellerId, cashierId, amount) {
      await recordTellerEvent({ officeId, tellerId, cashierId, transactionType: 'CASH_ALLOCATION', amount, currencyCode: 'USD', transactionDate: '2026-01-01' });
    },
    restore() { api.treasury = originalTreasury; api.journalEntries = originalJournalEntries; }
  };
}

export async function runTests({ assert: a = assert } = {}) {
  /* 1. Full lifecycle: request -> approve -> pay from BANK. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(1, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      const { expenseId } = await createExpenseRequest({ officeId: 1, expenseCategory: 'Utilities', expenseGlAccountId: 200, amount: 5000, currencyCode: 'USD', requestedBy: 'clerk1' });
      let expense = s.requestsByOffice.get(1).find(r => r.id === expenseId);
      a.strictEqual(expense.status, EXPENSE_STATUS.PENDING);

      await approveExpense(1, expenseId, 'manager1');
      expense = s.requestsByOffice.get(1).find(r => r.id === expenseId);
      a.strictEqual(expense.status, EXPENSE_STATUS.APPROVED);
      a.strictEqual(s.approvalsByOffice.get(1)[0].action, 'APPROVE');

      const result = await payExpense(1, expenseId, { paymentSource: 'BANK', transactionDate: '2026-01-05' });
      a.strictEqual(result.status, EXPENSE_STATUS.PAID);
      a.strictEqual(s.calls.createJe, 1);
      expense = s.requestsByOffice.get(1).find(r => r.id === expenseId);
      a.strictEqual(expense.payment_source, 'BANK');
      a.strictEqual(expense.fineract_je_transaction_id, 'JE-STUB-999');
      a.strictEqual((s.eventsByOffice.get(1) || []).length, 0, 'BANK payments must never touch the teller event ledger');
    } finally { s.restore(); }
  }

  /* 2. Full lifecycle: request -> approve -> pay from TELLER_CASH, with sufficient cashier cash. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(2, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      await s.seedCash(2, 3, 9, 10000);
      const { expenseId } = await createExpenseRequest({ officeId: 2, expenseCategory: 'Office Supplies', expenseGlAccountId: 201, amount: 2000, currencyCode: 'USD', requestedBy: 'clerk1' });
      await approveExpense(2, expenseId, 'manager1');
      const result = await payExpense(2, expenseId, { paymentSource: 'TELLER_CASH', tellerId: 3, cashierId: 9, transactionDate: '2026-01-05', performedBy: 'clerk1' });
      a.strictEqual(result.status, EXPENSE_STATUS.PAID);

      const events = s.eventsByOffice.get(2);
      const expEvent = events.find(e => e.transaction_type === 'EXPENSE_PAYMENT');
      a.ok(expEvent, 'TELLER_CASH payments must record an EXPENSE_PAYMENT teller event');
      a.strictEqual(expEvent.direction, 'CASH_OUT');
      a.strictEqual(expEvent.amount, 2000);
    } finally { s.restore(); }
  }

  /* 3. TELLER_CASH pay blocked by insufficient cashier cash — reuses Phase 4's exact message,
        and must never reach Fineract's journal entry API. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(3, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      await s.seedCash(3, 3, 9, 100);
      const { expenseId } = await createExpenseRequest({ officeId: 3, expenseCategory: 'Fuel', expenseGlAccountId: 202, amount: 500, currencyCode: 'USD', requestedBy: 'clerk1' });
      await approveExpense(3, expenseId, 'manager1');
      await a.rejects(
        () => payExpense(3, expenseId, { paymentSource: 'TELLER_CASH', tellerId: 3, cashierId: 9, transactionDate: '2026-01-05' }),
        /Insufficient teller cash\. Available: 100, Requested: 500/
      );
      a.strictEqual(s.calls.createJe, 0, 'insufficient cash must block before any journal entry is posted');
    } finally { s.restore(); }
  }

  /* 4. Status guards: cannot approve/pay out of order. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(4, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      const { expenseId } = await createExpenseRequest({ officeId: 4, expenseCategory: 'Misc', expenseGlAccountId: 203, amount: 100, currencyCode: 'USD', requestedBy: 'clerk1' });

      // Can't pay a still-PENDING expense.
      await a.rejects(() => payExpense(4, expenseId, { paymentSource: 'BANK', transactionDate: '2026-01-05' }), /status is PENDING, expected APPROVED/);

      await rejectExpense(4, expenseId, 'manager1', 'not a valid business expense');
      const rejected = s.requestsByOffice.get(4).find(r => r.id === expenseId);
      a.strictEqual(rejected.status, EXPENSE_STATUS.REJECTED);

      // Can't approve an already-rejected expense.
      await a.rejects(() => approveExpense(4, expenseId, 'manager2'), /status is REJECTED, expected PENDING/);
      // Can't pay a rejected expense either.
      await a.rejects(() => payExpense(4, expenseId, { paymentSource: 'BANK', transactionDate: '2026-01-05' }), /status is REJECTED, expected APPROVED/);
      a.strictEqual(s.calls.createJe, 0);
    } finally { s.restore(); }
  }

  /* 5. Fineract journal entry itself fails -> propagated as-is, expense stays APPROVED (not PAID),
        no teller event recorded. */
  {
    const s = installStubs({ jeShouldFail: true });
    try {
      await upsertThresholds(5, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      await s.seedCash(5, 3, 9, 10000);
      const { expenseId } = await createExpenseRequest({ officeId: 5, expenseCategory: 'Repairs', expenseGlAccountId: 204, amount: 700, currencyCode: 'USD', requestedBy: 'clerk1' });
      await approveExpense(5, expenseId, 'manager1');
      await a.rejects(
        () => payExpense(5, expenseId, { paymentSource: 'TELLER_CASH', tellerId: 3, cashierId: 9, transactionDate: '2026-01-05' }),
        /unbalanced journal entry/
      );
      const expense = s.requestsByOffice.get(5).find(r => r.id === expenseId);
      a.strictEqual(expense.status, EXPENSE_STATUS.APPROVED, 'a failed JE must leave the expense APPROVED, not silently PAID');
      a.strictEqual((s.eventsByOffice.get(5) || []).filter(e => e.transaction_type === 'EXPENSE_PAYMENT').length, 0);
    } finally { s.restore(); }
  }

  /* 6. Fineract JE succeeds but the follow-up FinCraft write fails -> reconciliation-gap error,
        carrying the Fineract JE transaction id (BANK-path variant). */
  {
    const s = installStubs({ failAfterJe: true });
    try {
      await upsertThresholds(6, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' });
      const { expenseId } = await createExpenseRequest({ officeId: 6, expenseCategory: 'Rent', expenseGlAccountId: 205, amount: 3000, currencyCode: 'USD', requestedBy: 'clerk1' });
      await approveExpense(6, expenseId, 'manager1');
      let caught = null;
      try { await payExpense(6, expenseId, { paymentSource: 'BANK', transactionDate: '2026-01-05' }); }
      catch (e) { caught = e; }
      a.ok(caught instanceof TreasuryReconciliationGapError);
      a.strictEqual(caught.fineractTransactionId, 'JE-STUB-999');
      a.strictEqual(s.calls.createJe, 1, 'the journal entry itself must have actually posted before the gap occurred');
    } finally { s.restore(); }
  }
}
