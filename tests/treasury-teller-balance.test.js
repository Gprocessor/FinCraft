/* FinCraft · tests/treasury-teller-balance.test.js
   Covers js/treasury/teller-balance.js against a fake in-memory event log (same stubbing approach
   as tests/treasury-teller-events.test.js), so no real Fineract instance is required. */
import assert from 'assert';
import { api } from '../js/api.js';
import { recordTellerEvent } from '../js/treasury/teller-events.js';
import {
  computeCashierExpectedBalance, validateCashierCanPay,
  compareCashierBalanceToFineract, getOfficeTellerBreakdown
} from '../js/treasury/teller-balance.js';

function installFakeTreasuryDatatable() {
  const rowsByOffice = new Map();
  let nextId = 1;
  const originalTreasury = api.treasury;
  api.treasury = {
    ...originalTreasury,
    async createRow(_name, officeId, row) {
      const id = nextId++;
      const list = rowsByOffice.get(officeId) || [];
      list.push({ id, ...row });
      rowsByOffice.set(officeId, list);
      return { resourceId: id };
    },
    async queryRows(_name, officeId) { return rowsByOffice.get(officeId) || []; }
  };
  return () => { api.treasury = originalTreasury; };
}

export async function runTests({ assert: a = assert } = {}) {
  const restore = installFakeTreasuryDatatable();
  try {
    const office = 7, teller = 3, cashier = 11;

    /* 1. Expected cash = allocation (CASH_IN) − disbursement (CASH_OUT), computed purely from
          the event log — no separate "opening float" needed since CASH_ALLOCATION is itself the
          first CASH_IN event (see teller-balance.js comment). */
    await recordTellerEvent({ officeId: office, tellerId: teller, cashierId: cashier, transactionType: 'CASH_ALLOCATION', amount: 1000, currencyCode: 'USD', transactionDate: '2026-01-01' });
    await recordTellerEvent({ officeId: office, tellerId: teller, cashierId: cashier, transactionType: 'LOAN_DISBURSEMENT', amount: 300, currencyCode: 'USD', transactionDate: '2026-01-02' });
    await recordTellerEvent({ officeId: office, tellerId: teller, cashierId: cashier, transactionType: 'SAVINGS_DEPOSIT', amount: 150, currencyCode: 'USD', transactionDate: '2026-01-03' });

    const balance = await computeCashierExpectedBalance(office, teller, cashier);
    a.strictEqual(balance.cashIn, 1150);
    a.strictEqual(balance.cashOut, 300);
    a.strictEqual(balance.expectedCash, 850);

    /* 2. validateCashierCanPay: a request within the available balance succeeds and returns the
          same figures as computeCashierExpectedBalance. */
    const ok = await validateCashierCanPay(office, teller, cashier, 800);
    a.strictEqual(ok.expectedCash, 850);

    /* 3. validateCashierCanPay: a request over the available balance throws the exact
          user-facing message format specified in the integration brief. */
    await a.rejects(
      () => validateCashierCanPay(office, teller, cashier, 900),
      /Insufficient teller cash\. Available: 850, Requested: 900/
    );

    /* 4. compareCashierBalanceToFineract: when Fineract's own cashierSummary call fails/is
          unreachable (as in this test environment), the comparison degrades gracefully to
          "no Fineract figure available" rather than throwing. */
    const originalCashierSummary = api.tellers.cashierSummary;
    api.tellers = { ...api.tellers, cashierSummary: async () => { throw new Error('no server in test env'); } };
    const cmp = await compareCashierBalanceToFineract(office, teller, cashier);
    a.strictEqual(cmp.fincraftExpectedCash, 850);
    a.strictEqual(cmp.fineractNetCash, null);
    a.strictEqual(cmp.matches, null);
    api.tellers = { ...api.tellers, cashierSummary: originalCashierSummary };

    /* 5. compareCashierBalanceToFineract: when Fineract's figure IS available and agrees within
          rounding tolerance, matches=true and difference≈0. */
    api.tellers = { ...api.tellers, cashierSummary: async () => ({ netCash: 850 }) };
    const cmpMatch = await compareCashierBalanceToFineract(office, teller, cashier);
    a.strictEqual(cmpMatch.matches, true);
    a.ok(Math.abs(cmpMatch.difference) < 0.005);
    api.tellers = { ...api.tellers, cashierSummary: originalCashierSummary };

    /* 6. getOfficeTellerBreakdown: office-wide total across multiple cashiers is the sum of each
          cashier's expected cash — this is the figure that should reconcile against the pooled
          Cash At Tellers GL (the worked example in the integration brief: Ada+Bola+Chidi=total). */
    const cashier2 = 12;
    await recordTellerEvent({ officeId: office, tellerId: teller, cashierId: cashier2, transactionType: 'CASH_ALLOCATION', amount: 500, currencyCode: 'USD', transactionDate: '2026-01-01' });
    await recordTellerEvent({ officeId: office, tellerId: teller, cashierId: cashier2, transactionType: 'EXPENSE_PAYMENT', amount: 60, currencyCode: 'USD', transactionDate: '2026-01-02' });

    const breakdown = await getOfficeTellerBreakdown(office, [{ tellerId: teller, cashierId: cashier }, { tellerId: teller, cashierId: cashier2 }]);
    const c1 = breakdown.perCashier.find(c => c.cashierId === cashier);
    const c2 = breakdown.perCashier.find(c => c.cashierId === cashier2);
    a.strictEqual(c1.expectedCash, 850);
    a.strictEqual(c2.expectedCash, 440);
    a.strictEqual(breakdown.officeTotal, 1290, 'office total must equal the sum of every cashier\'s expected cash');

    /* 7. A cashier supplied in tellerCashierList but with zero events still appears, at 0 —
          "known but unused" cashiers must not be silently dropped from the breakdown. */
    const cashier3 = 13;
    const breakdownWithIdle = await getOfficeTellerBreakdown(office, [
      { tellerId: teller, cashierId: cashier }, { tellerId: teller, cashierId: cashier2 }, { tellerId: teller, cashierId: cashier3 }
    ]);
    const idle = breakdownWithIdle.perCashier.find(c => c.cashierId === cashier3);
    a.ok(idle, 'idle cashier with no events must still be present in the breakdown');
    a.strictEqual(idle.expectedCash, 0);
  } finally {
    restore();
  }
}
