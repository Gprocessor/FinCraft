/* FinCraft · app.js — bootstrap */
import './ui.js';
import './modal-init.js';
import { initAuth } from './auth.js';
import { navigate } from './router.js';
import { store } from './store.js';

window.addEventListener('error', e => console.error('[fc-error]', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[fc-rejection]', e.reason));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// fc:reload — fired by submit handlers after a successful create/update.
// Re-navigate to the same page so lists refresh with the new record.
document.addEventListener('fc:reload', () => {
  const page = store.get('currentPage') || 'dashboard';
  navigate(page);
});

document.addEventListener('DOMContentLoaded', () => { initAuth(); });
