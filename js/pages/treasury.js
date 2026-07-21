/* FinCraft · pages/treasury.js — barrel re-export.
   Implementation lives in ./treasury/ (index.js dispatches to settings.js and future views).
   Kept as a thin barrel so router.js's `import('./pages/treasury.js')` works the same way every
   other page module does. */
export * from './treasury/index.js';
