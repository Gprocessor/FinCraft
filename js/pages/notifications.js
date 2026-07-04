/* FinCraft · pages/notifications.js — barrel re-export.
   Implementation now lives in ./notifications/. Kept as a thin barrel so every
   existing `import ... from 'notifications.js'` elsewhere in the app still works. */
export * from './notifications/index.js';
