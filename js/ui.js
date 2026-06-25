/* FinCraft · ui.js — App shell, modals, toasts, tabs, shortcuts, form handlers
   All submit-* actions call the real Fineract API via api.js. No mock data. */
import { store } from './store.js';
import { navigate, PAGE_REGISTRY } from './router.js';
import { escapeHtml } from './utils.js';
import { api } from './api.js';
import { LOCALE, DATE_FORMAT, today } from './config.js';

const NAV_GROUPS = [
  { title: 'Overview', items: ['dashboard','analytics','tasks','navigation','search'] },
  { title: 'Clients & Accounts',
    items: ['clients','groups','centers','loans','savings','deposits','shares','collections','transfers'] },
  { title: 'Finance', items: ['accounting','reports','surveys'] },
  { title: 'Admin',
    items: ['products','organization','system','users','templates','self-service','notifications','profile','settings'] }
];

export function mountAppShell() {
  const shell = document.getElementById('appShell');
  if (!shell || shell.dataset.mounted) { shell?.removeAttribute('hidden'); return; }
  shell.dataset.mounted = '1';
  shell.classList.add('app-shell'); // grid layout defined on .app-shell in CSS

  fetch('./views/modals.html').then(r => r.ok ? r.text() : '').then(html => {
    const root = document.getElementById('modalRoot');
    if (root && !root.dataset.loaded) {
      root.innerHTML = html; root.dataset.loaded = '1';
      document.dispatchEvent(new CustomEvent('fc:modals-loaded'));
    }
  }).catch(() => {});

  shell.removeAttribute('hidden');
  shell.classList.toggle('collapsed', store.get('sidebar') === 'collapsed');
  const auth = store.get('auth');
  const isAdminUser = Boolean(
    auth?.user?.roles?.some(r => /admin/i.test(String(r.name || ''))) ||
    auth?.user?.permissions?.some(p => /admin|all/i.test(String(p)))
  );
  const navHtml = NAV_GROUPS.map(g => {
    const items = g.items.filter(i => PAGE_REGISTRY[i] &&
      (!['system','users','products','organization'].includes(i) || isAdminUser));
    if (!items.length) return '';
    return `
        <div class="nav-group">
          <div class="nav-group-title">${g.title}</div>
          ${items.map(i => `
            <div class="nav-item" data-nav="${i}">
              <i class="fa-solid ${PAGE_REGISTRY[i].icon}"></i>
              <span>${PAGE_REGISTRY[i].label}</span>
            </div>`).join('')}
        </div>`;
  }).join('');

  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark">F</div>
        <div><div class="brand-title">FinCraft</div><div class="brand-sub">Fineract Platform</div></div>
      </div>
      ${navHtml}
    </aside>

    <header class="topbar">
      <button class="icon-btn" data-action="toggle-sidebar" title="Toggle sidebar">
        <i class="fa-solid fa-bars"></i>
      </button>
      <div class="crumb" id="breadcrumb"><b>Home</b></div>
      <div class="top-spacer"></div>
      <div class="top-search" data-action="open-cmd">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input placeholder="Search clients, loans, groups…" readonly />
        <kbd>Ctrl K</kbd>
      </div>
      <button class="icon-btn" data-action="toggle-theme" title="Toggle theme">
        <i class="fa-solid fa-circle-half-stroke"></i>
      </button>
      <button class="icon-btn has-dot" data-nav="notifications" title="Notifications">
        <i class="fa-solid fa-bell"></i>
      </button>
      <div class="dropdown" id="userMenu">
        <button class="icon-btn" data-action="toggle-user-menu" title="Account">
          <i class="fa-solid fa-user"></i>
        </button>
        <div class="dropdown-menu">
          <div class="dropdown-item" data-nav="profile"><i class="fa-solid fa-id-badge"></i> Profile</div>
          <div class="dropdown-item" data-nav="settings"><i class="fa-solid fa-gear"></i> Settings</div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" data-action="logout"><i class="fa-solid fa-right-from-bracket"></i> Sign out</div>
        </div>
      </div>
    </header>

    <main class="content-area" id="contentArea"></main>
    <div class="nav-scrim" id="navScrim"></div>
  `;

  document.getElementById('navScrim')?.addEventListener('click', () => sidebar.close());
  document.documentElement.setAttribute('data-theme', store.get('theme'));
}

export function setBreadcrumb(parts) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  el.innerHTML = parts.map((p, i) =>
    i === parts.length - 1 ? `<b>${escapeHtml(p)}</b>` :
    `${escapeHtml(p)} <i class="fa-solid fa-angle-right" style="opacity:.4;margin:0 6px"></i>`
  ).join('');
}
export function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
}

export function toast(type, title, msg, durationMs = 4500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  const icon = { success:'fa-circle-check', warn:'fa-triangle-exclamation', error:'fa-circle-xmark', info:'fa-circle-info' }[type] || 'fa-circle-info';
  t.className = 'toast t-' + type;
  t.innerHTML = `
    <i class="fa-solid ${icon}" style="color:var(--brand-teal);font-size:18px"></i>
    <div style="flex:1">
      <div class="ttl">${escapeHtml(title)}</div>
      ${msg ? `<div class="msg">${escapeHtml(msg)}</div>` : ''}
    </div>
    <button class="icon-btn" style="width:28px;height:28px" data-action="dismiss-toast"><i class="fa-solid fa-xmark"></i></button>
  `;
  c.appendChild(t);
  t.querySelector('[data-action="dismiss-toast"]').addEventListener('click', () => t.remove());
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = 'all .2s';
    setTimeout(() => t.remove(), 200);
  }, durationMs);
}

export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) { console.warn('[modal not found]', id); return null; }
  m.classList.add('open');
  setTimeout(() => m.querySelector('input,select,textarea,button')?.focus(), 50);
  return m;
}
export function closeModal(id) {
  const m = (typeof id === 'string') ? document.getElementById(id) : id;
  m?.classList.remove('open');
}
export function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

// Generic entity "view" panel reused by Centers, Groups, etc — replaces one-off toast stubs.
// fetchFn() must return the entity data. renderBody(data) returns inner HTML.
// onMount(bodyEl, data, refresh) wires any action buttons inside renderBody's markup;
// call refresh() after a mutating action to re-fetch and re-render the same modal in place.
export async function showEntityDetail({ title, fetchFn, renderBody, onMount }) {
  const titleEl = document.getElementById('edm-title');
  const bodyEl  = document.getElementById('edm-body');
  const footEl  = document.getElementById('edm-foot');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  footEl.innerHTML = '<button class="btn-ghost" data-close-modal>Close</button>';
  openModal('entityDetailModal');
  const refresh = () => showEntityDetail({ title, fetchFn, renderBody, onMount });
  try {
    const data = await fetchFn();
    bodyEl.innerHTML = renderBody(data);
    if (onMount) onMount(bodyEl, data, refresh);
  } catch (e) {
    bodyEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || String(e))}</div></div>`;
  }
}

export function tab(btn, panelId) {
  const tabs = btn.closest('.tabs');
  const root = btn.closest('.card, .modal, .page, body');
  tabs?.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
  root?.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
}
export function dropdownToggle(id) {
  const d = document.getElementById(id);
  if (!d) return;
  const wasOpen = d.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) d.classList.add('open');
}

export const sidebar = {
  toggle() {
    const shell = document.getElementById('appShell');
    if (!shell) return;
    if (window.innerWidth <= 720) {
      shell.classList.toggle('nav-open');
    } else {
      const next = store.get('sidebar') === 'collapsed' ? 'expanded' : 'collapsed';
      store.set('sidebar', next);
      shell.classList.toggle('collapsed', next === 'collapsed');
    }
  },
  close() { document.getElementById('appShell')?.classList.remove('nav-open'); }
};
export const theme = {
  toggle() {
    const next = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.set('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }
};

export function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const id = 'cfm_' + Date.now();
    document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
      <div id="${id}" class="modal-overlay open">
        <div class="modal">
          <div class="modal-head"><h3 class="modal-title">${escapeHtml(title)}</h3>
            <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body"><p class="text-muted">${escapeHtml(message)}</p></div>
          <div class="modal-foot">
            <button class="btn-ghost" data-close-modal>Cancel</button>
            <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`);
    const el = document.getElementById(id);
    el.querySelector('[data-confirm]').addEventListener('click', () => { el.remove(); resolve(true); });
    el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { el.remove(); resolve(false); }));
  });
}

// ---- Helpers ----
function formData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((v, k) => { obj[k] = v; });
  return obj;
}
function renderReportParameterField(field) {
  const name = field.parameterName || field.columnName || field.name || field.code || '';
  const label = field.displayName || field.parameterLabel || field.title || field.columnName || name;
  const value = field.defaultValue ?? field.value ?? '';
  const required = field.mandatory || field.required ? 'required' : '';
  const help = field.description ? `<div class="text-muted" style="font-size:12px;margin-top:4px">${escapeHtml(field.description)}</div>` : '';
  const options = field.parameterOptions || field.options || field.lookups || field.values || field.selectOptions;
  if (Array.isArray(options) && options.length) {
    return `<label class="full"><span class="form-label">${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" class="form-control" ${required}>
        <option value="">— Select —</option>
        ${options.map(opt => {
          const val = opt.id ?? opt.value ?? opt.code ?? opt.name ?? opt;
          const text = opt.name ?? opt.description ?? opt.value ?? opt.code ?? String(opt);
          const selected = String(val) === String(value) ? 'selected' : '';
          return `<option value="${escapeHtml(String(val))}" ${selected}>${escapeHtml(String(text))}</option>`;
        }).join('')}
      </select>${help}</label>`;
  }
  const type = String(field.dataType || field.parameterType || 'string').toLowerCase();
  if (type.includes('date')) {
    return `<label class="full"><span class="form-label">${escapeHtml(label)}</span>
      <input type="date" name="${escapeHtml(name)}" class="form-control" value="${escapeHtml(String(value||''))}" ${required}/>${help}</label>`;
  }
  if (type.includes('boolean')) {
    return `<label class="full"><span class="form-label">${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" class="form-control" ${required}>
        <option value="">— Select —</option>
        <option value="true" ${String(value) === 'true' ? 'selected' : ''}>Yes</option>
        <option value="false" ${String(value) === 'false' ? 'selected' : ''}>No</option>
      </select>${help}</label>`;
  }
  if (type.includes('int') || type.includes('number')) {
    return `<label class="full"><span class="form-label">${escapeHtml(label)}</span>
      <input type="number" name="${escapeHtml(name)}" class="form-control" value="${escapeHtml(String(value||''))}" ${required}/>${help}</label>`;
  }
  return `<label class="full"><span class="form-label">${escapeHtml(label)}</span>
      <input type="text" name="${escapeHtml(name)}" class="form-control" value="${escapeHtml(String(value||''))}" ${required}/>${help}</label>`;
}
async function renderReportParameters(reportName) {
  const container = document.getElementById('run-report-params');
  if (!container) return;
  container.innerHTML = '<div class="text-muted" style="grid-column:1/-1"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading report parameters…</div>';
  try {
    const res = await api.runReports.parameters(reportName);
    const params = Array.isArray(res) ? res : res?.reportParameters || res?.parameterData || res?.parameters || [];
    if (!params.length) {
      container.innerHTML = '<div class="text-muted" style="grid-column:1/-1">No dynamic report parameters.</div>';
      return;
    }
    container.innerHTML = params.map(renderReportParameterField).join('');
  } catch (e) {
    container.innerHTML = `<div class="text-danger" style="grid-column:1/-1">Failed to load parameters: ${escapeHtml(e.message || String(e))}</div>`;
  }
}
function setSubmitting(btn, loading = true) {
  if (!btn) return;
  btn._origHtml = btn._origHtml || btn.innerHTML;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing…'
    : btn._origHtml;
}
// today(), LOCALE, DATE_FORMAT imported from config.js

// ---- Modal population helpers (called on fc:modals-loaded) ----
async function populateModalDropdowns() {
  const [offices, staff, loanProds, savProds, fdProds, rdProds, clientTpl,
         currencies, glAccounts, financialActivityAccounts] = await Promise.allSettled([
    api.offices.list(),
    api.staff.list({ isLoanOfficer: true }),
    api.loanProducts.list(),
    api.savingsProducts.list(),
    api.fdProducts.list(),
    api.rdProducts.list(),
    api.clients.template(),
    api.currencies.list(),
    api.glAccounts.list(),
    api.financialActivityAccounts.list()
  ]);

  const officeList   = offices.status   === 'fulfilled' ? (Array.isArray(offices.value)   ? offices.value   : []) : [];
  const staffList    = staff.status     === 'fulfilled' ? (Array.isArray(staff.value)     ? staff.value     : (staff.value?.pageItems || [])) : [];
  const loanProdList = loanProds.status === 'fulfilled' ? (Array.isArray(loanProds.value) ? loanProds.value : []) : [];
  const savProdList  = savProds.status  === 'fulfilled' ? (Array.isArray(savProds.value)  ? savProds.value  : []) : [];
  const fdProdList   = fdProds.status   === 'fulfilled' ? (Array.isArray(fdProds.value)   ? fdProds.value   : []) : [];
  const rdProdList   = rdProds.status   === 'fulfilled' ? (Array.isArray(rdProds.value)   ? rdProds.value   : []) : [];
  const currList     = currencies.status === 'fulfilled' ? (currencies.value?.selectedCurrencyOptions || currencies.value?.currencyOptions || []) : [];
  const glList       = glAccounts.status === 'fulfilled' ? (Array.isArray(glAccounts.value) ? glAccounts.value : []) : [];
  const faList       = financialActivityAccounts.status === 'fulfilled' ? (Array.isArray(financialActivityAccounts.value) ? financialActivityAccounts.value : []) : [];

  // Offices (accounts/form dropdowns)
  document.querySelectorAll('[data-populate="offices"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select office…</option>' +
      officeList.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  });
  // Office parent selector (all offices, for creating child offices)
  const parentSel = document.getElementById('office-parent-sel');
  if (parentSel) parentSel.innerHTML = '<option value="">— Root office —</option>' +
    officeList.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  // Holiday offices (multi-select)
  const holidayOffices = document.getElementById('holiday-offices-sel');
  if (holidayOffices) holidayOffices.innerHTML =
    officeList.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  document.querySelectorAll('[data-populate="staff"]').forEach(sel => {
    sel.innerHTML = '<option value="">Unassigned</option>' +
      staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="loanProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      loanProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="savingsProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      savProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="fdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      fdProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="rdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      rdProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });

  const genderOpts = clientTpl.status === 'fulfilled' ? (clientTpl.value?.genderOptions || []) : [];
  document.querySelectorAll('[data-populate="gender"]').forEach(sel => {
    sel.innerHTML = '<option value="">— Not specified —</option>' +
      genderOpts.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  });

  // Currencies (loan product + savings product modals)
  const currOpts = currList.length
    ? currList.map(c => `<option value="${c.code}">${escapeHtml(c.code + ' — ' + c.name)}</option>`).join('')
    : '<option value="">No currencies configured</option>';
  ['lp-currency','sp-currency'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select currency…</option>' + currOpts;
  });

  // GL Accounts (accounting rule modal)
  const glOpts = glList.length
    ? glList.map(g => `<option value="${g.id}">${escapeHtml((g.glCode ? g.glCode + ' — ' : '') + g.name)}</option>`).join('')
    : '<option value="">No GL accounts found</option>';
  ['acc-rule-debit','acc-rule-credit','fa-glaccount-sel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select account…</option>' + glOpts;
  });

  // Financial activities
  const faEl = document.getElementById('fa-activity-sel');
  if (faEl) faEl.innerHTML = '<option value="">Select activity…</option>' +
    faList.map(a => `<option value="${a.financialActivityData?.id || a.id}">${escapeHtml(a.financialActivityData?.name || a.name || '—')}</option>`).join('');
}
document.addEventListener('fc:modals-loaded', populateModalDropdowns);

  // Populate all [data-populate="offices"] selects
  document.querySelectorAll('[data-populate="offices"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select office…</option>' +
      officeList.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="staff"]').forEach(sel => {
    sel.innerHTML = '<option value="">Unassigned</option>' +
      staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="loanProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      loanProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="savingsProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      savProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="fdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      fdProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="rdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      rdProdList.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });

  const genderOpts = clientTpl.status === 'fulfilled' ? (clientTpl.value?.genderOptions || []) : [];
  document.querySelectorAll('[data-populate="gender"]').forEach(sel => {
    sel.innerHTML = '<option value="">— Not specified —</option>' +
      genderOpts.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  });
}
document.addEventListener('fc:modals-loaded', populateModalDropdowns);

// ---- Global click handler ----
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-nav],[data-modal],[data-close-modal],[data-action],[data-tab]');
  if (!t) {
    if (!e.target.closest('.dropdown')) closeAllDropdowns();
    return;
  }
  if (t.matches('[data-tab]')) { tab(t, t.dataset.tab); return; }
  if (t.dataset.nav) { navigate(t.dataset.nav); closeAllDropdowns(); sidebar.close(); return; }
  if (t.dataset.modal) {
    const modalId = t.dataset.modal;
    const modalEl = openModal(modalId);
    if (modalEl) {
      // Forward any extra data-* context from the trigger (e.g. data-report, data-report-id,
      // data-loan-id) onto the modal element so its submit handler knows what it's acting on.
      Object.entries(t.dataset).forEach(([k, v]) => { if (k !== 'modal') modalEl.dataset[k] = v; });
      if (modalId === 'runReportModal') {
        const nameEl = modalEl.querySelector('#run-report-name');
        if (nameEl) nameEl.textContent = t.dataset.report || '—';
        modalEl.querySelector('#rep-output').innerHTML = '';
        if (t.dataset.report) {
          renderReportParameters(t.dataset.report);
        }
      }
      if (modalId === 'repaymentModal' && modalEl.dataset.loanId) {
        const loanIdInput = modalEl.querySelector('#rp-loanid');
        if (loanIdInput) loanIdInput.value = modalEl.dataset.loanId;
      }
    }
    return;
  }
  if (t.hasAttribute('data-close-modal')) {
    const m = t.closest('.modal-overlay');
    if (m) m.classList.remove('open');
    return;
  }
  const action = t.dataset.action;
  if (!action) return;
  switch (action) {
    case 'toggle-theme':     theme.toggle();   break;
    case 'toggle-sidebar':   sidebar.toggle(); break;
    case 'toggle-user-menu': dropdownToggle('userMenu'); break;
    case 'open-cmd':         import('./cmd.js').then(m => m.openCmd()); break;
    case 'logout':           import('./auth.js').then(m => m.logout()); break;
    case 'dismiss-toast':    t.closest('.toast')?.remove(); break;
    default:
      handleAction(action, t);
  }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); import('./cmd.js').then(m => m.openCmd()); return;
  }
  if (e.key === 'Escape') {
    closeAllModals(); closeAllDropdowns();
    import('./cmd.js').then(m => m.closeCmd?.());
    return;
  }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==='n') { e.preventDefault(); openModal('newClientModal'); }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==='l') { e.preventDefault(); openModal('newLoanModal'); }
  if (e.key==='?' && e.target.tagName!=='INPUT' && e.target.tagName!=='TEXTAREA')
    toast('info','Shortcuts','Ctrl+K palette · Ctrl+Shift+N new client · Ctrl+Shift+L new loan · ESC close');
});
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('modal-overlay')) e.target.classList.remove('open');
});

// ====================================================================
// FORM SUBMIT HANDLERS — All wired to live Fineract API
// ====================================================================
async function handleAction(action, btn) {
  switch (action) {

    // ---- NEW CLIENT ----
    case 'submit-client': {
      setSubmitting(btn);
      const f = formData('newClientForm');
      const legalFormId = parseInt(f.legalFormId) || 1;
      const isEntity = legalFormId === 2;
      // Validate required name fields by type
      if (isEntity && !f.fullname?.trim()) {
        toast('warn', 'Missing name', 'Enter the full legal name for the entity');
        setSubmitting(btn, false); break;
      }
      if (!isEntity && (!f.firstname?.trim() || !f.lastname?.trim())) {
        toast('warn', 'Missing name', 'Enter first and last name');
        setSubmitting(btn, false); break;
      }
      const payload = {
        legalFormId,
        officeId:        parseInt(f.officeId) || 1,
        active:          false,
        submittedOnDate: f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.staffId    && { staffId:    parseInt(f.staffId) }),
        ...(f.mobileNo   && { mobileNo:   f.mobileNo }),
        ...(f.externalId && { externalId: f.externalId }),
        ...(f.activationDate && { activationDate: f.activationDate }),
        ...(f.isStaff === 'on' && { isStaff: true }),
        // Individual-only fields
        ...(!isEntity && {
          firstname:   f.firstname,
          lastname:    f.lastname,
          ...(f.middlename   && { middlename:  f.middlename }),
          ...(f.dateOfBirth  && { dateOfBirth: f.dateOfBirth }),
          ...(f.genderId     && { genderId:    parseInt(f.genderId) })
        }),
        // Entity-only field
        ...(isEntity && { fullname: f.fullname })
      };
      try {
        const res = await api.clients.create(payload);
        closeAllModals();
        toast('success', 'Client created', `#${res.resourceId || res.clientId || '—'} submitted for activation`);
        document.getElementById('newClientForm')?.reset();
        navigate(store.get('currentPage') || 'clients');
      } catch(e) {
        toast('error', 'Client creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW LOAN ----
    case 'submit-loan': {
      setSubmitting(btn);
      const f = formData('newLoanForm');
      if (!f.clientId) {
        toast('warn', 'Missing client', 'Search and select a client first');
        setSubmitting(btn, false); break;
      }
      let tpl = {};
      try { tpl = JSON.parse(document.getElementById('newLoanForm')?.dataset.tpl || '{}'); } catch {}
      const nRep = parseInt(f.numberOfRepayments) || 12;
      const repEvery = parseInt(f.repaymentEvery) || 1;
      const repFreq  = parseInt(f.repaymentFrequencyType) ?? 2;
      const payload = {
        clientId:                      parseInt(f.clientId),
        productId:                     parseInt(f.productId),
        loanType:                      f.loanType || 'individual',
        principal:                     parseFloat(f.principal),
        loanTermFrequency:             nRep * repEvery,
        loanTermFrequencyType:         repFreq,
        numberOfRepayments:            nRep,
        repaymentEvery:                repEvery,
        repaymentFrequencyType:        repFreq,
        interestRatePerPeriod:         f.interestRate !== '' ? parseFloat(f.interestRate) : (tpl.interestRatePerPeriod ?? 0),
        interestRateFrequencyType:     tpl.interestRateFrequencyType ?? 2,
        amortizationType:              tpl.amortizationType ?? 1,
        interestType:                  tpl.interestType ?? 0,
        interestCalculationPeriodType: tpl.interestCalculationPeriodType ?? 1,
        transactionProcessingStrategyCode: tpl.transactionProcessingStrategyCode || 'mifos-standard-strategy',
        submittedOnDate:               f.submittedOnDate || today(),
        expectedDisbursementDate:      f.expectedDisbursementDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.loanOfficerId && { loanOfficerId: parseInt(f.loanOfficerId) }),
        ...(f.purpose       && { purpose: f.purpose }),
        ...(f.externalId    && { externalId: f.externalId })
      };
      try {
        const res = await api.loans.create(payload);
        closeAllModals();
        toast('success', 'Loan submitted', `#${res.resourceId || '—'} is pending approval`);
        document.getElementById('newLoanForm')?.reset();
        delete document.getElementById('newLoanForm')?.dataset.tpl;
        navigate(store.get('currentPage') || 'loans');
      } catch(e) {
        toast('error', 'Loan submission failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW SAVINGS ----
    case 'submit-savings': {
      setSubmitting(btn);
      const f = formData('newSavingsForm');
      if (!f.clientId) {
        toast('warn','Missing client','Search and select a client first');
        setSubmitting(btn, false); break;
      }
      const payload = {
        clientId:        parseInt(f.clientId),
        productId:       parseInt(f.productId),
        submittedOnDate: f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.staffId && { fieldOfficerId: parseInt(f.staffId) }),
        ...(f.nominalAnnualInterestRate !== '' && f.nominalAnnualInterestRate != null && {
          nominalAnnualInterestRate: parseFloat(f.nominalAnnualInterestRate)
        }),
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.savings.create(payload);
        closeAllModals();
        toast('success','Savings account created',`#${res.resourceId || '—'} pending approval`);
        document.getElementById('newSavingsForm')?.reset();
        navigate(store.get('currentPage') || 'savings');
      } catch(e) {
        toast('error','Savings creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW FIXED DEPOSIT ----
    case 'submit-fd': {
      setSubmitting(btn);
      const f = formData('newFDForm');
      if (!f.clientId) {
        toast('warn','Missing client','Search and select a client first');
        setSubmitting(btn, false); break;
      }
      const payload = {
        clientId:                 parseInt(f.clientId),
        productId:                parseInt(f.productId),
        depositAmount:            parseFloat(f.depositAmount),
        depositPeriod:            parseInt(f.depositPeriod) || 12,
        depositPeriodFrequencyId: parseInt(f.depositPeriodFrequencyId) ?? 2,
        maturityInstructionId:    parseInt(f.maturityInstructionId) || 1,
        submittedOnDate:          f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.fieldOfficerId  && { fieldOfficerId: parseInt(f.fieldOfficerId) }),
        ...(f.expectedFirstDepositOnDate && { expectedFirstDepositOnDate: f.expectedFirstDepositOnDate }),
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.fixedDeposits.create(payload);
        closeAllModals();
        toast('success','Fixed deposit created',`#${res.resourceId || '—'}`);
        document.getElementById('newFDForm')?.reset();
        navigate(store.get('currentPage') || 'deposits');
      } catch(e) {
        toast('error','FD creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW RECURRING DEPOSIT ----
    case 'submit-rd': {
      setSubmitting(btn);
      const f = formData('newRDForm');
      if (!f.clientId) {
        toast('warn','Missing client','Search and select a client first');
        setSubmitting(btn, false); break;
      }
      const payload = {
        clientId:                          parseInt(f.clientId),
        productId:                         parseInt(f.productId),
        mandatoryRecommendedDepositAmount: parseFloat(f.mandatoryRecommendedDepositAmount),
        recurringDepositFrequency:         parseInt(f.recurringDepositFrequency) || 1,
        recurringDepositFrequencyTypeId:   parseInt(f.recurringDepositFrequencyTypeId) ?? 2,
        depositPeriod:                     parseInt(f.depositPeriod) || 12,
        depositPeriodFrequencyId:          parseInt(f.depositPeriodFrequencyId) ?? 2,
        submittedOnDate:                   f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.fieldOfficerId && { fieldOfficerId: parseInt(f.fieldOfficerId) }),
        ...(f.expectedFirstDepositOnDate && { expectedFirstDepositOnDate: f.expectedFirstDepositOnDate }),
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.recurringDeposits.create(payload);
        closeAllModals();
        toast('success','Recurring deposit created',`#${res.resourceId || '—'}`);
        document.getElementById('newRDForm')?.reset();
        navigate(store.get('currentPage') || 'deposits');
      } catch(e) {
        toast('error','RD creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW SHARE ACCOUNT ----
    case 'submit-share': {
      setSubmitting(btn);
      const f = formData('newShareForm');
      if (!f.clientId) {
        toast('warn','Missing client','Search and select a client first');
        setSubmitting(btn, false); break;
      }
      const payload = {
        clientId:        parseInt(f.clientId),
        productId:       parseInt(f.productId),
        requestedShares: parseInt(f.requestedShares),
        unitPrice:       parseFloat(f.unitPrice),
        applicationDate: f.submittedDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.shares.create(payload);
        closeAllModals();
        toast('success','Share account created',`#${res.resourceId || '—'}`);
        document.getElementById('newShareForm')?.reset();
        navigate(store.get('currentPage') || 'shares');
      } catch(e) {
        toast('error','Share creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- REPAYMENT ----
    case 'submit-repayment': {
      setSubmitting(btn);
      const f = formData('repaymentForm');
      const loanId = f.loanId || document.getElementById('repaymentModal')?.dataset.loanId;
      if (!loanId) {
        toast('warn','Missing loan','Enter or select a loan account');
        setSubmitting(btn, false); break;
      }
      const payload = {
        transactionDate:   f.transactionDate || today(),
        transactionAmount: parseFloat(f.transactionAmount),
        paymentTypeId:     f.paymentTypeId ? parseInt(f.paymentTypeId) : undefined,
        accountNumber:     f.accountNumber  || undefined,
        checkNumber:       f.checkNumber    || undefined,
        receiptNumber:     f.receiptNumber  || undefined,
        note:              f.note           || undefined,
        dateFormat: DATE_FORMAT,
        locale: LOCALE
      };
      try {
        const res = await api.loans.repay(loanId, payload);
        closeAllModals();
        toast('success','Repayment posted',`Tx #${res.resourceId || '—'} · ${payload.transactionAmount}`);
        document.getElementById('repaymentForm')?.reset();
      } catch(e) {
        toast('error','Repayment failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- JOURNAL ENTRY ----
    case 'submit-journal': {
      setSubmitting(btn);
      const f = formData('journalEntryForm');
      // Collect multi-row debits/credits
      const debits  = collectJournalRows('#je-debits-body');
      const credits = collectJournalRows('#je-credits-body');
      if (!debits.length || !credits.length) {
        toast('warn','Incomplete','Add at least one debit and one credit line');
        setSubmitting(btn, false); break;
      }
      const payload = {
        officeId:         parseInt(f.officeId),
        currencyCode:     f.currencyCode,
        transactionDate:  f.transactionDate || today(),
        debits, credits,
        paymentTypeId:    f.paymentTypeId ? parseInt(f.paymentTypeId) : undefined,
        referenceNumber:  f.reference || undefined,
        comments:         f.comments  || undefined,
        dateFormat: DATE_FORMAT,
        locale: LOCALE
      };
      try {
        const res = await api.journalEntries.create(payload);
        closeAllModals();
        toast('success','Journal entry posted',`Tx #${res.transactionId || res.resourceId || '—'}`);
        document.getElementById('journalEntryForm')?.reset();
      } catch(e) {
        toast('error','Journal entry failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- ACCOUNT TRANSFER ----
    case 'submit-transfer': {
      setSubmitting(btn);
      const f = formData('newTransferForm');
      const payload = {
        fromOfficeId:      parseInt(f.fromOfficeId),
        toOfficeId:        parseInt(f.toOfficeId),
        fromClientId:      parseInt(f.fromClientId),
        fromAccountId:     parseInt(f.fromAccountId),
        fromAccountType:   parseInt(f.fromAccountType) || 2,
        toClientId:        parseInt(f.toClientId),
        toAccountId:       parseInt(f.toAccountId),
        toAccountType:     parseInt(f.toAccountType) || 2,
        transferAmount:    parseFloat(f.transferAmount),
        transferDate:      f.transferDate || today(),
        transferDescription: f.transferDescription || '',
        dateFormat: DATE_FORMAT,
        locale: LOCALE
      };
      try {
        const res = await api.transfers.create(payload);
        closeAllModals();
        toast('success','Transfer completed',`#${res.resourceId || '—'}`);
        document.getElementById('newTransferForm')?.reset();
        navigate(store.get('currentPage') || 'transfers');
      } catch(e) {
        toast('error','Transfer failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW GROUP ----
    case 'submit-group': {
      setSubmitting(btn);
      const f = formData('newGroupForm');
      const payload = {
        name:            f.name,
        officeId:        parseInt(f.officeId),
        submittedOnDate: f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.staffId    && { staffId: parseInt(f.staffId) }),
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.groups.create(payload);
        closeAllModals();
        toast('success','Group created',`#${res.resourceId || '—'}`);
        document.getElementById('newGroupForm')?.reset();
        navigate(store.get('currentPage') || 'groups');
      } catch(e) {
        toast('error','Group creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW USER ----
    case 'submit-user': {
      setSubmitting(btn);
      const form = document.getElementById('newUserForm');
      const f = formData('newUserForm');
      const roles = Array.from(form.querySelector('[name="roles"]').selectedOptions).map(o => parseInt(o.value));
      const sendByEmail = form.querySelector('#nu-sendemail').checked;
      if (!roles.length) {
        toast('warn', 'No role selected', 'Choose at least one role for this user');
        setSubmitting(btn, false); break;
      }
      const payload = {
        username: f.username, email: f.email, firstname: f.firstname, lastname: f.lastname,
        officeId: parseInt(f.officeId), roles,
        sendPasswordToEmail: sendByEmail
      };
      if (!sendByEmail) {
        if (!f.password || f.password !== f.repeatPassword) {
          toast('warn', 'Password mismatch', 'Enter and confirm a password, or send by email instead');
          setSubmitting(btn, false); break;
        }
        payload.password = f.password;
        payload.repeatPassword = f.repeatPassword;
      }
      try {
        const res = await api.users.create(payload);
        closeAllModals();
        toast('success','User created',`#${res.resourceId || '—'}`);
        form.reset();
        navigate(store.get('currentPage') || 'users');
      } catch(e) {
        toast('error','User creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW PAYMENT TYPE ----
    case 'submit-paymenttype': {
      setSubmitting(btn);
      const f = formData('newPaymentTypeForm');
      const payload = {
        name:          f.name,
        description:   f.description || undefined,
        isCashPayment: f.isCashPayment === 'true',
        position:      f.position ? parseInt(f.position) : undefined
      };
      try {
        const res = await api.paymentTypes.create(payload);
        closeAllModals();
        toast('success','Payment type created',`#${res.resourceId || '—'}`);
        document.getElementById('newPaymentTypeForm')?.reset();
        navigate(store.get('currentPage') || 'organization');
      } catch(e) {
        toast('error','Creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW CHARGE ----
    case 'submit-charge': {
      setSubmitting(btn);
      const f = formData('newChargeForm');
      const payload = {
        name:                  f.name,
        currencyCode:          f.currencyCode,
        amount:                parseFloat(f.amount),
        chargeAppliesTo:       parseInt(f.chargeAppliesTo),
        chargeTimeType:        parseInt(f.chargeTimeType),
        chargeCalculationType: parseInt(f.chargeCalculationType),
        penalty:               f.penalty === 'true',
        active:                f.active !== 'false',
        locale: LOCALE
      };
      try {
        const res = await api.charges.create(payload);
        closeAllModals();
        toast('success','Charge created',`#${res.resourceId || '—'}`);
        document.getElementById('newChargeForm')?.reset();
        navigate(store.get('currentPage') || 'products');
      } catch(e) {
        toast('error','Charge creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- NEW CENTER ----
    case 'submit-center': {
      setSubmitting(btn);
      const f = formData('newCenterForm');
      const payload = {
        name:            f.name,
        officeId:        parseInt(f.officeId),
        active:          false,
        submittedOnDate: f.submittedOnDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.staffId    && { staffId: parseInt(f.staffId) }),
        ...(f.externalId && { externalId: f.externalId })
      };
      try {
        const res = await api.centers.create(payload);
        closeAllModals();
        toast('success','Center created',`#${res.resourceId || '—'}`);
        document.getElementById('newCenterForm')?.reset();
        navigate(store.get('currentPage') || 'centers');
      } catch(e) {
        toast('error','Center creation failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- GL ACCOUNT ----
    case 'submit-gl': {
      setSubmitting(btn);
      const f = formData('glAccountForm');
      // Fineract GLAccountType: 1=ASSET, 2=LIABILITY, 3=EQUITY, 4=INCOME, 5=EXPENSE
      // Fineract GLAccountUsage: 1=DETAIL, 2=HEADER
      const payload = {
        name:                 f.name,
        glCode:               f.glCode,
        type:                 parseInt(f.type),   // numeric required by Fineract
        usage:                parseInt(f.usage),  // numeric required by Fineract
        manualEntriesAllowed: document.getElementById('gl-manual')?.checked ?? true,
        ...(f.parentId && { parentId: parseInt(f.parentId) }),
        ...(f.description && { description: f.description })
      };
      try {
        const res = await api.glAccounts.create(payload);
        closeAllModals();
        toast('success','GL account created',`${f.glCode} — ${f.name}`);
        document.getElementById('glAccountForm')?.reset();
        navigate(store.get('currentPage') || 'accounting');
      } catch(e) {
        toast('error','GL account failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- BULK IMPORT ----
    case 'submit-import': {
      setSubmitting(btn);
      const fileInput = document.querySelector('#bulkImportModal input[type="file"]');
      const entitySel = document.querySelector('#bulkImportModal select[name="entity"]');
      const officeSel = document.querySelector('#bulkImportModal [data-populate="offices"]');
      if (!fileInput?.files[0]) {
        toast('warn','No file','Choose a .xlsx file to import');
        setSubmitting(btn, false); break;
      }
      const entity  = entitySel?.value || 'clients';
      const officeId = officeSel?.value;
      if (!officeId) {
        toast('warn','No office selected','Choose which office this import belongs to');
        setSubmitting(btn, false); break;
      }
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('locale', 'en');
      fd.append('dateFormat', 'yyyy-MM-dd');
      fd.append('officeId', officeId);
      try {
        await api.bulkImports.upload(entity, fd);
        closeAllModals();
        toast('success','Import queued','Check Import History for status');
      } catch(e) {
        toast('error','Import failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- REPORT RUN ----
    case 'run-report': {
      setSubmitting(btn);
      const modal = document.getElementById('runReportModal');
      const reportName = modal?.dataset.report;
      const output = document.getElementById('rep-output');
      if (!reportName) { setSubmitting(btn, false); break; }
      const values = formData('runReportForm');
      const format = values.outputFormat || 'JSON';
      const params = Object.entries(values).reduce((acc, [k, v]) => {
        if (!v || k === 'outputFormat') return acc;
        acc[k] = v;
        return acc;
      }, {});
      try {
        if (format === 'JSON') {
          const res = await api.runReports.run(reportName, params);
          const cols = res?.columnHeaders?.map(h => h.columnName) || [];
          const rows = res?.data || [];
          output.innerHTML = rows.length
            ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr>${(r.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
            : '<div class="empty-state"><i class="fa-solid fa-table"></i><div>Report ran but returned no rows</div></div>';
          toast('success','Report generated', reportName);
        } else {
          const r = await api.runReports.run(reportName, params, { raw: true, outputType: format });
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${reportName}.${format.toLowerCase()}`;
          a.click();
          toast('success','Report downloaded', `${reportName}.${format.toLowerCase()}`);
        }
      } catch(e) {
        output.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(extractFineractError(e))}</div></div>`;
        toast('error','Report failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- REMITTANCE STEPPER ----
    case 'remit-next': import('./remit.js').then(m => m.Remit.next()); break;
    case 'remit-back': import('./remit.js').then(m => m.Remit.back()); break;

    // ---- WRITE-OFF ----
    case 'submit-writeoff': {
      setSubmitting(btn);
      const modal = document.getElementById('writeOffModal');
      const loanId = modal?.dataset.loanId;
      if (!loanId) { toast('warn','No loan selected','Open write-off from a loan record'); setSubmitting(btn, false); break; }
      const f = formData('writeOffForm');
      const payload = {
        transactionDate: f.transactionDate || today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.note && { note: f.note })
      };
      try {
        await api.loans.writeOff(loanId, payload);
        closeAllModals();
        toast('warn','Loan written off', `#${loanId} written off to provision`);
        navigate(store.get('currentPage') || 'loans');
      } catch(e) {
        toast('error','Write-off failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- LOAN RESCHEDULE ----
    case 'submit-reschedule': {
      setSubmitting(btn);
      const f = formData('rescheduleForm');
      const loanId = f.loanId || document.getElementById('rescheduleModal')?.dataset.loanId;
      if (!loanId) { toast('warn','No loan','Open rescheduling from a loan record'); setSubmitting(btn, false); break; }
      if (!f.rescheduleReasonId) { toast('warn','Reason required','Select a reschedule reason'); setSubmitting(btn, false); break; }
      const payload = {
        loanId:              parseInt(loanId),
        rescheduleFromDate:  f.rescheduleFromDate || today(),
        rescheduleReasonId:  parseInt(f.rescheduleReasonId),
        submittedOnDate:     today(),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.adjustedDueDate      && { adjustedDueDate: f.adjustedDueDate }),
        ...(f.numberOfRepayments   && { numberOfRepayments: parseInt(f.numberOfRepayments) }),
        ...(f.interestRatePerPeriod && { interestRatePerPeriod: parseFloat(f.interestRatePerPeriod) }),
        ...(f.comments             && { comments: f.comments })
      };
      try {
        const res = await api.loans.reschedule(payload);
        closeAllModals();
        toast('success','Loan reschedule submitted',`#${res.resourceId || '—'} — pending checker approval`);
        document.getElementById('rescheduleForm')?.reset();
      } catch(e) {
        toast('error','Reschedule failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- 2FA VERIFY (UI-only, no Fineract endpoint) ----
    case 'verify-2fa':
      closeAllModals();
      toast('success','2FA enabled','Your account is now secured');
      break;

    // ---- SELF-SERVICE USER ----
    case 'submit-ss-user': {
      setSubmitting(btn);
      const f = formData('selfServiceUserForm');
      if (!f.clientId) {
        toast('warn', 'Client required', 'Search and select a client to link this portal account to');
        setSubmitting(btn, false); break;
      }
      if (!f.password || f.password !== f.passwordRepeat) {
        toast('warn', 'Password mismatch', 'Passwords do not match');
        setSubmitting(btn, false); break;
      }
      try {
        await api.selfService.register({
          username:           f.username,
          email:              f.email,
          password:           f.password,
          repeatPassword:     f.passwordRepeat,
          clientId:           parseInt(f.clientId),
          authenticationMode: 'email'
        });
        closeAllModals();
        toast('success','Portal user registered',`Activation link sent to ${f.email}`);
        document.getElementById('selfServiceUserForm')?.reset();
      } catch(e) {
        toast('error','Registration failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- AD-HOC SQL QUERY ----
    case 'run-sql': {
      const queryEl = document.getElementById('sqlQuery');
      const resEl   = document.getElementById('sqlResult');
      if (!queryEl || !resEl) break;
      const queryName = queryEl.value?.trim();
      if (!queryName) { toast('warn','Enter query name','Type a registered ad-hoc query name'); break; }
      setSubmitting(btn);
      resEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Running…</div></div>';
      try {
        const res = await api.runReports.run(queryName, { 'output-type': 'JSON' });
        const cols = res?.columnHeaders?.map(h => h.columnName) || [];
        const rows = res?.data || [];
        resEl.innerHTML = rows.length
          ? `<div class="tbl-wrap"><table class="tbl">
              <thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
              <tbody>${rows.map(r=>`<tr>${(r.row||[]).map(v=>`<td>${escapeHtml(String(v??''))}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div><div class="text-muted mt-2">${rows.length} row(s)</div>`
          : '<div class="empty-state"><i class="fa-solid fa-table"></i><div>No results</div></div>';
      } catch(e) {
        resEl.innerHTML = `<div class="empty-state t-error"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(extractFineractError(e))}</div></div>`;
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- DEPOSIT/WITHDRAWAL ON SAVINGS ----
    case 'submit-savings-deposit': {
      setSubmitting(btn);
      const f = formData('savingsDepositForm');
      const acctId = f.accountId || document.getElementById('savingsDepositModal')?.dataset.accountId;
      if (!acctId) { toast('warn','No account','Open this from a savings account record'); setSubmitting(btn, false); break; }
      const payload = {
        transactionDate:   f.transactionDate || today(),
        transactionAmount: parseFloat(f.transactionAmount),
        dateFormat: DATE_FORMAT,
        locale: LOCALE,
        ...(f.paymentTypeId  && { paymentTypeId:  parseInt(f.paymentTypeId) }),
        ...(f.accountNumber  && { accountNumber:  f.accountNumber }),
        ...(f.checkNumber    && { checkNumber:    f.checkNumber }),
        ...(f.receiptNumber  && { receiptNumber:  f.receiptNumber }),
        ...(f.note           && { note:           f.note })
      };
      try {
        const res = f.transactionType === 'withdrawal'
          ? await api.savings.withdrawal(acctId, payload)
          : await api.savings.deposit(acctId, payload);
        closeAllModals();
        toast('success', f.transactionType === 'withdrawal' ? 'Withdrawal posted' : 'Deposit posted', `Tx #${res.resourceId || '—'}`);
        document.getElementById('savingsDepositForm')?.reset();
        navigate(store.get('currentPage') || 'savings');
      } catch(e) {
        toast('error','Transaction failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- CONFIGURATION WIZARD (atomic batch: working days + currencies together) ----
    case 'submit-wizard': {
      setSubmitting(btn);
      const dayMap = { Sun:'SU', Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA' };
      const selectedDays = Array.from(document.querySelectorAll('#cw-days [data-cw-day]:checked')).map(cb => dayMap[cb.dataset.cwDay]);
      const selectedCurrencies = Array.from(document.getElementById('cw-currencies')?.selectedOptions || []).map(o => o.value).filter(Boolean);
      if (!selectedDays.length) { toast('warn','No working days selected','Pick at least one working day'); setSubmitting(btn, false); break; }
      if (!selectedCurrencies.length) { toast('warn','No currencies selected','Pick at least one currency'); setSubmitting(btn, false); break; }

      const requests = [
        {
          requestId: 1, method: 'PUT', relativeUrl: 'workingdays',
          body: { recurrence: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${selectedDays.join(',')}`, locale: LOCALE }
        },
        {
          requestId: 2, method: 'PUT', relativeUrl: 'currencies',
          body: { currencies: selectedCurrencies }
        }
      ];
      try {
        // enclosingTransaction=true: if either step fails, both are rolled back —
        // you never end up with working days saved but currencies half-configured.
        const results = await api.batch.submit(requests, true);
        const failed = results.find(r => !r.ok);
        if (failed) {
          const msg = failed.body?.errors?.[0]?.defaultUserMessage || failed.body?.defaultUserMessage || `HTTP ${failed.statusCode}`;
          toast('error', 'Setup failed — nothing was changed', msg);
        } else {
          closeAllModals();
          toast('success', 'Organization setup saved', `${selectedDays.length} working days, ${selectedCurrencies.length} currencies`);
        }
      } catch (e) {
        toast('error', 'Batch submission failed', e.message || String(e));
      } finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Office ----
    case 'submit-office': {
      setSubmitting(btn);
      const f = document.getElementById('newOfficeForm');
      const d = new FormData(f);
      const payload = {
        name: d.get('name'), parentId: parseInt(d.get('parentId')),
        openingDate: d.get('openingDate'), dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(d.get('externalId') && { externalId: d.get('externalId') })
      };
      try {
        const res = await api.offices.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Office created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create office', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Staff ----
    case 'submit-staff': {
      setSubmitting(btn);
      const f = document.getElementById('newStaffForm');
      const d = new FormData(f);
      const payload = {
        firstname: d.get('firstname'), lastname: d.get('lastname'),
        officeId: parseInt(d.get('officeId')),
        isLoanOfficer: d.get('isLoanOfficer') === 'true',
        isActive: d.get('isActive') === 'true',
        locale: LOCALE, dateFormat: DATE_FORMAT,
        ...(d.get('mobileNo') && { mobileNo: d.get('mobileNo') }),
        ...(d.get('joiningDate') && { joiningDate: d.get('joiningDate') })
      };
      try {
        const res = await api.staff.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Staff member created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create staff', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Holiday ----
    case 'submit-holiday': {
      setSubmitting(btn);
      const f = document.getElementById('newHolidayForm');
      const d = new FormData(f);
      const officeEls = document.querySelectorAll('#holiday-offices-sel option:checked');
      const offices = Array.from(officeEls).map(o => ({ officeId: parseInt(o.value) }));
      if (!offices.length) { toast('warn', 'Select at least one office', ''); setSubmitting(btn, false); break; }
      const payload = {
        name: d.get('name'),
        fromDate: d.get('fromDate'), toDate: d.get('toDate'),
        dateFormat: DATE_FORMAT, locale: LOCALE, offices,
        ...(d.get('repaymentsRescheduledTo') && { repaymentsRescheduledTo: d.get('repaymentsRescheduledTo') }),
        ...(d.get('description') && { description: d.get('description') })
      };
      try {
        const res = await api.holidays.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Holiday created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create holiday', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Teller ----
    case 'submit-teller': {
      setSubmitting(btn);
      const f = document.getElementById('newTellerForm');
      const d = new FormData(f);
      const payload = {
        name: d.get('name'), officeId: parseInt(d.get('officeId')),
        startDate: d.get('startDate'), dateFormat: DATE_FORMAT, locale: LOCALE,
        status: d.get('status'),
        ...(d.get('endDate') && { endDate: d.get('endDate') }),
        ...(d.get('description') && { description: d.get('description') })
      };
      try {
        const res = await api.tellers.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Teller created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create teller', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Accounting Rule ----
    case 'submit-acc-rule': {
      setSubmitting(btn);
      const f = document.getElementById('newAccRuleForm');
      const d = new FormData(f);
      const payload = {
        name: d.get('name'),
        debitAccountId: parseInt(d.get('debitAccountId')),
        creditAccountId: parseInt(d.get('creditAccountId')),
        ...(d.get('officeId') && { officeId: parseInt(d.get('officeId')) }),
        ...(d.get('description') && { description: d.get('description') }),
        ...(d.get('tags') && { tags: d.get('tags').split(',').map(t => ({ name: t.trim() })).filter(t => t.name) })
      };
      try {
        const res = await api.accountingRules.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Accounting rule created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create rule', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Provisioning Criteria ----
    case 'submit-prov-criteria': {
      setSubmitting(btn);
      const f = document.getElementById('newProvCriteriaForm');
      const d = new FormData(f);
      const names = d.getAll('pc_name[]'), mins = d.getAll('pc_min[]'),
            maxs  = d.getAll('pc_max[]'),  amts = d.getAll('pc_minamount[]'),
            pcts  = d.getAll('pc_pct[]');
      const provisioningcriteria = names.map((nm, i) => ({
        categoryName: nm,
        minAge: parseInt(mins[i] || 0), maxAge: parseInt(maxs[i] || 0),
        minAmountStepSize: parseFloat(amts[i] || 0),
        liabilityPercentage: parseFloat(pcts[i] || 0)
      }));
      try {
        const res = await api.provisioning.createCriteria({ criteriaName: d.get('criteriaName'), provisioningcriteria });
        closeAllModals(); f.reset();
        toast('success', 'Provisioning criteria created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Financial Activity Account ----
    case 'submit-fa-account': {
      setSubmitting(btn);
      const f = document.getElementById('newFAAccountForm');
      const d = new FormData(f);
      try {
        const res = await api.financialActivityAccounts.create({
          financialActivityId: parseInt(d.get('financialActivityId')),
          glAccountId: parseInt(d.get('glAccountId'))
        });
        closeAllModals(); f.reset();
        toast('success', 'Financial activity mapped', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Standing Instruction ----
    case 'submit-si': {
      setSubmitting(btn);
      const f = document.getElementById('newSIForm');
      const d = new FormData(f);
      const ni = k => d.get(k) ? parseInt(d.get(k)) : undefined;
      const payload = {
        name: d.get('name'),
        fromClientId: ni('fromClientId'), fromAccountId: ni('fromAccountId'),
        fromAccountType: ni('fromAccountType'),
        toClientId: ni('toClientId'), toAccountId: ni('toAccountId'),
        toAccountType: ni('toAccountType'),
        transferType: ni('transferType'),
        amount: parseFloat(d.get('amount')),
        validFrom: d.get('validFrom'), dateFormat: DATE_FORMAT, locale: LOCALE,
        recurrenceType: ni('recurrenceType'),
        recurrenceFrequency: ni('recurrenceFrequency'),
        recurrenceInterval: ni('recurrenceInterval'),
        instructionType: ni('instructionType'),
        priority: ni('priority'), status: ni('status'),
        ...(d.get('validTill') && { validTill: d.get('validTill') }),
        ...(d.get('recurrenceOnMonthDay') && { recurrenceOnMonthDay: ni('recurrenceOnMonthDay') })
      };
      try {
        const res = await api.standingInstructions.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Standing instruction created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Loan Product ----
    case 'submit-loan-product': {
      setSubmitting(btn);
      const f = document.getElementById('newLoanProductForm');
      const d = new FormData(f);
      const nf = k => { const v = d.get(k); return v !== '' && v !== null ? parseFloat(v) : undefined; };
      const payload = {
        name:                              d.get('name'),
        shortName:                         d.get('shortName'),
        currencyCode:                      d.get('currencyCode'),
        digitsAfterDecimal:                parseInt(d.get('digitsAfterDecimal') || 2),
        principal:                         nf('principal'),
        interestRatePerPeriod:             nf('interestRatePerPeriod'),
        interestRateFrequencyType:         parseInt(d.get('interestRateFrequencyType')),
        amortizationType:                  parseInt(d.get('amortizationType')),
        interestType:                      parseInt(d.get('interestType')),
        interestCalculationPeriodType:     parseInt(d.get('interestCalculationPeriodType') || 1),
        numberOfRepayments:                parseInt(d.get('numberOfRepayments')),
        repaymentEvery:                    parseInt(d.get('repaymentEvery')),
        repaymentFrequencyType:            parseInt(d.get('repaymentFrequencyType')),
        transactionProcessingStrategyCode: d.get('transactionProcessingStrategyCode'),
        graceOnPrincipalPayment:           parseInt(d.get('graceOnPrincipalPayment') || 0),
        graceOnInterestPayment:            parseInt(d.get('graceOnInterestPayment') || 0),
        accountingRule:                    parseInt(d.get('accountingRule') || 1),
        locale: LOCALE,
        ...(nf('minPrincipal') !== undefined && { minPrincipal: nf('minPrincipal') }),
        ...(nf('maxPrincipal') !== undefined && { maxPrincipal: nf('maxPrincipal') }),
        ...(d.get('description') && { description: d.get('description') })
      };
      try {
        const res = await api.loanProducts.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Loan product created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create loan product', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    // ---- Savings Product ----
    case 'submit-savings-product': {
      setSubmitting(btn);
      const f = document.getElementById('newSavingsProductForm');
      const d = new FormData(f);
      const payload = {
        name:                              d.get('name'),
        shortName:                         d.get('shortName'),
        currencyCode:                      d.get('currencyCode'),
        digitsAfterDecimal:                parseInt(d.get('digitsAfterDecimal') || 2),
        nominalAnnualInterestRate:         parseFloat(d.get('nominalAnnualInterestRate') || 0),
        interestCompoundingPeriodType:     parseInt(d.get('interestCompoundingPeriodType')),
        interestPostingPeriodType:         parseInt(d.get('interestPostingPeriodType')),
        interestCalculationType:           parseInt(d.get('interestCalculationType')),
        interestCalculationDaysInYearType: parseInt(d.get('interestCalculationDaysInYearType')),
        minRequiredOpeningBalance:         parseFloat(d.get('minRequiredOpeningBalance') || 0),
        withdrawalFeeForTransfers:         parseFloat(d.get('withdrawalFeeForTransfers') || 0),
        accountingRule:                    parseInt(d.get('accountingRule') || 1),
        locale: LOCALE,
        ...(d.get('description') && { description: d.get('description') })
      };
      try {
        const res = await api.savingsProducts.create(payload);
        closeAllModals(); f.reset();
        toast('success', 'Savings product created', `#${res.resourceId}`);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Failed to create savings product', extractFineractError(e)); }
      finally { setSubmitting(btn, false); }
      break;
    }

    default:
      console.warn('[unhandled action]', action);
  }
}

// ---- Helper: extract readable error from Fineract response ----
function extractFineractError(e) {
  if (!e) return 'Unknown error';
  if (e.detail?.errors?.[0]?.defaultUserMessage) return e.detail.errors[0].defaultUserMessage;
  if (e.detail?.defaultUserMessage) return e.detail.defaultUserMessage;
  if (e.detail?.errors?.[0]?.developerMessage) return e.detail.errors[0].developerMessage;
  if (e.detail?.developerMessage) return e.detail.developerMessage;
  if (typeof e.detail === 'string') return e.detail;
  return e.message || 'API error';
}

// ---- Helper: collect journal entry rows from a table body ----
function collectJournalRows(selector) {
  const rows = [];
  document.querySelectorAll(`${selector} tr`).forEach(row => {
    const acct = row.querySelector('[data-je-account]')?.value;
    const amt  = parseFloat(row.querySelector('[data-je-amount]')?.value);
    if (acct && !isNaN(amt) && amt > 0) rows.push({ glAccountId: parseInt(acct), amount: amt });
  });
  return rows;
}
