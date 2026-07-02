/* FinCraft · api.js — barrel re-export.
   Implementation now lives in ./api/ (core.js + one file per domain).
   Kept as a thin barrel so every existing `import ... from './api.js'` still works. */
export * from './api/index.js';
