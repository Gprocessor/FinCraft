/* FinCraft · pages/treasury/index.js — render() entry point — dispatches to the view below by
   params.view. Mirrors js/pages/misc/index.js's structure exactly, so additional treasury views
   (dashboard, teller-console, cash-allocation, loan-disbursement, expenses, borrowings,
   reconciliation — see FINCRAFT_Fineract_Treasury_Integration_Log.md Phase 11 checklist) can be
   added the same way `settings` was, one file + one VIEWS entry each, without restructuring. */

import { settings } from './settings.js';
import { dashboard } from './dashboard.js';
import { tellerConsole } from './teller-console.js';
import { cashAllocation } from './cash-allocation.js';
import { loanDisbursement } from './loan-disbursement.js';
import { expenses } from './expenses.js';
import { borrowings } from './borrowings.js';
import { reconciliation } from './reconciliation.js';
import { ensureTreasuryDatatables } from '../../treasury/bootstrap.js';

export async function render(c, params = {}) {
  const view = params.view || 'settings';
  // Phase 13 — self-healing. Every treasury screen routes through here, so this is the single
  // choke point to guarantee the tenant's eight `dt_*` tables exist before any screen reads/writes
  // them (covers the case where login-time bootstrap was skipped, the tenant was switched, or the
  // tables were dropped). It's idempotent + per-tenant memoized in bootstrap.js, so after the first
  // successful run it's effectively free. Guarded: a provisioning hiccup must not blank the screen —
  // the view still renders and surfaces its own health/error state (Settings/Dashboard read health).
  try {
    await ensureTreasuryDatatables();
  } catch (err) {
    console.warn('[treasury] self-heal ensureTreasuryDatatables failed:', err && err.message ? err.message : err);
  }
  const VIEWS = {
    settings, dashboard,
    'teller-console': tellerConsole,
    'cash-allocation': cashAllocation,
    'loan-disbursement': loanDisbursement,
    expenses, borrowings, reconciliation
  };
  const fn = VIEWS[view] || settings;
  await fn(c);
}
