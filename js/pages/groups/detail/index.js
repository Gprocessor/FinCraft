/* FinCraft · pages/groups/detail/index.js — renderDetail — tab shell.
   Auto-split from the original monolithic pages/groups/detail.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmtDate, sb } from '../../../utils.js';
import { openAddMembersModal, openAssignRoleModal, openAssignStaffModal, openCloseGroupModal, openEditGroupModal, openScheduleMeetingModal, openTransferMembersModal } from '../actions.js';
import { can } from '../shared.js';
import { loadCharges, loadMeetings, loadStandingInstructions } from './meetings-charges.js';
import { loadAccounts, loadMembers, loadRoles } from './members.js';
import { loadDocuments, loadNotes } from './notes-docs.js';
import { enhanceScrollableTabs } from '../../../ui/scrollable-tabs.js';

export async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading group…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No group selected</div>'; return; }

  try {
    const g = await api.groups.get(id, { associations: 'all' });
    const status = g.status?.value || '';

    const canActivate = status === 'Pending' && can('ACTIVATE_GROUP');
    const canClose    = status === 'Active'  && can('CLOSE_GROUP');
    const canEdit     = can('UPDATE_GROUP');
    const canDelete   = can('DELETE_GROUP');
    const canAssign   = can('ASSIGNSTAFF_GROUP');
    const canMembers  = can('ASSOCIATECLIENTS_GROUP') || can('DISASSOCIATECLIENTS_GROUP');
    const canCollect  = can('READ_COLLECTIONSHEET');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(g.name || '—')}</h1>
          <div class="text-muted">
            ${escapeHtml(g.accountNo || `G${g.id}`)} · ${escapeHtml(g.officeName || '')} · ${sb(status || '—')}
            ${g.staffName ? ` · Officer: ${escapeHtml(g.staffName)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="grp-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit     ? `<button class="btn-secondary" id="grp-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canActivate ? `<button class="btn-success"   id="grp-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canClose    ? `<button class="btn-danger"    id="grp-close"><i class="fa-solid fa-circle-xmark"></i> Close</button>` : ''}
          ${canAssign   ? `<button class="btn-secondary" id="grp-assign-staff"><i class="fa-solid fa-user-tag"></i> Staff</button>` : ''}
          ${canCollect  ? `<button class="btn-secondary" id="grp-collection"><i class="fa-solid fa-file-invoice-dollar"></i> Collection Sheet</button>` : ''}
          ${canDelete   ? `<button class="btn-danger"    id="grp-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="grp-tabs">
          <button class="tab" data-grptab="overview">Overview</button>
          ${canMembers || can('READ_GROUP') ? `<button class="tab" data-grptab="members">Members (${(g.clientMembers || []).length})</button>` : ''}
          ${can('READ_LOAN') || can('READ_SAVINGSACCOUNT') ? `<button class="tab" data-grptab="accounts">Accounts</button>` : ''}
          ${can('READ_MEETING') ? `<button class="tab" data-grptab="meetings">Meetings</button>` : ''}
          <button class="tab" data-grptab="charges">Charges</button>
          ${can('READ_ACCOUNTTRANSFER') ? `<button class="tab" data-grptab="si">Standing Instructions</button>` : ''}
          ${can('READ_GROUPNOTE') ? `<button class="tab" data-grptab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-grptab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-grppanel="overview">
          <dl class="dl-grid">
            <dt>Name</dt><dd>${escapeHtml(g.name || '—')}</dd>
            <dt>Account No</dt><dd>${escapeHtml(g.accountNo || '—')}</dd>
            <dt>Status</dt><dd>${sb(status || '—')}</dd>
            <dt>Office</dt><dd>${escapeHtml(g.officeName || '—')}</dd>
            <dt>Centre</dt><dd>${escapeHtml(g.centerName || '—')}</dd>
            <dt>Staff</dt><dd>${escapeHtml(g.staffName || 'Unassigned')}</dd>
            <dt>Hierarchy</dt><dd>${escapeHtml(g.hierarchy || '—')}</dd>
            <dt>External ID</dt><dd>${escapeHtml(g.externalId || '—')}</dd>
            <dt>Activation</dt><dd>${fmtDate(g.activationDate) || '—'}</dd>
            <dt>Submitted</dt><dd>${fmtDate(g.timeline?.submittedOnDate) || '—'}</dd>
          </dl>
        </div>

        <!-- Members -->
        <div class="tab-panel" data-grppanel="members" hidden>
          <div class="section-header">
            <h3>Members</h3>
            ${canMembers ? `
              <div>
                <button class="btn-primary btn-sm" id="grp-add-members"><i class="fa-solid fa-user-plus"></i> Add Members</button>
                <button class="btn-secondary btn-sm" id="grp-transfer-members"><i class="fa-solid fa-right-left"></i> Transfer Selected</button>
              </div>` : ''}
          </div>
          <div id="grp-members-list"><div class="empty-state-row">Loading…</div></div>

          <div class="section-header mt-4">
            <h3>Member Roles</h3>
            ${can('ASSIGNROLE_GROUP') ? `<button class="btn-secondary btn-sm" id="grp-assign-role"><i class="fa-solid fa-user-tag"></i> Assign Role</button>` : ''}
          </div>
          <div id="grp-roles-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Accounts -->
        <div class="tab-panel" data-grppanel="accounts" hidden>
          <div id="grp-accounts-wrap"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Meetings -->
        <div class="tab-panel" data-grppanel="meetings" hidden>
          <div class="section-header">
            <h3>Meeting Schedule</h3>
            ${can('CREATE_MEETING') ? `<button class="btn-primary btn-sm" id="grp-add-meeting"><i class="fa-solid fa-calendar-plus"></i> Schedule Meeting</button>` : ''}
          </div>
          <div id="grp-meeting-cal"><div class="empty-state-row">Loading…</div></div>
          <h3 class="mt-4">Past & Upcoming Meetings</h3>
          <div id="grp-meeting-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Charges -->
        <div class="tab-panel" data-grppanel="charges" hidden>
          <div class="section-header">
            <h3>Charges</h3>

          </div>
          <div id="grp-charges-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Standing Instructions -->
        <div class="tab-panel" data-grppanel="si" hidden>
          <h3>Standing Instructions</h3>
          <div id="grp-si-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Notes -->
        <div class="tab-panel" data-grppanel="notes" hidden>
          <h3>Notes</h3>
          <div id="grp-note-list"><div class="empty-state-row">Loading…</div></div>
          <div class="mt-3">
            <textarea id="grp-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
            <button class="btn-primary mt-2" id="grp-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>

        <!-- Documents -->
        <div class="tab-panel" data-grppanel="documents" hidden>
          <h3>Documents</h3>
          <div id="grp-doc-list"><div class="empty-state-row">Loading…</div></div>
          <form id="grp-doc-form" class="form-grid mt-3">
            <label>Document name * <input name="name" class="form-control" required/></label>
            <label>Description <input name="description" class="form-control"/></label>
            <label class="full">File * <input type="file" name="file" required/></label>
            <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
          </form>
        </div>
      </div>`;

    // -------- Tab switching with deep-link --------
    enhanceScrollableTabs(c.querySelector('#grp-tabs'));
    const tabs = c.querySelectorAll('[data-grptab]');
    const panels = c.querySelectorAll('[data-grppanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      members:    () => { loadMembers(c, id, g); loadRoles(c, id); },
      accounts:   () => loadAccounts(c, id),
      meetings:   () => loadMeetings(c, id),
      charges:    () => loadCharges(c, id),
      si:         () => loadStandingInstructions(c, id, g),
      notes:      () => loadNotes(c, id),
      documents:  () => loadDocuments(c, id)
    };
function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.grptab === name));
      panels.forEach(p => p.hidden = p.dataset.grppanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders[name]();
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `groups?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.grptab)));
    switchTab(initialTab || 'overview');

    // -------- Toolbar handlers --------
    c.querySelector('#grp-back').addEventListener('click', () => {
      import('../../../router.js').then(r => r.navigate('groups'));
    });
    c.querySelector('#grp-edit')?.addEventListener('click', () => openEditGroupModal(g, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#grp-activate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate group?', confirmText: 'Activate' })) return;
      try {
        await api.groups.activate(id, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Group activated', g.name);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#grp-close')?.addEventListener('click', () => openCloseGroupModal(id));
    c.querySelector('#grp-assign-staff')?.addEventListener('click', () => openAssignStaffModal(id, g));
    c.querySelector('#grp-collection')?.addEventListener('click', () => {
      import('../../../router.js').then(r => r.navigate('collections', { groupId: id }));
    });
    c.querySelector('#grp-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete group?',
        message: 'This permanently deletes the group. Only allowed if it has no members or associated accounts. Continue?',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.groups.delete(id);
        toast('success', 'Group deleted', '');
        import('../../../router.js').then(r => r.navigate('groups'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#grp-add-members')?.addEventListener('click', () => openAddMembersModal(id, g, () => loadMembers(c, id, g)));
    c.querySelector('#grp-transfer-members')?.addEventListener('click', () => openTransferMembersModal(id, g));
    c.querySelector('#grp-assign-role')?.addEventListener('click', () => openAssignRoleModal(id, g, () => loadRoles(c, id)));
    c.querySelector('#grp-add-meeting')?.addEventListener('click', () => openScheduleMeetingModal(id, () => loadMeetings(c, id)));

    // -------- Notes --------
    c.querySelector('#grp-note-save')?.addEventListener('click', async () => {
      const inp = c.querySelector('#grp-note-input');
      const note = inp.value.trim(); if (!note) return;
      try {
        await api.notes.create('groups', id, { note });
        inp.value = '';
        loadNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });

    // -------- Documents --------
    c.querySelector('#grp-doc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target; const fd = new FormData(form);
      if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file to upload'); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api.documents.upload('groups', id, fd);
        toast('success', 'Document uploaded', fd.get('name'));
        form.reset();
        loadDocuments(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message); }
      finally { btn.disabled = false; }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load group</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}
