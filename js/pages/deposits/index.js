/* FinCraft · pages/deposits/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/deposits.js for maintainability. */

import { renderDetail } from './detail.js';
import { renderList } from './list.js';

export async function render(c, params = {}) {
  // ?type=fd or ?type=rd in detail mode
  const apiGroup = params.type === 'rd' ? 'recurringDeposits' : 'fixedDeposits';
  if (params.view === 'detail' || params.id) return renderDetail(c, apiGroup, params.id, params.tab);
  return renderList(c);
}
