/* FinCraft · pages/centers/detail.js — renderDetail, group/meeting/notes/documents tab loaders, and the collection sheet.
   Auto-split from the original monolithic pages/centers.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../utils.js';
import { disassociateSelectedGroups, openAddGroupsModal, openCloseCenterModal, openEditCenterModal, openScheduleMeetingModal } from './actions.js';
import { can } from './shared.js';
import { enhanceScrollableTabs } from '../../ui/scrollable-tabs.js';

export async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading center…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No center selected</div>'; return; }

  try {
    const ctr = await api.centers.get(id, { associations: 'groupMembers,collection' });
    const status = ctr.status?.value || '';

    const canActivate = status === 'Pending' && can('ACTIVATE_CENTER');
    const canClose    = status === 'Active'  && can('CLOSE_CENTER');
    const canEdit     = can('UPDATE_CENTER');
    const canDelete   = can('DELETE_CENTER');
    const canAssocGrp = can('ASSOCIATEGROUPS_CENTER') || can('DISASSOCIATEGROUPS_CENTER');
    const canCollect  = can('READ_COLLECTIONSHEET');

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(ctr.name || '—')}</h1>
          <div class="text-muted">
            ${escapeHtml(ctr.accountNo || `C${ctr.id}`)} · ${escapeHtml(ctr.officeName || '')} · ${sb(status || '—')}
            ${ctr.staffName ? ` · Officer: ${escapeHtml(ctr.staffName)}` : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" id="ctr-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canEdit     ? `<button class="btn-secondary" id="ctr-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
          ${canActivate ? `<button class="btn-success"   id="ctr-activate"><i class="fa-solid fa-circle-check"></i> Activate</button>` : ''}
          ${canClose    ? `<button class="btn-danger"    id="ctr-close"><i class="fa-solid fa-circle-xmark"></i> Close</button>` : ''}
          ${canCollect  ? `<button class="btn-secondary" id="ctr-collection"><i class="fa-solid fa-file-invoice-dollar"></i> Collection Sheet</button>` : ''}
          ${canDelete   ? `<button class="btn-danger"    id="ctr-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="ctr-tabs">
          <button class="tab" data-ctrtab="overview">Overview</button>
          ${can('READ_GROUP') ? `<button class="tab" data-ctrtab="groups">Groups (${(ctr.groupMembers || []).length})</button>` : ''}
          ${can('READ_MEETING') ? `<button class="tab" data-ctrtab="meetings">Meetings</button>` : ''}
          ${canCollect ? `<button class="tab" data-ctrtab="collection">Collection Sheet</button>` : ''}
          ${can('READ_NOTE') ? `<button class="tab" data-ctrtab="notes">Notes</button>` : ''}
          ${can('READ_DOCUMENT') ? `<button class="tab" data-ctrtab="documents">Documents</button>` : ''}
        </div>

        <!-- Overview -->
        <div class="tab-panel" data-ctrpanel="overview">
          <dl class="dl-grid">
            <dt>Name</dt><dd>${escapeHtml(ctr.name || '—')}</dd>
            <dt>Account No</dt><dd>${escapeHtml(ctr.accountNo || '—')}</dd>
            <dt>Status</dt><dd>${sb(status || '—')}</dd>
            <dt>Office</dt><dd>${escapeHtml(ctr.officeName || '—')}</dd>
            <dt>Staff</dt><dd>${escapeHtml(ctr.staffName || 'Unassigned')}</dd>
            <dt>Hierarchy</dt><dd>${escapeHtml(ctr.hierarchy || '—')}</dd>
            <dt>External ID</dt><dd>${escapeHtml(ctr.externalId || '—')}</dd>
            <dt>Activation</dt><dd>${fmtDate(ctr.activationDate) || '—'}</dd>
            <dt>Submitted</dt><dd>${fmtDate(ctr.timeline?.submittedOnDate) || '—'}</dd>
          </dl>
        </div>

        <!-- Groups -->
        <div class="tab-panel" data-ctrpanel="groups" hidden>
          <div class="section-header">
            <h3>Associated Groups</h3>
            ${canAssocGrp ? `
              <div>
                <button class="btn-primary btn-sm" id="ctr-add-groups"><i class="fa-solid fa-plus"></i> Associate Groups</button>
                <button class="btn-secondary btn-sm" id="ctr-remove-groups"><i class="fa-solid fa-minus"></i> Disassociate Selected</button>
              </div>` : ''}
          </div>
          <div id="ctr-groups-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Meetings -->
        <div class="tab-panel" data-ctrpanel="meetings" hidden>
          <div class="section-header">
            <h3>Meeting Schedule</h3>
            ${can('CREATE_MEETING') ? `<button class="btn-primary btn-sm" id="ctr-add-meeting"><i class="fa-solid fa-calendar-plus"></i> Schedule Meeting</button>` : ''}
          </div>
          <div id="ctr-meeting-cal"><div class="empty-state-row">Loading…</div></div>
          <h3 class="mt-4">Past & Upcoming Meetings</h3>
          <div id="ctr-meeting-list"><div class="empty-state-row">Loading…</div></div>
        </div>

        <!-- Collection Sheet -->
        <div class="tab-panel" data-ctrpanel="collection" hidden>
          <div class="section-header">
            <h3>Collection Sheet</h3>
            <div>
              <label class="text-muted">Meeting date
                <input type="date" id="ctr-cs-date" class="form-control" value="${today()}"/>
              </label>
              <button class="btn-primary btn-sm" id="ctr-cs-generate"><i class="fa-solid fa-bolt"></i> Generate</button>
              ${can('SAVECOLLECTIONSHEET_CENTER') ? `<button class="btn-success btn-sm" id="ctr-cs-save"><i class="fa-solid fa-save"></i> Save Sheet</button>` : ''}
            </div>
          </div>
          <div id="ctr-cs-wrap"><div class="empty-state-row">Click <b>Generate</b> to load the collection sheet for the selected date</div></div>
        </div>

        <!-- Notes -->
        <div class="tab-panel" data-ctrpanel="notes" hidden>
          <h3>Notes</h3>
          <div id="ctr-note-list"><div class="empty-state-row">Loading…</div></div>
          <div class="mt-3">
            <textarea id="ctr-note-input" class="form-control" rows="2" placeholder="Add a note…"></textarea>
            <button class="btn-primary mt-2" id="ctr-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>

        <!-- Documents -->
        <div class="tab-panel" data-ctrpanel="documents" hidden>
          <h3>Documents</h3>
          <div id="ctr-doc-list"><div class="empty-state-row">Loading…</div></div>
          <form id="ctr-doc-form" class="form-grid mt-3">
            <label>Document name * <input name="name" class="form-control" required/></label>
            <label>Description <input name="description" class="form-control"/></label>
            <label class="full">File * <input type="file" name="file" required/></label>
            <button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button>
          </form>
        </div>
      </div>`;

    // -------- Tab switching with deep-link --------
    enhanceScrollableTabs(c.querySelector('#ctr-tabs'));
    const tabs = c.querySelectorAll('[data-ctrtab]');
    const panels = c.querySelectorAll('[data-ctrpanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      groups:     () => loadGroups(c, id, ctr),
      meetings:   () => loadMeetings(c, id),
      collection: () => initCollectionSheet(c, id),
      notes:      () => loadNotes(c, id),
      documents:  () => loadDocuments(c, id)
    };
    function switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.ctrtab === name));
      panels.forEach(p => p.hidden = p.dataset.ctrpanel !== name);
      if (lazyLoaders[name] && !lazyLoaded[name]) {
        lazyLoaders;
        lazyLoaded[name] = true;
      }
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('tab', name);
      location.hash = `centers?${params.toString()}`;
    }
    tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.ctrtab)));
    switchTab(initialTab || 'overview');

    // -------- Toolbar --------
    c.querySelector('#ctr-back').addEventListener('click', () => {
      import('../../router.js').then(r => r.navigate('centers'));
    });
    c.querySelector('#ctr-edit')?.addEventListener('click', () => openEditCenterModal(ctr, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#ctr-activate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate center?', confirmText: 'Activate' })) return;
      try {
        await api.centers.activate(id, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Center activated', ctr.name);
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#ctr-close')?.addEventListener('click', () => openCloseCenterModal(id));
    c.querySelector('#ctr-collection')?.addEventListener('click', () => switchTab('collection'));
    c.querySelector('#ctr-delete')?.addEventListener('click', async () => {
      if (!await confirm({
        title: 'Delete center?',
        message: 'This permanently deletes the center. Only allowed if no groups remain. Continue?',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.centers.delete(id);
        toast('success', 'Center deleted', '');
        import('../../router.js').then(r => r.navigate('centers'));
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    });

    c.querySelector('#ctr-add-groups')?.addEventListener('click', () => openAddGroupsModal(id, ctr, () => document.dispatchEvent(new CustomEvent('fc:reload'))));
    c.querySelector('#ctr-remove-groups')?.addEventListener('click', () => disassociateSelectedGroups(c, id));
    c.querySelector('#ctr-add-meeting')?.addEventListener('click', () => openScheduleMeetingModal(id, () => loadMeetings(c, id)));

    // -------- Notes --------
    c.querySelector('#ctr-note-save')?.addEventListener('click', async () => {
      const inp = c.querySelector('#ctr-note-input');
      const note = inp.value.trim(); if (!note) return;
      try {
        await api.notes.create('centers', id, { note });
        inp.value = '';
        loadNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });

    // -------- Documents --------
    c.querySelector('#ctr-doc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target; const fd = new FormData(form);
      if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file to upload'); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api.documents.upload('centers', id, fd);
        toast('success', 'Document uploaded', fd.get('name'));
        form.reset();
        loadDocuments(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message); }
      finally { btn.disabled = false; }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load center</b></div>
      <div class="text-muted mt-2">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
    </div></div>`;
  }
}

async function loadGroups(c, id, center) {
  const wrap = c.querySelector('#ctr-groups-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const fresh = await api.centers.get(id, { associations: 'groupMembers' });
    const list = fresh.groupMembers || [];
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th><input type="checkbox" id="ctr-grp-all"/></th>
          <th>Name</th><th>Account</th><th>Office</th><th>Members</th><th>Status</th>
        </tr></thead>
        <tbody>${list.map(g => `
          <tr>
            <td><input type="checkbox" class="ctr-grp-chk" value="${g.id}"/></td>
            <td><a href="#" data-view-group="${g.id}">${escapeHtml(g.name || '—')}</a></td>
            <td>${escapeHtml(g.accountNo || '')}</td>
            <td>${escapeHtml(g.officeName || '—')}</td>
            <td>${(g.clientMembers || []).length || g.activeClientMembers || '—'}</td>
            <td>${sb(g.status?.value || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No groups associated</div>';

    wrap.querySelector('#ctr-grp-all')?.addEventListener('change', (e) => {
      wrap.querySelectorAll('.ctr-grp-chk').forEach(cb => cb.checked = e.target.checked);
    });
    wrap.querySelectorAll('[data-view-group]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../router.js').then(r => r.navigate('groups', { id: b.dataset.viewGroup }));
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function loadMeetings(c, id) {
  const calWrap = c.querySelector('#ctr-meeting-cal');
  const listWrap = c.querySelector('#ctr-meeting-list');
  calWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  listWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';

  try {
    const cals = await api.calendars.list('centers', id, { calendarType: 'collection' });
    const calList = Array.isArray(cals) ? cals : [];
    const activeCal = calList[0];

    calWrap.innerHTML = activeCal ? `
      <div class="calendar-summary">
        <div><b>Title:</b> ${escapeHtml(activeCal.title || '—')}</div>
        <div><b>Starts:</b> ${fmtDate(activeCal.startDate) || '—'}</div>
        <div><b>Frequency:</b> ${escapeHtml(activeCal.repeatingDescription || activeCal.frequency?.value || '—')}</div>
        <div class="mt-2">
          ${can('UPDATE_CALENDAR') ? `<button class="btn-secondary btn-sm" data-edit-cal="${activeCal.id}">Edit Schedule</button>` : ''}
          ${can('DELETE_CALENDAR') ? `<button class="btn-danger btn-sm" data-del-cal="${activeCal.id}">Delete Schedule</button>` : ''}
        </div>
      </div>` : '<div class="empty-state-row">No meeting schedule set</div>';

    calWrap.querySelector('[data-del-cal]')?.addEventListener('click', async (e) => {
      if (!await confirm({ title: 'Delete meeting schedule?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.calendars.delete('centers', id, e.target.dataset.delCal);
        toast('success', 'Schedule deleted', '');
        loadMeetings(c, id);
      } catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
    });
    calWrap.querySelector('[data-edit-cal]')?.addEventListener('click', () =>
      openScheduleMeetingModal(id, () => loadMeetings(c, id), activeCal));

    if (activeCal) {
      const ms = await api.meetings.list('centers', id, { calendarId: activeCal.id });
      const list = Array.isArray(ms) ? ms : [];
      listWrap.innerHTML = list.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th>Present</th><th>Absent</th><th></th></tr></thead>
          <tbody>${list.map(m => `
            <tr>
              <td>${fmtDate(m.meetingDate) || '—'}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'PRESENT').length || 0}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'ABSENT').length || 0}</td>
              <td class="text-right">
                ${can('DELETE_MEETING') ? `<button class="btn-mini btn-danger" data-del-meet="${m.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No meeting instances</div>';

      listWrap.querySelectorAll('[data-del-meet]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Delete meeting?', danger: true, confirmText: 'Delete' })) return;
        try { await api.meetings.delete('centers', id, b.dataset.delMeet); toast('success', 'Deleted', ''); loadMeetings(c, id); }
        catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
      }));
    } else {
      listWrap.innerHTML = '<div class="empty-state-row">Schedule meetings to see instances</div>';
    }
  } catch (e) { calWrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; listWrap.innerHTML = ''; }
}

function initCollectionSheet(c, id) {
  // The button handlers must be wired AFTER the panel is shown (lazy-load).
  const dateEl = c.querySelector('#ctr-cs-date');
  const genBtn = c.querySelector('#ctr-cs-generate');
  const saveBtn = c.querySelector('#ctr-cs-save');
  const wrap = c.querySelector('#ctr-cs-wrap');

  let latestSheet = null;

  genBtn?.addEventListener('click', async () => {
    const meetingDate = dateEl.value;
    if (!meetingDate) { toast('warn', 'Enter a meeting date', ''); return; }
    genBtn.disabled = true;
    wrap.innerHTML = '<div class="empty-state-row">Generating…</div>';
    try {
      latestSheet = await api.centers.generateCollectionSheet(id, {
        meetingDate, dateFormat: DATE_FORMAT, locale: LOCALE
      });
      renderCollectionSheet(wrap, latestSheet);
    } catch (e) {
      wrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    } finally { genBtn.disabled = false; }
  });

  saveBtn?.addEventListener('click', async () => {
    if (!latestSheet) { toast('warn', 'Generate first', ''); return; }
    const meetingDate = dateEl.value;
    // Collect inputs the user may have edited inline
    const transactions = [];
    wrap.querySelectorAll('[data-cs-row]').forEach(row => {
      const loanId = row.dataset.csRow;
      const amt = parseFloat(row.querySelector('[data-cs-amount]')?.value || '0');
      if (!isNaN(amt) && amt > 0) {
        transactions.push({ loanId: parseInt(loanId), transactionAmount: amt });
      }
    });
    if (!transactions.length) { toast('warn', 'Enter at least one repayment amount', ''); return; }
    saveBtn.disabled = true;
    try {
      await api.centers.saveCollectionSheet(id, {
        actualDisbursementDate: meetingDate,
        transactionDate: meetingDate,
        dateFormat: DATE_FORMAT, locale: LOCALE,
        bulkRepaymentTransactions: transactions
      });
      toast('success', 'Collection sheet saved', `${transactions.length} repayments posted`);
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
    finally { saveBtn.disabled = false; }
  });
}

function renderCollectionSheet(wrap, sheet) {
  const groups = sheet?.groups || [];
  if (!groups.length) {
    wrap.innerHTML = '<div class="empty-state-row">No collection-sheet entries for this date</div>';
    return;
  }
  wrap.innerHTML = groups.map(g => `
    <h4 class="mt-3">${escapeHtml(g.name)}</h4>
    <table class="table">
      <thead><tr>
        <th>Client</th><th>Loan #</th><th>Due</th><th>Outstanding</th><th>Repay Amount</th>
      </tr></thead>
      <tbody>${(g.clients || []).flatMap(cl =>
        (cl.loans || []).map(l => `
          <tr data-cs-row="${l.loanId}">
            <td>${escapeHtml(cl.clientName || '')}</td>
            <td>${escapeHtml(l.accountId || l.loanId)}</td>
            <td class="text-right">${fmt(l.totalDue ?? 0)}</td>
            <td class="text-right">${fmt(l.principalOutstanding + l.interestOutstanding + (l.chargesOutstanding || 0))}</td>
            <td><input type="number" step="0.01" data-cs-amount class="form-control" value="${l.totalDue || ''}"/></td>
          </tr>`)).join('')}
      </tbody>
    </table>`).join('');
}

async function loadNotes(c, id) {
  const listEl = c.querySelector('#ctr-note-list');
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const notes = await api.notes.list('centers', id);
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

async function loadDocuments(c, id) {
  const listEl = c.querySelector('#ctr-doc-list');
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const docs = await api.documents.list('centers', id);
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
      </table>` : '<div class="empty-state-row">No documents uploaded</div>';

    listEl.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.documents.download('centers', id, b.dataset.docDl);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `document-${b.dataset.docDl}`;
        a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    listEl.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' })) return;
      try { await api.documents.delete('centers', id, b.dataset.docDel); toast('success', 'Deleted', ''); loadDocuments(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
