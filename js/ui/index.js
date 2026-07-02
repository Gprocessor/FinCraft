/* FinCraft · ui/index.js — assembles and re-exports the full ui.js public surface. */
export { mountAppShell } from './shell.js';
export { setBreadcrumb, setActiveNav, toast, openModal, closeModal, closeAllModals,
         showEntityDetail, tab, dropdownToggle, sidebar, theme, confirm } from './core.js';

// Side-effect modules: wire up their document-level listeners on import,
// exactly like the original monolithic ui.js did top-to-bottom.
import './modal-dropdowns.js';
import './global-events.js';
