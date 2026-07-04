/* FinCraft · pages/organization/loaders/integrations.js — barrel re-export.
   Implementation now lives in ./integrations/. Kept as a thin barrel so every
   existing `import ... from 'integrations.js'` elsewhere in the app still works. */
export * from './integrations/index.js';
