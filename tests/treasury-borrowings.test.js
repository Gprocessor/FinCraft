/* FinCraft · tests/treasury-borrowings.test.js
   Covers js/treasury/borrowings.js by stubbing api.treasury / api.journalEntries. */
import assert from 'assert';
import { api } from '../js/api.js';
import { upsertThresholds } from '../js/treasury/thresholds.js';
import {
  createBorrowing, postBorrowingDrawdown, accrueInterest,
  payBorrowingInterest, repayBorrowingPrincipal, getBorrowingsDashboard,
  BORROWING_STATUS, SCHEDULE_STATUS
} from '../js/treasury/borrowings.js';
import { TreasuryReconciliationGapError } from '../js/treasury/errors.js';

function installStubs({ jeShouldFail = false } = {}) {
  const borrowingsByOffice = new Map();
  const scheduleByOffice = new Map();
  const txnsByOffice = new Map();
  const configByOffice = new Map();
  let nextId = 1;
  const calls = { createJe: 0 };

  const originalTreasury = api.treasury;
  const originalJournalEntries = api.journalEntries;

  const tableFor = (name) => name === BORROWINGS_TABLE_NAME() ? borrowingsByOffice
    : name === 'dt_office_borrowing_schedule' ? scheduleByOffice
    : name === 'dt_office_borrowing_txns' ? txnsByOffice
    : null;
  function BORROWINGS_TABLE_NAME() { return 'dt_office_borrowings'; }

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      if (name === 'dt_treasury_thresholds') { configByOffice.set(officeId, row); return { resourceId: officeId }; }
      const map = tableFor(name);
      if (!map) throw new Error(`unexpected createRow on ${name}`);
      const id = nextId++;
      const list = map.get(officeId) || [];
      list.push({ id, ...row });
      map.set(officeId, list);
      return { resourceId: id };
    },
    async getRow(name, officeId, rowId) {
      const map = tableFor(name);
      if (!map) throw new Error(`unexpected getRow on ${name}`);
      return (map.get(officeId) || []).find(r => r.id === rowId);
    },
    async updateRow(name, officeId, rowId, patch) {
      const map = tableFor(name);
      if (!map) throw new Error(`unexpected updateRow on ${name}`);
      const row = (map.get(officeId) || []).find(r => r.id === rowId);
      Object.assign(row, patch);
      return { resourceId: rowId };
    },
    async updateConfig(name, officeId, row) { configByOffice.set(officeId, { ...configByOffice.get(officeId), ...row }); return { resourceId: officeId }; },
    async queryRows(name, officeId) {
      if (name === 'dt_treasury_thresholds') return configByOffice.get(officeId) || null;
      const map = tableFor(name);
      return map ? (map.get(officeId) || []) : [];
    }
  };

  api.journalEntries = {
    ...originalJournalEntries,
    async create(body) {
      calls.createJe++;
      if (jeShouldFail) throw new Error('Fineract 400: unbalanced journal entry');
      return { officeId: body.officeId, transactionId: `JE-${calls.createJe}` };
    }
  };

  return {
    calls, borrowingsByOffice, scheduleByOffice, txnsByOffice,
    restore() { api.treasury = originalTreasury; api.journalEntries = originalJournalEntries; }
  };
}

const FULL_THRESHOLDS = {
  vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102,
  borrowingsLiabilityGlAccountId: 300, interestPayableGlAccountId: 301, interestExpenseGlAccountId: 302,
  reserveBufferAmount: 0, currencyCode: 'USD'
};

export async function runTests({ assert: a = assert } = {}) {
  /* 1. createBorrowing persists the borrowing row AND its full schedule in one call. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(1, FULL_THRESHOLDS);
      const { borrowingId, schedule } = await createBorrowing({
        officeId: 1, lenderName: 'ACME Capital', principalAmount: 120000, interestRate: 12,
        interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12, repaymentFrequency: 'MONTHLY'
      });
      a.strictEqual(schedule.length, 12);
      const borrowing = s.borrowingsByOffice.get(1).find(b => b.id === borrowingId);
      a.strictEqual(borrowing.status, BORROWING_STATUS.PENDING);
      a.strictEqual(borrowing.outstanding_principal, 120000);
      const persistedSchedule = s.scheduleByOffice.get(1);
      a.strictEqual(persistedSchedule.length, 12);
      a.strictEqual(persistedSchedule[0].borrowing_row_id, borrowingId);
      a.strictEqual(persistedSchedule[0].status, SCHEDULE_STATUS.SCHEDULED);
    } finally { s.restore(); }
  }

  /* 2. Drawdown: Dr Bank / Cr Liability, moves status PENDING -> ACTIVE, records a DRAWDOWN txn,
        and cannot be repeated. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(2, FULL_THRESHOLDS);
      const { borrowingId } = await createBorrowing({ officeId: 2, lenderName: 'ACME', principalAmount: 50000, interestRate: 10, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 6, repaymentFrequency: 'MONTHLY' });
      const result = await postBorrowingDrawdown(2, borrowingId, { transactionDate: '2026-01-01' });
      a.strictEqual(result.status, BORROWING_STATUS.ACTIVE);
      a.strictEqual(s.calls.createJe, 1);
      const borrowing = s.borrowingsByOffice.get(2).find(b => b.id === borrowingId);
      a.strictEqual(borrowing.status, BORROWING_STATUS.ACTIVE);
      const txns = s.txnsByOffice.get(2);
      a.strictEqual(txns.length, 1);
      a.strictEqual(txns[0].txn_type, 'DRAWDOWN');
      a.strictEqual(txns[0].amount, 50000);

      await a.rejects(() => postBorrowingDrawdown(2, borrowingId, { transactionDate: '2026-01-02' }), /status is ACTIVE, expected PENDING/);
      a.strictEqual(s.calls.createJe, 1, 'a repeated drawdown attempt must not post a second journal entry');
    } finally { s.restore(); }
  }

  /* 3. Interest accrual: posts once, and a second accrual attempt on the same installment is
        blocked (double-accrual guard). */
  {
    const s = installStubs();
    try {
      await upsertThresholds(3, FULL_THRESHOLDS);
      const { borrowingId, schedule } = await createBorrowing({ officeId: 3, lenderName: 'ACME', principalAmount: 12000, interestRate: 12, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12, repaymentFrequency: 'MONTHLY' });
      await postBorrowingDrawdown(3, borrowingId, { transactionDate: '2026-01-01' });
      const scheduleId = schedule[0].scheduleId;

      await accrueInterest(3, borrowingId, scheduleId, { transactionDate: '2026-02-01' });
      a.strictEqual(s.calls.createJe, 2); // drawdown + accrual
      await a.rejects(() => accrueInterest(3, borrowingId, scheduleId, { transactionDate: '2026-02-01' }), /already been accrued/);
      a.strictEqual(s.calls.createJe, 2, 'a duplicate accrual attempt must not post a second journal entry');
    } finally { s.restore(); }
  }

  /* 4. Interest payment: default amount pays off exactly the remaining due, schedule status
        becomes PAID once both principal and interest are fully covered, and overpayment beyond
        what's due is rejected. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(4, FULL_THRESHOLDS);
      const { borrowingId, schedule } = await createBorrowing({ officeId: 4, lenderName: 'ACME', principalAmount: 12000, interestRate: 12, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12, repaymentFrequency: 'MONTHLY' });
      await postBorrowingDrawdown(4, borrowingId, { transactionDate: '2026-01-01' });
      const scheduleId = schedule[0].scheduleId; // interestDue=120 (12000*12%/12), principalDue=1000

      await a.rejects(
        () => payBorrowingInterest(4, borrowingId, scheduleId, { amount: 9999, transactionDate: '2026-02-01' }),
        /exceeds remaining interest due/
      );

      const payResult = await payBorrowingInterest(4, borrowingId, scheduleId, { transactionDate: '2026-02-01' }); // default = full remaining
      a.strictEqual(payResult.amountPaid, 120);
      let row = s.scheduleByOffice.get(4).find(r => r.id === scheduleId);
      a.strictEqual(row.status, SCHEDULE_STATUS.PARTIALLY_PAID, 'interest paid but principal not yet -> PARTIALLY_PAID');

      // Paying it again should have nothing left to pay.
      await a.rejects(() => payBorrowingInterest(4, borrowingId, scheduleId, { transactionDate: '2026-02-02' }), /nothing remaining to pay/);

      await repayBorrowingPrincipal(4, borrowingId, scheduleId, { transactionDate: '2026-02-01' }); // default = full remaining principal
      row = s.scheduleByOffice.get(4).find(r => r.id === scheduleId);
      a.strictEqual(row.status, SCHEDULE_STATUS.PAID, 'both principal and interest now fully paid -> PAID');
    } finally { s.restore(); }
  }

  /* 5. Principal repayment decrements outstanding_principal and auto-closes the borrowing once it
        reaches (~)zero; repaying against a non-ACTIVE (already-closed) borrowing is rejected. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(5, FULL_THRESHOLDS);
      const { borrowingId, schedule } = await createBorrowing({ officeId: 5, lenderName: 'ACME', principalAmount: 2000, interestRate: 0, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 2, repaymentFrequency: 'MONTHLY' });
      await postBorrowingDrawdown(5, borrowingId, { transactionDate: '2026-01-01' });

      await repayBorrowingPrincipal(5, borrowingId, schedule[0].scheduleId, { transactionDate: '2026-02-01' });
      let borrowing = s.borrowingsByOffice.get(5).find(b => b.id === borrowingId);
      a.strictEqual(borrowing.outstanding_principal, 1000);
      a.strictEqual(borrowing.status, BORROWING_STATUS.ACTIVE, 'still owes money -> stays ACTIVE');

      await repayBorrowingPrincipal(5, borrowingId, schedule[1].scheduleId, { transactionDate: '2026-03-01' });
      borrowing = s.borrowingsByOffice.get(5).find(b => b.id === borrowingId);
      a.strictEqual(borrowing.outstanding_principal, 0);
      a.strictEqual(borrowing.status, BORROWING_STATUS.CLOSED, 'fully repaid -> auto-closed');

      await a.rejects(
        () => repayBorrowingPrincipal(5, borrowingId, schedule[1].scheduleId, { amount: 1, transactionDate: '2026-03-02' }),
        /status is CLOSED, expected ACTIVE/
      );
    } finally { s.restore(); }
  }

  /* 6. Fineract JE fails on drawdown -> propagated as-is, borrowing stays PENDING. */
  {
    const s = installStubs({ jeShouldFail: true });
    try {
      await upsertThresholds(6, FULL_THRESHOLDS);
      const { borrowingId } = await createBorrowing({ officeId: 6, lenderName: 'ACME', principalAmount: 1000, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 3, repaymentFrequency: 'MONTHLY' });
      await a.rejects(() => postBorrowingDrawdown(6, borrowingId, { transactionDate: '2026-01-01' }), /unbalanced journal entry/);
      const borrowing = s.borrowingsByOffice.get(6).find(b => b.id === borrowingId);
      a.strictEqual(borrowing.status, BORROWING_STATUS.PENDING, 'a failed JE must leave the borrowing PENDING, not ACTIVE');
    } finally { s.restore(); }
  }

  /* 7. Fineract JE succeeds but the post-JE FinCraft write fails -> reconciliation-gap error. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(7, FULL_THRESHOLDS);
      const { borrowingId } = await createBorrowing({ officeId: 7, lenderName: 'ACME', principalAmount: 1000, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 3, repaymentFrequency: 'MONTHLY' });
      const originalCreateRow = api.treasury.createRow;
      api.treasury = {
        ...api.treasury,
        createRow: async (name, officeId, row) => {
          if (name === 'dt_office_borrowing_txns') throw new Error('simulated write failure');
          return originalCreateRow(name, officeId, row);
        }
      };
      let caught = null;
      try { await postBorrowingDrawdown(7, borrowingId, { transactionDate: '2026-01-01' }); }
      catch (e) { caught = e; }
      api.treasury = { ...api.treasury, createRow: originalCreateRow };
      a.ok(caught instanceof TreasuryReconciliationGapError);
      a.strictEqual(caught.fineractTransactionId, 'JE-1');
    } finally { s.restore(); }
  }

  /* 8. getBorrowingsDashboard aggregates totals across multiple borrowings correctly. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(8, FULL_THRESHOLDS);
      const b1 = await createBorrowing({ officeId: 8, lenderName: 'A', principalAmount: 1000, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 2, repaymentFrequency: 'MONTHLY' });
      const b2 = await createBorrowing({ officeId: 8, lenderName: 'B', principalAmount: 2000, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 2, repaymentFrequency: 'MONTHLY' });
      await postBorrowingDrawdown(8, b1.borrowingId, { transactionDate: '2026-01-01' });
      await postBorrowingDrawdown(8, b2.borrowingId, { transactionDate: '2026-01-01' });
      await repayBorrowingPrincipal(8, b1.borrowingId, b1.schedule[0].scheduleId, { transactionDate: '2026-02-01' }); // pays down 500 of b1

      const dash = await getBorrowingsDashboard(8);
      a.strictEqual(dash.activeCount, 2);
      a.strictEqual(dash.totalPrincipal, 3000);
      a.strictEqual(dash.totalOutstandingPrincipal, 2500, '3000 principal - 500 repaid so far');
    } finally { s.restore(); }
  }
}
