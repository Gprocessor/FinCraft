/* FinCraft · pages/savings/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/savings.js for maintainability. */

import { renderDetail } from './detail.js';
import { renderList } from './list.js';

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}
