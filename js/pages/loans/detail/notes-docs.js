/* FinCraft · pages/loans/detail/notes-docs.js — notes and documents tab loaders.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';

export async function loadLoanNotes(c, loanId) {
  const wrap = c.querySelector('#ln-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="ln-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_LOANNOTE') ? `
      <div class="mt-3">
        <textarea id="ln-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="ln-note-save"><i class="fa-solid fa-plus"></i> Add Note</button>
      </div>` : ''}`;

  wrap.querySelector('#ln-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#ln-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try {
      await api.notes.create('loans', loanId, { note });
      inp.value = '';
      loadLoanNotes(c, loanId);
      toast('success', 'Note added', '');
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#ln-note-list');
  try {
    const notes = await api.notes.list('loans', loanId);
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
  } catch { listEl.innerHTML = '<div class="text-error">Could not load notes</div>'; }
}

export async function loadLoanDocuments(c, loanId) {
  const wrap = c.querySelector('#ln-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="ln-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="ln-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#ln-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file'); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload('loans', loanId, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadLoanDocuments(c, loanId);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#ln-doc-list');
  try {
    const docs = await api.documents.list('loans', loanId);
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
      </table>` : '<div class="empty-state-row">No documents yet</div>';

    listEl.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.documents.download('loans', loanId, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `loan-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.documents.delete('loans', loanId, b.dataset.docDel);
        toast('success', 'Document deleted', '');
        loadLoanDocuments(c, loanId);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
