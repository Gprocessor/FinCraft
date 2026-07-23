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

export async function render(c, params = {}) {
  const view = params.view || 'settings';
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
