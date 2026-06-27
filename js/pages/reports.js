import { LOCALE, DATE_FORMAT } from '../config.js';

/* FinCraft · reports.js — Run + Manage reports (permission-gated, 2 sub-tabs) */
import { api } from '../api.js';
import { store } from '../store.js';
import { escapeHtml, fmtDate, num, sb } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const CATS = ['All', 'Client', 'Loan', 'Savings', 'Accounting', 'Audit', 'Custom'];
const ICONS = {
  Client: 'fa-users',
  Loan: 'fa-hand-holding-dollar',
  Savings: 'fa-piggy-bank',
  Accounting: 'fa-calculator',
  Audit: 'fa-clipboard-check',
  Custom: 'fa-star'
};

const OUTPUT_TYPES = [
  { id: 'HTML',  label: 'View in browser (HTML)' },
  { id: 'CSV',   label: 'CSV (Excel-compatible)' },
  { id: 'XLS',   label: 'Excel (XLS)' },
  { id: 'XLSX',  label: 'Excel (XLSX)' },
  { id: 'PDF',   label: 'PDF' }
];

const TABS = ['Run Reports', 'Manage Reports'];

// ── parameter dropdown caches ─────────────────────────────────────
let _offices = null, _staff = null, _currencies = null;
async function getOffices()    { return _offices    ||= await api.offices.list().catch(() => []); }
async function getStaff()      { return _staff      ||= await api.staff.list().catch(() => []); }
async function getCurrencies() { return _currencies ||= await api.currencies.list().catch(() => []); }

async function buildParamField(p) {
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

// ── CSV export helper ────────────────────────────────────────────
function exportCSV(reportName, columnHeaders, data) {
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

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Reports</h1>
        <div class="text-muted">Standard, ad-hoc &amp; custom report definitions</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="rep-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="rep-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="rep-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = { 0: loadRunReports, 1: loadManageReports };
  const loaded = {};

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    if (loaders[idx] && !loaded[idx]) { loaded[idx] = true; loadersc; }
  }));

  loadRunReports(c);
  loaded[0] = true;
}

// ════════════════════════════════════════════════════════════
// TAB 0 — RUN REPORTS (existing functionality, enhanced)
// ════════════════════════════════════════════════════════════
async function loadRunReports(c) {
  const el = c.querySelector('#rep-0');

  el.innerHTML = `
    <div class="filter-bar mb-3">
      <input id="rep-search" class="form-control" placeholder="Search reports…" autocomplete="off"/>
      <div id="rep-cat-tabs" style="display:flex; gap:6px">
        ${CATS.map((cat, i) => `<button class="btn-secondary btn-sm ${i === 0 ? 'btn-primary' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
      </div>
    </div>

    <div id="rep-grid" class="report-grid" style="display:none"></div>
    <div id="rep-loading" class="empty-state">
      <i class="fa-solid fa-circle-notch fa-spin"></i>
      <div>Loading reports…</div>
    </div>`;

  let reports = [];
  try {
    const res = await api.reports.list();
    reports = Array.isArray(res) ? res : [];
    el.querySelector('#rep-loading').style.display = 'none';
    el.querySelector('#rep-grid').style.display = 'grid';
  } catch (e) {
    el.querySelector('#rep-loading').innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    return;
  }

  let activeCat = 'All', searchQ = '', searchTimer;

  function draw() {
    let filtered = activeCat === 'All' ? reports : reports.filter(r => r.reportCategory === activeCat);
    if (searchQ) filtered = filtered.filter(r => r.reportName.toLowerCase().includes(searchQ));

    el.querySelector('#rep-grid').innerHTML = filtered.length ? filtered.map(r => `
      <div class="report-card">
        <div class="report-card-icon"><i class="fa-solid ${ICONS[r.reportCategory] || 'fa-file-chart-column'}"></i></div>
        <div class="report-card-body">
          <b>${escapeHtml(r.reportName)}</b>
          <div class="text-muted small">${escapeHtml(r.reportCategory || '—')} · ${escapeHtml(r.reportType || 'Table')}</div>
          ${r.description ? `<div class="text-muted small mt-1">${escapeHtml(r.description)}</div>` : ''}
        </div>
        <div class="report-card-actions">
          ${can('READ_REPORT') ? `<button class="btn-primary btn-sm" data-run-report="${r.id}" data-report-name="${escapeHtml(r.reportName)}">
            <i class="fa-solid fa-play"></i> Run
          </button>` : ''}
        </div>
      </div>`).join('') : '<div class="empty-state-row">No reports match</div>';

    el.querySelectorAll('[data-run-report]').forEach(btn => btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.runReport);
      const name = btn.dataset.reportName;
      openRunModal({ id, reportName: name });
    }));
  }
  draw();

  el.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    el.querySelectorAll('[data-cat]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    activeCat = btn.dataset.cat;
    draw();
  }));

  el.querySelector('#rep-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQ = e.target.value.toLowerCase(); draw(); }, 200);
  });
}

// ════════════════════════════════════════════════════════════
// RUN MODAL — now with output-type selector
// ════════════════════════════════════════════════════════════
async function openRunModal(report) {
  let reportDef;
  try { reportDef = await api.reports.get(report.id); } catch { reportDef = report; }

  const params = Array.isArray(reportDef.reportParameters) ? reportDef.reportParameters : [];
  const isPentaho = (reportDef.reportType || '').toLowerCase() === 'pentaho';

  const paramsHtml = params.length
    ? (await Promise.all(params.map(buildParamField))).join('')
    : '<div class="text-muted">No parameters required — click Run to fetch results.</div>';

  const mid = 'run-rep-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header"><h3>Run: ${escapeHtml(report.reportName)}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <form id="rp-param-form" class="form-grid">${paramsHtml}</form>

        <h4 class="mt-3">Output</h4>
        <div class="form-grid">
          <label>Output type
            <select id="rp-output-type" class="form-control">
              ${OUTPUT_TYPES.map(o => `<option value="${o.id}">${escapeHtml(o.label)}</option>`).join('')}
            </select>
          </label>
        </div>

        ${isPentaho ? `<div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          This is a Pentaho report. PDF and XLS outputs are rendered server-side.
        </div>` : ''}

        <div id="rp-result" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="rp-run-btn"><i class="fa-solid fa-play"></i> Run Report</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#rp-run-btn').addEventListener('click', () => runReport(modalEl, report.reportName));
}

async function runReport(modalEl, reportName) {
  const btn = modalEl.querySelector('#rp-run-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Running…';

  const outputType = modalEl.querySelector('#rp-output-type').value;
  const paramObj = {};
  modalEl.querySelectorAll('#rp-param-form [name]').forEach(input => {
    if (input.value) paramObj[input.name] = input.value;
  });
  paramObj.dateFormat = DATE_FORMAT;
  paramObj.locale = LOCALE;

  const resultEl = modalEl.querySelector('#rp-result');
  resultEl.style.display = '';

  try {
    if (outputType === 'HTML' || outputType === 'CSV') {
      // Inline render (CSV is shown as table + export button)
      const res = await api.runReports.run(reportName, { ...paramObj, 'output-type': 'JSON' });
      const cols = res.columnHeaders || [];
      const rows = res.data || [];

      resultEl.innerHTML = `
        <div class="section-header mt-3 mb-2">
          <span class="text-muted">${num(rows.length)} row(s)</span>
          <button class="btn-secondary btn-sm" id="rp-export"><i class="fa-solid fa-download"></i> Export CSV</button>
        </div>
        <div style="max-height:400px; overflow:auto; border:1px solid var(--border); border-radius:4px">
          <table class="table">
            <thead><tr>${cols.map(h => `<th>${escapeHtml(h.columnName || '')}</th>`).join('')}</tr></thead>
            <tbody>${rows.length ? rows.map(r => `
              <tr>${(r.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>
            `).join('') : `<tr><td colspan="${cols.length}" class="empty-state-row">No results</td></tr>`}</tbody>
          </table>
        </div>`;
      resultEl.querySelector('#rp-export')?.addEventListener('click', () => exportCSV(reportName, cols, rows));
    } else {
      // Binary download — XLS/XLSX/PDF
      const res = await api.runReports.run(reportName, { ...paramObj, 'output-type': outputType }, { raw: true });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const ext = outputType.toLowerCase();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = reportName.replace(/\s+/g, '_') + '.' + ext;
      a.click();
      resultEl.innerHTML = `
        <div class="msg-banner b-success mt-3">
          <i class="fa-solid fa-check"></i>
          ${outputType} downloaded: <b>${escapeHtml(a.download)}</b>
        </div>`;
    }
  } catch (e) {
    const msg = e.detail?.defaultUserMessage || e?.errors?.[0]?.defaultUserMessage || e.message || String(e);
    resultEl.innerHTML = `<div class="text-error mt-3">${escapeHtml(msg)}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-play"></i> Run Report';
}

// ════════════════════════════════════════════════════════════
// TAB 1 — MANAGE REPORTS (full CRUD — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadManageReports(c) {
  const el = c.querySelector('#rep-1');
  try {
    const res = await api.reports.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Manage Report Definitions</h3>
          <span class="text-muted">${num(list.length)} report${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_REPORT') ? `<button class="btn-primary" id="btn-new-report"><i class="fa-solid fa-plus"></i> New Report</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Custom report definitions are stored as SQL queries with parameter bindings. Edit existing definitions or create new ones.
      </div>

      <div class="filter-bar mb-2">
        <input id="mgr-search" class="form-control" placeholder="Search by name or category…" autocomplete="off"/>
        <select id="mgr-type-filter" class="form-control">
          <option value="">All types</option>
          <option value="Table">Table</option>
          <option value="Chart">Chart</option>
          <option value="Pentaho">Pentaho</option>
          <option value="SMS">SMS</option>
        </select>
        <select id="mgr-cat-filter" class="form-control">
          <option value="">All categories</option>
          ${CATS.filter(c => c !== 'All').map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>

      <div id="mgr-table-wrap"></div>`;

    function draw(rows) {
      el.querySelector('#mgr-table-wrap').innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Category</th><th>Type</th><th>Sub-type</th>
            <th>Use Report</th><th>Core Report</th><th></th>
          </tr></thead>
          <tbody>${rows.length ? rows.map(r => `
            <tr>
              <td><b>${escapeHtml(r.reportName)}</b>
                ${r.description ? `<div class="text-muted small">${escapeHtml(r.description)}</div>` : ''}
              </td>
              <td>${escapeHtml(r.reportCategory || '—')}</td>
              <td>${escapeHtml(r.reportType || '—')}</td>
              <td>${escapeHtml(r.reportSubType || '—')}</td>
              <td>${r.useReport ? sb('Yes') : sb('No')}</td>
              <td>${r.coreReport ? sb('Core') : sb('Custom')}</td>
              <td class="text-right">
                ${can('UPDATE_REPORT') ? `<button class="btn-mini" data-edit-rep="${r.id}">Edit</button>` : ''}
                ${can('DELETE_REPORT') && !r.coreReport ? `<button class="btn-mini btn-danger" data-del-rep="${r.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty-state-row">No reports match</td></tr>'}
          </tbody>
        </table>`;

      el.querySelectorAll('[data-edit-rep]').forEach(b => b.addEventListener('click', () =>
        openReportFormModal(b.dataset.editRep, () => loadManageReports(c))));

      el.querySelectorAll('[data-del-rep]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({
          title: 'Delete report definition?',
          message: 'Users will no longer be able to run this report.',
          danger: true, confirmText: 'Delete'
        })) return;
        try {
          await api.reports.delete(b.dataset.delRep);
          toast('success', 'Report deleted', '');
          loadManageReports(c);
        } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
      }));
    }

    function applyFilters() {
      const q = el.querySelector('#mgr-search').value.toLowerCase().trim();
      const type = el.querySelector('#mgr-type-filter').value;
      const cat = el.querySelector('#mgr-cat-filter').value;

      let filtered = list;
      if (q) filtered = filtered.filter(r =>
        r.reportName.toLowerCase().includes(q) ||
        (r.reportCategory || '').toLowerCase().includes(q));
      if (type) filtered = filtered.filter(r => r.reportType === type);
      if (cat)  filtered = filtered.filter(r => r.reportCategory === cat);

      draw(filtered);
    }

    let t;
    el.querySelector('#mgr-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 250); });
    el.querySelector('#mgr-type-filter').addEventListener('change', applyFilters);
    el.querySelector('#mgr-cat-filter').addEventListener('change', applyFilters);

    el.querySelector('#btn-new-report')?.addEventListener('click', () =>
      openReportFormModal(null, () => loadManageReports(c)));

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// REPORT FORM MODAL (Create + Edit)
// ════════════════════════════════════════════════════════════
async function openReportFormModal(reportId, onSuccess) {
  const isEdit = !!reportId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.reports.get(reportId); } catch { toast('error', 'Failed to load report', ''); return; }
  }

  const reportTypes = ['Table', 'Chart', 'Pentaho', 'SMS'];
  const reportCategories = CATS.filter(c => c !== 'All');

  const mid = 'rep-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Report Definition</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Report name * <input id="rf-name" class="form-control" value="${escapeHtml(existing.reportName || '')}" required ${isEdit && existing.coreReport ? 'disabled' : ''}/></label>
          <label>Report type *
            <select id="rf-type" class="form-control" required>
              <option value="">Select…</option>
              ${reportTypes.map(t => `<option value="${t}" ${existing.reportType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
          </label>
          <label>Sub-type
            <input id="rf-subtype" class="form-control" value="${escapeHtml(existing.reportSubType || '')}" placeholder="e.g. Bar, Line"/>
          </label>
          <label>Category
            <select id="rf-category" class="form-control">
              <option value="">Select…</option>
              ${reportCategories.map(c => `<option value="${c}" ${existing.reportCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          <label class="checkbox-row"><input type="checkbox" id="rf-use" ${existing.useReport ? 'checked' : ''}/> Use Report (active)</label>
          <label class="full">Description
            <textarea id="rf-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea>
          </label>
          <label class="full">SQL Query *
            <textarea id="rf-sql" class="form-control" rows="10" required placeholder="SELECT ... FROM ...">${escapeHtml(existing.reportSql || '')}</textarea>
          </label>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Parameter bindings use <code>\${paramName}</code> notation in the SQL query.
          Parameters defined here automatically appear in the Run dialog with appropriate input fields.
        </div>
        ${existing.coreReport ? `
          <div class="msg-banner b-warning mt-2">
            <i class="fa-solid fa-lock"></i>
            This is a core (system) report. Some fields are read-only.
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="rf-save">${isEdit ? 'Save Changes' : 'Create Report'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#rf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#rf-name').value.trim();
    const type = modalEl.querySelector('#rf-type').value;
    const sql = modalEl.querySelector('#rf-sql').value.trim();

    if (!name || !type || !sql) { toast('warn', 'Fill required fields', ''); return; }

    const payload = {};
    if (!existing.coreReport) payload.reportName = name;
    payload.reportType = type;
    payload.reportSql = sql;
    payload.useReport = modalEl.querySelector('#rf-use').checked;

    const subtype = modalEl.querySelector('#rf-subtype').value.trim();
    if (subtype) payload.reportSubType = subtype;
    const cat = modalEl.querySelector('#rf-category').value;
    if (cat) payload.reportCategory = cat;
    const desc = modalEl.querySelector('#rf-desc').value.trim();
    if (desc) payload.description = desc;

    try {
      if (isEdit) await api.reports.update(reportId, payload);
      else        await api.reports.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Report updated' : 'Report created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}