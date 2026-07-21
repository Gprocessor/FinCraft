/* FinCraft · treasury/reconciliation.js — Phase 10: Daily Cash Reconciliation.
   Workflow: OPEN (expected cash computed) -> SUBMITTED (physical count entered, variance
   computed) -> APPROVED (only reachable via explicit approval when variance != 0; a zero-variance
   submission auto-approves itself, since there's nothing to authorize). Mirrors Phase 7's
   PENDING->APPROVED shape deliberately, per this log's own note that the two are structurally
   similar.

   Submitting a physical count is NOT itself authorization to post an accounting adjustment — per
   the integration brief ("Post shortage JE after approval / Post overage JE after approval"), a
   variance sits as SUBMITTED until a separate approveReconciliation() call books it. */

import { api } from '../api.js';
import { requireThresholds } from './thresholds.js';
import { computeCashierExpectedBalance } from './teller-balance.js';
import { recordTellerEvent } from './teller-events.js';
import { TreasuryReconciliationGapError } from './errors.js';

const TABLE = 'dt_daily_cash_reconciliation';
const STATUS = Object.freeze({ OPEN: 'OPEN', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED' });
const VARIANCE_TOLERANCE = 0.01; // a variance within a cent of zero is treated as "no variance"

function today() { return new Date().toISOString().slice(0, 10); }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

async function getReconciliation(officeId, reconciliationId) {
  const row = await api.treasury.getRow(TABLE, officeId, reconciliationId);
  if (!row) throw new Error(`Reconciliation ${reconciliationId} not found for office ${officeId}`);
  return row;
}

/**
 * Opens a new reconciliation for one cashier on one date: computes their FinCraft-derived
 * expected cash (Phase 4) and stores it. Blocks opening a second reconciliation for the same
 * cashier/date while one is still OPEN or SUBMITTED (an already-APPROVED one for that date is
 * fine to "re-open" as a fresh row, e.g. for a second count later the same day, but that's an
 * edge case left to the caller's judgment rather than blocked outright).
 */
export async function startDailyReconciliation(officeId, tellerId, cashierId, reconciliationDate) {
  const existing = await api.treasury.queryRows(TABLE, officeId);
  const openOrSubmitted = (Array.isArray(existing) ? existing : []).find(r =>
    r.cashier_id === cashierId && r.reconciliation_date === reconciliationDate &&
    (r.status === STATUS.OPEN || r.status === STATUS.SUBMITTED));
  if (openOrSubmitted) {
    throw new Error(`Cashier ${cashierId} already has an unresolved reconciliation for ${reconciliationDate} (id ${openOrSubmitted.id}, status ${openOrSubmitted.status})`);
  }

  const { expectedCash } = await computeCashierExpectedBalance(officeId, tellerId, cashierId);
  const row = {
    teller_id: tellerId, cashier_id: cashierId, reconciliation_date: reconciliationDate,
    expected_cash: expectedCash, physical_cash: null, variance: null,
    status: STATUS.OPEN, approved_by: null, fineract_je_transaction_id: null,
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  };
  const result = await api.treasury.createRow(TABLE, officeId, row);
  return { officeId, reconciliationId: result?.resourceId, expectedCash };
}

/**
 * Records the physical cash count, computes variance = physicalCash - expectedCash. A
 * (near-)zero variance auto-approves immediately (nothing to authorize); any other variance
 * moves to SUBMITTED and awaits approveReconciliation().
 */
export async function submitPhysicalCashCount(officeId, reconciliationId, physicalCash) {
  const recon = await getReconciliation(officeId, reconciliationId);
  if (recon.status !== STATUS.OPEN) throw new Error(`Cannot submit a count for reconciliation ${reconciliationId}: status is ${recon.status}, expected ${STATUS.OPEN}`);

  const variance = round2(Number(physicalCash) - Number(recon.expected_cash));
  const noVariance = Math.abs(variance) <= VARIANCE_TOLERANCE;
  const patch = {
    physical_cash: Number(physicalCash), variance,
    status: noVariance ? STATUS.APPROVED : STATUS.SUBMITTED,
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  };
  await api.treasury.updateRow(TABLE, officeId, reconciliationId, patch);
  return { officeId, reconciliationId, variance, status: patch.status, requiresApproval: !noVariance };
}

/**
 * Approves a SUBMITTED reconciliation with a non-zero variance: posts the shortage/overage
 * journal entry, then records a self-correcting teller event so the teller's own operational
 * balance reflects the physical reality that was just confirmed (reusing existing Phase 3 event
 * types rather than inventing new ones — a shortage removes cash from the teller's books the same
 * way a CASH_SETTLEMENT does; an overage adds cash the same way a CASH_RECEIPT does).
 *
 *   Shortage (physical < expected): Dr shortageGlAccount / Cr Cash At Tellers GL
 *   Overage  (physical > expected): Dr Cash At Tellers GL / Cr overageGlAccount
 */
export async function approveReconciliation(officeId, reconciliationId, approver, { transactionDate = today() } = {}) {
  const recon = await getReconciliation(officeId, reconciliationId);
  if (recon.status !== STATUS.SUBMITTED) {
    throw new Error(`Cannot approve reconciliation ${reconciliationId}: status is ${recon.status}, expected ${STATUS.SUBMITTED}`);
  }
  const variance = Number(recon.variance);
  if (Math.abs(variance) <= VARIANCE_TOLERANCE) {
    throw new Error(`Reconciliation ${reconciliationId} has no variance to approve (${variance}) — this should have auto-approved at submission`);
  }

  const t = await requireThresholds(officeId);
  const isShortage = variance < 0;
  const amount = Math.abs(variance);
  const adjustmentGlId = isShortage ? t.shortageGlAccountId : t.overageGlAccountId;
  if (!adjustmentGlId) {
    throw new Error(`approveReconciliation: no ${isShortage ? 'shortage' : 'overage'}GlAccountId configured for office ${officeId} — configure dt_treasury_thresholds before approving variances`);
  }

  const je = await api.journalEntries.create({
    officeId, transactionDate, currencyCode: t.currencyCode,
    debits: [{ glAccountId: isShortage ? adjustmentGlId : t.cashAtTellersGlAccountId, amount }],
    credits: [{ glAccountId: isShortage ? t.cashAtTellersGlAccountId : adjustmentGlId, amount, comments: `Reconciliation ${isShortage ? 'shortage' : 'overage'}: cashier ${recon.cashier_id}, ${recon.reconciliation_date}` }],
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  });

  try {
    await recordTellerEvent({
      officeId, tellerId: recon.teller_id, cashierId: recon.cashier_id,
      transactionType: isShortage ? 'CASH_SETTLEMENT' : 'CASH_RECEIPT',
      amount, currencyCode: t.currencyCode, transactionDate,
      fineractEntityType: 'JOURNALENTRY',
      fineractEntityId: recon.id,
      fineractTransactionId: String(je?.transactionId ?? ''),
      narration: `Reconciliation ${isShortage ? 'shortage' : 'overage'} adjustment`,
      createdBy: approver
    });
    await api.treasury.updateRow(TABLE, officeId, reconciliationId, {
      status: STATUS.APPROVED, approved_by: approver,
      fineract_je_transaction_id: String(je?.transactionId ?? ''),
      locale: 'en', dateFormat: 'yyyy-MM-dd'
    });
    return { officeId, reconciliationId, status: STATUS.APPROVED, fineractTransactionId: je?.transactionId, isShortage, amount };
  } catch (afterJeErr) {
    throw new TreasuryReconciliationGapError(
      `Reconciliation ${reconciliationId} ${isShortage ? 'shortage' : 'overage'} adjustment of ${amount} posted a journal entry in Fineract (transactionId=${je?.transactionId}) but recording it in FinCraft afterwards failed. Reconcile manually.`,
      { fineractTransactionId: je?.transactionId, cause: afterJeErr }
    );
  }
}

export { STATUS as RECONCILIATION_STATUS };
