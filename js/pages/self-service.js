/* FinCraft · pages/self-service.js — barrel re-export.
   Implementation now lives in ./self-service/. Kept as a thin barrel so every
   existing `import ... from 'self-service.js'` elsewhere in the app still works. */
export * from './self-service/index.js';
