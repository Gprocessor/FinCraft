/* FinCraft · pages/organization.js — barrel re-export.
   Implementation now lives in ./organization/ (shared, loaders/actions, index).
   Kept as a thin barrel so router.js's `import('./pages/organization.js')` still works. */
export * from './organization/index.js';
