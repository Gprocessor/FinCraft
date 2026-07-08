/* FinCraft · pages/deposits/detail/notes-docs.js — notes and documents tab loaders.
   Auto-split from the original monolithic pages/deposits/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';
import { can } from '../shared.js';

export async function loadDepositNotes(c, entityType, id) {
  const wrap = c.querySelector('#dep-notes-wrap');
  wrap.innerHTML = `
    <h3>Notes</h3>
    <div id="dep-note-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_SAVINGNOTE') ? `
      <div class="mt-3">
        <textarea id="dep-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
        <button class="btn-primary mt-2" id="dep-note-save"><i class="fa-solid fa-plus"></i> Add</button>
      </div>` : ''}`;

  wrap.querySelector('#dep-note-save')?.addEventListener('click', async () => {
    const inp = wrap.querySelector('#dep-note-input');
    const note = inp.value.trim();
    if (!note) return;
    try { await api.notes.create(entityType, id, { note }); inp.value = ''; loadDepositNotes(c, entityType, id); toast('success', 'Note added', ''); }
    catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });

  const listEl = wrap.querySelector('#dep-note-list');
  try {
    const notes = await api.notes.list(entityType, id);
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

export async function loadDepositDocuments(c, entityType, id) {
  const wrap = c.querySelector('#dep-docs-wrap');
  wrap.innerHTML = `
    <h3>Documents</h3>
    <div id="dep-doc-list"><div class="empty-state-row">Loading…</div></div>
    ${can('CREATE_DOCUMENT') ? `
      <form id="dep-doc-form" class="form-grid mt-3">
        <label>Name * <input name="name" class="form-control" required/></label>
        <label>Description <input name="description" class="form-control"/></label>
        <label class="full">File * <input type="file" name="file" required/></label>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
      </form>` : ''}`;

  wrap.querySelector('#dep-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; const fd = new FormData(form);
    if (!fd.get('file')?.name) { toast('warn', 'No file', ''); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.documents.upload(entityType, id, fd);
      toast('success', 'Document uploaded', fd.get('name'));
      form.reset();
      loadDepositDocuments(c, entityType, id);
    } catch (err) { toast('error', 'Upload failed', err.message); }
    finally { btn.disabled = false; }
  });

  const listEl = wrap.querySelector('#dep-doc-list');
  try {
    const docs = await api.documents.list(entityType, id);
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
        const res = await api.documents.download(entityType, id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `${entityType}-doc-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try { await api.documents.delete(entityType, id, b.dataset.docDel); toast('success', 'Deleted', ''); loadDepositDocuments(c, entityType, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
