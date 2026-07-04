/* FinCraft · pages/groups.js — barrel re-export.
   Implementation now lives in ./groups/ (shared, list/detail/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/groups.js')` still works. */
export * from './groups/index.js';
