/* FinCraft · pages/collateral.js — barrel re-export.
   Implementation now lives in ./collateral/. Kept as a thin barrel so every
   existing `import ... from 'collateral.js'` elsewhere in the app still works. */
export * from './collateral/index.js';
