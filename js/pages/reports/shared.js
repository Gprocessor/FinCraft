/* FinCraft · pages/reports/shared.js — cached lookups (offices/staff/currencies), param field builder, CSV export.
   Auto-split from the original monolithic pages/reports.js for maintainability. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { escapeHtml } from '../../utils.js';

export const can = (code) => store.hasPermission(code);

export const CATS = ['All', 'Client', 'Loan', 'Savings', 'Accounting', 'Audit', 'Custom'];

export const ICONS = {
  Client: 'fa-users',
  Loan: 'fa-hand-holding-dollar',
  Savings: 'fa-piggy-bank',
  Accounting: 'fa-calculator',
  Audit: 'fa-clipboard-check',
  Custom: 'fa-star'
};

export const OUTPUT_TYPES = [
  { id: 'HTML',  label: 'View in browser (HTML)' },
  { id: 'CSV',   label: 'CSV (Excel-compatible)' },
  { id: 'XLS',   label: 'Excel (XLS)' },
  { id: 'XLSX',  label: 'Excel (XLSX)' },
  { id: 'PDF',   label: 'PDF' }
];

export const TABS = ['Run Reports', 'Manage Reports'];

let _offices = null, _staff = null, _currencies = null;

async function getOffices()    { return _offices    ||= await api.offices.list().catch(() => []); }

async function getStaff()      { return _staff      ||= await api.staff.list().catch(() => []); }

async function getCurrencies() { return _currencies ||= await api.currencies.list().catch(() => []); }

export async function buildParamField(p) {
  const id = 'rp-' + p.name;
  const lbl = p.variable || p.name;
  const nm = (p.name || '').toLowerCase();

  if (/officeid|branchid/i.test(nm)) {
    const offices = await getOffices();
    const list = Array.isArray(offices) ? offices : [];
    return `
      <label>${escapeHtml(lbl)}
        <select name="${escapeHtml(p.name)}" class="form-control" id="${id}">
          <option value="">All offices</option>
          ${list.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/staffid|officerid/i.test(nm)) {
    const staff = await getStaff();
    const list = Array.isArray(staff) ? staff : (staff?.pageItems || []);
    return `
      <label>${escapeHtml(lbl)}
        <select name="${escapeHtml(p.name)}" class="form-control" id="${id}">
          <option value="">All staff</option>
          ${list.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/currencycode/i.test(nm)) {
    const cur = await getCurrencies();
    const list = Array.isArray(cur) ? cur : (cur?.selectedCurrencyOptions || []);
    return `
      <label>${escapeHtml(lbl)}
        <select name="${escapeHtml(p.name)}" class="form-control" id="${id}">
          <option value="">All currencies</option>
          ${list.map(c => `<option value="${c.code}">${escapeHtml(c.code + ' — ' + c.name)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/date/i.test(nm)) {
    return `
      <label>${escapeHtml(lbl)}
        <input type="date" name="${escapeHtml(p.name)}" class="form-control" id="${id}"/>
      </label>`;
  }
  return `
    <label>${escapeHtml(lbl)}
      <input name="${escapeHtml(p.name)}" class="form-control" id="${id}"/>
    </label>`;
}

export function exportCSV(reportName, columnHeaders, data) {
  const headers = (columnHeaders || []).map(h => h.columnName || '').join(',');
  const rows = (data || []).map(row =>
    (row.row || []).map(v =>
      (typeof v === 'string' && v.includes(','))
        ? '"' + v.replace(/"/g, '""') + '"'
        : (v ?? '')
    ).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = reportName.replace(/\s+/g, '_') + '.csv';
  a.click();
}
