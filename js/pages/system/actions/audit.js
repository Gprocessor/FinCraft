/* FinCraft · pages/system/actions/audit.js — audit trail detail modal.
   Auto-split from the original monolithic pages/system/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openEditJobModal(jobId, onSuccess) {
  let job = null;
  try { job = await api.jobs.get(jobId); } catch (e) {
    toast('error', 'Failed to load job', extractFineractError(e)); return;
  }
  const mid = 'edit-job-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Job</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(job?.displayName || job?.name || '—')}</div>
          <label>Cron expression * <input id="ej-cron" class="form-control" value="${escapeHtml(job?.cronExpression || '')}" required/></label>
          <label class="mt-2 checkbox-label">
            <input type="checkbox" id="ej-active" ${job?.active ? 'checked' : ''}/> Active
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ej-save">Save</button>
        </div>
      </div>
    </div>`);
  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  m.querySelector('#ej-save').addEventListener('click', async () => {
    const cronExpression = m.querySelector('#ej-cron').value.trim();
    const active = m.querySelector('#ej-active').checked;
    if (!cronExpression) { toast('warn', 'Enter a cron expression', ''); return; }
    try {
      await api.jobs.update(jobId, { cronExpression, active });
      m.remove(); toast('success', 'Job updated', ''); onSuccess?.();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openAuditDetail(auditId) {
  const mid = 'audit-detail-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>Audit Entry #${escapeHtml(String(auditId))}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="${mid}-body">
          <div class="empty-state-row">Loading…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  try {
    const audit = await api.audits.get(auditId);
    const body = document.getElementById(mid + '-body');
    let payload = '—';
    try {
      payload = audit.commandAsJson
        ? JSON.stringify(JSON.parse(audit.commandAsJson), null, 2)
        : '—';
    } catch {
      payload = String(audit.commandAsJson || '—');
    }

    body.innerHTML = `
      <div class="grid-2">
        <div>
          <dl class="dl-grid">
            <dt>Action</dt><dd>${escapeHtml(audit.actionName || '—')}</dd>
            <dt>Entity</dt><dd>${escapeHtml(audit.entityName || '—')}</dd>
            <dt>Resource ID</dt><dd>${escapeHtml(String(audit.resourceId || '—'))}</dd>
          </dl>
        </div>
        <div>
          <dl class="dl-grid">
            <dt>Maker</dt><dd>${escapeHtml(audit.maker || '—')}</dd>
            <dt>Made On</dt><dd>${fmtDate(audit.madeOnDate) || '—'}</dd>
            <dt>Status</dt><dd>${escapeHtml(audit.processingResult?.value || '—')}</dd>
          </dl>
        </div>
      </div>
      <h4 class="mt-3">Payload (commandAsJson)</h4>
      <pre style="background:var(--surface-1); padding:12px; border-radius:4px; max-height:400px; overflow:auto; font-family:monospace; font-size:12px">${escapeHtml(payload)}</pre>`;
  } catch (e) {
    document.getElementById(mid + '-body').innerHTML =
      `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}
