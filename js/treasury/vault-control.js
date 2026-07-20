/* FinCraft · treasury/vault-control.js — Phase 5: Vault Control.
   Guards the "Vault" GL account (per-office config, see ./thresholds.js) with a reserve buffer,
   and wraps Fineract's native cash-allocation call (`POST /tellers/{id}/cashiers/{cid}/allocate`)
   so a successful allocation is always paired with a FinCraft teller event (Phase 3) — the two
   halves of "who gave this cashier cash, and how much do they now have."

   Treasury date convention: every treasury.* function takes `transactionDate` as a plain
   'YYYY-MM-DD' string and pairs it with dateFormat:'yyyy-MM-dd' on every Fineract call it makes,
   for consistency with the datatable rows written by teller-events.js/thresholds.js. */

import { api } from '../api.js';
import { requireThresholds } from './thresholds.js';
import { recordTellerEvent } from './teller-events.js';
import { TreasuryReconciliationGapError } from './errors.js';

const ASSET_TYPE_ID = 1; // glaccounts type.id — see Fineract "Retrieve Currency..." / GL account docs

// Re-exported for backward compatibility — callers (including this session's tests) originally
// imported this from vault-control.js, before it moved to ./errors.js for Phase 6 to share.
export { TreasuryReconciliationGapError };

/**
 * Vault balance for one office.
 * @param {number} officeId
 * @param {object} [opts]
 * @param {boolean} [opts.precise=true]  true = office-scoped exact figure (Tier 2,
 *   `computeOfficeBalance` — correct even if the Vault GL account is shared across offices);
 *   false = cheap org-wide running balance (Tier 1, `getBalance`) — fine for a dashboard tile,
 *   NOT for an allocation gate (use precise=true, the default, wherever real money is at stake).
 */
export async function getVaultBalance(officeId, { precise = true } = {}) {
  const t = await requireThresholds(officeId);
  if (!precise) {
    const acct = await api.glAccounts.getBalance(t.vaultGlAccountId);
    return Number(acct?.organizationRunningBalance) || 0;
  }
  const acct = await api.glAccounts.get(t.vaultGlAccountId);
  const accountType = acct?.type?.id ?? ASSET_TYPE_ID; // Vault should always be an ASSET account; fall back defensively
  return api.glAccounts.computeOfficeBalance(t.vaultGlAccountId, officeId, { accountType });
}

/** The configured reserve buffer for this office (from dt_treasury_thresholds). */
export async function getReserveBuffer(officeId) {
  const t = await requireThresholds(officeId);
  return t.reserveBufferAmount;
}

/**
 * Throws the brief's exact business-error message if `amount` would take the vault below its
 * reserve buffer. Returns `{ vaultBalance, reserveBuffer, availableVault }` on success.
 */
export async function validateVaultCanAllocate(officeId, amount) {
  const [vaultBalance, reserveBuffer] = await Promise.all([
    getVaultBalance(officeId),
    getReserveBuffer(officeId)
  ]);
  const availableVault = vaultBalance - reserveBuffer;
  if (Number(amount) > availableVault) {
    throw new Error(`Insufficient vault cash. Available after buffer: ${availableVault}, Requested: ${amount}`);
  }
  return { vaultBalance, reserveBuffer, availableVault };
}

/**
 * Allocates cash from the vault to a cashier: validates the reserve buffer, calls Fineract's
 * native allocate API, then records the FinCraft-side CASH_ALLOCATION/CASH_IN teller event.
 *
 * @param {number} officeId
 * @param {number} tellerId
 * @param {number} cashierId
 * @param {number} amount
 * @param {string} transactionDate  'YYYY-MM-DD'
 * @param {string} [note]
 * @param {string} [performedBy]    for the teller event's created_by / Fineract's audit trail
 * @returns {Promise<{fineractResourceId:number, eventId:number|string, availableVaultAfter:number}>}
 */
export async function allocateCashToCashier(officeId, tellerId, cashierId, amount, transactionDate, note, performedBy) {
  const t = await requireThresholds(officeId);
  const check = await validateVaultCanAllocate(officeId, amount);

  // Step 1: move the money in Fineract. If this throws, nothing else happens — no teller event,
  // no partial state (per the brief: "If requested allocation > available vault: block"; and,
  // separately, Phase 6's pattern "If Fineract fails: do not record teller event" applies equally
  // here even though this is Phase 5, since the failure-handling shape is identical).
  let fineractResult;
  try {
    fineractResult = await api.tellers.allocateCashTo(tellerId, cashierId, {
      currencyCode: t.currencyCode,
      txnAmount: String(amount),
      txnNote: note || '',
      txnDate: transactionDate,
      locale: 'en',
      dateFormat: 'yyyy-MM-dd'
    });
  } catch (err) {
    throw err; // re-thrown as-is (no teller event to clean up — nothing was recorded)
  }

  // Step 2: record the FinCraft-side event. If THIS fails, real cash already moved in Fineract —
  // that's a reconciliation gap, not an ordinary error, so it gets its own error type/handling.
  try {
    const event = await recordTellerEvent({
      officeId, tellerId, cashierId,
      transactionType: 'CASH_ALLOCATION',
      amount,
      currencyCode: t.currencyCode,
      transactionDate,
      fineractEntityType: 'TELLER_CASHIER',
      fineractEntityId: cashierId,
      fineractTransactionId: String(fineractResult?.subResourceId ?? fineractResult?.resourceId ?? ''),
      narration: note,
      createdBy: performedBy
    });
    return {
      fineractResourceId: fineractResult?.subResourceId ?? fineractResult?.resourceId,
      eventId: event.eventId,
      availableVaultAfter: check.availableVault - amount
    };
  } catch (eventErr) {
    throw new TreasuryReconciliationGapError(
      `Vault allocation of ${amount} succeeded in Fineract (resourceId=${fineractResult?.subResourceId ?? fineractResult?.resourceId}) but recording the FinCraft teller event failed — the teller/cashier operational sub-ledger is now behind the real Fineract cashier balance for this transaction. Reconcile manually.`,
      { fineractResourceId: fineractResult?.subResourceId ?? fineractResult?.resourceId, cause: eventErr }
    );
  }
}
