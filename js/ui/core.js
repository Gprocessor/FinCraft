/* FinCraft · ui/core.js — toasts, modals, tabs, sidebar, theme toggle, confirm dialog.
   Auto-split from the original monolithic ui.js for maintainability. */

import { store } from '../store.js';
import { escapeHtml } from '../utils.js';

// ════════════════════════════════════════════════════════════
export function setBreadcrumb(parts) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  if (!Array.isArray(parts) || !parts.length) { el.textContent = ''; return; }
  el.textContent = parts[parts.length - 1];
}

export function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
}

export function toast(type, title, msg, durationMs = 4500) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  const iconMap = {
    success: 'fa-circle-check',
    warn:    'fa-triangle-exclamation',
    warning: 'fa-triangle-exclamation',
    error:   'fa-circle-xmark',
    info:    'fa-circle-info'
  };
  const cls = type === 'warn' ? 'warning' : type;
  const icon = iconMap[type] || 'fa-circle-info';
  t.className = `toast ${cls}`;
  t.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div style="flex:1">
      <div class="toast-title">${escapeHtml(title || '')}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
    <button class="toast-close" data-action="dismiss-toast">
      <i class="fa-solid fa-xmark"></i>
    </button>`;
  c.appendChild(t);
  t.querySelector('[data-action="dismiss-toast"]').addEventListener('click', () => t.remove());
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = 'all .2s';
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

/** Generic entity detail panel reused by Centers, Groups, etc. */
export async function showEntityDetail({ title, fetchFn, renderBody, onMount }) {
  const titleEl = document.getElementById('edm-title');
  const bodyEl  = document.getElementById('edm-body');
  const footEl  = document.getElementById('edm-foot');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>';
  if (footEl) footEl.innerHTML = '<button class="btn-ghost" data-close-modal>Close</button>';
  openModal('entityDetailModal');
  const refresh = () => showEntityDetail({ title, fetchFn, renderBody, onMount });
  try {
    const data = await fetchFn();
    bodyEl.innerHTML = renderBody(data);
    if (onMount) onMount(bodyEl, data, refresh);
  } catch (e) {
    bodyEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation empty-state-icon"></i><h3>${escapeHtml(e.message || String(e))}</h3></div>`;
  }
}

export function tab(btn, panelId) {
  const tabs = btn.closest('.tabs');
  const root = btn.closest('.card, .modal, .page, body');
  tabs?.querySelectorAll('.tab, .tab-btn').forEach(t => t.classList.toggle('active', t === btn));
  root?.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
}

export function closeAllDropdowns() {
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
    const shell   = document.getElementById('appShell');
    const sidebarEl = document.getElementById('sidebar');
    if (!shell || !sidebarEl) return;
    if (window.innerWidth <= 720) {
      sidebarEl.classList.remove('collapsed');
      shell.classList.toggle('nav-open');
    } else {
      const next = store.get('sidebar') === 'collapsed' ? 'expanded' : 'collapsed';
      store.set('sidebar', next);
      sidebarEl.classList.toggle('collapsed', next === 'collapsed');
    }
  },
  close() {
    document.getElementById('appShell')?.classList.remove('nav-open');
  }
};

export const theme = {
  toggle() {
    const next = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.set('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    const icon = document.querySelector('#themeBtn i');
    if (icon) icon.className = `fa-solid fa-${next === 'light' ? 'sun' : 'moon'}`;
  }
};

export function confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const id = 'cfm_' + Date.now();
    const root = document.getElementById('modalRoot') || document.body;
    root.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="modal-overlay open">
        <div class="modal modal-sm">
          <div class="modal-head">
            <h3 class="modal-title">${escapeHtml(title)}</h3>
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
    el.addEventListener('click', (e) => { if (e.target === el) { el.remove(); resolve(false); } });
  });
}

