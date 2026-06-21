/* FinCraft · app.js — bootstrap */
import './ui.js';
import './modal-init.js';
import { initAuth } from './auth.js';

window.addEventListener('error', e => console.error('[fc-error]', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[fc-rejection]', e.reason));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => { initAuth(); });
