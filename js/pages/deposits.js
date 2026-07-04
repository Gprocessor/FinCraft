/* FinCraft · pages/deposits.js — barrel re-export.
   Implementation now lives in ./deposits/ (shared, list/detail/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/deposits.js')` still works. */
export * from './deposits/index.js';
