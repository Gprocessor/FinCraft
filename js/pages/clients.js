/* FinCraft · clients.js — Live API */
import { api } from '../api.js';
import { num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { openModal, toast } from '../ui.js';

export async function render(c, params = {}) {
  if (params.view === 'detail') return renderDetail(c, params.id);
  return renderList(c);
}

async function renderList(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Clients</h1>
        <div class="page-subtitle"><span id="clients-count">—</span> clients across all offices</div></div>
      <div class="flex gap-2">
        <button class="btn-ghost" data-modal="bulkImportModal"><i class="fa-solid fa-file-import"></i> Bulk Import</button>
        <button class="btn-primary" data-modal="newClientModal"><i class="fa-solid fa-user-plus"></i> New Client</button>
      </div>
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control" id="cf-search" placeholder="Search by name or account…" />
        <select class="form-control" id="cf-status">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Closed">Closed</option>
          <option value="Rejected">Rejected</option>
          <option value="Withdrawn">Withdrawn</option>
        </select>
        <select class="form-control" id="cf-office"><option value="">All Offices</option></select>
        <span style="flex:1"></span>
        <button class="btn-ghost" id="cf-export"><i class="fa-solid fa-download"></i> Export</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th>Name</th><th>Account</th><th>Office</th><th>Officer</th><th>Status</th><th>Since</th><th></th></tr></thead>
        <tbody id="clients-rows"><tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading clients…</div></div></td></tr></tbody>
      </table></div>
      <div id="cf-pagination" class="flex justify-between items-center mt-4"></div>
    </div>
  </div>`;

  // Load offices for filter
  api.offices.list().then(offices => {
    const sel = c.querySelector('#cf-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allClients = [];
  let totalRecords = 0;
  let currentOffset = 0;
  const PAGE_SIZE = 50;

  async function loadClients(offset = 0) {
    c.querySelector('#clients-rows').innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const q = c.querySelector('#cf-search')?.value?.trim() || '';
      const status = c.querySelector('#cf-status')?.value || '';
      const officeId = c.querySelector('#cf-office')?.value || '';
      const params = { limit: PAGE_SIZE, offset };
      if (q) params.displayName = q;
      if (status) params.status = status.toLowerCase();
      if (officeId) params.officeId = officeId;

      const res = await api.clients.list(params);
      allClients = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? allClients.length;
      currentOffset = offset;
      c.querySelector('#clients-count').textContent = num(totalRecords);
      draw(allClients);
      drawPagination();
    } catch (e) {
      c.querySelector('#clients-rows').innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || 'Failed to load clients')}</div></div></td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#cf-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    const hasPrev = currentOffset > 0;
    const hasNext = to < totalRecords;
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="flex gap-2">
        <button class="btn-ghost btn-sm" id="cf-prev" ${hasPrev ? '' : 'disabled'}><i class="fa-solid fa-chevron-left"></i> Prev</button>
        <button class="btn-ghost btn-sm" id="cf-next" ${hasNext ? '' : 'disabled'}>Next <i class="fa-solid fa-chevron-right"></i></button>
      </div>`;
    c.querySelector('#cf-prev')?.addEventListener('click', () => loadClients(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#cf-next')?.addEventListener('click', () => loadClients(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#clients-rows').innerHTML = rows.map(cl => `
      <tr data-id="${cl.id}">
        <td><input type="checkbox"/></td>
        <td><div class="flex items-center gap-2" style="justify-content:flex-start"><div class="avatar">${ini(cl.displayName)}</div>${escapeHtml(cl.displayName || '—')}</div></td>
        <td class="mono">${escapeHtml(cl.accountNo || String(cl.id))}</td>
        <td>${escapeHtml(cl.officeName || '—')}</td>
        <td>${escapeHtml(cl.staffName || 'Unassigned')}</td>
        <td>${sb(cl.status?.value || cl.status || '—')}</td>
        <td>${fmtDate(cl.activationDate)}</td>
        <td>
          <button class="btn-ghost btn-sm" data-view-client="${cl.id}" title="View client">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-ghost btn-sm" data-activate-client="${cl.id}" title="Activate" style="${cl.status?.value === 'Pending' ? '' : 'display:none'}">
            <i class="fa-solid fa-check"></i>
          </button>
        </td>
      </tr>`).join('')
      || '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No clients match</div></div></td></tr>';

    c.querySelectorAll('[data-view-client]').forEach(b => b.addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('client-detail', { id: b.dataset.viewClient }));
    }));
    c.querySelectorAll('[data-activate-client]').forEach(b => b.addEventListener('click', async () => {
      const today = new Date().toISOString().split('T')[0];
      try {
        await api.clients.activate(b.dataset.activateClient, today);
        toast('success', 'Client activated', `#${b.dataset.activateClient} is now Active`);
        loadClients(currentOffset);
      } catch (e) {
        toast('error', 'Activation failed', e.message);
      }
    }));
  }

  await loadClients();

  let searchTimer;
  c.querySelector('#cf-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadClients(0), 400);
  });
  ['#cf-status', '#cf-office'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => loadClients(0));
  });

  c.querySelector('#cf-export').addEventListener('click', () => {
    const rows = allClients.map(cl => [cl.accountNo, cl.displayName, cl.officeName, cl.staffName, cl.status?.value, cl.activationDate].join(','));
    const csv = ['Account,Name,Office,Officer,Status,Since', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'clients.csv'; a.click();
    toast('success', 'Exported', 'clients.csv downloaded');
  });
}

async function renderDetail(c, id) {
  c.innerHTML = `<div class="page active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading client…</div></div></div>`;
  if (!id) { c.innerHTML = '<div class="card"><div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No client selected</div></div></div>'; return; }
  try {
    const cl = await api.clients.get(id, { associations: 'all' });
    const loans = await api.loans.list({ clientId: id }).catch(() => ({ pageItems: [] }));
    const savings = await api.savings.list({ clientId: id }).catch(() => ({ pageItems: [] }));
    const loanRows = (loans.pageItems || loans || []);
    const savingsRows = (savings.pageItems || savings || []);
    c.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div class="flex gap-3 items-center">
          <div id="cl-photo-wrap" style="width:56px;height:56px;border-radius:50%;background:var(--bg-elev,#1a2942);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            <i class="fa-solid fa-user" style="color:var(--text-3)"></i>
          </div>
          <div><h1 class="page-title">${escapeHtml(cl.displayName || cl.firstname || '')}</h1>
            <div class="page-subtitle">Account #${escapeHtml(cl.accountNo || '—')} · ${escapeHtml(cl.officeName || '')}</div></div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost" id="back-to-clients"><i class="fa-solid fa-arrow-left"></i> Back</button>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title mb-4">Client Details</h3>
          <div class="form-grid">
            <label><span class="form-label">Status</span><div>${escapeHtml(cl.status?.value || '—')}</div></label>
            <label><span class="form-label">Activation Date</span><div>${fmtDate(cl.activationDate) || '—'}</div></label>
            <label><span class="form-label">Office</span><div>${escapeHtml(cl.officeName || '—')}</div></label>
            <label><span class="form-label">Staff</span><div>${escapeHtml(cl.staffName || '—')}</div></label>
            <label><span class="form-label">Mobile</span><div>${escapeHtml(cl.mobileNo || '—')}</div></label>
            <label><span class="form-label">Gender</span><div>${escapeHtml(cl.gender?.name || '—')}</div></label>
          </div>
          <div class="mt-4">
            <label class="form-label">Profile Photo</label>
            <input type="file" id="cl-photo-input" accept="image/*" class="form-control"/>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title mb-4">Loan Accounts</h3>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead>
            <tbody>${loanRows.map(l => `<tr><td class="mono">${escapeHtml(l.accountNo||'')}</td><td>${escapeHtml(l.productName||l.loanProductName||'')}</td><td>${escapeHtml(l.status?.value||'')}</td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted" style="padding:16px">No loan accounts</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h3 class="card-title mb-4">Savings Accounts</h3>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead>
            <tbody>${savingsRows.map(s => `<tr><td class="mono">${escapeHtml(s.accountNo||'')}</td><td>${escapeHtml(s.productName||s.savingsProductName||'')}</td><td>${escapeHtml(s.status?.value||'')}</td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted" style="padding:16px">No savings accounts</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="card">
          <h3 class="card-title mb-4">Documents (KYC)</h3>
          <div id="cl-doc-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
          <form id="cl-doc-form" class="form-grid mt-4">
            <label><span class="form-label">Document name *</span><input name="name" required class="form-control" placeholder="e.g. National ID"/></label>
            <label><span class="form-label">Description</span><input name="description" class="form-control" placeholder="optional"/></label>
            <label class="full"><span class="form-label">File *</span><input name="file" type="file" required class="form-control"/></label>
            <label class="full"><button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload Document</button></label>
          </form>
        </div>
      </div>
    </div>`;
    c.querySelector('#back-to-clients').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('clients'));
    });
    loadClientPhoto(c, id);
    loadClientDocuments(c, id);
    c.querySelector('#cl-photo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        await api.images.upload('clients', id, fd);
        toast('success', 'Photo updated', file.name);
        loadClientPhoto(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message || String(err)); }
    });
    c.querySelector('#cl-doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      if (!fd.get('file') || !fd.get('file').name) { toast('warn', 'No file selected', 'Choose a file to upload'); return; }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await api.documents.upload('clients', id, fd);
        toast('success', 'Document uploaded', fd.get('name'));
        form.reset();
        loadClientDocuments(c, id);
      } catch (err) {
        toast('error', 'Upload failed', err.message || String(err));
      } finally { submitBtn.disabled = false; }
    });
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Failed to load client</b></div><div class="text-muted mt-2">${escapeHtml(e.message || String(e))}</div></div></div>`;
  }
}

// Fineract serves images from an authenticated endpoint, so a plain <img src="..."> tag
// can't be used (the browser won't attach the Basic Auth header) — fetch it as a blob instead.
async function loadClientPhoto(c, id) {
  const wrap = c.querySelector('#cl-photo-wrap');
  if (!wrap) return;
  try {
    const res = await api.images.get('clients', id);
    if (!res.ok) throw new Error('No photo');
    const blob = await res.blob();
    wrap.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="width:100%;height:100%;object-fit:cover"/>`;
  } catch {
    // No photo on file yet — leave the placeholder person icon as-is, this is expected
    // for most clients and not an error worth surfacing.
  }
}

async function loadClientDocuments(c, id) {
  const listEl = c.querySelector('#cl-doc-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const docs = await api.documents.list('clients', id);
    const list = Array.isArray(docs) ? docs : [];
    listEl.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Description</th><th>Type</th><th></th></tr></thead>
          <tbody>${list.map(d => `<tr>
            <td>${escapeHtml(d.name || '—')}</td>
            <td>${escapeHtml(d.description || '—')}</td>
            <td class="mono">${escapeHtml(d.type || d.fileName?.split('.').pop() || '—')}</td>
            <td>
              <button class="btn-ghost btn-sm" data-doc-dl="${d.id}" title="Download"><i class="fa-solid fa-download"></i></button>
              <button class="btn-ghost btn-sm" data-doc-del="${d.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-file-circle-question"></i><div>No documents uploaded yet</div></div>';

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
      if (!confirm('Delete this document? This cannot be undone.')) return;
      try {
        await api.documents.delete('clients', id, b.dataset.docDel);
        toast('success', 'Document deleted', '');
        loadClientDocuments(c, id);
      } catch (e) { toast('error', 'Delete failed', e.message || String(e)); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || String(e))}</div></div>`;
  }
}
