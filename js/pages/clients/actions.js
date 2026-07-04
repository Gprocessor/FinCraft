/* FinCraft · pages/clients/actions.js — barrel re-export.
   Implementation now lives in ./actions/. Kept as a thin barrel so every
   existing `import ... from 'actions.js'` elsewhere in the app still works. */
export * from './actions/index.js';
