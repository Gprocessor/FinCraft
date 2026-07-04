/* FinCraft · pages/tasks.js — barrel re-export.
   Implementation now lives in ./tasks/. Kept as a thin barrel so every
   existing `import ... from 'tasks.js'` elsewhere in the app still works. */
export * from './tasks/index.js';
