/* FinCraft · data.js
   All demo/offline hardcoded data has been removed.
   withDemoFallback now surfaces API errors rather than silently swallowing them.
   The offline D object contains only structural/empty defaults used for dropdowns
   before template data loads. */

import { store } from './store.js';

export const D = {
  offices: [],
  staff: [],
  clients: [],
  loans: [],
  savings: [],
  groups: [],
  loanProducts: [],
  checkerTasks: [],
  glAccounts: [],
  reports: [],
  configs: [],
  notifications: [],
  surveys: []
};

/**
 * Calls the live API. Returns { offline: false, data }.
 * On error, returns { offline: true, data: D[demoKey], error }.
 * If store is in offline mode (user clicked "demo" on login), returns empty set.
 */
export async function withDemoFallback(call, demoKey) {
  if (store.get('offline')) return { offline: true, data: D[demoKey] || [] };
  try {
    const p = (typeof call === 'function') ? call() : call;
    const data = await p;
    return { offline: false, data };
  } catch (e) {
    console.warn('[api-error]', demoKey, e.message || e);
    return { offline: true, data: D[demoKey] || [], error: e };
  }
}