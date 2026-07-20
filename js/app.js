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

document.addEventListener('DOMContentLoaded', () => {
  initAuth().catch(err => {
    // If bootstrap itself throws (bad config, blocked/missing module, etc.)
    // both #loginScreen and #appShell stay empty <div>s — a silent blank
    // screen with the only trace in the console. Surface it instead.
    console.error('[fc-fatal]', err);
    const el = document.getElementById('loginScreen');
    if (el) {
      el.hidden = false;
      el.innerHTML = `
        <div style="max-width:32rem;margin:4rem auto;padding:1.5rem;
                    font-family:system-ui,sans-serif;text-align:center;
                    border:1px solid #e5b4b4;border-radius:8px;color:#7a1f1f;
                    background:#fff5f5;">
          <h2 style="margin:0 0 0.5rem;">FinCraft failed to start</h2>
          <p style="margin:0 0 0.25rem;">${(err && err.message) ? String(err.message).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) : 'Unknown error'}</p>
          <p style="margin:0.5rem 0 0;font-size:0.9em;opacity:0.8;">Open the browser console for details, then reload.</p>
        </div>`;
    }
  });
});
