/* FinCraft · pages/products.js — barrel re-export.
   Implementation now lives in ./products/ (shared, loaders/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/products.js')` still works. */
export * from './products/index.js';
