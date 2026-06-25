import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · clients.js — Full client lifecycle + sub-tabs */
import { api } from '../api.js';
import { num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { openModal, closeModal, toast, confirm } from '../ui.js';

export async function render(c, params = {}) {
  if (params.view === 'detail') return renderDetail(c, params.id);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
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

  api.offices.list().then(offices => {
    const sel = c.querySelector('#cf-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allClients = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  async function loadClients(offset = 0) {
    c.querySelector('#clients-rows').innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const q        = c.querySelector('#cf-search')?.value?.trim() || '';
      const status   = c.querySelector('#cf-status')?.value || '';
      const officeId = c.querySelector('#cf-office')?.value || '';
      const params   = { limit: PAGE_SIZE, offset };
      if (q)        params.displayName = q;
      if (status)   params.status = status.toLowerCase();
      if (officeId) params.officeId = officeId;
      const res  = await api.clients.list(params);
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
    const to   = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="flex gap-2">
        <button class="btn-ghost btn-sm" id="cf-prev" ${currentOffset > 0 ? '' : 'disabled'}><i class="fa-solid fa-chevron-left"></i> Prev</button>
        <button class="btn-ghost btn-sm" id="cf-next" ${to < totalRecords ? '' : 'disabled'}>Next <i class="fa-solid fa-chevron-right"></i></button>
      </div>`;
    c.querySelector('#cf-prev')?.addEventListener('click', () => loadClients(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#cf-next')?.addEventListener('click', () => loadClients(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#clients-rows').innerHTML = rows.map(cl => `
      <tr data-id="${cl.id}">
        <td><input type="checkbox"/></td>
        <td><div class="flex items-center gap-2" style="justify-content:flex-start">
          <div class="avatar">${ini(cl.displayName)}</div>${escapeHtml(cl.displayName || '—')}</div></td>
        <td class="mono">${escapeHtml(cl.accountNo || String(cl.id))}</td>
        <td>${escapeHtml(cl.officeName || '—')}</td>
        <td>${escapeHtml(cl.staffName || 'Unassigned')}</td>
        <td>${sb(cl.status?.value || cl.status || '—')}</td>
        <td>${fmtDate(cl.activationDate)}</td>
        <td>
          <button class="btn-ghost btn-sm" data-view-client="${cl.id}" title="View client"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-ghost btn-sm" data-activate-client="${cl.id}" title="Activate"
            style="${cl.status?.value === 'Pending' ? '' : 'display:none'}"><i class="fa-solid fa-check"></i></button>
        </td>
      </tr>`).join('')
      || '<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No clients match</div></div></td></tr>';

    c.querySelectorAll('[data-view-client]').forEach(b => b.addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('client-detail', { id: b.dataset.viewClient }));
    }));
    c.querySelectorAll('[data-activate-client]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.clients.activate(b.dataset.activateClient, today());
        toast('success', 'Client activated', `#${b.dataset.activateClient} is now Active`);
        loadClients(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.message); }
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
    const rows = allClients.map(cl =>
      [cl.accountNo, cl.displayName, cl.officeName, cl.staffName, cl.status?.value, cl.activationDate].join(','));
    const csv = ['Account,Name,Office,Officer,Status,Since', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'clients.csv'; a.click();
    toast('success', 'Exported', 'clients.csv downloaded');
  });
}

// ============================================================
// DETAIL VIEW
// ============================================================
async function renderDetail(c, id) {
  c.innerHTML = `<div class="page active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading client…</div></div></div>`;
  if (!id) { c.innerHTML = '<div class="card"><div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No client selected</div></div></div>'; return; }
  try {
    const [cl, loansRes, savingsRes] = await Promise.all([
      api.clients.get(id, { associations: 'all' }),
      api.loans.list({ clientId: id }).catch(() => ({ pageItems: [] })),
      api.savings.list({ clientId: id }).catch(() => ({ pageItems: [] }))
    ]);
    const loanRows    = loansRes?.pageItems   || loansRes   || [];
    const savingsRows = savingsRes?.pageItems || savingsRes || [];
    const status      = cl.status?.value || '';

    // Which lifecycle actions are available depends on current status
    const canClose      = status === 'Active';
    const canReactivate = status === 'Closed';
    const canReject     = status === 'Pending';
    const canWithdraw   = status === 'Pending';
    const canTransfer   = status === 'Active';

    c.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div class="flex gap-3 items-center">
          <div id="cl-photo-wrap" style="width:56px;height:56px;border-radius:50%;background:var(--bg-elev,#1a2942);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
            <i class="fa-solid fa-user" style="color:var(--text-3)"></i>
          </div>
          <div>
            <h1 class="page-title">${escapeHtml(cl.displayName || cl.firstname || '')}</h1>
            <div class="page-subtitle">Account #${escapeHtml(cl.accountNo || '—')} · ${escapeHtml(cl.officeName || '')}</div>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost" id="back-to-clients"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canClose      ? `<button class="btn-ghost" id="btn-close-client"><i class="fa-solid fa-times-circle"></i> Close</button>` : ''}
          ${canReactivate ? `<button class="btn-ghost" id="btn-reactivate-client"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>` : ''}
          ${canReject     ? `<button class="btn-ghost" id="btn-reject-client"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdraw   ? `<button class="btn-ghost" id="btn-withdraw-client"><i class="fa-solid fa-undo"></i> Withdraw</button>` : ''}
          ${canTransfer   ? `<button class="btn-ghost" id="btn-transfer-client"><i class="fa-solid fa-building-columns"></i> Transfer</button>` : ''}
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs mb-4">
        <button class="tab active" data-tab="cl-tab-overview">Overview</button>
        <button class="tab" data-tab="cl-tab-identifiers">Identifiers</button>
        <button class="tab" data-tab="cl-tab-family">Family</button>
        <button class="tab" data-tab="cl-tab-address">Address</button>
        <button class="tab" data-tab="cl-tab-docs">Documents</button>
        <button class="tab" data-tab="cl-tab-notes">Notes</button>
      </div>

      <!-- Overview tab -->
      <div class="tab-panel active" id="cl-tab-overview">
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title mb-4">Client Details</h3>
            <div class="form-grid">
              <label><span class="form-label">Status</span><div>${escapeHtml(status || '—')}</div></label>
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
              <tbody>${loanRows.map(l => `<tr>
                <td class="mono">${escapeHtml(l.accountNo||'')}</td>
                <td>${escapeHtml(l.productName||l.loanProductName||'')}</td>
                <td>${escapeHtml(l.status?.value||'')}</td>
              </tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted" style="padding:16px">No loan accounts</td></tr>'}
              </tbody>
            </table></div>
          </div>
          <div class="card">
            <h3 class="card-title mb-4">Savings Accounts</h3>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Product</th><th>Status</th></tr></thead>
              <tbody>${savingsRows.map(s => `<tr>
                <td class="mono">${escapeHtml(s.accountNo||'')}</td>
                <td>${escapeHtml(s.productName||s.savingsProductName||'')}</td>
                <td>${escapeHtml(s.status?.value||'')}</td>
              </tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted" style="padding:16px">No savings accounts</td></tr>'}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>

      <!-- Identifiers tab -->
      <div class="tab-panel" id="cl-tab-identifiers">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="card-title">ID Documents</h3>
            <button class="btn-primary btn-sm" id="btn-add-identifier"><i class="fa-solid fa-plus"></i> Add Identifier</button>
          </div>
          <div id="cl-identifier-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <!-- Family Members tab -->
      <div class="tab-panel" id="cl-tab-family">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="card-title">Family Members</h3>
            <button class="btn-primary btn-sm" id="btn-add-family"><i class="fa-solid fa-plus"></i> Add Member</button>
          </div>
          <div id="cl-family-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <!-- Address tab -->
      <div class="tab-panel" id="cl-tab-address">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="card-title">Addresses</h3>
            <button class="btn-primary btn-sm" id="btn-add-address"><i class="fa-solid fa-plus"></i> Add Address</button>
          </div>
          <div id="cl-address-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <!-- Documents tab -->
      <div class="tab-panel" id="cl-tab-docs">
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

      <!-- Notes tab -->
      <div class="tab-panel" id="cl-tab-notes">
        <div class="card">
          <h3 class="card-title mb-4">Notes</h3>
          <div id="cl-note-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
          <div class="flex gap-2 mt-3">
            <input id="cl-note-input" class="form-control" placeholder="Add a note…" style="flex:1"/>
            <button class="btn-primary btn-sm" id="cl-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>
    </div>`;

    // ---- Back ----
    c.querySelector('#back-to-clients').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('clients'));
    });

    // ---- Lifecycle action buttons ----
    c.querySelector('#btn-close-client')?.addEventListener('click', () => openLifecycleModal('close', id, c));
    c.querySelector('#btn-reactivate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reactivate client?', message: `Reactivate ${cl.displayName}? They will be set to Active.`, confirmText: 'Reactivate' })) return;
      try {
        await api.clients.reactivate(id, { dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Client reactivated', cl.displayName);
        import('../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Reactivation failed', e.message); }
    });
    c.querySelector('#btn-reject-client')?.addEventListener('click', () => openLifecycleModal('reject', id, c));
    c.querySelector('#btn-withdraw-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Withdraw application?', message: 'Mark this application as withdrawn by the client?', confirmText: 'Withdraw', danger: true })) return;
      try {
        await api.clients.withdraw(id, { dateFormat: DATE_FORMAT, locale: LOCALE, withdrawalDate: today() });
        toast('success', 'Application withdrawn', '');
        import('../router.js').then(r => r.navigate('clients'));
      } catch (e) { toast('error', 'Withdrawal failed', e.message); }
    });
    c.querySelector('#btn-transfer-client')?.addEventListener('click', () => openTransferModal(id, cl.displayName));

    // ---- Photo upload ----
    loadClientPhoto(c, id);
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

    // ---- Sub-tab loaders ----
    loadClientIdentifiers(c, id);
    loadClientFamilyMembers(c, id);
    loadClientAddresses(c, id);
    loadClientDocuments(c, id);
    loadClientNotes(c, id);

    // ---- Add identifier ----
    c.querySelector('#btn-add-identifier').addEventListener('click', () => openAddIdentifierModal(id, () => loadClientIdentifiers(c, id)));

    // ---- Add family member ----
    c.querySelector('#btn-add-family').addEventListener('click', () => openAddFamilyModal(id, () => loadClientFamilyMembers(c, id)));

    // ---- Add address ----
    c.querySelector('#btn-add-address').addEventListener('click', () => openAddAddressModal(id, () => loadClientAddresses(c, id)));

    // ---- Document upload ----
    c.querySelector('#cl-doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      if (!fd.get('file')?.name) { toast('warn', 'No file selected', 'Choose a file to upload'); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api.documents.upload('clients', id, fd);
        toast('success', 'Document uploaded', fd.get('name'));
        form.reset();
        loadClientDocuments(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message || String(err)); }
      finally { btn.disabled = false; }
    });

    // ---- Notes ----
    c.querySelector('#cl-note-save').addEventListener('click', async () => {
      const inp = c.querySelector('#cl-note-input');
      const note = inp.value.trim();
      if (!note) return;
      try {
        await api.notes.create('clients', id, { note });
        inp.value = '';
        loadClientNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed to add note', e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Failed to load client</b></div><div class="text-muted mt-2">${escapeHtml(e.message || String(e))}</div></div></div>`;
  }
}

// ============================================================
// LIFECYCLE MODALS (close / reject)
// ============================================================
function openLifecycleModal(command, id, c) {
  const titles = { close: 'Close Client', reject: 'Reject Application' };
  const labels = { close: 'Closed on *', reject: 'Rejected on *' };
  const dateFields = { close: 'closureDate', reject: 'rejectionDate' };

  const mid = `cl-lifecycle-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head">
          <h3 class="modal-title">${titles[command]}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">${labels[command]}</span>
              <input type="date" id="lc-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Reason</span>
              <textarea id="lc-reason" class="form-control" rows="2" placeholder="Optional reason"></textarea></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-danger" id="lc-confirm">${titles[command]}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#lc-confirm').addEventListener('click', async () => {
    const date   = el.querySelector('#lc-date').value;
    const reason = el.querySelector('#lc-reason').value;
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE, [dateFields[command]]: date };
    if (reason) payload.note = reason;
    try {
      if (command === 'close')  await api.clients.close(id, payload);
      if (command === 'reject') await api.clients.reject(id, payload);
      el.remove();
      toast('success', titles[command] + 'd', `Client #${id}`);
      import('../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', titles[command] + ' failed', e.message); }
  });
}

// ============================================================
// TRANSFER MODAL
// ============================================================
async function openTransferModal(id, displayName) {
  let offices = [];
  try { offices = await api.offices.list(); } catch {}

  const mid = `cl-transfer-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head">
          <h3 class="modal-title">Transfer Client</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p class="text-muted mb-4">Propose transfer of <b>${escapeHtml(displayName)}</b> to another office.</p>
          <div class="form-grid">
            <label class="full"><span class="form-label">Destination office *</span>
              <select id="tr-office" class="form-control" required>
                <option value="">Select office…</option>
                ${(Array.isArray(offices) ? offices : []).map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
              </select></label>
            <label class="full"><span class="form-label">Transfer date *</span>
              <input type="date" id="tr-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Note</span>
              <textarea id="tr-note" class="form-control" rows="2" placeholder="Optional transfer note"></textarea></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tr-confirm"><i class="fa-solid fa-building-columns"></i> Propose Transfer</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tr-confirm').addEventListener('click', async () => {
    const destOfficeId = el.querySelector('#tr-office').value;
    const transferDate = el.querySelector('#tr-date').value;
    const note         = el.querySelector('#tr-note').value;
    if (!destOfficeId) { toast('warn', 'Select an office', ''); return; }
    try {
      await api.clients.transfer(id, {
        destinationOfficeId: parseInt(destOfficeId),
        transferDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Transfer proposed', `Awaiting acceptance at destination office`);
      import('../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Transfer failed', e.message); }
  });
}

// ============================================================
// IDENTIFIERS
// ============================================================
async function loadClientIdentifiers(c, id) {
  const listEl = c.querySelector('#cl-identifier-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const items = await api.clients.identifiers(id);
    const list  = Array.isArray(items) ? items : [];
    listEl.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Document Key</th><th>Status</th><th>Description</th><th></th></tr></thead>
          <tbody>${list.map(i => `<tr>
            <td>${escapeHtml(i.documentType?.name || i.documentTypeName || '—')}</td>
            <td class="mono">${escapeHtml(i.documentKey || '—')}</td>
            <td>${escapeHtml(i.status?.value || '—')}</td>
            <td>${escapeHtml(i.description || '—')}</td>
            <td><button class="btn-ghost btn-sm" data-del-id="${i.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-id-card"></i><div>No identifiers on file</div></div>';
    listEl.querySelectorAll('[data-del-id]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete identifier?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.clients.deleteIdentifier(id, b.dataset.delId);
        toast('success', 'Identifier deleted', '');
        loadClientIdentifiers(c, id);
      } catch (e) { toast('error', 'Delete failed', e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAddIdentifierModal(clientId, onSuccess) {
  // Fetch document types from client template
  let docTypes = [];
  try {
    const tpl = await api.clients.template();
    docTypes = tpl?.clientNonPersonDetails?.constitutionOptions || tpl?.documentTypeOptions || [];
  } catch {}

  const mid = `cl-id-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head">
          <h3 class="modal-title">Add Identifier</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Document type *</span>
              <input id="id-doctype" class="form-control" placeholder="e.g. Passport, National ID, Driver's License" required/></label>
            <label class="full"><span class="form-label">Document key *</span>
              <input id="id-dockey" class="form-control" placeholder="Document number / ID value" required/></label>
            <label class="full"><span class="form-label">Description</span>
              <input id="id-desc" class="form-control" placeholder="Optional notes"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="id-save"><i class="fa-solid fa-check"></i> Add</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#id-save').addEventListener('click', async () => {
    const documentType = el.querySelector('#id-doctype').value.trim();
    const documentKey  = el.querySelector('#id-dockey').value.trim();
    const description  = el.querySelector('#id-desc').value.trim();
    if (!documentType || !documentKey) { toast('warn', 'Required fields missing', 'Enter document type and key'); return; }
    try {
      await api.clients.createIdentifier(clientId, { documentType, documentKey, ...(description && { description }) });
      el.remove();
      toast('success', 'Identifier added', documentKey);
      onSuccess();
    } catch (e) { toast('error', 'Failed to add identifier', e.message); }
  });
}

// ============================================================
// FAMILY MEMBERS
// ============================================================
async function loadClientFamilyMembers(c, id) {
  const listEl = c.querySelector('#cl-family-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const res  = await api.clients.familyMembers(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Relationship</th><th>Gender</th><th>Date of Birth</th><th>Is Dependent</th><th></th></tr></thead>
          <tbody>${list.map(m => `<tr>
            <td>${escapeHtml(m.firstName || '') + (m.lastName ? ' ' + escapeHtml(m.lastName) : '') || '—'}</td>
            <td>${escapeHtml(m.relationship?.name || m.relationshipType?.value || '—')}</td>
            <td>${escapeHtml(m.gender?.name || '—')}</td>
            <td>${fmtDate(m.dateOfBirth) || '—'}</td>
            <td>${m.isDependent ? 'Yes' : 'No'}</td>
            <td><button class="btn-ghost btn-sm" data-del-fam="${m.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-people-group"></i><div>No family members on file</div></div>';
    listEl.querySelectorAll('[data-del-fam]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove family member?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.clients.deleteFamilyMember(id, b.dataset.delFam);
        toast('success', 'Family member removed', '');
        loadClientFamilyMembers(c, id);
      } catch (e) { toast('error', 'Remove failed', e.message); }
    }));
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAddFamilyModal(clientId, onSuccess) {
  let relationships = [], genders = [];
  try {
    const tpl = await api.clients.template();
    relationships = tpl?.familyMemberOptions?.relationshipIdOptions || [];
    genders       = tpl?.familyMemberOptions?.genderIdOptions       || tpl?.genderOptions || [];
  } catch {}

  const relOpts    = relationships.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('') || '<option value="">Type manually below</option>';
  const genderOpts = genders.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('') || '';

  const mid = `cl-fam-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal lg">
        <div class="modal-head">
          <h3 class="modal-title">Add Family Member</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label><span class="form-label">First name *</span>
              <input id="fam-fname" class="form-control" required/></label>
            <label><span class="form-label">Last name</span>
              <input id="fam-lname" class="form-control"/></label>
            <label><span class="form-label">Relationship *</span>
              <select id="fam-rel" class="form-control" required>
                <option value="">Select…</option>${relOpts}
              </select></label>
            <label><span class="form-label">Gender</span>
              <select id="fam-gender" class="form-control">
                <option value="">— Not specified —</option>${genderOpts}
              </select></label>
            <label><span class="form-label">Date of birth</span>
              <input id="fam-dob" type="date" class="form-control"/></label>
            <label class="flex items-center gap-2" style="align-items:center">
              <input type="checkbox" id="fam-dependent"/> <span>Is dependent</span></label>
            <label class="full"><span class="form-label">Occupation</span>
              <input id="fam-occupation" class="form-control" placeholder="Optional"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="fam-save"><i class="fa-solid fa-check"></i> Add Member</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#fam-save').addEventListener('click', async () => {
    const firstName    = el.querySelector('#fam-fname').value.trim();
    const lastName     = el.querySelector('#fam-lname').value.trim();
    const relationshipId = el.querySelector('#fam-rel').value;
    const genderId     = el.querySelector('#fam-gender').value;
    const dateOfBirth  = el.querySelector('#fam-dob').value;
    const isDependent  = el.querySelector('#fam-dependent').checked;
    const occupation   = el.querySelector('#fam-occupation').value.trim();
    if (!firstName || !relationshipId) { toast('warn', 'Required fields missing', 'First name and relationship are required'); return; }
    try {
      await api.clients.createFamilyMember(clientId, {
        firstName, locale: LOCALE,
        ...(lastName     && { lastName }),
        ...(relationshipId && { relationshipId: parseInt(relationshipId) }),
        ...(genderId     && { genderId: parseInt(genderId) }),
        ...(dateOfBirth  && { dateOfBirth, dateFormat: DATE_FORMAT }),
        isDependent,
        ...(occupation   && { occupation })
      });
      el.remove();
      toast('success', 'Family member added', firstName);
      onSuccess();
    } catch (e) { toast('error', 'Failed to add family member', e.message); }
  });
}

// ============================================================
// ADDRESSES
// ============================================================
async function loadClientAddresses(c, id) {
  const listEl = c.querySelector('#cl-address-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const res  = await api.clients.addresses(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th>Street</th><th>City</th><th>Postal</th><th>Country</th><th>Active</th></tr></thead>
          <tbody>${list.map(a => `<tr>
            <td>${escapeHtml(a.addressType || a.addressTypeId || '—')}</td>
            <td>${escapeHtml(a.street || '—')}</td>
            <td>${escapeHtml(a.city || '—')}</td>
            <td>${escapeHtml(a.postalCode || '—')}</td>
            <td>${escapeHtml(a.countryName || a.country || '—')}</td>
            <td>${a.isActive ? 'Yes' : 'No'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-map-marker-alt"></i><div>No addresses on file</div></div>';
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAddAddressModal(clientId, onSuccess) {
  let addressTypes = [], countries = [];
  try {
    const tpl = await api.clients.addressTemplate();
    addressTypes = tpl?.addressTypeIdOptions || [];
    countries    = tpl?.countryIdOptions     || [];
  } catch {}

  const typeOpts    = addressTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  const countryOpts = countries.map(co => `<option value="${co.id}">${escapeHtml(co.name)}</option>`).join('');

  const mid = `cl-addr-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal lg">
        <div class="modal-head">
          <h3 class="modal-title">Add Address</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Address type *</span>
              <select id="addr-type" class="form-control" required>
                <option value="">Select type…</option>${typeOpts}
              </select></label>
            <label class="full"><span class="form-label">Street</span>
              <input id="addr-street" class="form-control" placeholder="Street address"/></label>
            <label><span class="form-label">City</span>
              <input id="addr-city" class="form-control" placeholder="City"/></label>
            <label><span class="form-label">Postal code</span>
              <input id="addr-postal" class="form-control" placeholder="Postal / ZIP"/></label>
            <label><span class="form-label">State / Province</span>
              <input id="addr-state" class="form-control" placeholder="State or province"/></label>
            <label><span class="form-label">Country</span>
              <select id="addr-country" class="form-control">
                <option value="">— Select country —</option>${countryOpts}
              </select></label>
            <label class="flex items-center gap-2" style="align-items:center">
              <input type="checkbox" id="addr-active" checked/> <span>Active address</span></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="addr-save"><i class="fa-solid fa-check"></i> Add Address</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#addr-save').addEventListener('click', async () => {
    const addressTypeId = el.querySelector('#addr-type').value;
    if (!addressTypeId) { toast('warn', 'Select address type', ''); return; }
    try {
      await api.clients.createAddress(clientId, {
        addressTypeId: parseInt(addressTypeId),
        street:      el.querySelector('#addr-street').value.trim()  || undefined,
        city:        el.querySelector('#addr-city').value.trim()    || undefined,
        postalCode:  el.querySelector('#addr-postal').value.trim()  || undefined,
        stateProvinceId: el.querySelector('#addr-state').value.trim() || undefined,
        countryId:   el.querySelector('#addr-country').value ? parseInt(el.querySelector('#addr-country').value) : undefined,
        isActive:    el.querySelector('#addr-active').checked
      });
      el.remove();
      toast('success', 'Address added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed to add address', e.message); }
  });
}

// ============================================================
// DOCUMENTS / PHOTO / NOTES (unchanged helpers)
// ============================================================
async function loadClientPhoto(c, id) {
  const wrap = c.querySelector('#cl-photo-wrap');
  if (!wrap) return;
  try {
    const res = await api.images.get('clients', id);
    if (!res.ok) throw new Error('No photo');
    const blob = await res.blob();
    wrap.innerHTML = `<img src="${URL.createObjectURL(blob)}" style="width:100%;height:100%;object-fit:cover"/>`;
  } catch { /* No photo — leave placeholder */ }
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

async function loadClientNotes(c, id) {
  const listEl = c.querySelector('#cl-note-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const notes = await api.notes.list('clients', id);
    const list  = Array.isArray(notes) ? notes : [];
    listEl.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Note</th><th>By</th><th>Date</th></tr></thead>
          <tbody>${list.map(n => `<tr>
            <td>${escapeHtml(n.note || '—')}</td>
            <td>${escapeHtml(n.createdByUsername || '—')}</td>
            <td>${fmtDate(n.createdOn) || '—'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="text-muted" style="padding:8px 0">No notes yet</div>';
  } catch {
    listEl.innerHTML = `<div class="text-muted" style="padding:8px 0">Could not load notes</div>`;
  }
}
