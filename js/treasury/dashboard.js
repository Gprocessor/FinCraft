/* FinCraft · treasury/dashboard.js — Phase 9: Treasury Dashboard.
   Pure aggregation over what Phases 4-8 already built — no new persistence, no new Fineract
   writes, read-only throughout. The one genuinely new piece (RED/AMBER/GREEN liquidity status)
   lives in ./liquidity-status.js, kept separate and independently testable. */

import { api } from '../api.js';
import { requireThresholds } from './thresholds.js';
import { getVaultBalance, getReserveBuffer } from './vault-control.js';
import { getOfficeTellerBreakdown } from './teller-balance.js';
import { getBorrowingsDashboard } from './borrowings.js';
import { EXPENSE_STATUS } from './expenses.js';
import { deriveLiquidityStatus } from './liquidity-status.js';

const EXPENSE_REQUESTS_TABLE = 'dt_expense_requests';

/** Org-wide (Tier 1, cheap) balance for one GL account id, or `null` if the id itself isn't
 *  configured (e.g. interestPayableGlAccountId is optional in dt_treasury_thresholds) — a missing
 *  optional mapping should show as "not configured" on the dashboard, not crash it or show 0. */
async function orgBalanceOrNull(glAccountId) {
  if (!glAccountId) return null;
  const acct = await api.glAccounts.getBalance(glAccountId);
  return Number(acct?.organizationRunningBalance) || 0;
}

async function sumPendingExpenses(officeId) {
  const rows = await api.treasury.queryRows(EXPENSE_REQUESTS_TABLE, officeId);
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter(r => r.status === EXPENSE_STATUS.PENDING || r.status === EXPENSE_STATUS.APPROVED)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * One-call snapshot of everything the Treasury Dashboard screen (Phase 11) needs to render.
 * @param {number} officeId
 * @param {Array<{tellerId:number, cashierId:number}>} [tellerCashierList]  passed straight through
 *   to getOfficeTellerBreakdown (Phase 4) — Fineract has no "all cashiers for this office"
 *   endpoint, so the caller (whichever page already lists tellers/cashiers) must supply it; omit
 *   to get totals derived purely from event history (idle, never-used cashiers won't appear).
 */
export async function getTreasuryDashboard(officeId, tellerCashierList) {
  const t = await requireThresholds(officeId);

  const [bankBalance, vaultBalance, reserveBuffer, cashAtTellersGlBalance, tellerBreakdown,
    borrowings, interestPayableBalance, pendingExpensesTotal] = await Promise.all([
    orgBalanceOrNull(t.bankGlAccountId),
    getVaultBalance(officeId),               // precise (Tier 2) — this is the figure the buffer gates
    getReserveBuffer(officeId),
    orgBalanceOrNull(t.cashAtTellersGlAccountId),
    getOfficeTellerBreakdown(officeId, tellerCashierList),
    getBorrowingsDashboard(officeId),
    orgBalanceOrNull(t.interestPayableGlAccountId),
    sumPendingExpenses(officeId)
  ]);

  const availableVault = vaultBalance - reserveBuffer;
  const tellerOperationalTotal = tellerBreakdown.officeTotal;
  // The brief's central worked example: FinCraft's summed teller balances should reconcile to
  // Fineract's own pooled Cash At Tellers GL. `null` (not 0) if that GL isn't configured, so a
  // missing mapping reads as "unknown," not "perfectly reconciled by coincidence."
  const tellerGlDifference = cashAtTellersGlBalance === null ? null : round2(tellerOperationalTotal - cashAtTellersGlBalance);

  return {
    officeId,
    bankBalance,
    vaultBalance,
    reserveBuffer,
    availableVault: round2(availableVault),
    liquidityStatus: deriveLiquidityStatus(availableVault, reserveBuffer),
    cashAtTellersGlBalance,
    tellerOperationalTotal: round2(tellerOperationalTotal),
    tellerGlDifference,
    tellerBreakdown: tellerBreakdown.perCashier,
    borrowingsOutstanding: borrowings.totalOutstandingPrincipal,
    borrowingsActiveCount: borrowings.activeCount,
    interestPayableBalance,
    pendingExpensesTotal: round2(pendingExpensesTotal),
    currencyCode: t.currencyCode
  };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
