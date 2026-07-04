/* FinCraft · pages/clients/detail/notes-docs.js — documents and notes tab loaders.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';
import { can } from '../shared.js';

export async function loadClientDocuments(c, id) {
  const listEl = c.querySelector('#cl-doc-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const docs = await api.documents.list('clients', id);
    const list = Array.isArray(docs) ? docs : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Description</th><th>Type</th><th></th></tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${escapeHtml(d.name || '—')}</td>
            <td>${escapeHtml(d.description || '—')}</td>
            <td>${escapeHtml(d.type || d.fileName?.split('.').pop() || '—')}</td>
            <td class="text-right">
              <button class="btn-mini" data-doc-dl="${d.id}">Download</button>
              ${can('DELETE_DOCUMENT') ? `<button class="btn-mini btn-danger" data-doc-del="${d.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No documents uploaded yet</div>';

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
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
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
