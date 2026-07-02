/* FinCraft · ui/global-events.js — document-level click + keydown delegation, wired to handleAction.
   Auto-split from the original monolithic ui.js for maintainability. */

import { navigate } from '../router.js';
import { theme, sidebar, dropdownToggle, closeAllDropdowns, tab, openModal, closeModal,
         closeAllModals, toast } from './core.js';
import { handleAction } from './handlers/index.js';

// ════════════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-nav],[data-modal],[data-close-modal],[data-action],[data-tab]');
  if (!t) {
    if (!e.target.closest('.dropdown')) closeAllDropdowns();
    return;
  }

  // Tabs
  if (t.matches('[data-tab]')) { tab(t, t.dataset.tab); return; }

  // Navigation
  if (t.dataset.nav) {
    // Support "page?id=N" shorthand
    const [page, query] = t.dataset.nav.split('?');
    const params = {};
    if (query) {
      query.split('&').forEach(kv => {
        const [k, v] = kv.split('=');
        if (k) params[k] = decodeURIComponent(v || '');
      });
    }
    navigate(page, params);
    closeAllDropdowns();
    sidebar.close();
    return;
  }

  // Open modal
  if (t.dataset.modal) {
    const modalId = t.dataset.modal;
    const modalEl = openModal(modalId);
    if (modalEl) {
      // Forward any extra data-* context (e.g. data-loan-id) onto the modal
      Object.entries(t.dataset).forEach(([k, v]) => { if (k !== 'modal') modalEl.dataset[k] = v; });
      if (modalId === 'runReportModal') {
        const nameEl = modalEl.querySelector('#run-report-name');
        if (nameEl) nameEl.textContent = t.dataset.report || '—';
        const out = modalEl.querySelector('#rep-output');
        if (out) out.innerHTML = '';
      }
      if (modalId === 'repaymentModal' && modalEl.dataset.loanId) {
        const loanIdInput = modalEl.querySelector('#rp-loanid');
        if (loanIdInput) loanIdInput.value = modalEl.dataset.loanId;
      }
    }
    return;
  }

  // Close modal
  if (t.hasAttribute('data-close-modal')) {
    const m = t.closest('.modal-overlay');
    if (m) m.classList.remove('open');
    return;
  }

  // Named actions
  const action = t.dataset.action;
  if (!action) return;
  switch (action) {
    case 'toggle-theme':     theme.toggle();              break;
    case 'toggle-sidebar':   sidebar.toggle();            break;
    case 'toggle-user-menu': dropdownToggle('userMenu');  break;
    case 'open-cmd':         import('./cmd.js').then(m => m.openCmd()); break;
    case 'logout':           import('./auth.js').then(m => m.logout()); break;
    case 'dismiss-toast':    t.closest('.toast')?.remove(); break;
    default:
      // All submit-* and other form actions handled by handleAction
      handleAction(action, t);
  }
});

// Click outside any open modal-overlay closes it
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('modal-overlay')) e.target.classList.remove('open');
});


// ════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  // Ctrl+K — command palette
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    import('./cmd.js').then(m => m.openCmd());
    return;
  }
  // ESC — close everything
  if (e.key === 'Escape') {
    closeAllModals();
    closeAllDropdowns();
    import('./cmd.js').then(m => m.closeCmd?.());
    return;
  }
  // Ctrl+Shift+N — New Client
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openModal('newClientModal');
    return;
  }
  // Ctrl+Shift+L — New Loan
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    openModal('newLoanModal');
    return;
  }
  // ? — shortcut help
  if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    toast('info', 'Shortcuts', 'Ctrl+K palette · Ctrl+Shift+N new client · Ctrl+Shift+L new loan · ESC close');
  }
});

