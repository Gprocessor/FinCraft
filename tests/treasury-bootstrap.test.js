/* FinCraft · tests/treasury-bootstrap.test.js
   Covers js/treasury/bootstrap.js (Phase 13). Uses DYNAMIC import() after installing a minimal
   `document`/storage shim, because bootstrap.js → store.js runs store.restore() at module load,
   which touches document.documentElement (unavailable in the bare Node test runner — the same
   reason utils.test.js is the one known pre-existing failure). Stubs api.treasury so nothing hits
   a network. */
import assert from 'assert';

function installBrowserShim() {
  if (!globalThis.document) {
    globalThis.document = { documentElement: { setAttribute() {}, getAttribute() { return null; } } };
  }
  if (!globalThis.localStorage) {
    const mk = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
    globalThis.localStorage = mk();
    globalThis.sessionStorage = mk();
  }
}

export async function runTests({ assert: a = assert } = {}) {
  installBrowserShim();

  const { api } = await import('../js/api.js');
  const { store } = await import('../js/store.js');
  const bootstrap = await import('../js/treasury/bootstrap.js');

  const origTreasury = api.treasury;
  const origAuth = store.get('auth');

  function installStubs({ existingConfigOffices = new Set(), ensureImpl } = {}) {
    let ensureCalls = 0;
    api.treasury = {
      ...origTreasury,
      async ensureTreasuryDatatables() {
        ensureCalls++;
        if (ensureImpl) return ensureImpl(ensureCalls);
        return { created: ['dt_treasury_thresholds', 'dt_expense_requests'], alreadyPresent: [], failed: [] };
      },
      // getThresholds() reads via queryRows on the one-to-one config table.
      async queryRows(name, officeId) {
        if (name === 'dt_treasury_thresholds') {
          return existingConfigOffices.has(officeId)
            ? { vault_gl_account_id: 100, cash_at_tellers_gl_account_id: 101, bank_gl_account_id: 102, reserve_buffer_amount: 0, currency_code: 'USD' }
            : null;
        }
        return [];
      }
    };
    return { ensureCalls: () => ensureCalls };
  }
  function restore() { api.treasury = origTreasury; if (origAuth !== undefined) store.set('auth', origAuth); bootstrap._resetBootstrapCache(); }

  /* 1. ensureTreasuryDatatables memoizes per tenant/session — only one network call for repeats. */
  {
    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't1', officeId: 1 });
    const s = installStubs();
    try {
      const r1 = await bootstrap.ensureTreasuryDatatables();
      const r2 = await bootstrap.ensureTreasuryDatatables();
      a.deepStrictEqual(r1.created, ['dt_treasury_thresholds', 'dt_expense_requests']);
      a.strictEqual(r2, r1, 'second call returns the memoized result');
      a.strictEqual(s.ensureCalls(), 1, 'ensure only hit once per tenant/session');
      const r3 = await bootstrap.ensureTreasuryDatatables({ force: true });
      a.strictEqual(s.ensureCalls(), 2, 'force bypasses the cache');
      a.ok(r3.created.length >= 0);
    } finally { restore(); }
  }

  /* 2. initializeTreasuryTenant provisions AND reports requiresSetup for an unconfigured office. */
  {
    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't2', officeId: 7 });
    installStubs({ existingConfigOffices: new Set() });
    try {
      const res = await bootstrap.initializeTreasuryTenant();
      a.strictEqual(res.tenantId, 't2');
      a.strictEqual(res.office, 7);
      a.strictEqual(res.ok, true, 'no failed tables => ok');
      a.strictEqual(res.configured, false);
      a.strictEqual(res.requiresSetup, true, 'unconfigured office must flag requiresSetup');
    } finally { restore(); }
  }

  /* 3. initializeTreasuryTenant reports configured=true for an already-configured office. */
  {
    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't3', officeId: 9 });
    installStubs({ existingConfigOffices: new Set([9]) });
    try {
      const res = await bootstrap.initializeTreasuryTenant();
      a.strictEqual(res.configured, true);
      a.strictEqual(res.requiresSetup, false);
    } finally { restore(); }
  }

  /* 4. Provisioning failure => ok:false, requiresSetup stays true, and it does NOT throw. */
  {
    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't4', officeId: 3 });
    installStubs({ ensureImpl: () => { throw new Error('POST /datatables 500'); } });
    try {
      const res = await bootstrap.initializeTreasuryTenant();
      a.strictEqual(res.ok, false, 'failed provisioning => ok:false');
      a.ok((res.provisioning.failed || []).length >= 1, 'failure recorded, not thrown');
    } finally { restore(); }
  }

  /* 5. seedTreasuryThresholds is a safe no-op (returns null) when required GL ids are absent,
        and never overwrites an already-configured office. */
  {
    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't5', officeId: 2 });
    installStubs({ existingConfigOffices: new Set() });
    try {
      const seeded = await bootstrap.seedTreasuryThresholds(2, { currencyCode: 'USD' }); // no GL ids
      a.strictEqual(seeded, null, 'no fabrication without real GL account ids');
    } finally { restore(); }

    bootstrap._resetBootstrapCache();
    store.set('auth', { tenantId: 't5b', officeId: 5 });
    installStubs({ existingConfigOffices: new Set([5]) });
    try {
      const seeded = await bootstrap.seedTreasuryThresholds(5, { vaultGlAccountId: 1, cashAtTellersGlAccountId: 2, bankGlAccountId: 3, currencyCode: 'USD' });
      a.ok(seeded && seeded.vaultGlAccountId === 100, 'already-configured office returned untouched');
    } finally { restore(); }
  }
}
