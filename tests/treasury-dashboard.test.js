/* FinCraft · tests/treasury-dashboard.test.js
   Exercises getTreasuryDashboard against ONE shared in-memory stub, driving it through the real
   Phase 3-8 functions (recordTellerEvent, createExpenseRequest/approveExpense, createBorrowing/
   postBorrowingDrawdown/repayBorrowingPrincipal) rather than hand-crafting fixture rows — this
   doubles as a light integration check that those modules compose correctly through one shared
   api.treasury stub, not just individually. */
import assert from 'assert';
import { api } from '../js/api.js';
import { upsertThresholds } from '../js/treasury/thresholds.js';
import { recordTellerEvent } from '../js/treasury/teller-events.js';
import { createExpenseRequest, approveExpense } from '../js/treasury/expenses.js';
import { createBorrowing, postBorrowingDrawdown, repayBorrowingPrincipal } from '../js/treasury/borrowings.js';
import { getTreasuryDashboard } from '../js/treasury/dashboard.js';
import { LIQUIDITY_STATUS } from '../js/treasury/liquidity-status.js';

function installStubs({ vaultOfficeBalance = 10000 } = {}) {
  const tables = { // one Map per treasury datatable, keyed by officeId -> row[] (or single row for config)
    dt_teller_operational_events: new Map(),
    dt_expense_requests: new Map(),
    dt_expense_approvals: new Map(),
    dt_office_borrowings: new Map(),
    dt_office_borrowing_schedule: new Map(),
    dt_office_borrowing_txns: new Map(),
    dt_treasury_thresholds: new Map() // one-to-one: officeId -> single row
  };
  let nextId = 1, nextJeId = 1;
  const originalTreasury = api.treasury, originalGlAccounts = api.glAccounts, originalJournalEntries = api.journalEntries;

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      if (name === 'dt_treasury_thresholds') { tables[name].set(officeId, row); return { resourceId: officeId }; }
      const id = nextId++;
      const list = tables[name].get(officeId) || [];
      list.push({ id, ...row });
      tables[name].set(officeId, list);
      return { resourceId: id };
    },
    async getRow(name, officeId, rowId) { return (tables[name].get(officeId) || []).find(r => r.id === rowId); },
    async updateRow(name, officeId, rowId, patch) {
      const row = (tables[name].get(officeId) || []).find(r => r.id === rowId);
      Object.assign(row, patch);
      return { resourceId: rowId };
    },
    async updateConfig(name, officeId, row) { tables[name].set(officeId, { ...tables[name].get(officeId), ...row }); return { resourceId: officeId }; },
    async queryRows(name, officeId) {
      if (name === 'dt_treasury_thresholds') return tables[name].get(officeId) || null;
      return tables[name].get(officeId) || [];
    }
  };

  api.glAccounts = {
    ...originalGlAccounts,
    async get(id) { return { id, type: { id: 1, code: 'accountType.asset', value: 'ASSET' } }; },
    async getBalance(id) { return { id, organizationRunningBalance: id === 999 ? 42 : 7777 }; }, // used for BANK tile (id-agnostic stub figure) and interestPayable (id 999 case below)
    async computeOfficeBalance() { return vaultOfficeBalance; } // precise Tier-2 vault figure
  };

  api.journalEntries = {
    ...originalJournalEntries,
    async create(body) { return { officeId: body.officeId, transactionId: `JE-${nextJeId++}` }; }
  };

  return { restore() { api.treasury = originalTreasury; api.glAccounts = originalGlAccounts; api.journalEntries = originalJournalEntries; } };
}

export async function runTests({ assert: a = assert } = {}) {
  /* 1. Full aggregation, reconciling teller total against a pooled Cash At Tellers GL that
        deliberately does NOT match, so tellerGlDifference is provably non-zero (proves the
        comparison is real, not a hardcoded 0). */
  {
    const s = installStubs({ vaultOfficeBalance: 50000 });
    try {
      await upsertThresholds(1, {
        vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102,
        borrowingsLiabilityGlAccountId: 300, interestPayableGlAccountId: 301, interestExpenseGlAccountId: 302,
        reserveBufferAmount: 10000, currencyCode: 'USD'
      });

      // Teller side: two cashiers, net FinCraft-computed total = 500 + 700 = 1200.
      await recordTellerEvent({ officeId: 1, tellerId: 3, cashierId: 9, transactionType: 'CASH_ALLOCATION', amount: 500, currencyCode: 'USD', transactionDate: '2026-01-01' });
      await recordTellerEvent({ officeId: 1, tellerId: 3, cashierId: 10, transactionType: 'CASH_ALLOCATION', amount: 700, currencyCode: 'USD', transactionDate: '2026-01-01' });

      // Expense side: one PENDING (100) and one APPROVED-but-not-yet-paid (250) — both should
      // count toward pendingExpensesTotal; a PAID one should not (not created here, but see test 2).
      await createExpenseRequest({ officeId: 1, expenseCategory: 'A', expenseGlAccountId: 200, amount: 100, currencyCode: 'USD', requestedBy: 'clerk' });
      const approved = await createExpenseRequest({ officeId: 1, expenseCategory: 'B', expenseGlAccountId: 200, amount: 250, currencyCode: 'USD', requestedBy: 'clerk' });
      await approveExpense(1, approved.expenseId, 'manager');

      // Borrowing side: draw down 1000, repay 300 of it -> outstanding 700.
      const { borrowingId, schedule } = await createBorrowing({ officeId: 1, lenderName: 'ACME', principalAmount: 1000, interestRate: 0, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 2, repaymentFrequency: 'MONTHLY' });
      await postBorrowingDrawdown(1, borrowingId, { transactionDate: '2026-01-01' });
      await repayBorrowingPrincipal(1, borrowingId, schedule[0].scheduleId, { amount: 300, transactionDate: '2026-02-01' });

      const dash = await getTreasuryDashboard(1);

      a.strictEqual(dash.bankBalance, 7777);
      a.strictEqual(dash.vaultBalance, 50000);
      a.strictEqual(dash.reserveBuffer, 10000);
      a.strictEqual(dash.availableVault, 40000);
      a.strictEqual(dash.liquidityStatus, LIQUIDITY_STATUS.GREEN, '40000 available >= 10000 buffer -> GREEN');

      a.strictEqual(dash.tellerOperationalTotal, 1200);
      a.strictEqual(dash.cashAtTellersGlBalance, 7777, 'pooled GL uses the same generic getBalance stub figure');
      a.strictEqual(dash.tellerGlDifference, 1200 - 7777, 'difference must be computed, not hardcoded, and can legitimately be non-zero');

      a.strictEqual(dash.borrowingsOutstanding, 700);
      a.strictEqual(dash.borrowingsActiveCount, 1);

      a.strictEqual(dash.pendingExpensesTotal, 350, 'PENDING (100) + APPROVED (250) must both count; nothing has been paid yet');

      a.strictEqual(dash.currencyCode, 'USD');
    } finally { s.restore(); }
  }

  /* 2. Liquidity status flips to RED when available vault is exhausted, and an unconfigured
        optional GL (interestPayable) reads as null, not 0 or a crash. */
  {
    const s = installStubs({ vaultOfficeBalance: 500 }); // less than the buffer below
    try {
      await upsertThresholds(2, {
        vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102,
        reserveBufferAmount: 10000, currencyCode: 'USD' // no interestPayableGlAccountId configured
      });
      const dash = await getTreasuryDashboard(2);
      a.strictEqual(dash.availableVault, 500 - 10000);
      a.strictEqual(dash.liquidityStatus, LIQUIDITY_STATUS.RED);
      a.strictEqual(dash.interestPayableBalance, null, 'an unconfigured optional GL mapping must read as null, not 0');
    } finally { s.restore(); }
  }
}
