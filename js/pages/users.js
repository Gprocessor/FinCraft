/* FinCraft · pages/users.js — barrel re-export.
   Implementation now lives in ./users/. Kept as a thin barrel so every
   existing `import ... from 'users.js'` elsewhere in the app still works. */
export * from './users/index.js';
