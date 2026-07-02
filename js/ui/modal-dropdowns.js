/* FinCraft · ui/modal-dropdowns.js — populates <select> dropdowns inside modals once they load.
   Auto-split from the original monolithic ui.js for maintainability. */

import { api } from '../api.js';
import { escapeHtml } from '../utils.js';

// ════════════════════════════════════════════════════════════
async function populateModalDropdowns() {
  const results = await Promise.allSettled([
    api.offices.list(),
    api.staff.list(),
    api.loanProducts.list(),
    api.savingsProducts.list(),
    api.fdProducts.list(),
    api.rdProducts.list(),
    api.clients.template(),
    api.currencies.list(),
    api.glAccounts.list(),
    api.financialActivityAccounts.list()
  ]);
  const get = (i, fb = []) => results[i].status === 'fulfilled' ? (results[i].value ?? fb) : fb;

  const offices   = Array.isArray(get(0)) ? get(0) : [];
  const staff     = Array.isArray(get(1)) ? get(1) : (get(1)?.pageItems || []);
  const loanProds = Array.isArray(get(2)) ? get(2) : [];
  const savProds  = Array.isArray(get(3)) ? get(3) : [];
  const fdProds   = Array.isArray(get(4)) ? get(4) : [];
  const rdProds   = Array.isArray(get(5)) ? get(5) : [];
  const clientTpl = get(6, {});
  const currList  = get(7)?.selectedCurrencyOptions || get(7)?.currencyOptions || [];
  const glList    = Array.isArray(get(8)) ? get(8) : [];
  const faList    = Array.isArray(get(9)) ? get(9) : [];

  // Offices
  document.querySelectorAll('[data-populate="offices"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select office…</option>' +
      offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  });
  const parentSel = document.getElementById('office-parent-sel');
  if (parentSel) parentSel.innerHTML = '<option value="">— Root office —</option>' +
    offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  const holidayOffices = document.getElementById('holiday-offices-sel');
  if (holidayOffices) holidayOffices.innerHTML =
    offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  // Staff
  document.querySelectorAll('[data-populate="staff"]').forEach(sel => {
    sel.innerHTML = '<option value="">Unassigned</option>' +
      staff.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('');
  });

  // Products
  document.querySelectorAll('[data-populate="loanProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      loanProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="savingsProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      savProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="fdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      fdProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });
  document.querySelectorAll('[data-populate="rdProducts"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select product…</option>' +
      rdProds.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  });

  // Gender (client template)
  const genderOpts = clientTpl?.genderOptions || [];
  document.querySelectorAll('[data-populate="gender"]').forEach(sel => {
    sel.innerHTML = '<option value="">— Not specified —</option>' +
      genderOpts.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  });

  // Currencies (loan + savings product modals)
  const currOpts = currList.length
    ? currList.map(c => `<option value="${c.code}">${escapeHtml(c.code + ' — ' + c.name)}</option>`).join('')
    : '<option value="">No currencies configured</option>';
  ['lp-currency', 'sp-currency'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select currency…</option>' + currOpts;
  });

  // GL accounts
  const glOpts = glList.length
    ? glList.map(g => `<option value="${g.id}">${escapeHtml((g.glCode ? g.glCode + ' — ' : '') + g.name)}</option>`).join('')
    : '<option value="">No GL accounts found</option>';
  ['acc-rule-debit', 'acc-rule-credit', 'fa-glaccount-sel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Select account…</option>' + glOpts;
  });

  // Financial activities
  const faEl = document.getElementById('fa-activity-sel');
  if (faEl) faEl.innerHTML = '<option value="">Select activity…</option>' +
    faList.map(a => `<option value="${a.financialActivityData?.id || a.id}">${escapeHtml(a.financialActivityData?.name || a.name || '—')}</option>`).join('');
}
document.addEventListener('fc:modals-loaded', populateModalDropdowns);

