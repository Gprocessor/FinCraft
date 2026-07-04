/* FinCraft · pages/savings/detail/notes-docs.js — notes and documents tab loaders.
   Auto-split from the original monolithic pages/savings/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';
import { can } from '../shared.js';

export async function loadSavingsNotes(c, id) {
  const wrap = c.querySelector('#sv-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="sv-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_NOTE') ? `
      <div class="mt-3">
        <textarea id="sv-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="sv-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>` : ''}`;

  wrap.querySelector('#sv-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#sv-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try { await api.notes.create('savings', id, { note }); inp.value = ''; loadSavingsNotes(c, id); toast('success', 'Note added', ''); }
    catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#sv-note-list');
  try {
    const notes = await api.notes.list('savings', id);
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

export async function loadSavingsDocuments(c, id) {
  const wrap = c.querySelector('#sv-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="sv-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="sv-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#sv-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file'); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload('savingsaccounts', id, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadSavingsDocuments(c, id);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#sv-doc-list');
  try {
    const docs = await api.documents.list('savingsaccounts', id);
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
        const res = await api.documents.download('savingsaccounts', id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `savings-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.documents.delete('savingsaccounts', id, b.dataset.docDel);
        toast('success', 'Deleted', '');
        loadSavingsDocuments(c, id);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
