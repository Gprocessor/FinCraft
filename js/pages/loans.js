/* FinCraft · pages/loans.js — barrel re-export.
   Implementation now lives in ./loans/ (shared, list/detail/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/loans.js')` still works. */
export * from './loans/index.js';
