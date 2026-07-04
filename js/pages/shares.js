/* FinCraft · pages/shares.js — barrel re-export.
   Implementation now lives in ./shares/. Kept as a thin barrel so every
   existing `import ... from 'shares.js'` elsewhere in the app still works. */
export * from './shares/index.js';
