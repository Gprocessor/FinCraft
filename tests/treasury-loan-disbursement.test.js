/* FinCraft · tests/treasury-loan-disbursement.test.js
   Covers js/treasury/loan-disbursement.js by stubbing api.treasury / api.tellers / api.loans. */
import assert from 'assert';
import { api } from '../js/api.js';
import { recordTellerEvent } from '../js/treasury/teller-events.js';
import { disburseLoanThroughCashier } from '../js/treasury/loan-disbursement.js';
import { TreasuryReconciliationGapError } from '../js/treasury/errors.js';

function installStubs({ cashierEndDate = null, failEventRecording = false, disburseError = null } = {}) {
  const eventsByOffice = new Map();
  let nextEventId = 1;
  const calls = { disburse: 0 };

  const originalTreasury = api.treasury;
  const originalTellers = api.tellers;
  const originalLoans = api.loans;

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      if (failEventRecording) throw new Error('simulated datatable write failure');
      const id = nextEventId++;
      const list = eventsByOffice.get(officeId) || [];
      list.push({ id, ...row });
      eventsByOffice.set(officeId, list);
      return { resourceId: id };
    },
    async queryRows(name, officeId) { return eventsByOffice.get(officeId) || []; }
  };

  api.tellers = {
    ...originalTellers,
    async getCashier(tellerId, cashierId) {
      return { id: cashierId, tellerId, startDate: [2025, 1, 1], endDate: cashierEndDate };
    }
  };

  api.loans = {
    ...originalLoans,
    async disburse(loanId, body) {
      calls.disburse++;
      if (disburseError) throw disburseError;
      return { resourceId: 777, loanId };
    }
  };

  return {
    calls,
    eventsByOffice,
    async seedCash(officeId, tellerId, cashierId, amount) {
      await recordTellerEvent({ officeId, tellerId, cashierId, transactionType: 'CASH_ALLOCATION', amount, currencyCode: 'USD', transactionDate: '2026-01-01' });
    },
    restore() { api.treasury = originalTreasury; api.tellers = originalTellers; api.loans = originalLoans; }
  };
}

export async function runTests({ assert: a = assert } = {}) {
  /* 1. tellerId/cashierId are mandatory — this workflow's entire point. */
  {
    const s = installStubs();
    try {
      await a.rejects(
        () => disburseLoanThroughCashier({ officeId: 1, loanId: 1, amount: 100, transactionDate: '2026-01-01' }),
        /tellerId and cashierId are both required/
      );
      a.strictEqual(s.calls.disburse, 0);
    } finally { s.restore(); }
  }

  /* 2. Inactive cashier (assignment already ended) must block before Fineract is called. */
  {
    const s = installStubs({ cashierEndDate: [2025, 6, 1] }); // ended well before our test transactionDate
    try {
      await s.seedCash(1, 3, 9, 10000);
      await a.rejects(
        () => disburseLoanThroughCashier({ officeId: 1, loanId: 2, tellerId: 3, cashierId: 9, amount: 100, transactionDate: '2026-01-01' }),
        /is not active as of/
      );
      a.strictEqual(s.calls.disburse, 0, 'an inactive cashier must never reach Fineract');
    } finally { s.restore(); }
  }

  /* 3. Insufficient cashier cash blocks before Fineract is called, reusing Phase 4's exact message. */
  {
    const s = installStubs();
    try {
      await s.seedCash(1, 3, 9, 50); // only 50 available
      await a.rejects(
        () => disburseLoanThroughCashier({ officeId: 1, loanId: 3, tellerId: 3, cashierId: 9, amount: 100, transactionDate: '2026-01-01' }),
        /Insufficient teller cash\. Available: 50, Requested: 100/
      );
      a.strictEqual(s.calls.disburse, 0);
    } finally { s.restore(); }
  }

  /* 4. Happy path: disburses in Fineract exactly once, records a LOAN_DISBURSEMENT/CASH_OUT event
        correctly linked back to the loan. */
  {
    const s = installStubs();
    try {
      await s.seedCash(1, 3, 9, 10000);
      const result = await disburseLoanThroughCashier({
        officeId: 1, loanId: 4, tellerId: 3, cashierId: 9, amount: 4000,
        transactionDate: '2026-01-02', currencyCode: 'USD', performedBy: 'tester'
      });
      a.strictEqual(s.calls.disburse, 1);
      a.strictEqual(result.fineractResourceId, 777);
      a.ok(result.eventId);

      const events = s.eventsByOffice.get(1);
      const disbEvent = events.find(e => e.transaction_type === 'LOAN_DISBURSEMENT');
      a.strictEqual(disbEvent.direction, 'CASH_OUT');
      a.strictEqual(disbEvent.amount, 4000);
      a.strictEqual(disbEvent.fineract_entity_type, 'LOAN');
      a.strictEqual(disbEvent.fineract_entity_id, 4);
    } finally { s.restore(); }
  }

  /* 5. Duplicate-disbursement guard: a second attempt on the same loan must be blocked, and must
        not call Fineract a second time. */
  {
    const s = installStubs();
    try {
      await s.seedCash(1, 3, 9, 10000);
      await disburseLoanThroughCashier({ officeId: 1, loanId: 5, tellerId: 3, cashierId: 9, amount: 1000, transactionDate: '2026-01-02' });
      a.strictEqual(s.calls.disburse, 1);
      await a.rejects(
        () => disburseLoanThroughCashier({ officeId: 1, loanId: 5, tellerId: 3, cashierId: 9, amount: 1000, transactionDate: '2026-01-03' }),
        /already been disbursed through the teller workflow/
      );
      a.strictEqual(s.calls.disburse, 1, 'a duplicate attempt must never re-reach Fineract');
    } finally { s.restore(); }
  }

  /* 6. Fineract's disbursement call itself fails -> propagated as-is, no teller event recorded. */
  {
    const s = installStubs({ disburseError: new Error('Fineract 400: loan not approved') });
    try {
      await s.seedCash(1, 3, 9, 10000);
      await a.rejects(
        () => disburseLoanThroughCashier({ officeId: 1, loanId: 6, tellerId: 3, cashierId: 9, amount: 1000, transactionDate: '2026-01-02' }),
        /loan not approved/
      );
      const events = (s.eventsByOffice.get(1) || []).filter(e => e.fineract_entity_id === 6);
      a.strictEqual(events.length, 0);
    } finally { s.restore(); }
  }

  /* 7. Fineract succeeds but the teller-event write fails -> distinct reconciliation-gap error,
        carrying the Fineract resourceId so the disbursement can be traced/reconciled manually.
        Seed cash normally first (so the earlier "insufficient cash" guard doesn't fire before we
        even reach Fineract), then make ONLY the disbursement event's own write fail. */
  {
    const s = installStubs();
    let caught = null;
    try {
      await s.seedCash(1, 3, 9, 10000);
      const originalCreateRow = api.treasury.createRow;
      api.treasury = { ...api.treasury, createRow: async () => { throw new Error('simulated datatable write failure'); } };
      try {
        await disburseLoanThroughCashier({ officeId: 1, loanId: 7, tellerId: 3, cashierId: 9, amount: 1000, transactionDate: '2026-01-02' });
      } catch (e) { caught = e; }
      api.treasury = { ...api.treasury, createRow: originalCreateRow };
    } finally { s.restore(); }
    a.ok(caught instanceof TreasuryReconciliationGapError, 'must throw the distinct TreasuryReconciliationGapError type');
    a.strictEqual(caught.fineractResourceId, 777);
  }
}
