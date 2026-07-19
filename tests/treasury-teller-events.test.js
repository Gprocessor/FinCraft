/* FinCraft · tests/treasury-teller-events.test.js
   Covers js/treasury/teller-events.js: direction inference from transaction type, required-field
   validation, and reversal bookkeeping — by stubbing `api.treasury` (no real Fineract instance is
   reachable from this test runner, so every network-touching call goes through an in-memory fake
   datatable instead). No jsdom needed; these modules only import js/api.js, which does not touch
   `window`/`document` at import time (see js/config.js#getRuntimeConfig). */
import assert from 'assert';
import { api } from '../js/api.js';
import {
  recordTellerEvent, reverseTellerEvent, getCashierEvents,
  CASH_IN_TYPES, CASH_OUT_TYPES
} from '../js/treasury/teller-events.js';

/** Minimal in-memory stand-in for the `dt_teller_operational_events` datatable, keyed by
 *  officeId, so tests never hit the network. Mirrors the row shape produced by createRow(). */
function installFakeTreasuryDatatable() {
  const rowsByOffice = new Map();
  let nextId = 1;
  const originalTreasury = api.treasury;
  api.treasury = {
    ...originalTreasury,
    async createRow(_name, officeId, row) {
      const id = nextId++;
      const stored = { id, ...row };
      const list = rowsByOffice.get(officeId) || [];
      list.push(stored);
      rowsByOffice.set(officeId, list);
      return { resourceId: id };
    },
    async getRow(_name, officeId, rowId) {
      return (rowsByOffice.get(officeId) || []).find(r => r.id === rowId);
    },
    async updateRow(_name, officeId, rowId, patch) {
      const row = (rowsByOffice.get(officeId) || []).find(r => r.id === rowId);
      Object.assign(row, patch);
      return { resourceId: rowId };
    },
    async queryRows(_name, officeId) {
      return rowsByOffice.get(officeId) || [];
    }
  };
  return () => { api.treasury = originalTreasury; }; // restore hook
}

export async function runTests({ assert: a = assert } = {}) {
  const restore = installFakeTreasuryDatatable();
  try {
    /* 1. Direction inference: every declared CASH_IN/CASH_OUT type must round-trip correctly. */
    for (const t of CASH_IN_TYPES) {
      const { direction } = await recordTellerEvent({
        officeId: 1, tellerId: 1, cashierId: 1, transactionType: t,
        amount: 100, currencyCode: 'USD', transactionDate: '2026-01-01'
      });
      a.strictEqual(direction, 'CASH_IN', `${t} should infer CASH_IN`);
    }
    for (const t of CASH_OUT_TYPES) {
      const { direction } = await recordTellerEvent({
        officeId: 1, tellerId: 1, cashierId: 1, transactionType: t,
        amount: 50, currencyCode: 'USD', transactionDate: '2026-01-01'
      });
      a.strictEqual(direction, 'CASH_OUT', `${t} should infer CASH_OUT`);
    }

    /* 2. Unknown transaction type must throw, not silently default. */
    await a.rejects(
      () => recordTellerEvent({
        officeId: 1, tellerId: 1, cashierId: 1, transactionType: 'NOT_A_REAL_TYPE',
        amount: 10, currencyCode: 'USD', transactionDate: '2026-01-01'
      }),
      /Unknown teller transaction type/
    );

    /* 3. Missing required fields must throw with a clear message. */
    await a.rejects(() => recordTellerEvent({ officeId: 1 }), /missing required field/);

    /* 4. Non-positive amount must be rejected (direction is encoded by type, not sign). */
    await a.rejects(
      () => recordTellerEvent({
        officeId: 1, tellerId: 1, cashierId: 1, transactionType: 'CASH_ALLOCATION',
        amount: 0, currencyCode: 'USD', transactionDate: '2026-01-01'
      }),
      /amount must be a positive number/
    );

    /* 5. Reversal creates an opposite-direction event and marks the original reversed=true,
          without deleting/mutating the original event's own amount/direction (audit trail). */
    const office = 42;
    const alloc = await recordTellerEvent({
      officeId: office, tellerId: 5, cashierId: 9, transactionType: 'CASH_ALLOCATION',
      amount: 500, currencyCode: 'USD', transactionDate: '2026-01-01', createdBy: 'tester'
    });
    const { originalEventId, reversalEventId } = await reverseTellerEvent(office, alloc.eventId, 'test reversal', 'tester');
    a.strictEqual(originalEventId, alloc.eventId);
    a.ok(reversalEventId && reversalEventId !== originalEventId);

    const events = await getCashierEvents(office, 9);
    const original = events.find(e => e.id === originalEventId);
    const reversal = events.find(e => e.id === reversalEventId);
    a.strictEqual(original.reversed, true, 'original event must be flagged reversed');
    a.strictEqual(original.direction, 'CASH_IN', 'original event direction must be unchanged (audit trail)');
    a.strictEqual(reversal.transaction_type, 'REVERSAL_CASH_OUT', 'reversal of a CASH_IN event must be CASH_OUT');
    a.strictEqual(reversal.amount, 500, 'reversal amount must match original');

    /* 6. Reversing an already-reversed event must throw, not silently double-reverse. */
    await a.rejects(() => reverseTellerEvent(office, originalEventId, 'again'), /already been reversed|already reversed/);
  } finally {
    restore();
  }
}
