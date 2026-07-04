/* FinCraft · pages/products/loaders.js — section data-loading functions for each admin tab.
   Auto-split from the original monolithic pages/products.js for maintainability. */

import { api } from '../../api.js';

export async function loadProductMixList() {
  // Mix is per loan product. List loan products and count their mix entries.
  const products = await api.loanProducts.list().catch(() => []);
  const list = Array.isArray(products) ? products : [];
  // For perf: don't pre-fetch every mix on list. Counts come from `productMixes` association if present
  return list.map(p => ({
    id: p.id,
    name: p.name,
    _mixCount: Array.isArray(p.productMixes) ? p.productMixes.length : 0
  }));
}
