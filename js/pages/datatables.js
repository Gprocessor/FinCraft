/* FinCraft · pages/datatables.js — barrel re-export.
   Implementation now lives in ./datatables/. Kept as a thin barrel so every
   existing `import ... from 'datatables.js'` elsewhere in the app still works. */
export * from './datatables/index.js';
