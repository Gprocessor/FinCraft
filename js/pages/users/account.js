/* FinCraft · pages/users/account.js — barrel re-export.
   Implementation now lives in ./account/. Kept as a thin barrel so every
   existing `import ... from 'account.js'` elsewhere in the app still works. */
export * from './account/index.js';
