/* FinCraft · pages/datatables/index.js — render() entry point.
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { renderDetail } from './detail.js';
import { renderList } from './list.js';

export async function render(c, params = {}) {
  if (params.view === 'detail' && params.name) return renderDetail(c, params.name);
  return renderList(c);
}
