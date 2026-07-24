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
  // AUDIT FIX (Reports RP-02): Fineract's GET /reports/{id} returns each parameter as
  // { id, parameterId, parameterName, reportParameterName } — there is NO `name` field.
  // The old code read p.name (always undefined), so every field rendered with a blank
  // label AND fell through to the plain text input (no office/staff/date/currency widget) —
  // exactly the reported "parameter details don't show + types not enforced" symptom.
  //   • reportParameterName  = the SQL substitution key (e.g. "officeId") → used to build R_<key>
  //   • parameterName        = the descriptive definition name (e.g. "OfficeIdSelectOne") → best
  //                            source for type detection
  // We also bake the R_ prefix into the input's `name` attribute so runReport()'s [name]
  // collector sends the keys Fineract actually expects (spec: R_officeId, R_fromDate, …);
  // previously the raw, unprefixed keys were silently ignored (filters had no effect).
  // NOTE: the OpenAPI ReportParameterData schema is empty, so field names are per Fineract's
  // documented report-parameter shape — verify against your target server. Fallbacks across
  // reportParameterName/parameterName/name keep it working regardless of exact casing.
  const rpName  = p.reportParameterName || p.parameterName || p.name || '';
  const key     = rpName ? (rpName.startsWith('R_') ? rpName : 'R_' + rpName) : '';
  const nm      = (p.parameterName || p.reportParameterName || p.name || '').toLowerCase();
  const humanize = (s) => s.replace(/^R_/, '')
                           .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                           .replace(/[_-]+/g, ' ')
                           .replace(/\bid\b/i, 'ID')
                           .replace(/^./, ch => ch.toUpperCase())
                           .trim();
  const lbl = p.variable || p.parameterLabel || (rpName ? humanize(rpName) : 'Parameter');
  const id  = 'rp-' + (rpName || Math.random().toString(36).slice(2));
  const nameAttr = escapeHtml(key);

  if (/officeid|branchid/i.test(nm)) {
    const offices = await getOffices();
    const list = Array.isArray(offices) ? offices : [];
    return `
      <label>${escapeHtml(lbl)}
        <select name="${nameAttr}" class="form-control" id="${id}">
          <option value="">All offices</option>
          ${list.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/staffid|officerid|loanofficer/i.test(nm)) {
    const staff = await getStaff();
    const list = Array.isArray(staff) ? staff : (staff?.pageItems || []);
    return `
      <label>${escapeHtml(lbl)}
        <select name="${nameAttr}" class="form-control" id="${id}">
          <option value="">All staff</option>
          ${list.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/currency/i.test(nm)) {
    const cur = await getCurrencies();
    const list = Array.isArray(cur) ? cur : (cur?.selectedCurrencyOptions || []);
    return `
      <label>${escapeHtml(lbl)}
        <select name="${nameAttr}" class="form-control" id="${id}">
          <option value="">All currencies</option>
          ${list.map(c => `<option value="${c.code}">${escapeHtml(c.code + ' — ' + c.name)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (/date/i.test(nm)) {
    return `
      <label>${escapeHtml(lbl)}
        <input type="date" name="${nameAttr}" class="form-control" id="${id}"/>
      </label>`;
  }
  if (/^select|selectall|selectone/i.test(nm) || /\bid$/i.test(rpName)) {
    // Unknown *SelectAll/*SelectOne or *Id parameter with no cached lookup — render a
    // numeric input so at least the type is hinted rather than a free-text box.
    return `
      <label>${escapeHtml(lbl)}
        <input type="number" name="${nameAttr}" class="form-control" id="${id}"/>
      </label>`;
  }
  return `
    <label>${escapeHtml(lbl)}
      <input name="${nameAttr}" class="form-control" id="${id}"/>
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
