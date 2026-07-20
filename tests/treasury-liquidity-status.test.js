/* FinCraft · tests/treasury-liquidity-status.test.js — pure, no stubs needed. */
import assert from 'assert';
import { deriveLiquidityStatus, LIQUIDITY_STATUS } from '../js/treasury/liquidity-status.js';

export async function runTests({ assert: a = assert } = {}) {
  a.strictEqual(deriveLiquidityStatus(-100, 1000), LIQUIDITY_STATUS.RED, 'negative available vault must be RED');
  a.strictEqual(deriveLiquidityStatus(0, 1000), LIQUIDITY_STATUS.RED, 'exactly zero available vault must be RED (no headroom left)');
  a.strictEqual(deriveLiquidityStatus(500, 1000), LIQUIDITY_STATUS.AMBER, 'positive but less than one buffer of headroom must be AMBER');
  a.strictEqual(deriveLiquidityStatus(999, 1000), LIQUIDITY_STATUS.AMBER);
  a.strictEqual(deriveLiquidityStatus(1000, 1000), LIQUIDITY_STATUS.GREEN, 'exactly one buffer of headroom must be GREEN');
  a.strictEqual(deriveLiquidityStatus(5000, 1000), LIQUIDITY_STATUS.GREEN);

  // reserveBuffer === 0 edge case: no AMBER band possible.
  a.strictEqual(deriveLiquidityStatus(0, 0), LIQUIDITY_STATUS.RED);
  a.strictEqual(deriveLiquidityStatus(1, 0), LIQUIDITY_STATUS.GREEN, 'with a zero buffer, any positive available vault is GREEN, never AMBER');
  a.strictEqual(deriveLiquidityStatus(-1, 0), LIQUIDITY_STATUS.RED);
}
