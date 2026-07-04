/* FinCraft · pages/system/actions/audit.js — audit trail detail modal.
   Auto-split from the original monolithic pages/system/actions.js for maintainability. */

import { api } from '../../../api.js';
import { escapeHtml, fmtDate } from '../../../utils.js';

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
      `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}
