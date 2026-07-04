/* FinCraft · pages/charges/index.js — render() entry point.
   Auto-split from the original monolithic pages/charges.js for maintainability. */

import { renderDetail } from './detail.js';
import { renderList } from './list.js';

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}
