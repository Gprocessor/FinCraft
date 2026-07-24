/* FinCraft · tests/treasury-bootstrap.test.js
   Covers js/treasury/bootstrap.js (Phase 13) and js/treasury/health.js. Uses DYNAMIC import()
   after installing a minimal `document`/storage shim, because these modules → store.js run
   store.restore() at module load, which touches document.documentElement (unavailable in the bare
   Node test runner). Stubs api.treasury / api.dataTables so nothing hits a network. */
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
  const { getTreasuryHealth, TREASURY_HEALTH_STATUS } = await import('../js/treasury/health.js');
  const { TREASURY_DATATABLES } = await import('../js/api/treasury.js');
  const ALL_NAMES = TREASURY_DATATABLES.map(s => s.datatableName);

  const origTreasury = api.treasury;
  const origDataTables = api.dataTables;
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
  function restore() { api.treasury = origTreasury; api.dataTables = origDataTables; if (origAuth !== undefined) store.set('auth', origAuth); bootstrap._resetBootstrapCache(); }

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
      await bootstrap.ensureTreasuryDatatables({ force: true });
      a.strictEqual(s.ensureCalls(), 2, 'force bypasses the cache');
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

  /* 4. Provisioning failure => ok:false, does NOT throw. */
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

  /* 5. seedTreasuryThresholds: safe no-op without GL ids; never overwrites a configured office. */
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

  /* 6. getTreasuryHealth: BROKEN when a datatable is missing. */
  {
    store.set('auth', { tenantId: 'h1', officeId: 4 });
    const s = installStubs({ existingConfigOffices: new Set([4]) });
    api.dataTables = { ...origDataTables, async list() { return ALL_NAMES.slice(1).map(n => ({ registeredTableName: n })); } }; // drop one
    try {
      const h = await getTreasuryHealth(4);
      a.strictEqual(h.status, TREASURY_HEALTH_STATUS.BROKEN);
      a.strictEqual(h.datatablesPresent, false);
      a.ok(h.missingDatatables.includes(ALL_NAMES[0]), 'the dropped table is reported missing');
    } finally { restore(); }
  }

  /* 7. getTreasuryHealth: CONFIG_REQUIRED when all tables present but office not configured. */
  {
    store.set('auth', { tenantId: 'h2', officeId: 8 });
    installStubs({ existingConfigOffices: new Set() });
    api.dataTables = { ...origDataTables, async list() { return ALL_NAMES.map(n => ({ registeredTableName: n })); } };
    try {
      const h = await getTreasuryHealth(8);
      a.strictEqual(h.status, TREASURY_HEALTH_STATUS.CONFIG_REQUIRED);
      a.strictEqual(h.datatablesPresent, true);
      a.strictEqual(h.thresholdsConfigured, false);
    } finally { restore(); }
  }

  /* 8. getTreasuryHealth: READY when tables present AND office configured with GL mappings. */
  {
    store.set('auth', { tenantId: 'h3', officeId: 6 });
    installStubs({ existingConfigOffices: new Set([6]) });
    api.dataTables = { ...origDataTables, async list() { return ALL_NAMES.map(n => ({ registeredTableName: n })); } };
    try {
      const h = await getTreasuryHealth(6);
      a.strictEqual(h.status, TREASURY_HEALTH_STATUS.READY);
      a.strictEqual(h.glMappingsConfigured, true);
    } finally { restore(); }
  }
}
