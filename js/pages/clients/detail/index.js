/* FinCraft · pages/clients/detail/index.js — renderDetail — tab shell.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate, ini, sb } from '../../../utils.js';
import { openAddAddressModal, openAddFamilyModal, openAddIdentifierModal, openApplyChargeModal, openAssignStaffModal, openCloseClientModal, openEditClientModal, openRejectClientModal, openTransferModal } from '../actions.js';
import { can } from '../shared.js';
import { loadClientAccounts, loadClientCharges, loadClientStandingInstructions, loadClientTransactions } from './accounts.js';
import { loadClientAddresses, loadClientFamilyMembers, loadClientIdentifiers, loadClientPhoto } from './identity.js';
import { loadClientDocuments, loadClientNotes } from './notes-docs.js';

export async function renderDetail(c, id, initialTab = 'overview') {
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
      import('../../../router.js').then(r => r.navigate('clients'));
    });

    // -------- Lifecycle / toolbar actions --------
    c.querySelector('#btn-edit-client')?.addEventListener('click', () => openEditClientModal(cl, () => {
      import('../../../router.js').then(r => r.navigate('client-detail', { id }));
    }));

    c.querySelector('#btn-activate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate client?', message: `Activate ${cl.displayName}?`, confirmText: 'Activate' })) return;
      try {
        await api.clients.activate(id, today());
        toast('success', 'Client activated', cl.displayName);
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-close-client')?.addEventListener('click', () => openCloseClientModal(id));

    c.querySelector('#btn-reactivate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reactivate client?', message: `Reactivate ${cl.displayName}?`, confirmText: 'Reactivate' })) return;
      try {
        await api.clients.reactivate(id, { reactivationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Client reactivated', cl.displayName);
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
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
        import('../../../router.js').then(r => r.navigate('clients'));
      } catch (e) { toast('error', 'Withdrawal failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-transfer-client')?.addEventListener('click', () => openTransferModal(id, cl.displayName));

    c.querySelector('#btn-undotransfer-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo transfer?', message: 'Cancel the pending transfer for this client?', danger: true, confirmText: 'Undo' })) return;
      try {
        await api.clients.undoTransfer(id);
        toast('success', 'Transfer undone', '');
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Undo failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#btn-assign-staff')?.addEventListener('click', () => openAssignStaffModal(id, cl));

    c.querySelector('#btn-mark-fraud')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Mark as Fraud?', message: 'This will flag the client as fraudulent. Continue?', danger: true, confirmText: 'Mark as Fraud' })) return;
      try {
        await api.clients.markAsFraud(id, { isFraud: !cl.isFraud });
        toast('warn', 'Client marked', `Fraud flag toggled`);
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
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
