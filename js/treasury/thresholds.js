/* FinCraft · treasury/thresholds.js — per-office treasury configuration.
   Backs `dt_treasury_thresholds` (a ONE-TO-ONE datatable — one config row per office, see
   js/api/treasury.js#TREASURY_DATATABLES). Holds the GL account mappings (vault/bank/borrowings-
   liability/interest-payable/interest-expense) and the reserve buffer that Vault Control (Phase 5)
   and, later, the Treasury Dashboard (Phase 9) both read.

   This resolves Open Questions #3/#4 from FINCRAFT_Fineract_Treasury_Integration_Log.md as code:
   rather than hard-coding a GL account id or inventing an env-var system that doesn't exist in
   this browser-only app, the mapping is per-office data, editable (Phase 11: a "Treasury Settings"
   screen) and readable here. Until that screen exists, `upsertThresholds()` is how it gets seeded
   (e.g. from a one-off admin console call, or a future setup wizard). */

import { api } from '../api.js';

const DATATABLE = 'dt_treasury_thresholds';

/**
 * @typedef {object} TreasuryThresholds
 * @property {number} vaultGlAccountId
 * @property {number} cashAtTellersGlAccountId
 * @property {number} bankGlAccountId
 * @property {number} [borrowingsLiabilityGlAccountId]
 * @property {number} [interestPayableGlAccountId]
 * @property {number} [interestExpenseGlAccountId]
 * @property {number} reserveBufferAmount
 * @property {string} currencyCode
 */

function fromRow(row) {
  if (!row) return null;
  return {
    vaultGlAccountId: row.vault_gl_account_id,
    cashAtTellersGlAccountId: row.cash_at_tellers_gl_account_id,
    bankGlAccountId: row.bank_gl_account_id,
    borrowingsLiabilityGlAccountId: row.borrowings_liability_gl_account_id ?? null,
    interestPayableGlAccountId: row.interest_payable_gl_account_id ?? null,
    interestExpenseGlAccountId: row.interest_expense_gl_account_id ?? null,
    reserveBufferAmount: Number(row.reserve_buffer_amount) || 0,
    currencyCode: row.currency_code,
    shortageGlAccountId: row.shortage_gl_account_id ?? null,
    overageGlAccountId: row.overage_gl_account_id ?? null
  };
}

/** Returns this office's TreasuryThresholds, or `null` if the office has never been configured
 *  (callers must handle `null` explicitly — there is deliberately no silent zero-buffer default,
 *  since "not configured" and "configured with a zero buffer" are different, both legitimate,
 *  states that must not be conflated for a control that guards real cash). */
export async function getThresholds(officeId) {
  const result = await api.treasury.queryRows(DATATABLE, officeId).catch(err => {
    // Fineract returns 404 for "no row yet" on a one-to-one datatable with nothing seeded —
    // treat that the same as "not configured" rather than propagating an HTTP error.
    if (err?.status === 404 || err?.detail?.httpStatusCode === '404') return null;
    throw err;
  });
  // Fineract's one-to-one GET returns a single object; defensively also accept an array of one
  // (e.g. if a caller's stub/mock returns queryRows-style array shape).
  const row = Array.isArray(result) ? result[0] : result;
  return fromRow(row);
}

/** Creates or replaces this office's threshold config. Required fields mirror the datatable's
 *  `mandatory: true` columns (see js/api/treasury.js); everything else is optional. */
export async function upsertThresholds(officeId, thresholds) {
  const required = ['vaultGlAccountId', 'cashAtTellersGlAccountId', 'bankGlAccountId', 'reserveBufferAmount', 'currencyCode'];
  const missing = required.filter(f => thresholds[f] === undefined || thresholds[f] === null || thresholds[f] === '');
  if (missing.length) throw new Error(`upsertThresholds: missing required field(s): ${missing.join(', ')}`);

  const row = {
    vault_gl_account_id: thresholds.vaultGlAccountId,
    cash_at_tellers_gl_account_id: thresholds.cashAtTellersGlAccountId,
    bank_gl_account_id: thresholds.bankGlAccountId,
    borrowings_liability_gl_account_id: thresholds.borrowingsLiabilityGlAccountId ?? null,
    interest_payable_gl_account_id: thresholds.interestPayableGlAccountId ?? null,
    interest_expense_gl_account_id: thresholds.interestExpenseGlAccountId ?? null,
    reserve_buffer_amount: Number(thresholds.reserveBufferAmount),
    currency_code: thresholds.currencyCode,
    shortage_gl_account_id: thresholds.shortageGlAccountId ?? null,
    overage_gl_account_id: thresholds.overageGlAccountId ?? null,
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  };

  const existing = await getThresholds(officeId);
  if (existing) return api.treasury.updateConfig(DATATABLE, officeId, row);
  return api.treasury.createRow(DATATABLE, officeId, row);
}

/** Convenience guard used by every Phase 5+ consumer: fetch thresholds and throw a clear,
 *  actionable error (rather than a confusing downstream null-property crash) if the office
 *  hasn't been configured yet. */
export async function requireThresholds(officeId) {
  const t = await getThresholds(officeId);
  if (!t) throw new Error(`Office ${officeId} has no treasury configuration (dt_treasury_thresholds). Configure Vault/Cash-At-Tellers/Bank GL accounts and a reserve buffer before using Vault Control.`);
  return t;
}
