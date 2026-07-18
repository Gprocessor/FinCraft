/* FinCraft · tests/accounting-fixes.test.js
   Regression tests for the accounting-module audit/fix pass:
     1. Permission-code sweep — every quoted permission literal passed to can('...') anywhere under
        js/pages/accounting/ must be a real Fineract permission code (sweeps the actual source files,
        not a hand-picked sample). The whitelist below was extracted directly from
        fineract_permissions_raw.json (groupings: accounting, LOAN_PROVISIONING) plus the small set of
        cross-module codes (savings accrual, journal-entry checker variants) the page also touches.
     2. GL Account payload field name regression — command-palette "New GL Account" (ui/handlers/gl-account.js)
        must send manualEntriesAllowed (the real Fineract field), not the old manualEntries typo.
     3. GL Account usage-code fallback regression — pages/accounting/actions/coa.js's template-failure
        fallback must map id 1 -> DETAIL, id 2 -> HEADER (matches views/modals/accounting.html and Fineract's actual
        GLAccountUsage convention), not the reversed mapping that shipped before this pass.
     4. Accounting Rule payload-shape regression — openAccountingRuleModal must send singular
        debitAccountId/creditAccountId (Fineract's real simple-rule schema), not the
        `debitAccounts: [{glAccountId}]` array-of-objects shape that never matched either the API
        or the command-palette handler it was inconsistent with.
     5. Provisioning Category wiring — api/accounting.js must export makeProvisioningCategoryAPI and
        api/index.js must wire it up as api.provisioningCategory (this API/permission trio existed
        server-side and in fineract_permissions_raw.json but had zero references anywhere in the
        codebase before this pass). */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Extracted from fineract_permissions_raw.json (groupings: accounting, LOAN_PROVISIONING),
// plus EXECUTEFORSAVINGS (savings-accrual permission the Provisioning/Run-Accruals tabs
// are adjacent to) which shares the accounting grouping in the ground-truth file.
const REAL_ACCOUNTING_PERMISSIONS = new Set([
  'CREATE_ACCOUNTINGRULE', 'CREATE_FINANCIALACTIVITYACCOUNT', 'CREATE_GLACCOUNT', 'CREATE_GLCLOSURE',
  'CREATE_JOURNALENTRY', 'CREATE_JOURNALENTRY_CHECKER', 'CREATE_PROVISIONCATEGORY',
  'CREATE_PROVISIONCRITERIA', 'CREATE_PROVISIONENTRIES', 'CREATE_PROVISIONJOURNALENTRIES',
  'DEFINEOPENINGBALANCE_JOURNALENTRY', 'DEFINEOPENINGBALANCE_JOURNALENTRY_CHECKER',
  'DELETE_ACCOUNTINGRULE', 'DELETE_FINANCIALACTIVITYACCOUNT', 'DELETE_GLACCOUNT', 'DELETE_GLCLOSURE',
  'DELETE_PROVISIONCATEGORY', 'DELETE_PROVISIONCRITERIA', 'EXECUTEFORSAVINGS',
  'EXECUTE_PERIODICACCRUALACCOUNTING', 'READ_ACCOUNTINGRULE', 'READ_FINANCIALACTIVITYACCOUNT',
  'READ_GLACCOUNT', 'READ_GLCLOSURE', 'READ_JOURNALENTRY', 'RECREATE_PROVISIONENTRIES',
  'REVERSE_JOURNALENTRY', 'UPDATEOPENINGBALANCE_JOURNALENTRY', 'UPDATEOPENINGBALANCE_JOURNALENTRY_CHECKER',
  'UPDATERUNNINGBALANCE_JOURNALENTRY', 'UPDATE_ACCOUNTINGRULE', 'UPDATE_FINANCIALACTIVITYACCOUNT',
  'UPDATE_GLACCOUNT', 'UPDATE_GLCLOSURE', 'UPDATE_PROVISIONCATEGORY', 'UPDATE_PROVISIONCRITERIA'
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

export async function runTests({ assert: a = assert } = {}) {
  /* ---------------------------------------------------------------- */
  /* 1. Permission-code sweep over pages/accounting/**                 */
  /* ---------------------------------------------------------------- */
  const accountingDir = path.join(root, 'js', 'pages', 'accounting');
  const files = walk(accountingDir);
  a.ok(files.length > 5, 'sanity check: should find several accounting page files');

  const canCallRe = /\bcan\(\s*'([A-Z][A-Z0-9_]*)'\s*\)/g;
  const found = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = canCallRe.exec(src))) found.add(m[1]);
  }
  a.ok(found.size > 10, 'sanity check: should find a reasonable number of can(...) permission checks');

  const unknown = [...found].filter(code => !REAL_ACCOUNTING_PERMISSIONS.has(code));
  a.deepStrictEqual(unknown, [], `every can('...') permission literal in pages/accounting/ must be a real Fineract permission code; found unrecognized: ${unknown.join(', ')}`);

  /* ---------------------------------------------------------------- */
  /* 2. GL Account manualEntriesAllowed field-name regression           */
  /* ---------------------------------------------------------------- */
  const glHandlerSrc = read('js/ui/handlers/gl-account.js');
  a.ok(glHandlerSrc.includes('manualEntriesAllowed:'), 'gl-account.js handler must send manualEntriesAllowed (the real Fineract field)');
  a.ok(!/manualEntries:\s*f\.manualEntries/.test(glHandlerSrc), 'gl-account.js handler must not send the old manualEntries typo as the payload key');

  /* ---------------------------------------------------------------- */
  /* 3. GL Account usage-code fallback regression                      */
  /* ---------------------------------------------------------------- */
  const coaActionsSrc = read('js/pages/accounting/actions/coa.js');
  a.ok(/\{\s*id:\s*1,\s*value:\s*'DETAIL'\s*\},\s*\{\s*id:\s*2,\s*value:\s*'HEADER'\s*\}/.test(coaActionsSrc),
    'GL account usage fallback must map id 1 -> DETAIL, id 2 -> HEADER (matches views/modals/accounting.html and real Fineract convention)');

  /* ---------------------------------------------------------------- */
  /* 4. Accounting Rule payload-shape regression                       */
  /* ---------------------------------------------------------------- */
  a.ok(coaActionsSrc.includes('debitAccountId: debitId') && coaActionsSrc.includes('creditAccountId: creditId'),
    'openAccountingRuleModal must send singular debitAccountId/creditAccountId');
  a.ok(!coaActionsSrc.includes('debitAccounts: [{ glAccountId: debitId }]'),
    'openAccountingRuleModal must not send the old debitAccounts array-of-objects shape');

  /* ---------------------------------------------------------------- */
  /* 5. Provisioning Category API wiring                                */
  /* ---------------------------------------------------------------- */
  const { makeProvisioningCategoryAPI } = await import('../js/api/accounting.js');
  a.strictEqual(typeof makeProvisioningCategoryAPI, 'function', 'api/accounting.js must export makeProvisioningCategoryAPI');

  const calls = [];
  const fakeSelf = {
    _g: (url, params) => { calls.push(['GET', url, params]); return Promise.resolve([]); },
    _p: (url, body) => { calls.push(['POST', url, body]); return Promise.resolve({}); },
    _u: (url, body) => { calls.push(['PUT', url, body]); return Promise.resolve({}); },
    _d: (url) => { calls.push(['DELETE', url]); return Promise.resolve({}); }
  };
  const provCatApi = makeProvisioningCategoryAPI(fakeSelf);
  await provCatApi.list();
  await provCatApi.create({ categoryName: 'Test' });
  await provCatApi.update(5, { categoryName: 'Test2' });
  await provCatApi.delete(5);
  a.deepStrictEqual(calls, [
    ['GET', '/provisioningcategory', undefined],
    ['POST', '/provisioningcategory', { categoryName: 'Test' }],
    ['PUT', '/provisioningcategory/5', { categoryName: 'Test2' }],
    ['DELETE', '/provisioningcategory/5']
  ], 'makeProvisioningCategoryAPI must hit /provisioningcategory with correct verbs');

  const indexSrc = read('js/api/index.js');
  a.ok(indexSrc.includes('makeProvisioningCategoryAPI') && indexSrc.includes('this.provisioningCategory ='),
    'api/index.js must import and wire up provisioningCategory');
}
