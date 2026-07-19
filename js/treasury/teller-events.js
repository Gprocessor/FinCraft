/* FinCraft · treasury/teller-events.js — Phase 3: Teller Operational Events.
   Business-logic layer above `api.treasury` (js/api/treasury.js), persisting to the
   `dt_teller_operational_events` datatable. This is NOT a Fineract REST wrapper (that's `js/api/`)
   and NOT a route-bound page (that's `js/pages/`) — it's the cross-cutting treasury business
   logic the brief's Phase 3-10 services need, so it lives in a new sibling top-level folder,
   `js/treasury/`, alongside the existing `js/api/`, `js/pages/`, `js/ui/` — matching the "extend,
   don't invent a new architecture" instruction as closely as this new concern allows.

   Every FinCraft-owned event lives only as a datatable row — there is no other persistence layer
   (see FINCRAFT_Fineract_Treasury_Integration_Log.md §2-3). Each row is scoped to `officeId`
   (the datatable entity id) and carries `tellerId`/`cashierId` as plain columns for filtering. */

import { api } from '../api.js';

export const DATATABLE = 'dt_teller_operational_events';

export const CASH_IN_TYPES  = Object.freeze(['CASH_ALLOCATION', 'SAVINGS_DEPOSIT', 'LOAN_REPAYMENT', 'CASH_RECEIPT', 'REVERSAL_CASH_IN']);
export const CASH_OUT_TYPES = Object.freeze(['SAVINGS_WITHDRAWAL', 'LOAN_DISBURSEMENT', 'EXPENSE_PAYMENT', 'CASH_SETTLEMENT', 'REVERSAL_CASH_OUT']);

function directionFor(transactionType) {
  if (CASH_IN_TYPES.includes(transactionType)) return 'CASH_IN';
  if (CASH_OUT_TYPES.includes(transactionType)) return 'CASH_OUT';
  throw new Error(`Unknown teller transaction type "${transactionType}" — must be one of: ${[...CASH_IN_TYPES, ...CASH_OUT_TYPES].join(', ')}`);
}

function assertRequired(payload, fields) {
  const missing = fields.filter(f => payload[f] === undefined || payload[f] === null || payload[f] === '');
  if (missing.length) throw new Error(`recordTellerEvent: missing required field(s): ${missing.join(', ')}`);
}

/**
 * Records one teller cash-movement event. `direction` is derived from `transactionType`
 * automatically (see CASH_IN_TYPES/CASH_OUT_TYPES above) unless explicitly overridden — callers
 * should not normally pass `direction`.
 *
 * @param {object} payload
 * @param {number} payload.officeId
 * @param {number} payload.tellerId
 * @param {number} payload.cashierId
 * @param {number} [payload.staffId]
 * @param {string} payload.transactionType  one of CASH_IN_TYPES/CASH_OUT_TYPES
 * @param {number} payload.amount           must be > 0 (direction, not sign, encodes in/out)
 * @param {string} payload.currencyCode
 * @param {string} payload.transactionDate  'YYYY-MM-DD' or Fineract-locale date string
 * @param {string} [payload.fineractEntityType]   e.g. 'LOAN', 'SAVINGS'
 * @param {number} [payload.fineractEntityId]
 * @param {string} [payload.fineractTransactionId]
 * @param {string} [payload.narration]
 * @param {string} [payload.createdBy]
 * @returns {Promise<{officeId:number, eventId:number|string, direction:string}>}
 */
export async function recordTellerEvent(payload) {
  assertRequired(payload, ['officeId', 'tellerId', 'cashierId', 'transactionType', 'amount', 'currencyCode', 'transactionDate']);
  const amount = Number(payload.amount);
  if (!(amount > 0)) throw new Error('recordTellerEvent: amount must be a positive number (direction is encoded by transactionType, not sign)');

  const direction = payload.direction || directionFor(payload.transactionType);

  const row = {
    teller_id: payload.tellerId,
    cashier_id: payload.cashierId,
    staff_id: payload.staffId ?? null,
    transaction_type: payload.transactionType,
    direction,
    amount,
    currency_code: payload.currencyCode,
    transaction_date: payload.transactionDate,
    fineract_entity_type: payload.fineractEntityType ?? null,
    fineract_entity_id: payload.fineractEntityId ?? null,
    fineract_transaction_id: payload.fineractTransactionId ?? null,
    narration: payload.narration ?? null,
    status: 'POSTED',
    created_by: payload.createdBy ?? null,
    reversed: false,
    reversal_reference: null,
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  };

  const result = await api.treasury.createRow(DATATABLE, payload.officeId, row);
  return { officeId: payload.officeId, eventId: result?.resourceId ?? result?.subResourceId ?? result?.id, direction };
}

/**
 * Reverses a previously-recorded event: marks the original row `reversed=true`, and records a
 * brand-new event in the *opposite* direction (transaction type REVERSAL_CASH_IN/REVERSAL_CASH_OUT)
 * for the same amount, so the running total self-corrects without ever mutating/deleting history.
 *
 * @param {number} officeId
 * @param {number|string} eventId  the original event's datatable row id
 * @param {string} reason
 * @param {string} [reversedBy]
 */
export async function reverseTellerEvent(officeId, eventId, reason, reversedBy) {
  const original = await api.treasury.getRow(DATATABLE, officeId, eventId);
  if (!original) throw new Error(`reverseTellerEvent: event ${eventId} not found for office ${officeId}`);
  if (original.reversed) throw new Error(`reverseTellerEvent: event ${eventId} was already reversed`);

  const reversalType = original.direction === 'CASH_IN' ? 'REVERSAL_CASH_OUT' : 'REVERSAL_CASH_IN';
  const reversal = await recordTellerEvent({
    officeId,
    tellerId: original.teller_id,
    cashierId: original.cashier_id,
    staffId: original.staff_id,
    transactionType: reversalType,
    amount: original.amount,
    currencyCode: original.currency_code,
    transactionDate: new Date().toISOString().slice(0, 10),
    fineractEntityType: original.fineract_entity_type,
    fineractEntityId: original.fineract_entity_id,
    fineractTransactionId: original.fineract_transaction_id,
    narration: `Reversal of event ${eventId}: ${reason || ''}`.trim(),
    createdBy: reversedBy
  });

  await api.treasury.updateRow(DATATABLE, officeId, eventId, {
    reversed: true,
    reversal_reference: String(reversal.eventId),
    locale: 'en', dateFormat: 'yyyy-MM-dd'
  });

  return { originalEventId: eventId, reversalEventId: reversal.eventId };
}

/** In-range filter shared by the getX Events helpers below. `dateRange` is optional:
 *  { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' } — omit for all history. */
function inRange(row, dateRange) {
  if (!dateRange) return true;
  const d = row.transaction_date;
  if (dateRange.from && d < dateRange.from) return false;
  if (dateRange.to && d > dateRange.to) return false;
  return true;
}

/** All events for one cashier at one office (client-side filtered — Fineract's datatable query
 *  is entity(office)-scoped only, it has no column-level filtering, see js/api/reports.js). */
export async function getCashierEvents(officeId, cashierId, dateRange) {
  const rows = await api.treasury.queryRows(DATATABLE, officeId);
  return (Array.isArray(rows) ? rows : []).filter(r => r.cashier_id === cashierId && inRange(r, dateRange));
}

/** All events for one teller (all of its cashiers) at one office. */
export async function getTellerEvents(officeId, tellerId, dateRange) {
  const rows = await api.treasury.queryRows(DATATABLE, officeId);
  return (Array.isArray(rows) ? rows : []).filter(r => r.teller_id === tellerId && inRange(r, dateRange));
}

/** All events for every teller/cashier at one office — the raw feed the dashboard/reconciliation
 *  screens aggregate over. */
export async function getOfficeTellerEvents(officeId, dateRange) {
  const rows = await api.treasury.queryRows(DATATABLE, officeId);
  return (Array.isArray(rows) ? rows : []).filter(r => inRange(r, dateRange));
}
