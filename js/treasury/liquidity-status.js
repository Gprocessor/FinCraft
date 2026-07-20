/* FinCraft · treasury/liquidity-status.js — Phase 9: RED/AMBER/GREEN status logic.
   Kept pure and separate from dashboard.js (zero imports, plain numbers in/out) for the same
   reason borrowing-schedule.js was kept separate from borrowings.js: this is genuinely new
   business logic (nothing in Phases 1-8 defines "how close to the buffer is too close"), so it
   deserves its own direct unit tests rather than being inlined into a larger aggregator.

   Thresholds (documented here since they're a judgment call, not a Fineract-given fact):
     RED   — availableVault (= vaultBalance - reserveBuffer) is at or below zero: the office has
             hit its reserve floor and cannot allocate any more cash without violating policy.
     AMBER — availableVault is positive but less than one full reserveBuffer's worth of headroom
             above the buffer (i.e. total vault is less than 2x the buffer) — getting close.
     GREEN — availableVault >= reserveBuffer: comfortable margin above the floor.
   Edge case: reserveBuffer === 0 has no AMBER band (nothing to be "close to") — GREEN whenever
   availableVault >= 0, RED only if somehow negative. */

export const LIQUIDITY_STATUS = Object.freeze({ RED: 'RED', AMBER: 'AMBER', GREEN: 'GREEN' });

/**
 * @param {number} availableVault  vaultBalance - reserveBuffer (see js/treasury/vault-control.js)
 * @param {number} reserveBuffer
 * @returns {'RED'|'AMBER'|'GREEN'}
 */
export function deriveLiquidityStatus(availableVault, reserveBuffer) {
  if (availableVault <= 0) return LIQUIDITY_STATUS.RED;
  if (reserveBuffer > 0 && availableVault < reserveBuffer) return LIQUIDITY_STATUS.AMBER;
  return LIQUIDITY_STATUS.GREEN;
}
