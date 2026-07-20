/* FinCraft · pages/clients/detail/index.js — renderDetail — tab shell.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability.
   Redesigned around the cv-* (clients-view.css) component set: a compact profile bar,
   a slimmer top-level tab list (Charges/Family/Address/Collateral folded into related tabs
   rather than removed), and card-grid Overview/Documents panels. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, openModal, toast } from '../../../ui.js';
import { escapeHtml, fmtDate } from '../../../utils.js';
import { openAddAddressModal, openAddClientCollateralModal, openAddFamilyModal, openAddIdentifierModal, openApplyChargeModal, openAssignStaffModal, openCloseClientModal, openEditClientModal, openRejectClientModal, openTransferModal } from '../actions.js';
import { can, cvAvatar, cvClientType, cvPill, cvStatusTone } from '../shared.js';
import { enhanceScrollableTabs } from '../../../ui/scrollable-tabs.js';
import { loadClientAccounts, loadClientCharges, loadClientLoansOnly, loadClientOverviewStats, loadClientStandingInstructions, loadClientTransactions } from './accounts.js';
import { loadClientAddresses, loadClientCollateral, loadClientFamilyMembers, loadClientIdentifiers, loadClientNextOfKin, loadClientPhoto } from './identity.js';
import { loadClientDocuments, loadClientHistory, loadClientNotes } from './notes-docs.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading client…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No client selected</div>'; return; }

  try {
    const cl = await api.clients.get(id, { associations: 'all' });
    const status = cl.status?.value || '';
    const type = cvClientType(cl);

    // Status-aware command availability
    const canActivate   = status === 'Pending'   && can('ACTIVATE_CLIENT');
    const canClose      = status === 'Active'    && can('CLOSE_CLIENT');
    const canReactivate = status === 'Closed'    && can('REACTIVATE_CLIENT');
    const canReject     = status === 'Pending'   && can('REJECT_CLIENT');
    const canWithdraw   = status === 'Pending'   && can('WITHDRAW_CLIENT');
    const canTransfer   = status === 'Active'    && can('PROPOSETRANSFER_CLIENT');
    const canUndoTransfer = (cl.transferToOfficeId || status === 'Transfer in progress') && can('WITHDRAWTRANSFER_CLIENT');
    const canEdit       = can('UPDATE_CLIENT');
    // NOTE: was previously OR'd with UPDATESAVINGSACCOUNT_CLIENT, an unrelated permission
    // (governs changing a client's default savings account, not staff assignment) — a user
    // holding only that permission would have seen this button and had the call 403 at the
    // backend. Gated on the two permissions the modal's assign/unassign calls actually need.
    const canAssign     = can('ASSIGNSTAFF_CLIENT') || can('UNASSIGNSTAFF_CLIENT');
    const canNewLoan    = status === 'Active' && can('CREATE_LOAN');

    // Any lifecycle action besides Activate/Reactivate tucks into a "More" kebab menu so the
    // header stays down to Back / Edit / New Loan the way the approved mockup shows it.
    const kebabItems = [
      canClose      ? `<button class="dropdown-item" id="btn-close-client"><i class="fa-solid fa-circle-xmark"></i> Close client</button>` : '',
      canReject     ? `<button class="dropdown-item" id="btn-reject-client"><i class="fa-solid fa-ban"></i> Reject application</button>` : '',
      canWithdraw   ? `<button class="dropdown-item" id="btn-withdraw-client"><i class="fa-solid fa-rotate-left"></i> Withdraw application</button>` : '',
      canTransfer   ? `<button class="dropdown-item" id="btn-transfer-client"><i class="fa-solid fa-right-left"></i> Propose transfer</button>` : '',
      canUndoTransfer ? `<button class="dropdown-item" id="btn-undotransfer-client"><i class="fa-solid fa-undo"></i> Undo transfer</button>` : '',
      canAssign     ? `<button class="dropdown-item" id="btn-assign-staff"><i class="fa-solid fa-user-tag"></i> Assign staff</button>` : ''
    ].filter(Boolean).join('');

    c.innerHTML = `
    <div class="cv-detail">
      <div class="cv-detail-head">
        <div>
          <h1>${escapeHtml(cl.displayName || cl.firstname || '')}</h1>
          <div class="cv-sub">${escapeHtml(cl.accountNo || '—')} · ${type.toLowerCase()} · ${escapeHtml(cl.officeName || '')}</div>
        </div>
        <div class="cv-detail-actions">
          <button class="cv-btn-ghost" id="back-to-clients"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit ? `<button class="cv-btn-ghost" id="btn-edit-client"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canActivate ? `<button class="cv-btn-solid" id="btn-activate-client"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canReactivate ? `<button class="cv-btn-solid" id="btn-reactivate-client"><i class="fa-solid fa-rotate-right"></i> Reactivate</button>` : ''}
          ${canNewLoan ? `<button class="cv-btn-solid" id="btn-new-loan"><i class="fa-solid fa-hand-holding-dollar"></i> New Loan</button>` : ''}
          ${kebabItems ? `
            <div class="dropdown" id="cl-kebab">
              <button class="cv-btn-ghost" id="cl-kebab-btn"><i class="fa-solid fa-ellipsis"></i></button>
              <div class="dropdown-menu cv-kebab-menu" style="right:0;left:auto">${kebabItems}</div>
            </div>` : ''}
        </div>
      </div>

      <div class="cv-card cv-profile-bar">
        <div class="cv-profile-top">
          ${cvAvatar(cl, 'lg')}
          <div class="cv-profile-field">
            <span class="cv-flabel"><i class="fa-solid fa-phone"></i> Mobile</span>
            <span class="cv-fval">${escapeHtml(cl.mobileNo || '—')}</span>
          </div>
          <div class="cv-profile-field">
            <span class="cv-flabel"><i class="fa-solid fa-envelope"></i> Email</span>
            <span class="cv-fval">${escapeHtml(cl.emailAddress || '—')}</span>
          </div>
          <div class="cv-profile-field">
            <span class="cv-flabel"><i class="fa-solid fa-briefcase"></i> ${type === 'Business' ? 'Business Line' : 'Occupation'}</span>
            <!-- Fineract has no "occupation" field on person clients; for entity clients
                 clientNonPersonDetails.mainBusinessLine is the closest real analogue. Falls
                 back to "—" gracefully if this Fineract instance doesn't populate it. -->
            <span class="cv-fval">${escapeHtml(cl.clientNonPersonDetails?.mainBusinessLine?.name || '—')}</span>
          </div>
          <div class="cv-profile-field">
            <span class="cv-flabel"><i class="fa-solid fa-location-dot"></i> Branch</span>
            <span class="cv-fval">${escapeHtml(cl.officeName || '—')}</span>
          </div>
        </div>
        <div class="cv-profile-bottom">
          <div class="cv-profile-pills">
            ${cvPill(status || '—', cvStatusTone(status))}
            ${cvPill(type, type === 'Business' ? 'blue' : 'slate')}
            ${cl.isStaff ? cvPill('Staff member', 'amber') : ''}
          </div>
          <div class="cv-dim">Customer since ${fmtDate(cl.timeline?.submittedOnDate || cl.activationDate) || '—'}</div>
        </div>
      </div>

      <div class="tabs cv-tabs" id="cl-tabs">
        <button class="cv-tab" data-cltab="overview">Overview</button>
        <button class="cv-tab" data-cltab="accounts">Accounts</button>
        <button class="cv-tab" data-cltab="loans">Loans</button>
        ${can('READ_CLIENTCHARGE')    ? `<button class="cv-tab" data-cltab="charges">Charges</button>` : ''}
        <button class="cv-tab" data-cltab="transactions">Transactions</button>
        ${can('READ_ACCOUNTTRANSFER') ? `<button class="cv-tab" data-cltab="si">Standing Instructions</button>` : ''}
        <button class="cv-tab" data-cltab="collateral">Collateral</button>
        <button class="cv-tab" data-cltab="documents">Documents</button>
        <button class="cv-tab" data-cltab="kyc">KYC &amp; Compliance</button>
        <button class="cv-tab" data-cltab="notes">Notes &amp; History</button>
      </div>

      <!-- Overview -->
      <div class="tab-panel" data-clpanel="overview">
        <div class="cv-grid-3">
          <div class="cv-card cv-panel">
            <h3>Personal Information</h3>
            <div class="cv-info-row"><span class="cv-i-label">Full Name</span><span class="cv-i-val">${escapeHtml(cl.displayName || '—')}</span></div>
            <div class="cv-info-row"><span class="cv-i-label">Date of Birth</span><span class="cv-i-val">${fmtDate(cl.dateOfBirth) || '—'}</span></div>
            <div class="cv-info-row"><span class="cv-i-label">Gender</span><span class="cv-i-val">${escapeHtml(cl.gender?.name || '—')}</span></div>
            <div class="cv-info-row"><span class="cv-i-label">Mobile</span><span class="cv-i-val">${escapeHtml(cl.mobileNo || '—')}</span></div>
            <div class="cv-info-row"><span class="cv-i-label">Email</span><span class="cv-i-val">${escapeHtml(cl.emailAddress || '—')}</span></div>
            <div class="cv-info-row"><span class="cv-i-label">External ID</span><span class="cv-i-val">${escapeHtml(cl.externalId || '—')}</span></div>
          </div>
          <div class="cv-card cv-panel">
            <h3>Financial Summary</h3>
            <div id="cl-overview-stats"><div class="empty-state-row">Loading…</div></div>
          </div>
          <div class="cv-card cv-panel">
            <h3>Next of Kin</h3>
            <div id="cl-next-of-kin"><div class="empty-state-row">Loading…</div></div>
          </div>
        </div>
        <div class="cv-card cv-panel mt-3" style="display:flex;align-items:center;gap:16px">
          <div id="cl-photo-wrap" class="photo-frame" style="width:64px;height:64px">
            ${cvAvatar(cl, 'md')}
          </div>
          <div style="flex:1">
            <h3 style="margin-bottom:2px">Profile Photo</h3>
            <div class="cv-dim" style="font-size:12px">Shown across the client's record and in search results.</div>
          </div>
          ${canEdit ? `<label class="cv-btn-ghost" style="cursor:pointer">
            <i class="fa-solid fa-camera"></i> Change photo
            <input type="file" id="cl-photo-input" hidden accept="image/*"/>
          </label>` : ''}
        </div>
      </div>

      <!-- Accounts -->
      <div class="tab-panel" data-clpanel="accounts" hidden>
        <div id="cl-accounts-wrap"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Loans (quick view) -->
      <div class="tab-panel" data-clpanel="loans" hidden>
        <div class="section-header">
          <h3>Loan Accounts</h3>
          ${canNewLoan ? `<button class="cv-btn-solid btn-sm" id="btn-new-loan-tab"><i class="fa-solid fa-plus"></i> New Loan</button>` : ''}
        </div>
        <div id="cl-loans-only-wrap"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Charges -->
      <div class="tab-panel" data-clpanel="charges" hidden>
        <div class="section-header">
          <h3>Charges</h3>
          ${can('CREATE_CLIENTCHARGE') ? `<button class="cv-btn-solid btn-sm" id="btn-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>` : ''}
        </div>
        <div id="cl-charges-list"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Transactions -->
      <div class="tab-panel" data-clpanel="transactions" hidden>
        <div id="cl-tx-list"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Standing Instructions -->
      <div class="tab-panel" data-clpanel="si" hidden>
        <h3>Standing Instructions</h3>
        <div id="cl-si-list"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Collateral -->
      <div class="tab-panel" data-clpanel="collateral" hidden>
        <div class="section-header">
          <h3>Collateral</h3>
          ${can('CREATE_CLIENT_COLLATERAL_PRODUCT') ? `<button class="cv-btn-solid btn-sm" id="btn-add-collateral"><i class="fa-solid fa-plus"></i> Add Collateral</button>` : ''}
        </div>
        <div id="cl-collateral-list"><div class="empty-state-row">Loading…</div></div>
      </div>

      <!-- Documents -->
      <div class="tab-panel" data-clpanel="documents" hidden>
        <div class="section-header"><h3>Documents</h3></div>
        <div id="cl-doc-list"><div class="empty-state-row">Loading…</div></div>
        <form id="cl-doc-form" class="form-grid mt-3">
          <label>Document name * <input name="name" class="form-control" required/></label>
          <label>Description <input name="description" class="form-control"/></label>
          <label class="full">File * <input type="file" name="file" required/></label>
          <button type="submit" class="cv-btn-solid"><i class="fa-solid fa-upload"></i> Upload Document</button>
        </form>
      </div>

      <!-- KYC & Compliance (Identifiers + Addresses + Family, folded together) -->
      <div class="tab-panel" data-clpanel="kyc" hidden>
        <div class="cv-section">
          <div class="cv-section-head">
            <h4>ID Documents</h4>
            ${can('CREATE_CLIENTIDENTIFIER') ? `<button class="btn-mini" id="btn-add-identifier"><i class="fa-solid fa-plus"></i> Add Identifier</button>` : ''}
          </div>
          <div id="cl-identifier-list"><div class="empty-state-row">Loading…</div></div>
        </div>
        <div class="cv-section">
          <div class="cv-section-head">
            <h4>Addresses</h4>
            ${can('CREATE_ADDRESS') ? `<button class="btn-mini" id="btn-add-address"><i class="fa-solid fa-plus"></i> Add Address</button>` : ''}
          </div>
          <div id="cl-address-list"><div class="empty-state-row">Loading…</div></div>
        </div>
        <div class="cv-section">
          <div class="cv-section-head">
            <h4>Family Members</h4>
            ${can('CREATE_FAMILYMEMBERS') ? `<button class="btn-mini" id="btn-add-family"><i class="fa-solid fa-plus"></i> Add Member</button>` : ''}
          </div>
          <div id="cl-family-list"><div class="empty-state-row">Loading…</div></div>
        </div>
      </div>

      <!-- Notes & History -->
      <div class="tab-panel" data-clpanel="notes" hidden>
        <div class="cv-section">
          <div class="cv-section-head"><h4>Notes</h4></div>
          <div id="cl-note-list"><div class="empty-state-row">Loading…</div></div>
          <div class="mt-3">
            <textarea id="cl-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
            <button class="cv-btn-solid mt-2" id="cl-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
        <div class="cv-section" id="cl-history-section">
          <div class="cv-section-head"><h4>Audit History</h4></div>
          <div id="cl-history-list"><div class="empty-state-row">Loading…</div></div>
        </div>
      </div>
    </div>`;

    // -------- Tab switching --------
    enhanceScrollableTabs(c.querySelector('#cl-tabs'));
    const tabs   = c.querySelectorAll('[data-cltab]');
    const panels = c.querySelectorAll('[data-clpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      overview:     () => { loadClientOverviewStats(c, id, cl); loadClientNextOfKin(c, id); },
      accounts:     () => loadClientAccounts(c, id),
      loans:        () => loadClientLoansOnly(c, id),
      charges:      () => loadClientCharges(c, id),
      transactions: () => loadClientTransactions(c, id),
      si:           () => loadClientStandingInstructions(c, id),
      collateral:   () => loadClientCollateral(c, id),
      documents:    () => loadClientDocuments(c, id),
      kyc:          () => { loadClientIdentifiers(c, id); loadClientAddresses(c, id); loadClientFamilyMembers(c, id); },
      notes:        () => { loadClientNotes(c, id); loadClientHistory(c, id); }
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.cltab === name));
      panels.forEach(p => p.hidden = p.dataset.clpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) { lazyLoaded[name] = true; lazyLoaders[name](); }
      // Deep-link
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

    // -------- Kebab menu --------
    c.querySelector('#cl-kebab-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      c.querySelector('#cl-kebab').classList.toggle('open');
    });

    // -------- New Loan quick action (prefills the existing New Loan modal) --------
    function openNewLoanForClient() {
      openModal('newLoanModal');
      const searchInp = document.getElementById('loanClientSearch');
      const idInp = document.getElementById('loanClientId');
      if (searchInp) searchInp.value = cl.displayName || '';
      if (idInp) idInp.value = id;
    }
    c.querySelector('#btn-new-loan')?.addEventListener('click', openNewLoanForClient);
    c.querySelector('#btn-new-loan-tab')?.addEventListener('click', openNewLoanForClient);

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
      } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
    });

    c.querySelector('#btn-close-client')?.addEventListener('click', () => openCloseClientModal(id));

    c.querySelector('#btn-reactivate-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reactivate client?', message: `Reactivate ${cl.displayName}?`, confirmText: 'Reactivate' })) return;
      try {
        await api.clients.reactivate(id, { reactivationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Client reactivated', cl.displayName);
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Reactivation failed', extractFineractError(e)); }
    });

    c.querySelector('#btn-reject-client')?.addEventListener('click', () => openRejectClientModal(id));

    c.querySelector('#btn-withdraw-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Withdraw application?', message: 'Mark this application as withdrawn by the client?', confirmText: 'Withdraw', danger: true })) return;
      try {
        await api.clients.withdraw(id, {
          withdrawalDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Application withdrawn', '');
        import('../../../router.js').then(r => r.navigate('clients'));
      } catch (e) { toast('error', 'Withdrawal failed', extractFineractError(e)); }
    });

    c.querySelector('#btn-transfer-client')?.addEventListener('click', () => openTransferModal(id, cl.displayName));

    c.querySelector('#btn-undotransfer-client')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Undo transfer?', message: 'Cancel the pending transfer for this client?', danger: true, confirmText: 'Undo' })) return;
      try {
        await api.clients.undoTransfer(id);
        toast('success', 'Transfer undone', '');
        import('../../../router.js').then(r => r.navigate('client-detail', { id }));
      } catch (e) { toast('error', 'Undo failed', extractFineractError(e)); }
    });

    c.querySelector('#btn-assign-staff')?.addEventListener('click', () => openAssignStaffModal(id, cl));

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
    c.querySelector('#btn-add-collateral')?.addEventListener('click', () => openAddClientCollateralModal(id, () => loadClientCollateral(c, id)));

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
      } catch (e) { toast('error', 'Failed to add note', extractFineractError(e)); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load client</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.message || String(e))}</div>
    </div></div>`;
  }
}
