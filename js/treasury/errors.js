/* FinCraft · treasury/errors.js — shared error types for the treasury control layer.
   Factored out of vault-control.js once it became clear Phase 6 (Loan Disbursement Through
   Teller) needs the identical "Fineract call succeeded, FinCraft's own event write failed
   afterwards" failure shape that Phase 5 (Vault Control) introduced — duplicating the class
   per-phase would drift as soon as one copy's constructor signature changed and the other didn't. */

/** Thrown whenever a Fineract-side write (allocate cash, disburse a loan, post a journal entry,
 *  ...) succeeded but the FinCraft-side bookkeeping that was supposed to follow it (a teller
 *  event, an expense/borrowing status update, ...) failed. This means real money/state already
 *  moved in Fineract, but FinCraft's own operational sub-ledger doesn't reflect it yet — a
 *  reconciliation gap, not an ordinary validation failure, and it must never be silently
 *  swallowed or presented to the user the same way as "your request was invalid." */
export class TreasuryReconciliationGapError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {number|string} [details.fineractResourceId]     the id Fineract returned for the
   *   successful write, so an operator can trace the orphaned transaction
   * @param {string} [details.fineractTransactionId]
   * @param {Error} [details.cause]                          the underlying error from the failed
   *   FinCraft-side write (e.g. the datatable create/update that threw)
   */
  constructor(message, { fineractResourceId, fineractTransactionId, cause } = {}) {
    super(message);
    this.name = 'TreasuryReconciliationGapError';
    this.fineractResourceId = fineractResourceId;
    this.fineractTransactionId = fineractTransactionId;
    this.cause = cause;
  }
}
