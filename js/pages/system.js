/* FinCraft · pages/system.js — barrel re-export.
   Implementation now lives in ./system/ (shared, loaders/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/system.js')` still works. */
export * from './system/index.js';
