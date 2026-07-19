/* FinCraft · pages/system/loaders/audit.js — audit trail and scheduled jobs tab loaders.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, fmtDate, num, sb } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openAuditDetail, openEditJobModal } from '../actions.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadAuditTrails(c) {
  const el = c.querySelector('#sy-1');
  el.innerHTML = '<div class="empty-state-row">Loading audit trails…</div>';
  try {
    const res = await api.audits.list({ limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} audit entries (most recent 100)</span>
        <input id="aud-search" class="form-control" placeholder="Search action, entity, maker…" style="max-width:300px"/>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Action</th><th>Entity</th><th>Resource</th>
            <th>Maker</th><th>Made On</th><th>Status</th><th></th>
          </tr></thead>
          <tbody id="aud-tbody">${list.map(a => `
            <tr class="aud-row">
              <td><b>${escapeHtml(a.actionName || '—')}</b></td>
              <td>${escapeHtml(a.entityName || '—')}</td>
              <td>${escapeHtml(a.resourceId ? String(a.resourceId) : '—')}</td>
              <td>${escapeHtml(a.maker || '—')}</td>
              <td>${fmtDate(a.madeOnDate) || '—'}</td>
              <td>${escapeHtml(a.processingResult?.value || '—')}</td>
              <td class="text-right">
                <button class="btn-mini" data-audit-id="${a.id}">View</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No audit trail records</div>'}`;

    el.querySelector('#aud-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.aud-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-audit-id]').forEach(b => b.addEventListener('click', () =>
      openAuditDetail(b.dataset.auditId)
    ));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadJobs(c) {
  const el = c.querySelector('#sy-4');
  el.innerHTML = '<div class="empty-state-row">Loading jobs…</div>';
  try {
    const jobs = await api.jobs.list();
    const list = Array.isArray(jobs) ? jobs : [];

    const canRun = can('EXECUTEJOB_SCHEDULER') || can('UPDATE_SCHEDULER');

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} scheduled job${list.length !== 1 ? 's' : ''}</span>
        <input id="job-search" class="form-control" placeholder="Search jobs…" style="max-width:300px"/>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Job</th><th>Cron</th><th>Last Run</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.flatMap(j => {
            const jobId = j.jobId || j.id;
            return [`
              <tr class="job-row">
                <td><b>${escapeHtml(j.displayName || j.name || '—')}</b></td>
                <td><code class="small">${escapeHtml(j.cronExpression || '—')}</code></td>
                <td>${fmtDate(j.lastRunHistory?.jobRunStartTime) || '—'}</td>
                <td>${j.currentlyRunning ? sb('Running') : sb('Idle')}</td>
                <td class="text-right">
                  <button class="btn-mini" data-job-history="${jobId}" data-job-name="${escapeHtml(j.displayName || j.name || '')}">History</button>
                  ${canRun ? `<button class="btn-mini btn-success" data-run-job="${jobId}">Run</button>` : ''}
                  ${can('UPDATE_SCHEDULER') ? `<button class="btn-mini" data-edit-job="${jobId}">Edit</button>` : ''}
                </td>
              </tr>
              <tr id="job-hist-${jobId}" style="display:none">
                <td colspan="5"><div id="job-hist-body-${jobId}"></div></td>
              </tr>`];
          }).join('')}
          </tbody>
        </table>` : '<div class="empty-state-row">No scheduled jobs</div>'}`;

    el.querySelector('#job-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.job-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-run-job]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Run job now?', confirmText: 'Run' })) return;
      try {
        await api.jobs.runJob(b.dataset.runJob);
        toast('success', 'Job triggered', 'Job #' + b.dataset.runJob + ' scheduled');
      } catch (e) {
        toast('error', 'Job failed', extractFineractError(e));
      }
    }));

    el.querySelectorAll('[data-edit-job]').forEach(b => b.addEventListener('click', () =>
      openEditJobModal(b.dataset.editJob, () => loadJobs(c))));

    el.querySelectorAll('[data-job-history]').forEach(b => b.addEventListener('click', async () => {
      const jid = b.dataset.jobHistory;
      const row = el.querySelector('#job-hist-' + jid);
      const body = el.querySelector('#job-hist-body-' + jid);
      if (row.style.display !== 'none') { row.style.display = 'none'; return; }
      row.style.display = '';
      body.innerHTML = '<div class="empty-state-row">Loading history…</div>';
      try {
        const res = await api.jobs.history(jid, { limit: 10 });
        const runs = Array.isArray(res) ? res : (res?.pageItems || []);
        body.innerHTML = runs.length ? `
          <div class="text-muted small mb-1">Run history &mdash; ${escapeHtml(b.dataset.jobName)}</div>
          <table class="table table-compact">
            <thead><tr><th>Started</th><th>Finished</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>${runs.map(r => `
              <tr>
                <td>${fmtDate(r.jobRunStartTime) || '—'}</td>
                <td>${fmtDate(r.jobRunEndTime) || '—'}</td>
                <td>${escapeHtml(r.status || '—')}</td>
                <td class="text-muted small">${escapeHtml(r.triggerType || r.jobRunErrorMessage || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state-row">No run history</div>';
      } catch (e) {
        body.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}
