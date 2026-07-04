/* FinCraft · pages/accounting/loaders.js — barrel re-export.
   Implementation now lives in ./loaders/. Kept as a thin barrel so every
   existing `import ... from 'loaders.js'` elsewhere in the app still works. */
export * from './loaders/index.js';
