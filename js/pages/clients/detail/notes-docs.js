/* FinCraft · pages/clients/detail/notes-docs.js — documents and notes tab loaders.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability.
   Documents now render as a card grid; a new loadClientHistory loader powers the
   audit-trail half of the redesigned "Notes & History" tab. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';
import { can } from '../shared.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
const DOC_ICONS = { pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', xls: 'fa-file-excel', xlsx: 'fa-file-excel', jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image' };
function docIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  return DOC_ICONS[ext] || 'fa-file-lines';
}

export async function loadClientDocuments(c, id) {
  const listEl = c.querySelector('#cl-doc-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const docs = await api.documents.list('clients', id);
    const list = Array.isArray(docs) ? docs : [];
    listEl.innerHTML = list.length ? `
      <div class="cv-doc-grid">
        ${list.map(d => `
          <div class="cv-doc-card">
            <div class="cv-doc-icon"><i class="fa-solid ${docIcon(d.fileName || d.name)}"></i></div>
            <div class="cv-doc-name">${escapeHtml(d.name || d.fileName || '—')}</div>
            <div class="cv-doc-meta">${escapeHtml(d.description || d.type || 'Document')} · ${fmtDate(d.createdOn || d.updatedOn) || '—'}</div>
            <div class="cv-doc-foot">
              <button class="cv-doc-link" data-doc-dl="${d.id}"><i class="fa-solid fa-download"></i> Download</button>
              ${can('DELETE_DOCUMENT') ? `<button class="cv-doc-link" style="color:#a6392b" data-doc-del="${d.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '<div class="empty-state-row">No documents uploaded yet</div>';

    listEl.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.documents.download('clients', id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `document-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message || String(e)); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', message: 'This cannot be undone.', danger: true, confirmText: 'Delete' })) return;
      try { await api.documents.delete('clients', id, b.dataset.docDel); toast('success', 'Document deleted', ''); loadClientDocuments(c, id); }
      catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message || String(e))}</div>`; }
}

export async function loadClientNotes(c, id) {
  const listEl = c.querySelector('#cl-note-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const notes = await api.notes.list('clients', id);
    const list = Array.isArray(notes) ? notes : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Note</th><th>By</th><th>Date</th></tr></thead>
        <tbody>${list.map(n => `
          <tr>
            <td>${escapeHtml(n.note || '—')}</td>
            <td>${escapeHtml(n.createdByUsername || '—')}</td>
            <td>${fmtDate(n.createdOn) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No notes yet</div>';
  } catch { listEl.innerHTML = `<div class="text-error">Could not load notes</div>`; }
}

/* Powers the "History" half of the Notes & History tab — a read-only feed of maker-checker
   audit entries for this client, sourced from the same /audits search Admin > Audit Trail uses.
   Silently no-ops (and hides the section) for users without READ_AUDIT rather than erroring. */
export async function loadClientHistory(c, id) {
  const listEl = c.querySelector('#cl-history-list'); if (!listEl) return;
  const section = c.querySelector('#cl-history-section');
  if (!can('READ_AUDIT')) { if (section) section.hidden = true; return; }
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.audits.list({ resourceId: id, paged: true, limit: 25, orderBy: 'id', sortOrder: 'DESC' });
    const all = Array.isArray(res) ? res : (res?.pageItems || []);
    const list = all.filter(a => !a.entityName || /client/i.test(a.entityName));
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Action</th><th>By</th><th>Date</th><th>Result</th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>${escapeHtml((a.actionName || '—').replace(/_/g, ' '))}</td>
            <td>${escapeHtml(a.maker || a.makerId || '—')}</td>
            <td>${fmtDate(a.madeOnDate) || '—'}</td>
            <td>${escapeHtml(a.processingResult || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No audit history recorded for this client</div>';
  } catch {
    listEl.innerHTML = '<div class="empty-state-row">History unavailable</div>';
  }
}
