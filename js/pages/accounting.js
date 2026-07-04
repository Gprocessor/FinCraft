/* FinCraft · pages/accounting.js — barrel re-export.
   Implementation now lives in ./accounting/ (shared, loaders/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/accounting.js')` still works. */
export * from './accounting/index.js';
