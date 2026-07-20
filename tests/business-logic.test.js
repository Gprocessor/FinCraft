/* FinCraft · tests/business-logic.test.js
   Unlike module-integrity.test.js (wiring-only smoke tests), these exercise actual
   business rules with realistic fixture data:
     1. Route-permission gating (js/router.js :: isAllowed) — including a direct
        regression test for the Checker Inbox lockout bug (audit item 1).
     1b. initRouter() hashchange-listener idempotency (js/router.js :: initRouter) —
        regression test for the double-render/double-API-call-per-page-load stud
        found on the following pass (every re-login within an SPA session used to
        stack another 'hashchange' listener).
     2. Permission-code extraction from all 3 payload shapes Fineract's
        /authentication and /userdetails responses can take (js/auth.js :: _extractPerms).
     3. NPL-ratio parsing from a PortfolioAtRisk genericResultSet fixture
        (js/pages/analytics.js :: computeNplFromPar) — a regression test for the
        count-based-vs-principal-based NPL formula bug fixed in an earlier session.
   Business-logic assertions like these are what module-integrity.test.js explicitly
   says it cannot catch. */
import assert from 'assert';

export async function runTests({ assert: a = assert } = {}) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    console.warn('[business-logic] jsdom not installed — run `npm install` first. Skipping.');
    return;
  }

  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true }); } catch {}
  try { Object.defineProperty(global, 'location', { value: dom.window.location, configurable: true, writable: true }); } catch {}

  const { store }              = await import('../js/store.js');
  const { isAllowed, PAGE_REGISTRY } = await import('../js/router.js');
  const { _extractPerms }      = await import('../js/auth.js');
  const { computeNplFromPar }  = await import('../js/pages/analytics.js');

  /* ---------------------------------------------------------------- */
  /* 1. Route-permission gating (js/router.js :: isAllowed)            */
  /* ---------------------------------------------------------------- */

  // Public/authenticated-only pages (requiredPermission: null) are always allowed
  store.set('perms', []);
  a.strictEqual(isAllowed({ requiredPermission: null }), true, 'null requiredPermission should always be allowed');
  a.strictEqual(isAllowed({ requiredPermission: undefined }), true, 'undefined requiredPermission should always be allowed');

  // Single-string permission: strict deny when the user lacks it, allow when they have it
  store.set('perms', []);
  a.strictEqual(isAllowed({ requiredPermission: 'READ_CLIENT' }), false, 'empty perms must deny a gated page');
  store.set('perms', ['READ_CLIENT']);
  a.strictEqual(isAllowed({ requiredPermission: 'READ_CLIENT' }), true);

  // ALL_FUNCTIONS superuser bypass
  store.set('perms', ['ALL_FUNCTIONS']);
  a.strictEqual(isAllowed({ requiredPermission: 'SOME_RANDOM_PERM' }), true);

  // Array of alternatives (any-of match) — general isAllowed() array support, using two
  // real Fineract codes (unrelated to the Checker Inbox case below).
  store.set('perms', ['READ_LOAN']);
  a.strictEqual(
    isAllowed({ requiredPermission: ['READ_CLIENT', 'READ_LOAN'] }),
    true,
    'a user with just one of the array permissions should be allowed in'
  );
  store.set('perms', []);
  a.strictEqual(
    isAllowed({ requiredPermission: ['READ_CLIENT', 'READ_LOAN'] }),
    false,
    'a user with none of the array permissions should still be denied'
  );

  // Direct regression test for audit item 1: the live 'tasks' route definition must admit
  // ANY real entity-level "..._CHECKER" permission (e.g. CREATE_ROLE_CHECKER,
  // DISBURSE_LOAN_CHECKER — Fineract has no single "CHECKER_APPROVE" umbrella code), not
  // just the special CHECKER_SUPER_USER bypass — a checker-role user who can only approve
  // a specific entity's actions (the overwhelmingly common case) must not be locked out.
  store.set('perms', ['DISBURSE_LOAN_CHECKER']);
  a.strictEqual(
    isAllowed(PAGE_REGISTRY.tasks),
    true,
    'Checker Inbox route must admit users with any real "..._CHECKER" permission, not just CHECKER_SUPER_USER'
  );
  store.set('perms', ['CHECKER_SUPER_USER']);
  a.strictEqual(isAllowed(PAGE_REGISTRY.tasks), true, 'CHECKER_SUPER_USER must still work as the global bypass');
  store.set('perms', ['READ_LOAN']);
  a.strictEqual(
    isAllowed(PAGE_REGISTRY.tasks),
    false,
    'a user with no checker-related permission at all must still be denied'
  );

  /* ---------------------------------------------------------------- */
  /* 1b. initRouter() must not double-register its hashchange listener */
  /*     (js/router.js :: initRouter) — regression test for the        */
  /*     double-render/double-fetch-on-every-page-load stud: initRouter*/
  /*     used to add a fresh 'hashchange' listener on every call (e.g. */
  /*     logout -> log back in within the same SPA session), so every  */
  /*     navigation after the Nth login re-rendered the page N times,  */
  /*     firing every one of that page's API calls N times over.       */
  /* ---------------------------------------------------------------- */
  {
    const { initRouter } = await import('../js/router.js');
    let listenerCount = 0;
    const realAdd = window.addEventListener.bind(window);
    window.addEventListener = (type, ...rest) => {
      if (type === 'hashchange') listenerCount++;
      return realAdd(type, ...rest);
    };
    try {
      initRouter();
      initRouter();
      initRouter();
    } finally {
      window.addEventListener = realAdd;
    }
    a.strictEqual(
      listenerCount,
      1,
      'initRouter() must register the hashchange listener at most once no matter how many times it is called'
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Permission-code extraction fixtures (js/auth.js :: _extractPerms) */
  /* ---------------------------------------------------------------- */

  // Shape A: flat array of permission-code strings
  a.deepStrictEqual(
    _extractPerms({ permissions: ['READ_CLIENT', 'CREATE_CLIENT'] }).sort(),
    ['CREATE_CLIENT', 'READ_CLIENT']
  );

  // Shape B: array of { code } objects
  a.deepStrictEqual(
    _extractPerms({ permissions: [{ code: 'READ_LOAN' }, { code: 'CREATE_LOAN' }] }).sort(),
    ['CREATE_LOAN', 'READ_LOAN']
  );

  // Shape C: roles[].permissions[] with a selected flag — deselected perms must be excluded
  const rolesShape = _extractPerms({
    roles: [
      { permissions: [{ code: 'READ_SAVINGSACCOUNT', selected: true }, { code: 'DELETE_SAVINGSACCOUNT', selected: false }] },
      { permissions: [{ code: 'CREATE_SAVINGSACCOUNT' }] } // selected omitted -> treated as true
    ]
  }).sort();
  a.deepStrictEqual(rolesShape, ['CREATE_SAVINGSACCOUNT', 'READ_SAVINGSACCOUNT']);

  // Mixed payload (top-level permissions + roles) should merge and de-duplicate
  const mixed = _extractPerms({
    permissions: ['READ_CLIENT'],
    roles: [{ permissions: ['READ_CLIENT', 'CREATE_CLIENT'] }]
  }).sort();
  a.deepStrictEqual(mixed, ['CREATE_CLIENT', 'READ_CLIENT']);

  // Empty/malformed payloads should never throw — just return []
  a.deepStrictEqual(_extractPerms({}), []);
  a.deepStrictEqual(_extractPerms(null), []);
  a.deepStrictEqual(_extractPerms({ permissions: null, roles: null }), []);

  /* ---------------------------------------------------------------- */
  /* 3. NPL ratio parsing fixtures (js/pages/analytics.js :: computeNplFromPar) */
  /* ---------------------------------------------------------------- */

  // Realistic PortfolioAtRisk genericResultSet: one office row with a total-outstanding
  // column and two at-risk buckets. NPL = (150 + 50) / 1000 * 100 = 20%.
  const parFixture = {
    columnHeaders: [
      { columnName: 'Office' },
      { columnName: 'Current' },
      { columnName: '1 - 30 Days' },
      { columnName: '31 - 60 Days' },
      { columnName: 'Total Outstanding' }
    ],
    data: [
      { row: ['Head Office', '800', '150', '50', '1000'] }
    ]
  };
  const npl = computeNplFromPar(parFixture);
  a.strictEqual(npl, 20, 'NPL ratio should be principal-based: (150+50)/1000 * 100');

  // Multiple office rows should sum before dividing (portfolio-wide ratio, not an average of ratios)
  const parMultiRow = {
    columnHeaders: [
      { columnName: 'Office' }, { columnName: '1 - 30 Days' }, { columnName: 'Total Outstanding' }
    ],
    data: [
      { row: ['Office A', '100', '1000'] },
      { row: ['Office B', '100', '1000'] }
    ]
  };
  a.strictEqual(computeNplFromPar(parMultiRow), 10, '(100+100)/(1000+1000)*100 = 10, not an average of two 10% rows coincidentally');

  // No recognisable "total outstanding" column -> must return null so the caller can fall
  // back to the count-based estimate, rather than silently returning a wrong number.
  a.strictEqual(computeNplFromPar({
    columnHeaders: [{ columnName: 'Office' }, { columnName: 'Some Other Metric' }],
    data: [{ row: ['Head Office', '5'] }]
  }), null);

  // No data at all -> null, not NaN or a thrown error
  a.strictEqual(computeNplFromPar({ columnHeaders: [], data: [] }), null);
  a.strictEqual(computeNplFromPar(null), null);
  a.strictEqual(computeNplFromPar(undefined), null);
}
