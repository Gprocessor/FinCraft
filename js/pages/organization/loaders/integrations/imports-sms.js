/* FinCraft · pages/organization/loaders/integrations/imports-sms.js — bulk imports and SMS campaigns tab loaders.
   Auto-split from the original monolithic pages/organization/loaders/integrations.js for maintainability. */

import { api } from '../../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../../config.js';
import { confirm as modalConfirm, toast } from '../../../../ui.js';
import { escapeHtml, fmtDate, num, sb } from '../../../../utils.js';
import { openEmailCampaignModal, openSmsCampaignModal } from '../../actions.js';
import { can } from '../../shared.js';

export async function loadBulkImports(c) {
  const el = c.querySelector('#og-13');
  try {
    // Try the canonical /imports endpoint first; fall back to a static set if not supported
    let entityTypes = [];
    try {
      const types = await api.bulkImports.types();
      entityTypes = Array.isArray(types) ? types : (types?.entityTypes || []);
    } catch {
      // Fallback to documented Fineract import entities
      entityTypes = [
        { entity: 'clients',                      label: 'Clients' },
        { entity: 'centers',                      label: 'Centers' },
        { entity: 'groups',                       label: 'Groups' },
        { entity: 'staff',                        label: 'Staff' },
        { entity: 'offices',                      label: 'Offices' },
        { entity: 'loans',                        label: 'Loans' },
        { entity: 'loanrepayments',               label: 'Loan Repayments' },
        { entity: 'savingsaccounts',              label: 'Savings Accounts' },
        { entity: 'savingstransactions',          label: 'Savings Transactions' },
        { entity: 'fixeddepositaccounts',         label: 'Fixed Deposit Accounts' },
        { entity: 'recurringdepositaccounts',     label: 'Recurring Deposit Accounts' },
        { entity: 'chartofaccounts',              label: 'Chart of Accounts' },
        { entity: 'journalentries',               label: 'Journal Entries' },
        { entity: 'shareaccounts',                label: 'Share Accounts' }
      ];
    }

    // Fetch import history (may not exist on all Fineract versions)
    let history = [];
    try {
      const r = await api.bulkImports.list({ limit: 50 });
      history = Array.isArray(r) ? r : (r?.pageItems || []);
    } catch {}

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Bulk Imports</h3>
          <span class="text-muted">${history.length} import${history.length !== 1 ? 's' : ''} in history</span>
        </div>
      </div>

      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Download an Excel template, fill it offline, then upload to create records in bulk. Status updates after the server processes the file.
      </div>

      <div class="card-inset mb-3" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4>New Import</h4>
        <div class="form-grid">
          <label>Entity type *
            <select id="imp-entity" class="form-control" required>
              <option value="">Select entity to import…</option>
              ${entityTypes.map(t => `<option value="${t.entity || t.entityType || t}">${escapeHtml(t.label || t.entityType || t.entity || t)}</option>`).join('')}
            </select>
          </label>
          <label>Office (filter for some imports)
            <select id="imp-office" class="form-control"><option value="">All offices</option></select>
          </label>
        </div>
        <div class="mt-3" style="display:flex; gap:8px; flex-wrap:wrap">
          ${can('READ_DOCUMENT') ? `<button class="btn-secondary" id="btn-imp-download"><i class="fa-solid fa-download"></i> Download Template</button>` : ''}
          ${can('CREATE_DOCUMENT') ? `<button class="btn-primary" id="btn-imp-upload"><i class="fa-solid fa-upload"></i> Upload Filled Template</button>` : ''}
        </div>
        <input type="file" id="imp-file" accept=".xlsx,.xls" hidden/>
      </div>

      <h4 class="mt-3">Import History</h4>
      ${history.length ? `
        <table class="table">
          <thead><tr>
            <th>Created</th><th>Entity</th><th>Status</th>
            <th class="text-right">Total Rows</th>
            <th class="text-right">Successful</th>
            <th class="text-right">Failed</th>
            <th></th>
          </tr></thead>
          <tbody>${history.map(h => `
            <tr>
              <td>${fmtDate(h.createdDate || h.importTime) || '—'}</td>
              <td>${escapeHtml(h.entity || h.entityType || '—')}</td>
              <td>${sb(h.completed ? 'Completed' : h.status || 'Processing')}</td>
              <td class="text-right">${num(h.totalRecords || h.total || 0)}</td>
              <td class="text-right text-success">${num(h.successfulRecords || h.successCount || 0)}</td>
              <td class="text-right text-error">${num(h.failedRecords || h.failureCount || 0)}</td>
              <td class="text-right">
                ${h.id ? `<button class="btn-mini" data-imp-download="${h.id}">Download Output</button>` : ''}
                ${h.id && can('DELETE_DOCUMENT') ? `<button class="btn-mini btn-danger" data-imp-del="${h.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No imports in history yet. Upload a template above to start.</div>'}`;

    // Populate office filter
    api.offices.list().then(offices => {
      const sel = el.querySelector('#imp-office');
      (Array.isArray(offices) ? offices : []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id; opt.textContent = o.name;
        sel.appendChild(opt);
      });
    }).catch(() => {});

    // Download template
    el.querySelector('#btn-imp-download')?.addEventListener('click', async () => {
      const entity = el.querySelector('#imp-entity').value;
      if (!entity) { toast('warn', 'Select an entity first', ''); return; }
      try {
        const res = await api.bulkImports.template(entity);
        // Fineract returns either a redirect URL or a binary blob depending on version
        if (typeof res === 'string' && res.startsWith('http')) {
          window.open(res, '_blank');
        } else if (res?.url) {
          window.open(res.url, '_blank');
        } else {
          // Treat as blob fallback
          const blob = new Blob([res], { type: 'application/vnd.ms-excel' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${entity}_import_template.xlsx`;
          a.click();
        }
        toast('success', 'Template downloaded', entity);
      } catch (e) { toast('error', 'Template download failed', e.detail?.defaultUserMessage || e.message); }
    });

    // Upload filled template
    el.querySelector('#btn-imp-upload')?.addEventListener('click', () => {
      const entity = el.querySelector('#imp-entity').value;
      if (!entity) { toast('warn', 'Select an entity first', ''); return; }
      el.querySelector('#imp-file').click();
    });

    el.querySelector('#imp-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const entity = el.querySelector('#imp-entity').value;
      const officeId = el.querySelector('#imp-office').value;

      const fd = new FormData();
      fd.append('file', file);
      fd.append('locale', LOCALE);
      fd.append('dateFormat', DATE_FORMAT);
      if (officeId) fd.append('officeId', officeId);

      try {
        toast('info', 'Uploading…', file.name);
        await api.bulkImports.upload(entity, fd);
        toast('success', 'Import queued', `${entity} · ${file.name}`);
        // Refresh history after a short delay so the server has time to register the import
        setTimeout(() => loadBulkImports(c), 2000);
      } catch (e) { toast('error', 'Upload failed', e.detail?.defaultUserMessage || e.message); }
      finally { ev.target.value = ''; }
    });

    // Download output (results) of a past import
    el.querySelectorAll('[data-imp-download]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.bulkImports.download(b.dataset.impDownload);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `import_${b.dataset.impDownload}_output.xlsx`;
        a.click();
        toast('success', 'Output downloaded', '');
      } catch (e) { toast('error', 'Download failed', e.detail?.defaultUserMessage || e.message); }
    }));

    // Delete a past import record
    el.querySelectorAll('[data-imp-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete import record?',
        message: 'Imported records remain — only the audit log entry is removed.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.bulkImports.delete(b.dataset.impDel);
        toast('success', 'Import record deleted', '');
        loadBulkImports(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadEmailCampaigns(c) {
  const el = c.querySelector('#og-16');
  try {
    const [campaignsRes, configRes] = await Promise.all([
      api.emailCampaigns.list(),
      api.emailConfiguration.list().catch(() => null)
    ]);
    const list = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.pageItems || []);
    const configList = Array.isArray(configRes) ? configRes : (configRes?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Email Campaigns</h3>
          <span class="text-muted">${list.length} campaign${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_EMAILCAMPAIGN') ? `<button class="btn-primary" id="btn-new-email"><i class="fa-solid fa-plus"></i> New Campaign</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Configure email notifications triggered by Fineract events (loan disbursal, repayment due, etc.).
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Campaign Name</th><th>Subject</th>
            <th>Type</th><th>Recipient</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(cmp => `
            <tr>
              <td><b>${escapeHtml(cmp.campaignName || cmp.name || '—')}</b></td>
              <td>${escapeHtml(cmp.emailSubject || '—')}</td>
              <td>${escapeHtml(cmp.campaignType?.value || cmp.campaignType || '—')}</td>
              <td>${escapeHtml(cmp.recipientType?.value || cmp.recipientType || '—')}</td>
              <td>${sb(cmp.campaignStatus?.value || (cmp.isActive ? 'Active' : 'Inactive'))}</td>
              <td class="text-right">
                ${cmp.campaignStatus?.value !== 'Active' && can('ACTIVATE_EMAILCAMPAIGN') ? `<button class="btn-mini btn-success" data-act-email="${cmp.id}">Activate</button>` : ''}
                ${cmp.campaignStatus?.value === 'Active' && can('CLOSE_EMAILCAMPAIGN') ? `<button class="btn-mini btn-warning" data-close-email="${cmp.id}">Close</button>` : ''}
                ${can('UPDATE_EMAILCAMPAIGN') ? `<button class="btn-mini" data-edit-email="${cmp.id}">Edit</button>` : ''}
                ${can('DELETE_EMAILCAMPAIGN') ? `<button class="btn-mini btn-danger" data-del-email="${cmp.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-envelope"></i>
          <h3>No email campaigns defined</h3>
          ${can('CREATE_EMAILCAMPAIGN') ? `<div class="text-muted mt-2">Create your first campaign to send automated email notifications.</div>` : ''}
        </div>`}

      <h3 class="mt-4">Email Configuration (SMTP)</h3>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Server settings used to send these emails. Distinct from the generic External Services → SMTP config.
      </div>
      ${configList.length ? `
        <table class="table">
          <tbody>${configList.map(cfg => `
            <tr><td>${escapeHtml(cfg.name || '—')}</td><td>${escapeHtml(cfg.value ?? '—')}</td></tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No email configuration returned by this Fineract instance</div>'}`;

    el.querySelector('#btn-new-email')?.addEventListener('click', () =>
      openEmailCampaignModal(null, () => loadEmailCampaigns(c)));

    el.querySelectorAll('[data-edit-email]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.emailCampaigns.get(b.dataset.editEmail);
        openEmailCampaignModal(existing, () => loadEmailCampaigns(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-act-email]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Activate campaign?', message: 'Notifications will start sending immediately.', confirmText: 'Activate' })) return;
      try {
        await api.emailCampaigns.activate(b.dataset.actEmail);
        toast('success', 'Campaign activated', '');
        loadEmailCampaigns(c);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-close-email]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Close campaign?', message: 'No further notifications will be sent.', danger: true, confirmText: 'Close' })) return;
      try {
        await api.emailCampaigns.close(b.dataset.closeEmail);
        toast('success', 'Campaign closed', '');
        loadEmailCampaigns(c);
      } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-email]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete campaign?', message: 'This permanently removes the campaign and its history.', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.emailCampaigns.delete(b.dataset.delEmail);
        toast('success', 'Campaign deleted', '');
        loadEmailCampaigns(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Email campaigns not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadSmsCampaigns(c) {
  const el = c.querySelector('#og-14');
  try {
    const res = await api.smsCampaigns.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>SMS Campaigns</h3>
          <span class="text-muted">${list.length} campaign${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_SMSCAMPAIGN') ? `<button class="btn-primary" id="btn-new-sms"><i class="fa-solid fa-plus"></i> New Campaign</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Configure SMS or email notifications triggered by Fineract events (loan disbursal, repayment due, etc.).
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Campaign Name</th><th>Type</th>
            <th>Trigger</th><th>Recipient</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(cmp => `
            <tr>
              <td><b>${escapeHtml(cmp.campaignName || cmp.name || '—')}</b></td>
              <td>${escapeHtml(cmp.campaignType?.value || cmp.campaignType || '—')}</td>
              <td>${escapeHtml(cmp.triggerType?.value || cmp.triggerType || '—')}</td>
              <td>${escapeHtml(cmp.recipientType?.value || cmp.recipientType || '—')}</td>
              <td>${sb(cmp.campaignStatus?.value || (cmp.isActive ? 'Active' : 'Inactive'))}</td>
              <td class="text-right">
                ${cmp.campaignStatus?.value !== 'Active' && can('ACTIVATE_SMSCAMPAIGN') ? `<button class="btn-mini btn-success" data-act-sms="${cmp.id}">Activate</button>` : ''}
                ${cmp.campaignStatus?.value === 'Active' && can('CLOSE_SMSCAMPAIGN') ? `<button class="btn-mini btn-warning" data-close-sms="${cmp.id}">Close</button>` : ''}
                ${can('UPDATE_SMSCAMPAIGN') ? `<button class="btn-mini" data-edit-sms="${cmp.id}">Edit</button>` : ''}
                ${can('DELETE_SMSCAMPAIGN') ? `<button class="btn-mini btn-danger" data-del-sms="${cmp.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-comment-sms"></i>
          <h3>No SMS campaigns defined</h3>
          ${can('CREATE_SMSCAMPAIGN') ? `<div class="text-muted mt-2">Create your first campaign to send automated SMS or email notifications.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-sms')?.addEventListener('click', () =>
      openSmsCampaignModal(null, () => loadSmsCampaigns(c)));

    el.querySelectorAll('[data-edit-sms]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.smsCampaigns.get(b.dataset.editSms);
        openSmsCampaignModal(existing, () => loadSmsCampaigns(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-act-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Activate campaign?', message: 'Notifications will start sending immediately.', confirmText: 'Activate' })) return;
      try {
        await api.smsCampaigns.activate(b.dataset.actSms);
        toast('success', 'Campaign activated', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-close-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Close campaign?', message: 'No further notifications will be sent.', danger: true, confirmText: 'Close' })) return;
      try {
        await api.smsCampaigns.close(b.dataset.closeSms);
        toast('success', 'Campaign closed', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete campaign?', message: 'This permanently removes the campaign and its history.', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.smsCampaigns.delete(b.dataset.delSms);
        toast('success', 'Campaign deleted', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">SMS campaigns not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
