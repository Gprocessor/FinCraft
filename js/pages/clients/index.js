/* FinCraft · pages/clients/index.js — render() entry point — orchestrates the pieces above.
   Auto-split from the original monolithic pages/clients.js for maintainability. */

import { renderDetail } from './detail.js';
import { renderList } from './list.js';

export async function render(c, params = {}) {
  if (params.view === 'detail') return renderDetail(c, params.id, params.tab);
  return renderList(c);
}
