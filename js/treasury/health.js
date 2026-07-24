/* FinCraft · treasury/health.js — Phase 13.1: Treasury health check.

   A cheap, read-only status probe the UI (Treasury Dashboard / Settings) can call to decide what
   to show a user before they hit a confusing downstream error:
     - BROKEN          — one or more of the eight treasury datatables is NOT registered on this
                         tenant (provisioning failed / never ran). Write screens will hard-fail.
     - CONFIG_REQUIRED — datatables exist, but this office has no dt_treasury_thresholds row yet
                         (mandatory GL mappings + reserve buffer not chosen). Route to Settings.
     - READY           — datatables present AND this office is configured.

   Deliberately does NOT itself provision anything (that's bootstrap.js) — a health check that
   mutates state would be surprising. It only reads GET /datatables and the office's thresholds. */

import { api } from '../api.js';
import { store } from '../store.js';
import { TREASURY_DATATABLES } from '../api/treasury.js';
import { getThresholds } from './thresholds.js';

const STATUS = Object.freeze({ READY: 'READY', CONFIG_REQUIRED: 'CONFIG_REQUIRED', BROKEN: 'BROKEN' });

/** Names of the eight treasury datatables, from the single source of truth in api/treasury.js. */
function requiredTableNames() {
  return TREASURY_DATATABLES.map(s => s.datatableName);
}

/**
 * @param {number} [officeId]  defaults to the signed-in user's office
 * @returns {Promise<{
 *   status:'READY'|'CONFIG_REQUIRED'|'BROKEN',
 *   datatablesPresent:boolean,
 *   missingDatatables:string[],
 *   thresholdsConfigured:boolean,
 *   glMappingsConfigured:boolean,
 *   office:number|null
 * }>}
 */
export async function getTreasuryHealth(officeId) {
  const auth = store.get('auth') || {};
  const office = officeId ?? auth.officeId ?? null;

  const health = {
    status: STATUS.BROKEN,
    datatablesPresent: false,
    missingDatatables: [],
    thresholdsConfigured: false,
    glMappingsConfigured: false,
    office
  };

  // 1) Which of the eight treasury datatables are actually registered on this tenant?
  let registered = new Set();
  try {
    const existing = await api.dataTables.list();
    registered = new Set((existing || []).map(t => t.registeredTableName));
  } catch (err) {
    // Can't even read the datatable registry — treat as BROKEN with everything "missing".
    health.missingDatatables = requiredTableNames();
    return health;
  }
  const required = requiredTableNames();
  health.missingDatatables = required.filter(name => !registered.has(name));
  health.datatablesPresent = health.missingDatatables.length === 0;

  if (!health.datatablesPresent) {
    health.status = STATUS.BROKEN; // provisioning must succeed before anything else matters
    return health;
  }

  // 2) Is this office configured (thresholds row with its mandatory GL mappings)?
  if (office != null) {
    const t = await getThresholds(office).catch(() => null);
    if (t) {
      health.thresholdsConfigured = true;
      // The three mandatory GL mappings that gate every write path.
      health.glMappingsConfigured = !!(t.vaultGlAccountId && t.cashAtTellersGlAccountId && t.bankGlAccountId);
    }
  }

  health.status = health.thresholdsConfigured && health.glMappingsConfigured
    ? STATUS.READY
    : STATUS.CONFIG_REQUIRED;
  return health;
}

export { STATUS as TREASURY_HEALTH_STATUS };
