/* FinCraft · pages/clients.js — barrel re-export.
   Implementation now lives in ./clients/ (shared, list/detail/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/clients.js')` still works. */
export * from './clients/index.js';
