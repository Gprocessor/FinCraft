/* FinCraft · pages/reports/run-reports.js — run-reports tab: report picker, run modal, execution.
   Auto-split from the original monolithic pages/reports.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';
import { escapeHtml, num } from '../../utils.js';
import { render } from './index.js';
import { CATS, ICONS, OUTPUT_TYPES, buildParamField, can, exportCSV } from './shared.js';

export async function loadRunReports(c) {
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
