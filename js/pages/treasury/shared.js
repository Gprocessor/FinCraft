/* FinCraft · pages/treasury/shared.js — helpers shared across treasury/*.js views.
   Follows the pages/<domain>/shared.js convention used elsewhere (e.g. pages/dashboard/shared.js,
   pages/organization/shared.js) for small pieces of markup/logic reused by more than one view
   within the same page module. */

import { escapeHtml } from '../../utils.js';
import { api } from '../../api.js';

export function officeOptionsHtml(offices, selectedId) {
  return offices.map(o => `<option value="${o.id}" ${Number(selectedId) === o.id ? 'selected' : ''}>${escapeHtml(o.name || '')}</option>`).join('');
}

/** RED/AMBER/GREEN -> the existing .badge modifier classes (see css/components.css) already
 *  used everywhere else in the app for status pills, so the liquidity status badge looks and
 *  behaves identically to every other status badge in FinCraft rather than introducing new CSS. */
export function liquidityBadgeClass(status) {
  return status === 'RED' ? 'b-danger' : status === 'AMBER' ? 'b-warning' : 'b-success';
}

/** .stat-card accent (c-teal/c-amber/...) matching liquidity status, for the Available Vault tile
 *  on the dashboard — same RED/AMBER/GREEN -> css mapping idea as liquidityBadgeClass, just for
 *  the .stat-card variant instead of .badge (see css/cards.css). */
export function liquidityAccentClass(status) {
  return status === 'RED' ? 'red' : status === 'AMBER' ? 'amber' : 'green';
}

/** true/false/null -> the same .badge modifier classes, for any "does FinCraft's figure match
 *  Fineract's own?" comparison (currently: Teller Console's per-cashier reconciliation check).
 *  null (comparison unavailable, e.g. Fineract's own call failed) reads as "unknown", not a
 *  silent pass or fail. */
export function matchBadgeClass(matches) {
  return matches === true ? 'b-success' : matches === false ? 'b-danger' : 'b-warning';
}

/** GL-account <option> markup, shared by every treasury screen that needs a GL-account picker
 *  (Settings' eight mapping dropdowns, Expenses' expense-account dropdown). Extracted out of
 *  settings.js once expenses.js needed the identical `glCode — name` option shape a second time,
 *  per this module's own "extend shared.js before duplicating" discipline. `includeNone` adds a
 *  leading "— none —" blank option (Settings' optional mappings want it; a mandatory expense
 *  account picker passes false). */
export function glOptionsHtml(glAccounts, selectedId, includeNone = true) {
  const opts = includeNone ? ['<option value="">— none —</option>'] : [];
  for (const g of (Array.isArray(glAccounts) ? glAccounts : [])) {
    const sel = Number(selectedId) === g.id ? 'selected' : '';
    opts.push(`<option value="${g.id}" ${sel}>${escapeHtml(g.glCode || '')} — ${escapeHtml(g.name || '')}</option>`);
  }
  return opts.join('');
}

/** Maps the treasury workflow status strings (expenses: PENDING/APPROVED/REJECTED/PAID;
 *  borrowings: PENDING/ACTIVE/CLOSED; reconciliation: OPEN/SUBMITTED/APPROVED; schedule rows:
 *  SCHEDULED/PARTIALLY_PAID/PAID) onto the app's existing .badge modifier classes, so every
 *  treasury status pill reads consistently with the rest of FinCraft rather than introducing new
 *  CSS. Unknown/unmapped statuses fall back to the neutral info badge rather than throwing. */
export function statusBadgeClass(status) {
  switch (status) {
    case 'PAID': case 'ACTIVE': case 'APPROVED': return 'b-success';
    case 'REJECTED': return 'b-danger';
    case 'PENDING': case 'SUBMITTED': case 'OPEN': case 'PARTIALLY_PAID': return 'b-warning';
    case 'CLOSED': case 'SCHEDULED': return 'b-info';
    default: return 'b-info';
  }
}

export function fmtMoney(amount, currencyCode) {
  if (amount === null || amount === undefined) return '—';
  const n = Number(amount);
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencyCode ? `${currencyCode} ${formatted}` : formatted;
}

/** Assembles a flat [{tellerId, tellerName, cashierId, cashierName}] list for one office.
 *  Fineract's `GET /tellers` list isn't guaranteed office-filterable via a query param across all
 *  versions, and there is no single "all cashiers for this office" endpoint — so this filters
 *  tellers client-side by their own `officeId` field, then fetches each teller's cashiers
 *  individually. Extracted here (originally written inline in teller-console.js) once
 *  cash-allocation.js needed the identical assembly a second time. */
export function tellerCashierOptionsHtml(list) {
  if (!list.length) return '<option value="">No tellers/cashiers configured</option>';
  return list.map(tc => `<option value="${tc.tellerId}:${tc.cashierId}">${escapeHtml(tc.tellerName || `Teller ${tc.tellerId}`)} — ${escapeHtml(tc.cashierName)}</option>`).join('');
}

export async function loadOfficeTellerCashierList(officeId) {
  const allTellers = await api.tellers.list().catch(() => []);
  const officeTellers = (Array.isArray(allTellers) ? allTellers : []).filter(t => t.officeId === officeId);

  const rows = [];
  for (const teller of officeTellers) {
    const result = await api.tellers.cashiers(teller.id).catch(() => null);
    const cashiers = result?.cashiers || [];
    for (const cashier of cashiers) {
      rows.push({ tellerId: teller.id, tellerName: teller.name, cashierId: cashier.id, cashierName: cashier.staffName || cashier.description || `Cashier ${cashier.id}` });
    }
  }
  return rows;
}
