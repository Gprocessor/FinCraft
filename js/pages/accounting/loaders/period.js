/* FinCraft · pages/accounting/loaders/period.js — run accruals, GL closure, provisioning, and financial activities tab loaders.
   Auto-split from the original monolithic pages/accounting/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate } from '../../../utils.js';
import { openFAModal, openProvisioningModal, openProvisioningCategoryModal } from '../actions.js';
import { can } from '../shared.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadRunAccruals(c) {
  const el = c.querySelector('#acc-5');
  try {
    const entries = await api.provisioning.entries().catch(() => []);
    const recent = Array.isArray(entries) ? entries.slice(0, 5) : [];

    el.innerHTML = `
      <h3>Run Accruals</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Post periodic accruals up to a given date for all active loans. This applies to products configured with Accrual accounting.
      </div>

      <div class="form-grid">
        <label>Till date * <input type="date" id="acc-till" class="form-control" value="${today()}" required/></label>
      </div>

      <div class="mt-3">
        ${can('EXECUTE_PERIODICACCRUALACCOUNTING') ? `<button class="btn-primary" id="btn-run-accruals">Run Accruals</button>` : ''}
      </div>
      <div id="acc-run-result" class="mt-3"></div>

      <h3 class="mt-4">Recent Provisioning Entries</h3>
      ${recent.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th class="text-right">Amount</th></tr></thead>
          <tbody>${recent.map(e => `
            <tr>
              <td>${fmtDate(e.createdDate) || '—'}</td>
              <td class="text-right">${e.provisioningEntryAmount != null ? fmt(e.provisioningEntryAmount) : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No provisioning entries yet</div>'}`;

    el.querySelector('#btn-run-accruals')?.addEventListener('click', async () => {
      const tillDate = el.querySelector('#acc-till').value;
      if (!tillDate) { toast('warn', 'Select a date', ''); return; }
      const btn = el.querySelector('#btn-run-accruals');
      btn.disabled = true;
      const result = el.querySelector('#acc-run-result');
      result.innerHTML = '<div class="msg-banner b-info"><i class="fa-solid fa-circle-notch fa-spin"></i> Running accruals…</div>';
      try {
        await api.runAccruals.run(tillDate);
        result.innerHTML = '<div class="msg-banner b-success"><i class="fa-solid fa-check"></i> Accruals completed for ' + escapeHtml(tillDate) + '</div>';
        toast('success', 'Accruals completed', 'Up to ' + tillDate);
      } catch (e) {
        result.innerHTML = '<div class="text-error">' + escapeHtml(extractFineractError(e)) + '</div>';
        toast('error', 'Accruals failed', extractFineractError(e));
      }
      btn.disabled = false;
    });
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadGLClosure(c) {
  const el = c.querySelector('#acc-6');
  try {
    const officesRes = await api.offices.list().catch(() => []);
    const officeList = Array.isArray(officesRes) ? officesRes : [];
    const headOffice = officeList.find(o => o.hierarchy === '.') || officeList[0];
    const closures = headOffice ? await api.glClosures.list({ officeId: headOffice.id }) : [];
    const list = Array.isArray(closures) ? closures : [];
    const officeOpts = officeList.map(o => `<option value="${o.id}" ${o.id === headOffice?.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');

    el.innerHTML = `
      <h3>GL Closure</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Close the GL period for an office. After closure, no entries can be back-dated to before the closure date.
      </div>

      <div class="form-grid">
        <label>Office
          <select id="gl-close-office" class="form-control">
            ${officeOpts}
          </select>
        </label>
      </div>

      <div class="mt-3">
        ${can('CREATE_GLCLOSURE') ? `<button class="btn-danger" id="gl-close-btn"><i class="fa-solid fa-lock"></i> Close Period as of ${today()}</button>` : ''}
      </div>

      <h3 class="mt-4">Closure History</h3>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Office</th><th>Closing Date</th><th>Closed By</th><th>Comments</th></tr></thead>
          <tbody>${list.map(cl => `
            <tr>
              <td>${escapeHtml(cl.officeName || '—')}</td>
              <td>${fmtDate(cl.closingDate) || '—'}</td>
              <td>${escapeHtml(cl.createdByUsername || cl.lastModifiedByUsername || '—')}</td>
              <td>${escapeHtml(cl.comments || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No GL closures on record</div>'}`;

    el.querySelector('#gl-close-btn')?.addEventListener('click', async () => {
      const officeId = parseInt(el.querySelector('#gl-close-office')?.value) || headOffice?.id;
      const name = officeList.find(o => o.id === officeId)?.name || ('#' + officeId);
      if (!officeId) { toast('warn', 'No office selected', ''); return; }
      if (!await modalConfirm({
        title: 'Close GL period for ' + name + '?',
        message: 'As of ' + today() + '. This cannot be easily undone.',
        danger: true, confirmText: 'Close Period'
      })) return;
      try {
        await api.glClosures.create({
          closingDate: today(), officeId,
          comments: 'Manual closure',
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'GL period closed', today());
        loadGLClosure(c);
      } catch (e) { toast('error', 'GL closure failed', extractFineractError(e)); }
    });
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadProvisioning(c) {
  const el = c.querySelector('#acc-7');
  try {
    const [criteria, entries, categories] = await Promise.all([
      api.provisioning.criteria(),
      api.provisioning.entries().catch(() => []),
      api.provisioningCategory.list().catch(() => [])
    ]);
    const clist = Array.isArray(criteria) ? criteria : [];
    const elist = Array.isArray(entries) ? entries : [];
    const catlist = Array.isArray(categories) ? categories : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Provisioning</h3>
        <div>
          <span class="text-muted mr-2">${clist.length} criteria</span>
          ${elist.length && can('CREATE_PROVISIONJOURNALENTRIES') ? `<button class="btn-secondary" id="btn-prov-journal"><i class="fa-solid fa-receipt"></i> Create Journal Entry</button>` : ''}
          ${can('CREATE_PROVISIONENTRIES') ? `<button class="btn-secondary" id="btn-prov-entry"><i class="fa-solid fa-plus"></i> Create Provisioning Entry</button>` : ''}
          ${can('CREATE_PROVISIONCRITERIA') ? `<button class="btn-primary" id="btn-prov-new"><i class="fa-solid fa-plus"></i> New Criteria</button>` : ''}
        </div>
      </div>

      ${clist.length ? `
        <table class="table">
          <thead><tr>
            <th>Criteria Name</th><th>Created By</th><th></th>
          </tr></thead>
          <tbody>${clist.map(p => `
            <tr>
              <td>${escapeHtml(p.criteriaName || p.name || '—')}</td>
              <td>${escapeHtml(p.createdBy || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_PROVISIONCRITERIA') ? `<button class="btn-mini" data-edit-prov="${p.id}">Edit</button>` : ''}
                ${can('DELETE_PROVISIONCRITERIA') ? `<button class="btn-mini btn-danger" data-del-prov="${p.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No provisioning criteria</div>'}

      <div class="section-header mb-2 mt-4">
        <h3>Provisioning Categories</h3>
        <div>
          <span class="text-muted mr-2">${catlist.length} categor${catlist.length === 1 ? 'y' : 'ies'}</span>
          ${can('CREATE_PROVISIONCATEGORY') ? `<button class="btn-primary" id="btn-pcat-new"><i class="fa-solid fa-plus"></i> New Category</button>` : ''}
        </div>
      </div>
      ${catlist.length ? `
        <table class="table">
          <thead><tr><th>Category Name</th><th>Description</th><th></th></tr></thead>
          <tbody>${catlist.map(cat => `
            <tr>
              <td>${escapeHtml(cat.categoryName || cat.name || '—')}</td>
              <td>${escapeHtml(cat.categoryDescription || cat.description || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_PROVISIONCATEGORY') ? `<button class="btn-mini" data-edit-pcat="${cat.id}">Edit</button>` : ''}
                ${can('DELETE_PROVISIONCATEGORY') ? `<button class="btn-mini btn-danger" data-del-pcat="${cat.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No provisioning categories defined</div>'}`;

    el.querySelector('#btn-prov-new')?.addEventListener('click', () => openProvisioningModal(() => loadProvisioning(c)));
    el.querySelectorAll('[data-edit-prov]').forEach(b => b.addEventListener('click', () =>
      openProvisioningModal(() => loadProvisioning(c), b.dataset.editProv)));
    el.querySelector('#btn-prov-entry')?.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Create provisioning entry?', message: 'For all active loans.', confirmText: 'Create' })) return;
      try {
        await api.provisioning.createEntry({ dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Provisioning entry created', '');
        loadProvisioning(c);
      } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    });
    el.querySelector('#btn-prov-journal')?.addEventListener('click', async () => {
      const latest = elist[elist.length - 1];
      if (!latest) return;
      if (!await modalConfirm({ title: 'Create journal entries from provisioning entry #' + latest.id + '?', confirmText: 'Create JEs' })) return;
      try {
        await api.provisioning.createJournal(latest.id);
        toast('success', 'Journal entries created', '');
      } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
    });
    el.querySelectorAll('[data-del-prov]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete provisioning criteria?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.provisioning.deleteCriteria(b.dataset.delProv);
        toast('success', 'Deleted', '');
        loadProvisioning(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
    el.querySelector('#btn-pcat-new')?.addEventListener('click', () =>
      openProvisioningCategoryModal(() => loadProvisioning(c)));
    el.querySelectorAll('[data-edit-pcat]').forEach(b => b.addEventListener('click', () =>
      openProvisioningCategoryModal(() => loadProvisioning(c), catlist.find(cat => String(cat.id) === b.dataset.editPcat))));
    el.querySelectorAll('[data-del-pcat]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete provisioning category?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.provisioningCategory.delete(b.dataset.delPcat);
        toast('success', 'Category deleted', '');
        loadProvisioning(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadFinancialActivities(c) {
  const el = c.querySelector('#acc-8');
  try {
    const [fa, tpl] = await Promise.all([
      api.financialActivityAccounts.list(),
      api.financialActivityAccounts.template().catch(() => ({ financialActivityOptions: [] }))
    ]);
    const list = Array.isArray(fa) ? fa : [];
    const actOpts = (tpl?.financialActivityOptions || []).map(a => `<option value="${a.id}">${escapeHtml(a.name || a.value || '')}</option>`).join('');

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Financial Activity Mappings</h3>
        <div>
          <span class="text-muted mr-2">${list.length} mapping${list.length !== 1 ? 's' : ''}</span>
          ${can('CREATE_FINANCIALACTIVITYACCOUNT') ? `<button class="btn-primary" id="btn-fa-new"><i class="fa-solid fa-plus"></i> Add Mapping</button>` : ''}
        </div>
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Financial Activity</th><th>GL Account</th><th></th>
          </tr></thead>
          <tbody>${list.map(f => `
            <tr>
              <td>${escapeHtml(f.financialActivityData?.name || String(f.financialActivityId) || '—')}</td>
              <td>${escapeHtml(f.glAccountData?.name || '—')}</td>
              <td class="text-right">
                ${can('DELETE_FINANCIALACTIVITYACCOUNT') ? `<button class="btn-mini btn-danger" data-del-fa="${f.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No financial activity mappings</div>'}`;

    el.querySelector('#btn-fa-new')?.addEventListener('click', () => openFAModal(actOpts, () => loadFinancialActivities(c)));
    el.querySelectorAll('[data-del-fa]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete financial activity mapping?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.financialActivityAccounts.delete(b.dataset.delFa);
        toast('success', 'Deleted', '');
        loadFinancialActivities(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}
