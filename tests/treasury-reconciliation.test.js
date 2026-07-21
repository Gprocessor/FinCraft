/* FinCraft · tests/treasury-reconciliation.test.js
   Covers js/treasury/reconciliation.js by stubbing api.treasury / api.journalEntries. */
import assert from 'assert';
import { api } from '../js/api.js';
import { upsertThresholds } from '../js/treasury/thresholds.js';
import { recordTellerEvent } from '../js/treasury/teller-events.js';
import {
  startDailyReconciliation, submitPhysicalCashCount, approveReconciliation, RECONCILIATION_STATUS
} from '../js/treasury/reconciliation.js';
import { TreasuryReconciliationGapError } from '../js/treasury/errors.js';

function installStubs({ jeShouldFail = false, failAfterJe = false } = {}) {
  const reconByOffice = new Map();
  const eventsByOffice = new Map();
  const configByOffice = new Map();
  let nextId = 1;
  const calls = { createJe: 0 };

  const originalTreasury = api.treasury;
  const originalJournalEntries = api.journalEntries;

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      if (name === 'dt_treasury_thresholds') { configByOffice.set(officeId, row); return { resourceId: officeId }; }
      const id = nextId++;
      if (name === 'dt_daily_cash_reconciliation') { const l = reconByOffice.get(officeId) || []; l.push({ id, ...row }); reconByOffice.set(officeId, l); return { resourceId: id }; }
      if (name === 'dt_teller_operational_events') {
        if (failAfterJe) throw new Error('simulated post-JE datatable failure');
        const l = eventsByOffice.get(officeId) || []; l.push({ id, ...row }); eventsByOffice.set(officeId, l); return { resourceId: id };
      }
      throw new Error(`unexpected createRow on ${name}`);
    },
    async getRow(name, officeId, rowId) {
      if (name !== 'dt_daily_cash_reconciliation') throw new Error(`unexpected getRow on ${name}`);
      return (reconByOffice.get(officeId) || []).find(r => r.id === rowId);
    },
    async updateRow(name, officeId, rowId, patch) {
      if (name === 'dt_daily_cash_reconciliation') {
        if (failAfterJe && patch.status === 'APPROVED') throw new Error('simulated post-JE status-update failure');
        const row = (reconByOffice.get(officeId) || []).find(r => r.id === rowId);
        Object.assign(row, patch);
        return { resourceId: rowId };
      }
      throw new Error(`unexpected updateRow on ${name}`);
    },
    async updateConfig(name, officeId, row) { configByOffice.set(officeId, { ...configByOffice.get(officeId), ...row }); return { resourceId: officeId }; },
    async queryRows(name, officeId) {
      if (name === 'dt_treasury_thresholds') return configByOffice.get(officeId) || null;
      if (name === 'dt_daily_cash_reconciliation') return reconByOffice.get(officeId) || [];
      if (name === 'dt_teller_operational_events') return eventsByOffice.get(officeId) || [];
      return [];
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
    calls, reconByOffice, eventsByOffice,
    async seedCash(officeId, tellerId, cashierId, amount) {
      await recordTellerEvent({ officeId, tellerId, cashierId, transactionType: 'CASH_ALLOCATION', amount, currencyCode: 'USD', transactionDate: '2026-01-01' });
    },
    restore() { api.treasury = originalTreasury; api.journalEntries = originalJournalEntries; }
  };
}

const FULL_THRESHOLDS = {
  vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102,
  shortageGlAccountId: 400, overageGlAccountId: 401,
  reserveBufferAmount: 0, currencyCode: 'USD'
};

export async function runTests({ assert: a = assert } = {}) {
  /* 1. Zero variance auto-approves at submission — no journal entry posted, no approval needed. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(1, FULL_THRESHOLDS);
      await s.seedCash(1, 3, 9, 5000);
      const { reconciliationId, expectedCash } = await startDailyReconciliation(1, 3, 9, '2026-01-15');
      a.strictEqual(expectedCash, 5000);
      const result = await submitPhysicalCashCount(1, reconciliationId, 5000);
      a.strictEqual(result.status, RECONCILIATION_STATUS.APPROVED);
      a.strictEqual(result.requiresApproval, false);
      a.strictEqual(s.calls.createJe, 0, 'a zero-variance count must never post a journal entry');
    } finally { s.restore(); }
  }

  /* 2. Shortage workflow: physical < expected -> Dr Shortage / Cr Cash At Tellers, and a
        CASH_SETTLEMENT/CASH_OUT teller event self-corrects the teller ledger. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(2, FULL_THRESHOLDS);
      await s.seedCash(2, 3, 9, 5000);
      const { reconciliationId } = await startDailyReconciliation(2, 3, 9, '2026-01-15');
      const submitResult = await submitPhysicalCashCount(2, reconciliationId, 4800); // 200 short
      a.strictEqual(submitResult.variance, -200);
      a.strictEqual(submitResult.status, RECONCILIATION_STATUS.SUBMITTED);
      a.strictEqual(s.calls.createJe, 0, 'submitting a count must not itself post anything');

      const approveResult = await approveReconciliation(2, reconciliationId, 'supervisor1', { transactionDate: '2026-01-16' });
      a.strictEqual(approveResult.isShortage, true);
      a.strictEqual(approveResult.amount, 200);
      a.strictEqual(s.calls.createJe, 1);

      const recon = s.reconByOffice.get(2).find(r => r.id === reconciliationId);
      a.strictEqual(recon.status, RECONCILIATION_STATUS.APPROVED);
      a.strictEqual(recon.approved_by, 'supervisor1');

      const events = s.eventsByOffice.get(2);
      const adjEvent = events.find(e => e.transaction_type === 'CASH_SETTLEMENT');
      a.ok(adjEvent, 'a shortage approval must record a self-correcting CASH_SETTLEMENT event');
      a.strictEqual(adjEvent.direction, 'CASH_OUT');
      a.strictEqual(adjEvent.amount, 200);
    } finally { s.restore(); }
  }

  /* 3. Overage workflow: physical > expected -> Dr Cash At Tellers / Cr Overage, and a
        CASH_RECEIPT/CASH_IN teller event self-corrects the teller ledger the other way. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(3, FULL_THRESHOLDS);
      await s.seedCash(3, 3, 9, 5000);
      const { reconciliationId } = await startDailyReconciliation(3, 3, 9, '2026-01-15');
      await submitPhysicalCashCount(3, reconciliationId, 5150); // 150 over
      const approveResult = await approveReconciliation(3, reconciliationId, 'supervisor1');
      a.strictEqual(approveResult.isShortage, false);
      a.strictEqual(approveResult.amount, 150);

      const events = s.eventsByOffice.get(3);
      const adjEvent = events.find(e => e.transaction_type === 'CASH_RECEIPT');
      a.ok(adjEvent, 'an overage approval must record a self-correcting CASH_RECEIPT event');
      a.strictEqual(adjEvent.direction, 'CASH_IN');
      a.strictEqual(adjEvent.amount, 150);
    } finally { s.restore(); }
  }

  /* 4. Duplicate-open guard: cannot start a second reconciliation for the same cashier/date while
        one is still unresolved. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(4, FULL_THRESHOLDS);
      await s.seedCash(4, 3, 9, 1000);
      await startDailyReconciliation(4, 3, 9, '2026-01-15');
      await a.rejects(() => startDailyReconciliation(4, 3, 9, '2026-01-15'), /already has an unresolved reconciliation/);
    } finally { s.restore(); }
  }

  /* 5. Status guards: cannot submit a count twice, cannot approve out of order. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(5, FULL_THRESHOLDS);
      await s.seedCash(5, 3, 9, 1000);
      const { reconciliationId } = await startDailyReconciliation(5, 3, 9, '2026-01-15');
      await a.rejects(() => approveReconciliation(5, reconciliationId, 'sup'), /status is OPEN, expected SUBMITTED/);
      await submitPhysicalCashCount(5, reconciliationId, 900); // creates a variance -> SUBMITTED
      await a.rejects(() => submitPhysicalCashCount(5, reconciliationId, 800), /status is SUBMITTED, expected OPEN/);
    } finally { s.restore(); }
  }

  /* 6. Missing shortage/overage GL configuration is rejected with a clear, actionable message
        rather than posting a malformed journal entry. */
  {
    const s = installStubs();
    try {
      await upsertThresholds(6, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 0, currencyCode: 'USD' }); // no shortage/overage GL
      await s.seedCash(6, 3, 9, 1000);
      const { reconciliationId } = await startDailyReconciliation(6, 3, 9, '2026-01-15');
      await submitPhysicalCashCount(6, reconciliationId, 900);
      await a.rejects(() => approveReconciliation(6, reconciliationId, 'sup'), /no shortageGlAccountId configured/);
      a.strictEqual(s.calls.createJe, 0, 'must not post a JE with a missing GL account mapping');
    } finally { s.restore(); }
  }

  /* 7. Fineract JE succeeds but the post-JE FinCraft write fails -> reconciliation-gap error.
        Seed cash and submit the count normally first (so the earlier steps aren't affected by
        the same failure this test wants to isolate), then make ONLY the approval's own
        teller-event write fail. */
  {
    const s = installStubs();
    let caught = null;
    try {
      await upsertThresholds(7, FULL_THRESHOLDS);
      await s.seedCash(7, 3, 9, 1000);
      const { reconciliationId } = await startDailyReconciliation(7, 3, 9, '2026-01-15');
      await submitPhysicalCashCount(7, reconciliationId, 900);

      const originalCreateRow = api.treasury.createRow;
      api.treasury = { ...api.treasury, createRow: async () => { throw new Error('simulated datatable write failure'); } };
      try { await approveReconciliation(7, reconciliationId, 'sup'); } catch (e) { caught = e; }
      api.treasury = { ...api.treasury, createRow: originalCreateRow };
    } finally { s.restore(); }
    a.ok(caught instanceof TreasuryReconciliationGapError);
    a.strictEqual(caught.fineractTransactionId, 'JE-1');
  }
}
