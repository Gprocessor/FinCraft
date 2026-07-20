/* FinCraft · tests/treasury-vault-control.test.js
   Covers js/treasury/thresholds.js (config read/seed) and js/treasury/vault-control.js
   (balance reads, reserve-buffer enforcement, allocation orchestration + failure-mode handling),
   by stubbing api.treasury / api.glAccounts / api.tellers with in-memory fakes. */
import assert from 'assert';
import { api } from '../js/api.js';
import { getThresholds, upsertThresholds, requireThresholds } from '../js/treasury/thresholds.js';
import {
  getVaultBalance, getReserveBuffer, validateVaultCanAllocate,
  allocateCashToCashier, TreasuryReconciliationGapError
} from '../js/treasury/vault-control.js';

function installStubs({ failEventRecording = false } = {}) {
  const configByOffice = new Map();          // dt_treasury_thresholds: officeId -> row (one-to-one)
  const eventsByOffice = new Map();          // dt_teller_operational_events: officeId -> row[]
  let nextEventId = 1;
  const calls = { allocateCashTo: 0, createConfig: 0, updateConfig: 0 };

  const originalTreasury = api.treasury;
  const originalGlAccounts = api.glAccounts;
  const originalTellers = api.tellers;

  api.treasury = {
    ...originalTreasury,
    async createRow(name, officeId, row) {
      if (name === 'dt_treasury_thresholds') { calls.createConfig++; configByOffice.set(officeId, row); return { resourceId: officeId }; }
      if (name === 'dt_teller_operational_events') {
        if (failEventRecording) throw new Error('simulated datatable write failure');
        const id = nextEventId++;
        const list = eventsByOffice.get(officeId) || [];
        list.push({ id, ...row });
        eventsByOffice.set(officeId, list);
        return { resourceId: id };
      }
      throw new Error(`unexpected createRow on ${name}`);
    },
    async updateConfig(name, officeId, row) {
      calls.updateConfig++;
      configByOffice.set(officeId, { ...configByOffice.get(officeId), ...row });
      return { resourceId: officeId };
    },
    async queryRows(name, officeId) {
      if (name === 'dt_treasury_thresholds') return configByOffice.get(officeId) || null;
      if (name === 'dt_teller_operational_events') return eventsByOffice.get(officeId) || [];
      return [];
    }
  };

  api.glAccounts = {
    ...originalGlAccounts,
    async get(id) { return { id, type: { id: 1, code: 'accountType.asset', value: 'ASSET' } }; },
    async getBalance(id) { return { id, organizationRunningBalance: 999999 }; }, // Tier 1 — deliberately different from Tier 2 below, to prove precise=true/false take different paths
    async computeOfficeBalance(glAccountId, officeId) { return 10000; } // Tier 2 — the "real" office-precise vault balance used in these tests
  };

  api.tellers = {
    ...originalTellers,
    async allocateCashTo(tellerId, cashierId, body) {
      calls.allocateCashTo++;
      return { resourceId: tellerId, subResourceId: 555 };
    }
  };

  return {
    calls,
    restore() { api.treasury = originalTreasury; api.glAccounts = originalGlAccounts; api.tellers = originalTellers; }
  };
}

export async function runTests({ assert: a = assert } = {}) {
  /* ---- thresholds.js ---- */
  {
    const { restore } = installStubs();
    try {
      a.strictEqual(await getThresholds(1), null, 'unconfigured office must return null, not throw or default');
      await a.rejects(() => requireThresholds(1), /has no treasury configuration/);

      await upsertThresholds(1, {
        vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102,
        reserveBufferAmount: 500, currencyCode: 'USD'
      });
      const t = await getThresholds(1);
      a.strictEqual(t.vaultGlAccountId, 100);
      a.strictEqual(t.reserveBufferAmount, 500);
      a.strictEqual(t.currencyCode, 'USD');

      // Missing required field must throw before touching the network/datatable.
      await a.rejects(() => upsertThresholds(2, { vaultGlAccountId: 1 }), /missing required field/);
    } finally { restore(); }
  }

  /* ---- vault-control.js: balance reads ---- */
  {
    const { restore } = installStubs();
    try {
      await upsertThresholds(5, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });

      const precise = await getVaultBalance(5); // default precise=true -> Tier 2 (computeOfficeBalance stub = 10000)
      a.strictEqual(precise, 10000, 'precise=true must use office-scoped computeOfficeBalance, not the org-wide figure');

      const cheap = await getVaultBalance(5, { precise: false }); // Tier 1 (getBalance stub = 999999)
      a.strictEqual(cheap, 999999, 'precise=false must use the org-wide fetchRunningBalance figure');

      a.strictEqual(await getReserveBuffer(5), 2000);
    } finally { restore(); }
  }

  /* ---- vault-control.js: validateVaultCanAllocate ---- */
  {
    const { restore } = installStubs();
    try {
      await upsertThresholds(6, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });
      // vault=10000 (stub), buffer=2000 -> available=8000
      const ok = await validateVaultCanAllocate(6, 8000);
      a.strictEqual(ok.availableVault, 8000);

      await a.rejects(
        () => validateVaultCanAllocate(6, 8001),
        /Insufficient vault cash\. Available after buffer: 8000, Requested: 8001/
      );
    } finally { restore(); }
  }

  /* ---- vault-control.js: allocateCashToCashier happy path ---- */
  {
    const { calls, restore } = installStubs();
    try {
      await upsertThresholds(7, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });
      const result = await allocateCashToCashier(7, 3, 9, 1000, '2026-01-01', 'opening float', 'tester');
      a.strictEqual(calls.allocateCashTo, 1, 'Fineract allocate endpoint must be called exactly once');
      a.strictEqual(result.fineractResourceId, 555);
      a.strictEqual(result.availableVaultAfter, 7000); // 8000 available - 1000 allocated
      a.ok(result.eventId, 'a teller event id must be returned');

      const events = await api.treasury.queryRows('dt_teller_operational_events', 7);
      a.strictEqual(events.length, 1);
      a.strictEqual(events[0].transaction_type, 'CASH_ALLOCATION');
      a.strictEqual(events[0].direction, 'CASH_IN');
      a.strictEqual(events[0].amount, 1000);
    } finally { restore(); }
  }

  /* ---- vault-control.js: allocation blocked by reserve buffer -> Fineract never called ---- */
  {
    const { calls, restore } = installStubs();
    try {
      await upsertThresholds(8, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });
      await a.rejects(
        () => allocateCashToCashier(8, 3, 9, 8001, '2026-01-01'),
        /Insufficient vault cash/
      );
      a.strictEqual(calls.allocateCashTo, 0, 'a blocked allocation must never reach Fineract');
    } finally { restore(); }
  }

  /* ---- vault-control.js: Fineract call itself fails -> propagated as-is, no event recorded ---- */
  {
    const { restore } = installStubs();
    api.tellers = { ...api.tellers, allocateCashTo: async () => { throw new Error('Fineract 400: cashier not active'); } };
    try {
      await upsertThresholds(9, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });
      await a.rejects(() => allocateCashToCashier(9, 3, 9, 1000, '2026-01-01'), /cashier not active/);
      const events = await api.treasury.queryRows('dt_teller_operational_events', 9);
      a.strictEqual(events.length, 0, 'no teller event may be recorded when the Fineract call itself failed');
    } finally { restore(); }
  }

  /* ---- vault-control.js: Fineract succeeds but event recording fails -> reconciliation-gap error ---- */
  {
    const { restore } = installStubs({ failEventRecording: true });
    try {
      await upsertThresholds(10, { vaultGlAccountId: 100, cashAtTellersGlAccountId: 101, bankGlAccountId: 102, reserveBufferAmount: 2000, currencyCode: 'USD' });
      let caught = null;
      try { await allocateCashToCashier(10, 3, 9, 1000, '2026-01-01'); }
      catch (e) { caught = e; }
      a.ok(caught instanceof TreasuryReconciliationGapError, 'must throw the distinct TreasuryReconciliationGapError type, not a generic Error');
      a.strictEqual(caught.fineractResourceId, 555, 'the gap error must carry the Fineract resourceId so an operator can trace the orphaned transaction');
    } finally { restore(); }
  }
}
