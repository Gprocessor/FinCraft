/* FinCraft · pages/reports/manage-reports.js — manage-reports tab: report list and create/edit modal.
   Auto-split from the original monolithic pages/reports.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { CATS, can } from './shared.js';

export async function loadManageReports(c) {
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
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
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
