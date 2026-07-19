/* FinCraft · treasury/teller-balance.js — Phase 4: Teller Balance Service.
   Computes each cashier's expected cash purely from FinCraft's own event log
   (dt_teller_operational_events, see ./teller-events.js), and cross-checks it against Fineract's
   own native cashier ledger (GET /tellers/{id}/cashiers/{cid}/summaryandtransactions, which
   Fineract already maintains for allocate/settle/transaction history) — per the architecture
   decision in FINCRAFT_Fineract_Treasury_Integration_Log.md §3 to prefer Fineract's own tracked
   figures over blind trust in FinCraft-local records wherever an equivalent exists. */

import { api } from '../api.js';
import { getCashierEvents, getOfficeTellerEvents } from './teller-events.js';

/**
 * Expected Cash = Σ(CASH_IN events) − Σ(CASH_OUT events), including any prior allocation
 * (CASH_ALLOCATION is itself a CASH_IN event type — see teller-events.js) — i.e. there's no
 * separate "opening float" concept to track: a cashier's very first CASH_ALLOCATION event *is*
 * their opening float, and every subsequent event nets against it. Reversal events (see
 * reverseTellerEvent in teller-events.js) are ordinary CASH_IN/CASH_OUT rows too, so they net out
 * naturally without any special-casing here.
 */
export async function computeCashierExpectedBalance(officeId, tellerId, cashierId, dateRange) {
  const events = await getCashierEvents(officeId, cashierId, dateRange);
  let cashIn = 0, cashOut = 0;
  for (const e of events) {
    if (e.teller_id !== tellerId) continue; // defensive: a cashier is normally tied to one teller, but don't assume
    const amt = Number(e.amount) || 0;
    if (e.direction === 'CASH_IN') cashIn += amt;
    else if (e.direction === 'CASH_OUT') cashOut += amt;
  }
  return { expectedCash: cashIn - cashOut, cashIn, cashOut, eventCount: events.length };
}

/**
 * Throws a business error (not a generic exception — message is meant to be shown to the user
 * verbatim, per the brief's exact wording) if `amount` exceeds the cashier's expected cash.
 * Returns the computed balance object on success, so callers get both the validation and the
 * figures in one call.
 */
export async function validateCashierCanPay(officeId, tellerId, cashierId, amount) {
  const balance = await computeCashierExpectedBalance(officeId, tellerId, cashierId);
  if (Number(amount) > balance.expectedCash) {
    throw new Error(`Insufficient teller cash. Available: ${balance.expectedCash}, Requested: ${amount}`);
  }
  return balance;
}

/**
 * Cross-checks FinCraft's computed expected balance for one cashier against Fineract's own
 * native `netCash` figure from GET /tellers/{id}/cashiers/{cid}/summaryandtransactions.
 * `difference` should be ~0 when FinCraft's event log and Fineract's teller ledger agree; a
 * non-zero difference is the earliest, cheapest signal of drift (see log §5 risks) and is what
 * the Treasury Dashboard's per-cashier reconciliation status should be built on.
 */
export async function compareCashierBalanceToFineract(officeId, tellerId, cashierId, params) {
  const [fincraft, fineractSummary] = await Promise.all([
    computeCashierExpectedBalance(officeId, tellerId, cashierId),
    api.tellers.cashierSummary(tellerId, cashierId, params).catch(() => null)
  ]);
  const fineractNetCash = Number(fineractSummary?.netCash);
  const hasFineractFigure = Number.isFinite(fineractNetCash);
  return {
    fincraftExpectedCash: fincraft.expectedCash,
    fineractNetCash: hasFineractFigure ? fineractNetCash : null,
    difference: hasFineractFigure ? fincraft.expectedCash - fineractNetCash : null,
    matches: hasFineractFigure ? Math.abs(fincraft.expectedCash - fineractNetCash) < 0.005 : null
  };
}

/**
 * Full office breakdown: expected cash per teller/cashier, plus the grand total that should
 * reconcile against the pooled `Cash At Tellers` GL balance (compare the returned `officeTotal`
 * against `api.glAccounts.getBalance(cashAtTellersGlAccountId)` — the top-level worked example
 * in the brief, "sum of FinCraft teller balances reconciles to the pooled Fineract GL").
 * `tellerCashierList` must be supplied by the caller (from api.tellers.list()/cashiers(tellerId))
 * since Fineract has no single "all cashiers for this office" endpoint.
 */
export async function getOfficeTellerBreakdown(officeId, tellerCashierList, dateRange) {
  const events = await getOfficeTellerEvents(officeId, dateRange);
  const byCashier = new Map(); // cashierId -> { tellerId, cashIn, cashOut }
  for (const e of events) {
    const key = e.cashier_id;
    const bucket = byCashier.get(key) || { tellerId: e.teller_id, cashierId: key, cashIn: 0, cashOut: 0 };
    const amt = Number(e.amount) || 0;
    if (e.direction === 'CASH_IN') bucket.cashIn += amt; else if (e.direction === 'CASH_OUT') bucket.cashOut += amt;
    byCashier.set(key, bucket);
  }

  // Ensure every known cashier appears even with zero events (e.g. newly assigned, not yet used).
  for (const { tellerId, cashierId } of (tellerCashierList || [])) {
    if (!byCashier.has(cashierId)) byCashier.set(cashierId, { tellerId, cashierId, cashIn: 0, cashOut: 0 });
  }

  const perCashier = [...byCashier.values()].map(b => ({ ...b, expectedCash: b.cashIn - b.cashOut }));
  const officeTotal = perCashier.reduce((sum, b) => sum + b.expectedCash, 0);
  return { perCashier, officeTotal };
}
