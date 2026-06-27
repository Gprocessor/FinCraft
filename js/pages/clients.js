import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · clients.js — Full client lifecycle + sub-tabs (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { num, ini, sb, escapeHtml, fmt, fmtDate } from '../utils.js';
import { openModal, closeModal, toast, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

export async function render(c, params = {}) {
  if (params.view === 'detail') return renderDetail(c, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Clients</h1>
        <div class="text-muted"><span id="clients-count">—</span> clients across all offices</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_CLIENT') ? `
          <button class="btn-secondary" data-modal="bulkImportModal"><i class="fa-solid fa-file-arrow-up"></i> Bulk Import</button>
          <button class="btn-primary" data-modal="newClientModal"><i class="fa-solid fa-plus"></i> New Client</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="cf-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="cf-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <select id="cf-office" class="form-control"><option value="">All Offices</option></select>
        <button class="btn-secondary" id="cf-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th></th><th>Name</th><th>Account</th><th>Office</th>
          <th>Officer</th><th>Status</th><th>Since</th><th></th>
        </tr></thead>
        <tbody id="clients-rows">
          <tr><td colspan="8" class="empty-state-row">Loading clients…</td></tr>
        </tbody>
      </table>
      <div id="cf-pagination" class="pagination-bar"></div>
    </div>`;

  // Office filter
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
    c.querySelector('#clients-rows').innerHTML =
      '<tr><td colspan="8" class="empty-state-row">Loading…</td></tr>';
    try {
      const q       = c.querySelector('#cf-search')?.value?.trim() || '';
      const status  = c.querySelector('#cf-status')?.value || '';
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
      c.querySelector('#clients-rows').innerHTML =
        `<tr><td colspan="8" class="text-error">${escapeHtml(e.message || 'Failed to load clients')}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#cf-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="cf-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="cf-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#cf-prev')?.addEventListener('click', () => loadClients(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#cf-next')?.addEventListener('click', () => loadClients(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#clients-rows').innerHTML = rows.map(cl => `
      <tr>
        <td><div class="avatar">${ini(cl.displayName)}</div></td>
        <td><a href="#" data-view-client="${cl.id}"><b>${escapeHtml(cl.displayName || '—')}</b></a></td>
        <td>${escapeHtml(cl.accountNo || String(cl.id))}</td>
        <td>${escapeHtml(cl.officeName || '—')}</td>
        <td>${escapeHtml(cl.staffName || 'Unassigned')}</td>
        <td>${sb(cl.status?.value || cl.status || '—')}</td>
        <td>${fmtDate(cl.activationDate)}</td>
        <td class="text-right">
          ${(cl.status?.value === 'Pending' && can('ACTIVATE_CLIENT')) ?
            `<button class="btn-mini btn-success" data-activate-client="${cl.id}">Activate</button>` : ''}
        </td>
      </tr>`).join('') ||
      '<tr><td colspan="8" class="empty-state-row">No clients match</td></tr>';

    c.querySelectorAll('[data-view-client]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../router.js').then(r => r.navigate('client-detail', { id: b.dataset.viewClient }));
    }));
    c.querySelectorAll('[data-activate-client]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.clients.activate(b.dataset.activateClient, today());
        toast('success', 'Client activated', `#${b.dataset.activateClient} is now Active`);
        loadClients(currentOffset);
      } catch (e) {
        toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message);
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
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading client…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No client selected</div>'; return; }

  try {
    const cl = await api.clients.get(id, { associations: 'all' });
    const status = cl.status?.value || '';

    // Status-aware command availability
    const canActivate   = status === 'Pending'   && can('ACTIVATE_CLIENT');
    const canClose      = status === 'Active'    && can('CLOSE_CLIENT');
    const canReactivate = status === 'Closed'    && can('REACTIVATE_CLIENT');
    const canReject     = status === 'Pending'   && can('REJECT_CLIENT');
    const canWithdraw   = status === 'Pending'   && can('WITHDRAW_CLIENT');
    const canTransfer   = status === 'Active'    && can('PROPOSETRANSFER_CLIENT');
    const canUndoTransfer = (cl.transferToOfficeId || status === 'Transfer in progress') && can('UNDOTRANSFER_CLIENT');
    const canEdit       = can('UPDATE_CLIENT');
    const canAssign     = can('UPDATECLIENTSAVINGACCOUNT_CHECKER') || can('ASSIGN_STAFF_CLIENT') || can('UPDATE_CLIENT');
    const canMarkFraud  = can('UPDATE_CLIENT');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(cl.displayName || cl.firstname || '')}</h1>
          <div class="text-muted">
            Account #${escapeHtml(cl.accountNo || '—')} · ${escapeHtml(cl.officeName || '')}
            · ${sb(status || '—')}
            ${cl.isStaff ? '· <span class="badge b-info">Staff</span>' : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="back-to-clients"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit       ? `<button class="btn-secondary" id="btn-edit-client"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canActivate   ? `<button class="btn-success"   id="btn-activate-client"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canClose      ? `<button class="btn-danger"    id="btn-close-client"><i class="fa-solid fa-circle-xmark"></i> Close</button>` : ''}
          ${canReactivate ? `<button class="btn-success"   id="btn-reactivate-client"><i class="fa-solid fa-rotate-right"></i> Reactivate</button>` : ''}
          ${canReject     ? `<button class="btn-warning"   id="btn-reject-client"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
          ${canWithdraw   ? `<button class="btn-secondary" id="btn-withdraw-client"><i class="fa-solid fa-rotate-left"></i> Withdraw</button>` : ''}
          ${canTransfer   ? `<button class="btn-secondary" id="btn-transfer-client"><i class="fa-solid fa-right-left"></i> Transfer</button>` : ''}
          ${canUndoTransfer ? `<button class="btn-warning" id="btn-undotransfer-client"><i class="fa-solid fa-undo"></i> Undo Transfer</button>` : ''}
          ${canAssign     ? `<button class="btn-secondary" id="btn-assign-staff"><i class="fa-solid fa-user-tag"></i> Staff</button>` : ''}
          ${canMarkFraud  ? `<button class="btn-danger"    id="btn-mark-fraud"><i class="fa-solid fa-triangle-exclamation"></i> Mark as Fraud</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="cl-tabs">
          <button class="tab" data-cltab="overview">Overview</button>
          <button class="tab" data-cltab="accounts">Accounts</button>
          ${can('READ_CLIENTCHARGE')        ? `<button class="tab" data-cltab="charges">Charges</button>` : ''}
          ${can('READ_CLIENT')              ? `<button class="tab" data-cltab="transactions">Transactions</button>` : ''}
          ${can('READ_CLIENTIDENTIFIER')    ? `<button class="tab" data-cltab="identifiers">Identifiers</button>` : ''}
          ${can('READ_CLIENTFAMILYMEMBER')  ? `<button class="tab" data-cltab="family">Family</button>` : ''}
          ${can('READ_CLIENTADDRESS')       ? `<button class="tab" data-cltab="address">Address</button>` : ''}
          ${can('READ_STANDINGINSTRUCTION') ? `<button class="tab" data-cltab="si">Standing Instructions</button>` : ''}
          ${can('READ_DOCUMENT')            ? `<button class="tab" data-cltab="documents">Documents</button>` : ''}
          ${can('READ_NOTE')                ? `<button class="tab" data-cltab="notes">Notes</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-clpanel="overview">
          <div class="grid-2">
            <div>
              <h3>Client Details</h3>
              <dl class="dl-grid">
                <dt>Status</dt><dd>${sb(status || '—')}</dd>
                <dt>Activation Date</dt><dd>${fmtDate(cl.activationDate) || '—'}</dd>
                <dt>Submitted</dt><dd>${fmtDate(cl.timeline?.submittedOnDate) || '—'}</dd>
                <dt>Office</dt><dd>${escapeHtml(cl.officeName || '—')}</dd>
                <dt>Staff</dt><dd>${escapeHtml(cl.staffName || 'Unassigned')}</dd>
                <dt>Mobile</dt><dd>${escapeHtml(cl.mobileNo || '—')}</dd>
                <dt>Email</dt><dd>${escapeHtml(cl.emailAddress || '—')}</dd>
                <dt>Gender</dt><dd>${escapeHtml(cl.gender?.name || '—')}</dd>
                <dt>Date of Birth</dt><dd>${fmtDate(cl.dateOfBirth) || '—'}</dd>
                <dt>External ID</dt><dd>${escapeHtml(cl.externalId || '—')}</dd>
              </dl>
            </div>
            <div>
              <h3>Profile Photo</h3>
              <div id="cl-photo-wrap" class="photo-frame">
                <div class="avatar avatar-xl">${ini(cl.displayName)}</div>
              </div>
              ${canEdit ? `<label class="btn-secondary mt-2">
                <i class="fa-solid fa-camera"></i> Change photo
                <input type="file" id="cl-photo-input" hidden accept="image/*"/>
              </label>` : ''}
            </div>
          </div>
        </div>

        <!-- Accounts -->
        <div class="tab-panel" data-clpanel="accounts" hidden>
          <div id="cl-accounts-wrap"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Charges -->
        <div class="tab-panel" data-clpanel="charges" hidden>
          <div class="section-header">
            <h3>Charges</h3>
            ${can('CREATE_CLIENTCHARGE') ? `<button class="btn-primary btn-sm" id="btn-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>` : ''}
          </div>
          <div id="cl-charges-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Transactions -->
        <div class="tab-panel" data-clpanel="transactions" hidden>
          <div id="cl-tx-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Identifiers -->
        <div class="tab-panel" data-clpanel="identifiers" hidden>
          <div class="section-header">
            <h3>ID Documents</h3>
            ${can('CREATE_CLIENTIDENTIFIER') ? `<button class="btn-primary btn-sm" id="btn-add-identifier"><i class="fa-solid fa-plus"></i> Add Identifier</button>` : ''}
          </div>
          <div id="cl-identifier-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Family -->
        <div class="tab-panel" data-clpanel="family" hidden>
          <div class="section-header">
            <h3>Family Members</h3>
            ${can('CREATE_CLIENTFAMILYMEMBER') ? `<button class="btn-primary btn-sm" id="btn-add-family"><i class="fa-solid fa-plus"></i> Add Member</button>` : ''}
          </div>
          <div id="cl-family-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Address -->
        <div class="tab-panel" data-clpanel="address" hidden>
          <div class="section-header">
            <h3>Addresses</h3>
            ${can('CREATE_CLIENTADDRESS') ? `<button class="btn-primary btn-sm" id="btn-add-address"><i class="fa-solid fa-plus"></i> Add Address</button>` : ''}
          </div>
          <div id="cl-address-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Standing Instructions -->
        <div class="tab-panel" data-clpanel="si" hidden>
          <h3>Standing Instructions</h3>
          <div id="cl-si-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Documents -->
        <div class="tab-panel" data-clpanel="documents" hidden>
          <h3>Documents (KYC)</h3>
          <div id="cl-doc-list"><div class="empty-state-row">Loading…</div></div>
          <form id="cl-doc-form" class="form-grid mt-3">
            <label>Document name * <input name="name" class="form-control" required/></label>
            <label>Description <input name="description" class="form-control"/></label>
            <label class="full">File * <input type="file" name="file" required/></label>
            <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload Document</button>
          </form>
        </div>

        <!-- Notes -->
        <div class="tab-panel" data-clpanel="notes" hidden>
          <h3>Notes</h3>
          <div id="cl-note-list"><div class="empty-state-row">Loading…</div></div>
          <div class="mt-3">
            <textarea id="cl-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
            <button class="btn-primary mt-2" id="cl-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>`;

    // -------- Tab switching --------
    const tabs   = c.querySelectorAll('[data-cltab]');
    const panels = c.querySelectorAll('[data-clpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      accounts:     () => loadClientAccounts(c, id),
      charges:      () => loadClientCharges(c, id),
      transactions: () => loadClientTransactions(c, id),
      identifiers:  () => loadClientIdentifiers(c, id),
      family:       () => loadClientFamilyMembers(c, id),
      address:      () => loadClientAddresses(c, id),
      si:           () => loadClientStandingInstructions(c, id),
      documents:    () => loadClientDocuments(c, id),
      notes:        () => loadClientNotes(c, id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.cltab === name));
      panels.forEach(p => p.hidden = p.dataset.clpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) { lazyLoaded[name] = true; lazyLoaders[name](); }
      // Deep-link
      const u = new URL(window.location.href);
      const hashParts = (location.hash || '').split('?');
      const params = new URLSearchParams(hashParts[1] || '');
      params.set('id', id); params.set('tab', name);
      location.hash = `client-detail?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.cltab)));
    switchTab(initialTab || 'overview');

    // -------- Back --------
    c.querySelector('#back-to-clients').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('clients'));
    });

    // -------- Lifecycle / toolbar actions --------
    c.querySelector('#btn-edit-client')?.addEventListener('click', () => openEditClientModal(cl, () => {
      import('../router.js').then(r => r.navigate('client-detail', { id }));
    }));

    c.querySelector('#btn-activate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate client?', message: `Activate ${cl.displayName}?`, confirmText: 'Activate' })) return;
      try {
        await api.clients.activate(id, today());
        toast('success', 'Client activated', cl.displayName);
        import('../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-close-client')?.addEventListener('click', () => openCloseClientModal(id));

    c.querySelector('#btn-reactivate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reactivate client?', message: `Reactivate ${cl.displayName}?`, confirmText: 'Reactivate' })) return;
      try {
        await api.clients.reactivate(id, { reactivationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Client reactivated', cl.displayName);
        import('../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Reactivation failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-reject-client')?.addEventListener('click', () => openRejectClientModal(id));

    c.querySelector('#btn-withdraw-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Withdraw application?', message: 'Mark this application as withdrawn by the client?', confirmText: 'Withdraw', danger: true })) return;
      try {
        await api.clients.withdrawnByApplicant(id, {
          withdrawalDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Application withdrawn', '');
        import('../router.js').then(r => r.navigate('clients'));
      } catch (e) { toast('error', 'Withdrawal failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-transfer-client')?.addEventListener('click', () => openTransferModal(id, cl.displayName));

    c.querySelector('#btn-undotransfer-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo transfer?', message: 'Cancel the pending transfer for this client?', danger: true, confirmText: 'Undo' })) return;
      try {
        await api.clients.undoTransfer(id);
        toast('success', 'Transfer undone', '');
        import('../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Undo failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-assign-staff')?.addEventListener('click', () => openAssignStaffModal(id, cl));

    c.querySelector('#btn-mark-fraud')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Mark as Fraud?', message: 'This will flag the client as fraudulent. Continue?', danger: true, confirmText: 'Mark as Fraud' })) return;
      try {
        await api.clients.markAsFraud(id, { isFraud: !cl.isFraud });
        toast('warn', 'Client marked', `Fraud flag toggled`);
        import('../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Action failed', e.detail?.defaultUserMessage || e.message); }
    });

    // -------- Photo upload --------
    loadClientPhoto(c, id);
    c.querySelector('#cl-photo-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        await api.images.upload('clients', id, fd);
        toast('success', 'Photo updated', file.name);
        loadClientPhoto(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message || String(err)); }
    });

    // -------- Tab-specific button wiring --------
    c.querySelector('#btn-add-charge')?.addEventListener('click', () => openApplyChargeModal(id, () => loadClientCharges(c, id)));
    c.querySelector('#btn-add-identifier')?.addEventListener('click', () => openAddIdentifierModal(id, () => loadClientIdentifiers(c, id)));
    c.querySelector('#btn-add-family')?.addEventListener('click', () => openAddFamilyModal(id, () => loadClientFamilyMembers(c, id)));
    c.querySelector('#btn-add-address')?.addEventListener('click', () => openAddAddressModal(id, () => loadClientAddresses(c, id)));

    // -------- Document upload --------
    c.querySelector('#cl-doc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target; const fd = new FormData(form);
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

    // -------- Notes --------
    c.querySelector('#cl-note-save')?.addEventListener('click', async () => {
      const inp = c.querySelector('#cl-note-input');
      const note = inp.value.trim(); if (!note) return;
      try {
        await api.notes.create('clients', id, { note });
        inp.value = '';
        loadClientNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed to add note', e.detail?.defaultUserMessage || e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load client</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.message || String(e))}</div>
    </div></div>`;
  }
}

// ============================================================
// EDIT CLIENT MODAL
// ============================================================
async function openEditClientModal(cl, onSuccess) {
  const mid = `cl-edit-modal-${Date.now()}`;
  const isEntity = cl.legalForm?.id === 2;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            ${isEntity
              ? `<label class="full">Full name * <input id="ec-fullname" class="form-control" value="${escapeHtml(cl.fullname || cl.displayName || '')}" required/></label>`
              : `<label>First name * <input id="ec-firstname" class="form-control" value="${escapeHtml(cl.firstname || '')}" required/></label>
                 <label>Middle <input id="ec-middlename" class="form-control" value="${escapeHtml(cl.middlename || '')}"/></label>
                 <label>Last name * <input id="ec-lastname" class="form-control" value="${escapeHtml(cl.lastname || '')}" required/></label>`}
            <label>Mobile <input id="ec-mobile" class="form-control" value="${escapeHtml(cl.mobileNo || '')}"/></label>
            <label>Email <input id="ec-email" type="email" class="form-control" value="${escapeHtml(cl.emailAddress || '')}"/></label>
            <label>External ID <input id="ec-extid" class="form-control" value="${escapeHtml(cl.externalId || '')}"/></label>
            <label>Date of birth <input id="ec-dob" type="date" class="form-control" value="${cl.dateOfBirth || ''}"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ec-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ec-save').addEventListener('click', async () => {
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
    if (isEntity) payload.fullname = el.querySelector('#ec-fullname').value.trim();
    else {
      payload.firstname  = el.querySelector('#ec-firstname').value.trim();
      payload.lastname   = el.querySelector('#ec-lastname').value.trim();
      const mid_ = el.querySelector('#ec-middlename').value.trim();
      if (mid_) payload.middlename = mid_;
    }
    const mob = el.querySelector('#ec-mobile').value.trim(); if (mob) payload.mobileNo = mob;
    const em  = el.querySelector('#ec-email').value.trim(); if (em) payload.emailAddress = em;
    const ext = el.querySelector('#ec-extid').value.trim(); if (ext) payload.externalId = ext;
    const dob = el.querySelector('#ec-dob').value; if (dob) payload.dateOfBirth = dob;
    try {
      await api.clients.update(cl.id, payload);
      el.remove();
      toast('success', 'Client updated', cl.displayName);
      onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// CLOSE CLIENT MODAL (needs closureReasonId from CodeValues)
// ============================================================
async function openCloseClientModal(id) {
  let reasons = [];
  try {
    // Fineract uses ClientClosureReason CodeValues
    const tpl = await api.clients.template();
    reasons = tpl?.clientClosureReasons || tpl?.closureReasons || [];
  } catch {}
  const mid = `cl-close-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="lc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Closure reason *
            <select id="lc-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="lc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="lc-confirm">Close Client</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#lc-confirm').addEventListener('click', async () => {
    const closureDate = el.querySelector('#lc-date').value;
    const closureReasonId = el.querySelector('#lc-reason').value;
    const note = el.querySelector('#lc-note').value.trim();
    if (!closureReasonId) { toast('warn', 'Reason required', 'Select a closure reason'); return; }
    try {
      await api.clients.close(id, {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        closureDate, closureReasonId: parseInt(closureReasonId),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Client closed', `#${id}`);
      import('../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// REJECT CLIENT MODAL
// ============================================================
async function openRejectClientModal(id) {
  let reasons = [];
  try {
    const tpl = await api.clients.template();
    reasons = tpl?.clientRejectionReasons || tpl?.rejectionReasons || [];
  } catch {}
  const mid = `cl-reject-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Application</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Rejected on * <input type="date" id="rj-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Rejection reason *
            <select id="rj-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="rj-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="rj-confirm">Reject</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#rj-confirm').addEventListener('click', async () => {
    const rejectionDate = el.querySelector('#rj-date').value;
    const rejectionReasonId = el.querySelector('#rj-reason').value;
    const note = el.querySelector('#rj-note').value.trim();
    if (!rejectionReasonId) { toast('warn', 'Reason required', 'Select a rejection reason'); return; }
    try {
      await api.clients.reject(id, {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        rejectionDate, rejectionReasonId: parseInt(rejectionReasonId),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Application rejected', '');
      import('../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Reject failed', e.detail?.defaultUserMessage || e.message); }
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
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Transfer Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p>Propose transfer of <b>${escapeHtml(displayName)}</b> to another office.</p>
          <label>Destination office *
            <select id="tr-office" class="form-control" required>
              <option value="">Select office…</option>
              ${(Array.isArray(offices) ? offices : []).map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Transfer date * <input type="date" id="tr-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="tr-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tr-confirm">Propose Transfer</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tr-confirm').addEventListener('click', async () => {
    const destinationOfficeId = el.querySelector('#tr-office').value;
    const transferDate = el.querySelector('#tr-date').value;
    const note = el.querySelector('#tr-note').value;
    if (!destinationOfficeId) { toast('warn', 'Select an office', ''); return; }
    try {
      await api.clients.transfer(id, {
        destinationOfficeId: parseInt(destinationOfficeId),
        transferDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Transfer proposed', 'Awaiting acceptance at destination office');
      import('../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Transfer failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ASSIGN STAFF MODAL
// ============================================================
async function openAssignStaffModal(id, cl) {
  let staffList = [];
  try { const r = await api.staff.list({ officeId: cl.officeId }); staffList = Array.isArray(r) ? r : (r?.pageItems || []); } catch {}
  const mid = `cl-assign-modal-${Date.now()}`;
  const hasStaff = !!cl.staffId;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${hasStaff ? 'Reassign / Unassign Staff' : 'Assign Staff'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${hasStaff ? `<p class="text-muted">Currently assigned to <b>${escapeHtml(cl.staffName || '')}</b>.</p>` : ''}
          <label>Staff
            <select id="as-staff" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(s => `<option value="${s.id}" ${s.id === cl.staffId ? 'selected' : ''}>${escapeHtml(s.displayName)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="as-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#as-save').addEventListener('click', async () => {
    const staffId = el.querySelector('#as-staff').value;
    try {
      if (staffId) await api.clients.assignStaff(id, { staffId: parseInt(staffId) });
      else         await api.clients.unassignStaff(id, { staffId: cl.staffId });
      el.remove();
      toast('success', 'Staff updated', '');
      import('../router.js').then(r => r.navigate('client-detail', { id }));
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ACCOUNTS TAB
// ============================================================
async function loadClientAccounts(c, id) {
  const wrap = c.querySelector('#cl-accounts-wrap');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const acc = await api.clients.accounts(id);
    const loans   = acc?.loanAccounts            || [];
    const savings = acc?.savingsAccounts         || [];
    const fds     = acc?.fixedDepositAccounts    || [];
    const rds     = acc?.recurringDepositAccounts|| [];
    const shares  = acc?.shareAccounts           || [];

    const tableSection = (title, rows, mapper, cols) => `
      <h3 class="mt-3">${title}</h3>
      <table class="table"><thead><tr>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(mapper).join('') :
          `<tr><td colspan="${cols.length}" class="empty-state-row">No ${title.toLowerCase()}</td></tr>`}
        </tbody>
      </table>`;

    wrap.innerHTML = `
      ${tableSection('Loan Accounts', loans,
        l => `<tr>
          <td>${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td class="text-right">${fmt(l.loanBalance ?? l.originalLoan ?? 0)}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${tableSection('Savings Accounts', savings,
        s => `<tr>
          <td>${s.id}">${escapeHtml(s.accountNo || '')}</a></td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${fds.length ? tableSection('Fixed Deposits', fds,
        d => `<tr><td>${escapeHtml(d.accountNo || '')}</td><td>${escapeHtml(d.productName || '')}</td>
          <td class="text-right">${fmt(d.accountBalance ?? 0)}</td><td>${sb(d.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status']) : ''}
      ${rds.length ? tableSection('Recurring Deposits', rds,
        d => `<tr><td>${escapeHtml(d.accountNo || '')}</td><td>${escapeHtml(d.productName || '')}</td>
          <td class="text-right">${fmt(d.accountBalance ?? 0)}</td><td>${sb(d.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status']) : ''}
      ${shares.length ? tableSection('Share Accounts', shares,
        s => `<tr><td>${escapeHtml(s.accountNo || '')}</td><td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.totalApprovedShares ?? 0)}</td><td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Shares', 'Status']) : ''}`;
  } catch (e) {
    wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// CHARGES TAB
// ============================================================
async function loadClientCharges(c, id) {
  const wrap = c.querySelector('#cl-charges-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.charges(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Charge</th><th>Due</th><th>Amount</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(ch => `
          <tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td>${fmtDate(ch.dueDate)}</td>
            <td class="text-right">${fmt(ch.amount ?? 0)}</td>
            <td class="text-right">${fmt(ch.amountOutstanding ?? 0)}</td>
            <td>${sb(ch.isPaid ? 'Paid' : ch.isWaived ? 'Waived' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.isPaid && !ch.isWaived && can('PAY_CLIENTCHARGE')    ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.isPaid && !ch.isWaived && can('WAIVE_CLIENTCHARGE')  ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${can('DELETE_CLIENTCHARGE') ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges applied</div>';

    wrap.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () => openPayChargeModal(id, b.dataset.payCharge, () => loadClientCharges(c, id))));
    wrap.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive', danger: true })) return;
      try { await api.clients.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Charge waived', ''); loadClientCharges(c, id); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    wrap.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.clients.deleteCharge(id, b.dataset.delCharge); toast('success', 'Charge deleted', ''); loadClientCharges(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openApplyChargeModal(clientId, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 3 }); // 3 = Client charges
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `cl-applycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Charge *
            <select id="ac-charge" class="form-control" required>
              <option value="">Select charge…</option>
              ${charges.map(ch => `<option value="${ch.id}" data-amount="${ch.amount}">${escapeHtml(ch.name)} (${fmt(ch.amount)})</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="ac-amount" class="form-control" required/></label>
          <label class="mt-2">Due date <input type="date" id="ac-due" class="form-control" value="${today()}"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ac-save">Apply</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ac-charge').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    el.querySelector('#ac-amount').value = opt?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    const dueDate = el.querySelector('#ac-due').value;
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields missing', ''); return; }
    try {
      await api.clients.addCharge(clientId, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openPayChargeModal(clientId, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `cl-paycharge-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Transaction date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pc-save">Pay</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#pc-amount').value);
    const transactionDate = el.querySelector('#pc-date').value;
    const paymentTypeId = el.querySelector('#pc-pt').value;
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    try {
      await api.clients.payCharge(clientId, chargeId, {
        amount, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// TRANSACTIONS TAB
// ============================================================
async function loadClientTransactions(c, id) {
  const wrap = c.querySelector('#cl-tx-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.transactions(id, { limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Amount</th><th>Reversed</th></tr></thead>
        <tbody>${list.map(tx => `
          <tr>
            <td>${tx.id}</td>
            <td>${fmtDate(tx.date)}</td>
            <td>${escapeHtml(tx.type?.value || '—')}</td>
            <td class="text-right">${fmt(tx.amount ?? 0)}</td>
            <td>${tx.reversed ? '<span class="badge b-warning">Reversed</span>' : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No transactions</div>';
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// STANDING INSTRUCTIONS TAB
// ============================================================
async function loadClientStandingInstructions(c, id) {
  const wrap = c.querySelector('#cl-si-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.standingInstructions.list({ clientId: id });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>From</th><th>To</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${sb(si.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DELETE_STANDINGINSTRUCTION') ? `<button class="btn-mini btn-danger" data-del-si="${si.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions</div>';

    wrap.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete standing instruction?', danger: true, confirmText: 'Delete' })) return;
      try { await api.standingInstructions.delete(b.dataset.delSi); toast('success', 'Deleted', ''); loadClientStandingInstructions(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// IDENTIFIERS
// ============================================================
async function loadClientIdentifiers(c, id) {
  const listEl = c.querySelector('#cl-identifier-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const items = await api.clients.identifiers(id);
    const list = Array.isArray(items) ? items : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Type</th><th>Document Key</th><th>Status</th><th>Description</th><th></th></tr></thead>
        <tbody>${list.map(i => `
          <tr>
            <td>${escapeHtml(i.documentType?.name || i.documentTypeName || '—')}</td>
            <td>${escapeHtml(i.documentKey || '—')}</td>
            <td>${sb(i.status?.value || '—')}</td>
            <td>${escapeHtml(i.description || '—')}</td>
            <td>${can('DELETE_CLIENTIDENTIFIER') ? `<button class="btn-mini btn-danger" data-del-id="${i.id}">Delete</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No identifiers on file</div>';

    listEl.querySelectorAll('[data-del-id]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete identifier?', danger: true, confirmText: 'Delete' })) return;
      try { await api.clients.deleteIdentifier(id, b.dataset.delId); toast('success', 'Identifier deleted', ''); loadClientIdentifiers(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddIdentifierModal(clientId, onSuccess) {
  let docTypes = [];
  try {
    const tpl = await api.clients.template();
    // Real Fineract field is clientIdentifierTypeOptions
    docTypes = tpl?.clientIdentifierTypeOptions || tpl?.documentTypeOptions || [];
  } catch {}
  const mid = `cl-id-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Identifier</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Document type *
            <select id="id-doctype" class="form-control" required>
              <option value="">Select…</option>
              ${docTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Document key * <input id="id-dockey" class="form-control" required/></label>
          <label class="mt-2">Description <input id="id-desc" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="id-save">Add</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#id-save').addEventListener('click', async () => {
    const documentTypeId = el.querySelector('#id-doctype').value;
    const documentKey = el.querySelector('#id-dockey').value.trim();
    const description = el.querySelector('#id-desc').value.trim();
    if (!documentTypeId || !documentKey) { toast('warn', 'Required fields missing', ''); return; }
    try {
      await api.clients.createIdentifier(clientId, {
        documentTypeId: parseInt(documentTypeId),
        documentKey,
        ...(description && { description })
      });
      el.remove(); toast('success', 'Identifier added', documentKey); onSuccess();
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// FAMILY MEMBERS
// ============================================================
async function loadClientFamilyMembers(c, id) {
  const listEl = c.querySelector('#cl-family-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.familyMembers(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Relationship</th><th>Gender</th><th>Date of Birth</th><th>Dependent</th><th></th></tr></thead>
        <tbody>${list.map(m => `
          <tr>
            <td>${escapeHtml((m.firstName || '') + (m.lastName ? ' ' + m.lastName : '')) || '—'}</td>
            <td>${escapeHtml(m.relationship?.name || m.relationshipType?.value || '—')}</td>
            <td>${escapeHtml(m.gender?.name || '—')}</td>
            <td>${fmtDate(m.dateOfBirth) || '—'}</td>
            <td>${m.isDependent ? 'Yes' : 'No'}</td>
            <td>${can('DELETE_CLIENTFAMILYMEMBER') ? `<button class="btn-mini btn-danger" data-del-fam="${m.id}">Remove</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No family members on file</div>';

    listEl.querySelectorAll('[data-del-fam]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove family member?', danger: true, confirmText: 'Remove' })) return;
      try { await api.clients.deleteFamilyMember(id, b.dataset.delFam); toast('success', 'Removed', ''); loadClientFamilyMembers(c, id); }
      catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddFamilyModal(clientId, onSuccess) {
  let relationships = [], genders = [];
  try {
    const tpl = await api.clients.template();
    relationships = tpl?.familyMemberOptions?.relationshipIdOptions || [];
    genders = tpl?.familyMemberOptions?.genderIdOptions || tpl?.genderOptions || [];
  } catch {}
  const mid = `cl-fam-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Family Member</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>First name * <input id="fam-fname" class="form-control" required/></label>
            <label>Last name <input id="fam-lname" class="form-control"/></label>
            <label>Relationship *
              <select id="fam-rel" class="form-control" required>
                <option value="">Select…</option>
                ${relationships.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
              </select>
            </label>
            <label>Gender
              <select id="fam-gender" class="form-control">
                <option value="">— Not specified —</option>
                ${genders.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
              </select>
            </label>
            <label>Date of birth <input id="fam-dob" type="date" class="form-control"/></label>
            <label class="checkbox-row"><input type="checkbox" id="fam-dependent"/> Dependent</label>
            <label class="full">Occupation <input id="fam-occupation" class="form-control"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="fam-save">Add Member</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#fam-save').addEventListener('click', async () => {
    const firstName = el.querySelector('#fam-fname').value.trim();
    const lastName = el.querySelector('#fam-lname').value.trim();
    const relationshipId = el.querySelector('#fam-rel').value;
    const genderId = el.querySelector('#fam-gender').value;
    const dateOfBirth = el.querySelector('#fam-dob').value;
    const isDependent = el.querySelector('#fam-dependent').checked;
    const occupation = el.querySelector('#fam-occupation').value.trim();
    if (!firstName || !relationshipId) { toast('warn', 'Required fields missing', ''); return; }
    try {
      await api.clients.createFamilyMember(clientId, {
        firstName, locale: LOCALE,
        ...(lastName && { lastName }),
        relationshipId: parseInt(relationshipId),
        ...(genderId && { genderId: parseInt(genderId) }),
        ...(dateOfBirth && { dateOfBirth, dateFormat: DATE_FORMAT }),
        isDependent,
        ...(occupation && { occupation })
      });
      el.remove(); toast('success', 'Family member added', firstName); onSuccess();
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ADDRESSES
// ============================================================
async function loadClientAddresses(c, id) {
  const listEl = c.querySelector('#cl-address-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.addresses(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Type</th><th>Street</th><th>City</th><th>Postal</th><th>Country</th><th>Active</th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>${escapeHtml(a.addressType || a.addressTypeId || '—')}</td>
            <td>${escapeHtml(a.street || '—')}</td>
            <td>${escapeHtml(a.city || '—')}</td>
            <td>${escapeHtml(a.postalCode || '—')}</td>
            <td>${escapeHtml(a.countryName || a.country || '—')}</td>
            <td>${a.isActive ? 'Yes' : 'No'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No addresses on file</div>';
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddAddressModal(clientId, onSuccess) {
  let addressTypes = [], countries = [];
  try {
    const tpl = await api.clients.addressTemplate();
    addressTypes = tpl?.addressTypeIdOptions || [];
    countries = tpl?.countryIdOptions || [];
  } catch {}
  const mid = `cl-addr-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Address</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Address type *
              <select id="addr-type" class="form-control" required>
                <option value="">Select type…</option>
                ${addressTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
              </select>
            </label>
            <label>Street <input id="addr-street" class="form-control"/></label>
            <label>City <input id="addr-city" class="form-control"/></label>
            <label>Postal code <input id="addr-postal" class="form-control"/></label>
            <label>State / Province <input id="addr-state" class="form-control"/></label>
            <label>Country
              <select id="addr-country" class="form-control">
                <option value="">— Select country —</option>
                ${countries.map(co => `<option value="${co.id}">${escapeHtml(co.name)}</option>`).join('')}
              </select>
            </label>
            <label class="checkbox-row"><input type="checkbox" id="addr-active" checked/> Active address</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="addr-save">Add Address</button>
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
        street: el.querySelector('#addr-street').value.trim() || undefined,
        city: el.querySelector('#addr-city').value.trim() || undefined,
        postalCode: el.querySelector('#addr-postal').value.trim() || undefined,
        stateProvinceId: el.querySelector('#addr-state').value.trim() || undefined,
        countryId: el.querySelector('#addr-country').value ? parseInt(el.querySelector('#addr-country').value) : undefined,
        isActive: el.querySelector('#addr-active').checked
      });
      el.remove(); toast('success', 'Address added', ''); onSuccess();
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// PHOTO / DOCUMENTS / NOTES
// ============================================================
async function loadClientPhoto(c, id) {
  const wrap = c.querySelector('#cl-photo-wrap'); if (!wrap) return;
  try {
    const res = await api.images.get('clients', id);
    if (!res.ok) throw new Error('No photo');
    const blob = await res.blob();
    wrap.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Client photo" class="client-photo"/>`;
  } catch { /* leave placeholder */ }
}

async function loadClientDocuments(c, id) {
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

async function loadClientNotes(c, id) {
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