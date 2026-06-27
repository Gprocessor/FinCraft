/* FinCraft · router.js — hash routing + auth/permission guards */
import { parseHash, buildHash } from './utils.js';
import { store } from './store.js';
import { setActiveNav, setBreadcrumb } from './ui.js';

/**
 * `requiredPermission` is a single Fineract permission code OR an array (any-of).
 * `null` = authenticated user only. Use `'ALL_FUNCTIONS'` to bypass (admin-only).
 */
const PAGES = {
  dashboard:    { mod: () => import('./pages/dashboard.js'),    label: 'Dashboard',     icon: 'fa-gauge-high',     requiredPermission: null },
  clients:      { mod: () => import('./pages/clients.js'),      label: 'Clients',       icon: 'fa-users',          requiredPermission: 'READ_CLIENT' },
  'client-detail':{mod: () => import('./pages/clients.js'),     label: 'Client Detail', icon: 'fa-user',           view: 'detail', requiredPermission: 'READ_CLIENT' },
  loans:        { mod: () => import('./pages/loans.js'),        label: 'Loans',         icon: 'fa-hand-holding-dollar', requiredPermission: 'READ_LOAN' },
  savings:      { mod: () => import('./pages/savings.js'),      label: 'Savings',       icon: 'fa-piggy-bank',     requiredPermission: 'READ_SAVINGSACCOUNT' },
  deposits:     { mod: () => import('./pages/deposits.js'),     label: 'Deposits',      icon: 'fa-vault',          requiredPermission: ['READ_FIXEDDEPOSITACCOUNT','READ_RECURRINGDEPOSITACCOUNT'] },
  shares:       { mod: () => import('./pages/shares.js'),       label: 'Shares',        icon: 'fa-chart-pie',      requiredPermission: 'READ_SHAREACCOUNT' },
  groups:       { mod: () => import('./pages/groups.js'),       label: 'Groups',        icon: 'fa-people-group',   requiredPermission: 'READ_GROUP' },
  centers:      { mod: () => import('./pages/centers.js'),      label: 'Centers',       icon: 'fa-building-columns', requiredPermission: 'READ_CENTER' },
  collections:  { mod: () => import('./pages/collections.js'),  label: 'Collections',   icon: 'fa-file-invoice-dollar', requiredPermission: 'READ_COLLECTIONSHEET' },
  transfers:    { mod: () => import('./pages/transfers.js'),    label: 'Transfers',     icon: 'fa-right-left',     requiredPermission: 'READ_ACCOUNTTRANSFER' },
  remittances:  { mod: () => import('./pages/misc.js'),         label: 'Remittances',   icon: 'fa-paper-plane',    view: 'remittances', requiredPermission: 'READ_ACCOUNTTRANSFER' },
  accounting:   { mod: () => import('./pages/accounting.js'),   label: 'Accounting',    icon: 'fa-calculator',     requiredPermission: 'READ_JOURNALENTRY' },
  tasks:        { mod: () => import('./pages/tasks.js'),        label: 'Checker Inbox', icon: 'fa-inbox',          requiredPermission: 'CHECKER_SUPER_USER' },
  reports:      { mod: () => import('./pages/reports.js'),      label: 'Reports',       icon: 'fa-file-chart-column', requiredPermission: 'READ_REPORT' },
  products:     { mod: () => import('./pages/products.js'),     label: 'Products',      icon: 'fa-cubes',          requiredPermission: 'READ_LOANPRODUCT' },
  charges:      { mod: () => import('./pages/charges.js'),      label: 'Charges',       icon: 'fa-tags',           requiredPermission: 'READ_CHARGE' },
  organization: { mod: () => import('./pages/organization.js'), label: 'Organization',  icon: 'fa-sitemap',        requiredPermission: 'READ_OFFICE' },
  collaterals:  { mod: () => import('./pages/collateral.js'),   label: 'Collateral',    icon: 'fa-shield-halved',  requiredPermission: 'READ_COLLATERAL_PRODUCT' },
  system:       { mod: () => import('./pages/system.js'),       label: 'System',        icon: 'fa-gears',          requiredPermission: 'READ_CONFIGURATION' },
  users:        { mod: () => import('./pages/users.js'), label: 'Users & Roles', icon: 'fa-user-shield', requiredPermission: 'READ_USER' },
  analytics:    { mod: () => import('./pages/analytics.js'),    label: 'Analytics',     icon: 'fa-chart-line',     requiredPermission: 'READ_REPORT' },
  search:       { mod: () => import('./pages/search.js'),       label: 'Search',        icon: 'fa-magnifying-glass', requiredPermission: null },
  notifications: { mod: () => import('./pages/notifications.js'), label: 'Notifications', icon: 'fa-bell', requiredPermission: null },
  profile:      { mod: () => import('./pages/misc.js'),         label: 'Profile',       icon: 'fa-user',           view: 'profile', requiredPermission: null },
  settings:     { mod: () => import('./pages/misc.js'),         label: 'Settings',      icon: 'fa-gear',           view: 'settings', requiredPermission: null },
  datatables:   { mod: () => import('./pages/datatables.js'),   label: 'Data Tables',   icon: 'fa-table',          requiredPermission: 'READ_DATATABLE' },
  surveys:      { mod: () => import('./pages/misc.js'),         label: 'Surveys',       icon: 'fa-clipboard-list', view: 'surveys', requiredPermission: 'READ_SURVEY' },
  templates:    { mod: () => import('./pages/templates.js'), label: 'Templates', icon: 'fa-file-lines', requiredPermission: 'READ_TEMPLATE' },
  navigation:   { mod: () => import('./pages/misc.js'),         label: 'Navigation',    icon: 'fa-folder-tree',    view: 'navigation', requiredPermission: null },
  'self-service': { mod: () => import('./pages/self-service.js'), label: 'Self Service', icon: 'fa-mobile-screen', requiredPermission: null },
  forbidden:    { mod: null,                                    label: 'Access denied', icon: 'fa-ban',            requiredPermission: null },
  'not-found':  { mod: null,                                    label: 'Page not found', icon: 'fa-question',      requiredPermission: null }
};

export const PAGE_REGISTRY = PAGES;
const moduleCache = {};

async function loadModule(name) {
  if (moduleCache[name]) return moduleCache[name];
  const def = PAGES[name];
  if (!def?.mod) return null;
  const mod = await def.mod();
  moduleCache[name] = mod;
  return mod;
}

/** Strict permission check — denies when perms array is empty for non-public pages. */
function isAllowed(def) {
  if (!def) return false;
  const need = def.requiredPermission;
  if (need === null || need === undefined) return true;            // public-to-authenticated
  const codes = Array.isArray(need) ? need : [need];
  return codes.some(c => store.hasPermission(c));
}

function renderStaticPage(content, def, kind) {
  const icon = def.icon || 'fa-circle-info';
  const title = def.label || 'Notice';
  const message = kind === 'forbidden'
    ? "You don't have permission to view this page. Contact your administrator if you believe this is in error."
    : "The page you are looking for does not exist.";
  content.innerHTML = `
    <div class="card">
      <div class="empty-state">
        <i class="fa-solid ${icon}"></i>
        <h3 class="mt-3">${title}</h3>
        <div class="text-muted mt-2">${message}</div>
        <button class="btn-primary mt-4" data-nav="dashboard">
          <i class="fa-solid fa-house"></i> Back to Dashboard
        </button>
      </div>
    </div>`;
}

export async function handleHash() {
  const { page, params } = parseHash();
  const exists = !!PAGES[page];
  const def = exists ? PAGES[page] : PAGES['not-found'];
  const realName = exists ? page : 'not-found';

  const content = document.getElementById('contentArea');
  if (!content) return;

  // Unknown page → 404
  if (!exists) {
    store.set('currentPage', 'not-found');
    setActiveNav(null);
    setBreadcrumb(['Home', 'Not found']);
    renderStaticPage(content, def, 'not-found');
    return;
  }

  // Permission gate
  if (!isAllowed(def)) {
    store.set('currentPage', 'forbidden');
    setActiveNav(null);
    setBreadcrumb(['Home', 'Access denied']);
    renderStaticPage(content, def, 'forbidden');
    return;
  }

  store.set('currentPage', realName);
  store.set('currentParams', params);
  store.set('lastPage', realName);

  content.innerHTML = `<div class="empty-state">
    <i class="fa-solid fa-circle-notch fa-spin"></i>
    <div>Loading ${def.label}…</div>
  </div>`;

  try {
    const mod = await loadModule(realName);
    if (!mod?.render) throw new Error('Module has no render() export');
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
      <button class="btn-secondary mt-4" data-nav="dashboard">Back to Dashboard</button>
    </div></div>`;
  }
}

export function navigate(page, params = {}) { location.hash = buildHash(page, params); }

export function initRouter() {
  window.addEventListener('hashchange', handleHash);
  handleHash();
}