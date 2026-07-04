/* FinCraft · utils.js */
import { store } from './store.js';

export const fmt = (n, ccy) => {
  if (n == null || isNaN(n)) return '—';
  const currency = ccy || store.get('defaultCurrency') || 'USD';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n); }
  catch { return currency + ' ' + num(n); }
};
export const num = n => (n == null || isNaN(n)) ? '—' : new Intl.NumberFormat().format(n);
export const ini = name => {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
};
const STATUS_MAP = {
  active: 'b-success', open: 'b-success', approved: 'b-teal',
  pending: 'b-warn', submitted: 'b-warn', 'pending approval': 'b-warn',
  closed: 'b-info', withdrawn: 'b-info', completed: 'b-info',
  overdue: 'b-danger', rejected: 'b-danger', 'written off': 'b-danger'
};
export const sb = status => {
  const s = String(status || '—').toLowerCase();
  const cls = STATUS_MAP[s] || '';
  return `<span class="badge ${cls}">${escapeHtml(status || '—')}</span>`;
};
export function bars(el, values, labels) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  const max = Math.max(1, ...values);
  el.classList.add('chart-bars');
  el.innerHTML = values.map((v, i) =>
    `<div class="bar" style="height:${Math.max(4, (v / max) * 100)}%" title="${v}">
       <span class="lbl">${escapeHtml(labels?.[i] || '')}</span>
     </div>`).join('');
}
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const throttle = (fn, ms = 200) => {
  let last = 0, t;
  return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
  };
};
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function parseHash() {
  const h = (location.hash || '#dashboard').replace(/^#\/?/, '');
  const [page, ...rest] = h.split('/');
  const params = {};
  if (rest.length === 1 && rest[0]) params.id = decodeURIComponent(rest[0]);
  else if (rest.length > 1) for (let i = 0; i < rest.length; i += 2) params[rest[i]] = decodeURIComponent(rest[i + 1] || '');
  return { page: page || 'dashboard', params };
}
export function buildHash(page, params = {}) {
  const keys = Object.keys(params);
  if (!keys.length) return `#${page}`;
  if (keys.length === 1 && 'id' in params) return `#${page}/${encodeURIComponent(params.id)}`;
  return `#${page}/` + keys.map(k => `${k}/${encodeURIComponent(params[k])}`).join('/');
}
export function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout after ' + ms + 'ms')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
export const fmtDate = d => {
  if (!d) return '—';
  if (Array.isArray(d)) d = new Date(d[0], d[1] - 1, d[2]);
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};
