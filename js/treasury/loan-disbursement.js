/* FinCraft · treasury/loan-disbursement.js — Phase 6: Loan Disbursement Through Teller.
   Orchestrates: cashier/teller required + active -> cashier has enough expected cash (Phase 4) ->
   Fineract loan disbursement -> FinCraft CASH_OUT teller event (Phase 3). Reuses the same
   success/failure handling shape Phase 5 established (see js/treasury/errors.js): if Fineract's
   call fails, nothing else happens; if Fineract succeeds but the FinCraft event write fails
   afterwards, that's a TreasuryReconciliationGapError, not an ordinary error. */

import { api } from '../api.js';
import { validateCashierCanPay } from './teller-balance.js';
import { recordTellerEvent, getOfficeTellerEvents } from './teller-events.js';
import { TreasuryReconciliationGapError } from './errors.js';

/** True if `cashier` (as returned by api.tellers.getCashier) is currently assigned as of
 *  `asOfDate` ('YYYY-MM-DD'). Fineract's cashier resource has no standalone `isActive` boolean —
 *  "active" is derived from the assignment window (startDate..endDate, endDate optional/open). */
function isCashierActive(cashier, asOfDate) {
  if (!cashier) return false;
  const start = fineractDateToIso(cashier.startDate);
  const end = fineractDateToIso(cashier.endDate);
  if (start && asOfDate < start) return false;
  if (end && asOfDate > end) return false;
  return true;
}

/** Fineract returns date-type fields as [YYYY, M, D] arrays (see the API docs throughout, e.g.
 *  "activationDate":[2014,3,4]) rather than strings — normalize to 'YYYY-MM-DD' for comparison. */
function fineractDateToIso(d) {
  if (!d) return null;
  if (Array.isArray(d)) { const [y, m, day] = d; return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  return String(d);
}

/** Prevents disbursing the same loan twice through this workflow: true if an un-reversed
 *  LOAN_DISBURSEMENT event already exists for this loanId at this office. (This only guards the
 *  FinCraft-teller-workflow path — it cannot detect a disbursement made directly against Fineract
 *  through some other channel; see log §5, "users bypassing FinCraft" risk.) */
async function alreadyDisbursedThroughTeller(officeId, loanId) {
  const events = await getOfficeTellerEvents(officeId);
  return events.find(e => e.fineract_entity_type === 'LOAN' && e.fineract_entity_id === loanId &&
                           e.transaction_type === 'LOAN_DISBURSEMENT' && !e.reversed) || null;
}

/**
 * @param {object} payload
 * @param {number} payload.officeId
 * @param {number} payload.loanId
 * @param {number} payload.tellerId
 * @param {number} payload.cashierId
 * @param {number} payload.amount
 * @param {string} payload.transactionDate   'YYYY-MM-DD'
 * @param {number} [payload.paymentTypeId]
 * @param {string} [payload.note]
 * @param {string} [payload.currencyCode]    for the teller-event row; defaults to 'USD' if omitted
 *   (Fineract's own loan currency isn't looked up here to avoid an extra round trip — pass it
 *   explicitly from whatever loan-detail screen calls this, where the currency is already known)
 * @param {string} [payload.performedBy]
 * @returns {Promise<{fineractResourceId:number, eventId:number|string}>}
 */
export async function disburseLoanThroughCashier(payload) {
  const { officeId, loanId, tellerId, cashierId, amount, transactionDate } = payload;

  // 1. Require tellerId and cashierId — this workflow's whole point is "which cash custodian
  //    handed out this money," so neither is optional here (contrast with Fineract's own
  //    /loans/{id}?command=disburse, which doesn't require either).
  if (!tellerId || !cashierId) throw new Error('disburseLoanThroughCashier: tellerId and cashierId are both required');
  if (!(Number(amount) > 0)) throw new Error('disburseLoanThroughCashier: amount must be a positive number');

  // 2. Prevent duplicate disbursement through this workflow before doing anything else.
  const dup = await alreadyDisbursedThroughTeller(officeId, loanId);
  if (dup) throw new Error(`Loan ${loanId} has already been disbursed through the teller workflow (event ${dup.id}, ${dup.transaction_date}). Reverse that event first if this is a genuine correction.`);

  // 3. Validate the cashier is currently active.
  const cashier = await api.tellers.getCashier(tellerId, cashierId);
  if (!isCashierActive(cashier, transactionDate)) {
    throw new Error(`Cashier ${cashierId} on teller ${tellerId} is not active as of ${transactionDate}`);
  }

  // 4. Validate the cashier's expected cash covers this disbursement (Phase 4). Throws the
  //    brief's exact "Insufficient teller cash..." message on failure.
  await validateCashierCanPay(officeId, tellerId, cashierId, amount);

  // 5. Disburse in Fineract. If this throws, stop here — no teller event, no partial state.
  const disburseResult = await api.loans.disburse(loanId, {
    actualDisbursementDate: transactionDate,
    transactionAmount: amount,
    paymentTypeId: payload.paymentTypeId,
    note: payload.note || '',
    locale: 'en',
    dateFormat: 'yyyy-MM-dd'
  });
  // Not posting a separate journal entry here deliberately — Fineract's own loan disbursement
  // already creates the accounting entries for the configured loan product (see integration
  // brief, Phase 6: "Do not post a separate JE if Fineract loan disbursement already creates
  // accounting").

  // 6. Record the FinCraft-side CASH_OUT event. If this fails, real money already left in
  //    Fineract — that's a reconciliation gap, not an ordinary error.
  try {
    const event = await recordTellerEvent({
      officeId, tellerId, cashierId,
      transactionType: 'LOAN_DISBURSEMENT',
      amount,
      currencyCode: payload.currencyCode || 'USD',
      transactionDate,
      fineractEntityType: 'LOAN',
      fineractEntityId: loanId,
      fineractTransactionId: String(disburseResult?.resourceId ?? ''),
      narration: payload.note,
      createdBy: payload.performedBy
    });
    return { fineractResourceId: disburseResult?.resourceId, eventId: event.eventId };
  } catch (eventErr) {
    throw new TreasuryReconciliationGapError(
      `Loan ${loanId} disbursement of ${amount} succeeded in Fineract (resourceId=${disburseResult?.resourceId}) but recording the FinCraft teller event failed — the teller/cashier operational sub-ledger is now behind the real Fineract cashier balance for this transaction. Reconcile manually.`,
      { fineractResourceId: disburseResult?.resourceId, cause: eventErr }
    );
  }
}
