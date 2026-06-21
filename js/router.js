/* FinCraft · router.js */
import { parseHash, buildHash } from './utils.js';
import { store } from './store.js';
import { setActiveNav, setBreadcrumb } from './ui.js';

const PAGES = {
  dashboard:    { mod: () => import('./pages/dashboard.js'),    label: 'Dashboard',     icon: 'fa-gauge-high' },
  clients:      { mod: () => import('./pages/clients.js'),      label: 'Clients',       icon: 'fa-users' },
  'client-detail':{mod: () => import('./pages/clients.js'),     label: 'Client Detail', icon: 'fa-user',  view: 'detail' },
  loans:        { mod: () => import('./pages/loans.js'),        label: 'Loans',         icon: 'fa-hand-holding-dollar' },
  savings:      { mod: () => import('./pages/savings.js'),      label: 'Savings',       icon: 'fa-piggy-bank' },
  deposits:     { mod: () => import('./pages/deposits.js'),     label: 'Deposits',      icon: 'fa-vault' },
  shares:       { mod: () => import('./pages/shares.js'),       label: 'Shares',        icon: 'fa-chart-pie' },
  groups:       { mod: () => import('./pages/groups.js'),       label: 'Groups',        icon: 'fa-people-group' },
  centers:      { mod: () => import('./pages/centers.js'),      label: 'Centers',       icon: 'fa-building-columns' },
  collaterals:  { mod: () => import('./pages/misc.js'),         label: 'Collaterals',   icon: 'fa-shield-halved', view: 'collaterals' },
  collections:  { mod: () => import('./pages/collections.js'),  label: 'Collections',   icon: 'fa-file-invoice-dollar' },
  transfers:    { mod: () => import('./pages/transfers.js'),    label: 'Transfers',     icon: 'fa-right-left' },
  remittances:  { mod: () => import('./pages/misc.js'),         label: 'Remittances',   icon: 'fa-paper-plane', view: 'remittances' },
  accounting:   { mod: () => import('./pages/accounting.js'),   label: 'Accounting',    icon: 'fa-calculator' },
  tasks:        { mod: () => import('./pages/tasks.js'),        label: 'Checker Inbox', icon: 'fa-inbox' },
  reports:      { mod: () => import('./pages/reports.js'),      label: 'Reports',       icon: 'fa-file-chart-column' },
  products:     { mod: () => import('./pages/products.js'),     label: 'Products',      icon: 'fa-cubes' },
  organization: { mod: () => import('./pages/organization.js'), label: 'Organization',  icon: 'fa-sitemap' },
  system:       { mod: () => import('./pages/system.js'),       label: 'System',        icon: 'fa-gears' },
  users:        { mod: () => import('./pages/misc.js'),         label: 'Users & Roles', icon: 'fa-user-shield', view: 'users' },
  analytics:    { mod: () => import('./pages/analytics.js'),    label: 'Analytics',     icon: 'fa-chart-line' },
  search:       { mod: () => import('./pages/search.js'),       label: 'Search',        icon: 'fa-magnifying-glass' },
  notifications:{ mod: () => import('./pages/misc.js'),         label: 'Notifications', icon: 'fa-bell', view: 'notifications' },
  profile:      { mod: () => import('./pages/misc.js'),         label: 'Profile',       icon: 'fa-user', view: 'profile' },
  settings:     { mod: () => import('./pages/misc.js'),         label: 'Settings',      icon: 'fa-gear', view: 'settings' },
  surveys:      { mod: () => import('./pages/misc.js'),         label: 'Surveys',       icon: 'fa-clipboard-list', view: 'surveys' },
  templates:    { mod: () => import('./pages/misc.js'),         label: 'Templates',     icon: 'fa-file-lines', view: 'templates' },
  navigation:   { mod: () => import('./pages/misc.js'),         label: 'Navigation',    icon: 'fa-folder-tree', view: 'navigation' },
  'self-service':{mod: () => import('./pages/misc.js'),         label: 'Self Service',  icon: 'fa-mobile-screen', view: 'self-service' }
};
export const PAGE_REGISTRY = PAGES;

const moduleCache = {};
async function loadModule(name) {
  if (moduleCache[name]) return moduleCache[name];
  const def = PAGES[name];
  if (!def) throw new Error('Unknown page: ' + name);
  const mod = await def.mod();
  moduleCache[name] = mod;
  return mod;
}

export async function handleHash() {
  const { page, params } = parseHash();
  const def = PAGES[page] || PAGES.dashboard;
  const realName = PAGES[page] ? page : 'dashboard';
  store.set('currentPage', realName);
  store.set('currentParams', params);
  const content = document.getElementById('contentArea');
  if (!content) return;
  content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading ${def.label}…</div></div>`;
  try {
    const mod = await loadModule(realName);
    const view = def.view || realName;
    await mod.render(content, { ...params, view });
    setActiveNav(realName);
    setBreadcrumb(['Home', def.label]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load ${def.label}</b></div>
      <div class="text-muted mt-2">${e.message || e}</div>
    </div></div>`;
  }
}

export function navigate(page, params = {}) { location.hash = buildHash(page, params); }

export function initRouter() {
  window.addEventListener('hashchange', handleHash);
  if (!location.hash) location.hash = '#dashboard';
  else handleHash();
}
