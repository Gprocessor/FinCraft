/* FinCraft · ui.js — barrel re-export.
   Implementation now lives in ./ui/ (shell, core, dom-helpers, modal-dropdowns,
   global-events, handlers/*). Kept as a thin barrel so every existing
   `import ... from './ui.js'` elsewhere in the app still works unchanged. */
export * from './ui/index.js';
