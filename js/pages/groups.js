import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · groups.js — Full group lifecycle + tabs (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { num, ini, sb, escapeHtml, fmt, fmtDate } from '../utils.js';
import { toast, confirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

export async function render(c, params = {}) {
  if (params.view === 'detail' || params.id) return renderDetail(c, params.id, params.tab);
  return renderList(c);
}

// ============================================================
// LIST VIEW
// ============================================================
async function renderList(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Groups</h1>
        <div class="text-muted">JLG / Solidarity / Savings groups · <span id="grp-count">—</span> total</div>
      </div>
      <div class="page-actions">
        ${can('CREATE_GROUP') ? `<button class="btn-primary" data-modal="newGroupModal"><i class="fa-solid fa-plus"></i> New Group</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input id="grp-search" class="form-control" placeholder="Search by name…" autocomplete="off"/>
        <select id="grp-status" class="form-control">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
        <select id="grp-office" class="form-control"><option value="">All Offices</option></select>
        <button class="btn-secondary" id="grp-export"><i class="fa-solid fa-download"></i> Export CSV</button>
      </div>

      <table class="table">
        <thead><tr>
          <th>Account</th><th>Group Name</th><th>Office</th>
          <th>Staff</th><th>Members</th><th>Status</th><th></th>
        </tr></thead>
        <tbody id="grp-rows">
          <tr><td colspan="7" class="empty-state-row">Loading…</td></tr>
        </tbody>
      </table>
      <div id="grp-pagination" class="pagination-bar"></div>
    </div>`;

  api.offices.list().then(offices => {
    const sel = c.querySelector('#grp-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id; opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  let allGroups = [], totalRecords = 0, currentOffset = 0;
  const PAGE_SIZE = 50;

  async function load(offset = 0) {
    c.querySelector('#grp-rows').innerHTML =
      '<tr><td colspan="7" class="empty-state-row">Loading…</td></tr>';
    try {
      const officeId = c.querySelector('#grp-office')?.value;
      const status   = c.querySelector('#grp-status')?.value;
      const q        = c.querySelector('#grp-search')?.value?.trim();
      const params   = { limit: PAGE_SIZE, offset, paged: true };
      if (officeId) params.officeId = officeId;
      if (q) params.name = q;

      const res = await api.groups.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      totalRecords = res?.totalFilteredRecords ?? list.length;
      // Status is client-side filterable since Fineract GET /groups doesn't accept status directly
      if (status) list = list.filter(g => (g.status?.value || '').toLowerCase() === status);
      allGroups = list;
      currentOffset = offset;
      c.querySelector('#grp-count').textContent = num(totalRecords);
      draw(list);
      drawPagination();
    } catch (e) {
      c.querySelector('#grp-rows').innerHTML =
        `<tr><td colspan="7" class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</td></tr>`;
    }
  }

  function drawPagination() {
    const pageEl = c.querySelector('#grp-pagination');
    if (totalRecords <= PAGE_SIZE) { pageEl.innerHTML = ''; return; }
    const from = totalRecords ? currentOffset + 1 : 0;
    const to = Math.min(currentOffset + PAGE_SIZE, totalRecords);
    pageEl.innerHTML = `
      <span class="text-muted">Showing ${from}–${to} of ${num(totalRecords)}</span>
      <div class="pagination-actions">
        <button class="btn-secondary" id="grp-prev" ${currentOffset > 0 ? '' : 'disabled'}>Prev</button>
        <button class="btn-secondary" id="grp-next" ${currentOffset + PAGE_SIZE < totalRecords ? '' : 'disabled'}>Next</button>
      </div>`;
    c.querySelector('#grp-prev')?.addEventListener('click', () => load(Math.max(0, currentOffset - PAGE_SIZE)));
    c.querySelector('#grp-next')?.addEventListener('click', () => load(currentOffset + PAGE_SIZE));
  }

  function draw(rows) {
    c.querySelector('#grp-rows').innerHTML = rows.map(g => `
      <tr>
        <td>g.id}">${escapeHtml(g.accountNo || `G${g.id}`)}</a></td>
        <td>${escapeHtml(g.name || '—')}</td>
        <td>${escapeHtml(g.officeName || '—')}</td>
        <td>${escapeHtml(g.staffName || '—')}</td>
        <td>${(g.clientMembers || []).length || g.activeClientMembers || '—'}</td>
        <td>${sb(g.status?.value || '—')}</td>
        <td class="text-right">
          ${(g.status?.value === 'Pending' && can('ACTIVATE_GROUP'))
            ? `<button class="btn-mini btn-success" data-grp-activate="${g.id}">Activate</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-state-row">No groups found</td></tr>';

    c.querySelectorAll('[data-grp-activate]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.groups.activate(b.dataset.grpActivate, {
          activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Group activated', `#${b.dataset.grpActivate}`);
        load(currentOffset);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  }

  await load();

  let t;
  c.querySelector('#grp-search').addEventListener('input', () => {
    clearTimeout(t); t = setTimeout(() => load(0), 400);
  });
  ['#grp-status', '#grp-office'].forEach(sel => {
    c.querySelector(sel)?.addEventListener('change', () => load(0));
  });

  c.querySelector('#grp-export').addEventListener('click', () => {
    const rows = allGroups.map(g => [
      g.accountNo, g.name, g.officeName, g.staffName,
      (g.clientMembers || []).length, g.status?.value
    ].join(','));
    const csv = ['Account,Name,Office,Staff,Members,Status', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'groups.csv'; a.click();
    toast('success', 'Exported', 'groups.csv downloaded');
  });
}

// ============================================================
// DETAIL VIEW (tabbed)
// ============================================================
async function renderDetail(c, id, initialTab = 'overview') {
  c.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading group…</div></div>`;
  if (!id) { c.innerHTML = '<div class="empty-state">No group selected</div>'; return; }

  try {
    const g = await api.groups.get(id, { associations: 'all' });
    const status = g.status?.value || '';

    const canActivate = status === 'Pending' && can('ACTIVATE_GROUP');
    const canClose    = status === 'Active'  && can('CLOSE_GROUP');
    const canEdit     = can('UPDATE_GROUP');
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
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="grp-tabs">
          <button class="tab" data-grptab="overview">Overview</button>
          ${canMembers || can('READ_GROUP') ? `<button class="tab" data-grptab="members">Members (${(g.clientMembers || []).length})</button>` : ''}
          ${can('READ_LOAN') || can('READ_SAVINGSACCOUNT') ? `<button class="tab" data-grptab="accounts">Accounts</button>` : ''}
          ${can('READ_MEETING') ? `<button class="tab" data-grptab="meetings">Meetings</button>` : ''}
          ${can('READ_GROUPCHARGE') ? `<button class="tab" data-grptab="charges">Charges</button>` : ''}
          ${can('READ_STANDINGINSTRUCTION') ? `<button class="tab" data-grptab="si">Standing Instructions</button>` : ''}
          ${can('READ_NOTE') ? `<button class="tab" data-grptab="notes">Notes</button>` : ''}
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
            ${can('CREATE_GROUPCHARGE') ? `<button class="btn-primary btn-sm" id="grp-add-charge"><i class="fa-solid fa-plus"></i> Apply Charge</button>` : ''}
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
    const tabs = c.querySelectorAll('[data-grptab]');
    const panels = c.querySelectorAll('[data-grppanel]');
    const lazyLoaded = {};
    const lazyLoaders = {
      members:    () => loadMembers(c, id, g),
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
      import('../router.js').then(r => r.navigate('groups'));
    });
    c.querySelector('#grp-edit')?.addEventListener('click', () => openEditGroupModal(g, () => location.reload()));
    c.querySelector('#grp-activate')?.addEventListener('click', async () => {
      if (!await confirm({ title: 'Activate group?', confirmText: 'Activate' })) return;
      try {
        await api.groups.activate(id, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Group activated', g.name);
        location.reload();
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    });
    c.querySelector('#grp-close')?.addEventListener('click', () => openCloseGroupModal(id));
    c.querySelector('#grp-assign-staff')?.addEventListener('click', () => openAssignStaffModal(id, g));
    c.querySelector('#grp-collection')?.addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('collections', { groupId: id }));
    });

    c.querySelector('#grp-add-members')?.addEventListener('click', () => openAddMembersModal(id, g, () => loadMembers(c, id, g)));
    c.querySelector('#grp-transfer-members')?.addEventListener('click', () => openTransferMembersModal(id, g));
    c.querySelector('#grp-add-meeting')?.addEventListener('click', () => openScheduleMeetingModal(id, () => loadMeetings(c, id)));
    c.querySelector('#grp-add-charge')?.addEventListener('click', () => openApplyChargeModal(id, () => loadCharges(c, id)));

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

// ============================================================
// MEMBERS TAB
// ============================================================
async function loadMembers(c, id, group) {
  const wrap = c.querySelector('#grp-members-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const fresh = await api.groups.get(id, { associations: 'clientMembers' });
    const list = fresh.clientMembers || [];
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th><input type="checkbox" id="mem-all"/></th>
          <th>Name</th><th>Account</th><th>Office</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(m => `
          <tr>
            <td><input type="checkbox" class="mem-chk" value="${m.id}"/></td>
            <td>
              <div class="user-cell">
                <div class="avatar">${ini(m.displayName)}</div>
                m.id}">${escapeHtml(m.displayName || '—')}</a>
              </div>
            </td>
            <td>${escapeHtml(m.accountNo || '')}</td>
            <td>${escapeHtml(m.officeName || '—')}</td>
            <td>${sb(m.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DISASSOCIATECLIENTS_GROUP') ?
                `<button class="btn-mini btn-danger" data-remove-member="${m.id}">Remove</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No members in this group</div>';

    wrap.querySelector('#mem-all')?.addEventListener('change', (e) => {
      wrap.querySelectorAll('.mem-chk').forEach(cb => cb.checked = e.target.checked);
    });
    wrap.querySelectorAll('[data-remove-member]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove member?', message: 'Disassociate this client from the group?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.groups.disassociateClients(id, { clientMembers: [parseInt(b.dataset.removeMember)] });
        toast('success', 'Member removed', '');
        loadMembers(c, id, group);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openAddMembersModal(groupId, group, onSuccess) {
  const mid = `grp-addmem-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Add Members</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Search active clients in <b>${escapeHtml(group.officeName || '')}</b>
            <input id="am-search" class="form-control" placeholder="Type to search…" autocomplete="off"/>
          </label>
          <div id="am-results" class="search-results-inline mt-2"></div>
          <h4 class="mt-3">Selected (<span id="am-count">0</span>)</h4>
          <div id="am-selected" class="chip-list"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="am-save">Add Selected</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  const selected = new Map();
  const refreshSelected = () => {
    el.querySelector('#am-count').textContent = selected.size;
    el.querySelector('#am-selected').innerHTML = [...selected.values()].map(c => `
      <span class="chip">${escapeHtml(c.displayName)}
        <button data-unselect="${c.id}">&times;</button>
      </span>`).join('') || '<span class="text-muted">None</span>';
    el.querySelectorAll('[data-unselect]').forEach(b => b.addEventListener('click', () => {
      selected.delete(parseInt(b.dataset.unselect)); refreshSelected();
    }));
  };

  let st;
  el.querySelector('#am-search').addEventListener('input', (e) => {
    clearTimeout(st);
    const q = e.target.value.trim();
    if (q.length < 2) { el.querySelector('#am-results').innerHTML = ''; return; }
    st = setTimeout(async () => {
      try {
        const res = await api.clients.list({
          displayName: q, officeId: group.officeId, status: 'active', limit: 20
        });
        const list = Array.isArray(res) ? res : (res?.pageItems || []);
        el.querySelector('#am-results').innerHTML = list.length ? list.map(c => `
          <button class="search-result" data-pick="${c.id}" data-name="${escapeHtml(c.displayName)}">
            <div class="avatar">${ini(c.displayName)}</div>
            <div><strong>${escapeHtml(c.displayName)}</strong><div class="text-muted small">${escapeHtml(c.accountNo || '')}</div></div>
          </button>`).join('') : '<div class="search-empty">No matches</div>';
        el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
          const cid = parseInt(b.dataset.pick);
          selected.set(cid, { id: cid, displayName: b.dataset.name });
          refreshSelected();
        }));
      } catch (er) { el.querySelector('#am-results').innerHTML = `<div class="text-error">${escapeHtml(er.message)}</div>`; }
    }, 300);
  });

  refreshSelected();

  el.querySelector('#am-save').addEventListener('click', async () => {
    if (!selected.size) { toast('warn', 'No clients selected', ''); return; }
    try {
      await api.groups.associateClients(groupId, { clientMembers: [...selected.keys()] });
      el.remove();
      toast('success', 'Members added', `${selected.size} clients added`);
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openTransferMembersModal(groupId, group) {
  const checked = Array.from(document.querySelectorAll('.mem-chk:checked')).map(cb => parseInt(cb.value));
  if (!checked.length) { toast('warn', 'No members selected', 'Tick at least one member to transfer'); return; }
  let groups = [];
  try {
    const r = await api.groups.list({ officeId: group.officeId, limit: 500 });
    groups = (Array.isArray(r) ? r : r?.pageItems || []).filter(x => x.id !== groupId);
  } catch {}
  const mid = `grp-xfer-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Transfer ${checked.length} Member(s)</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Destination group *
            <select id="tx-grp" class="form-control" required>
              <option value="">Select group…</option>
              ${groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2 checkbox-row"><input type="checkbox" id="tx-inherit"/> Inherit destination group's office</label>
          <label class="mt-2 checkbox-row"><input type="checkbox" id="tx-tx-loans"/> Transfer loan officer with members</label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tx-save">Transfer</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tx-save').addEventListener('click', async () => {
    const destinationGroupId = el.querySelector('#tx-grp').value;
    if (!destinationGroupId) { toast('warn', 'Select a group', ''); return; }
    try {
      await api.groups.transferClients(groupId, {
        destinationGroupId: parseInt(destinationGroupId),
        clients: checked,
        inheritDestinationGroupLoanOfficer: el.querySelector('#tx-tx-loans').checked,
        transferActiveLoans: true
      });
      el.remove();
      toast('success', 'Members transferred', `${checked.length} client(s)`);
      location.reload();
    } catch (e) { toast('error', 'Transfer failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// ACCOUNTS TAB
// ============================================================
async function loadAccounts(c, id) {
  const wrap = c.querySelector('#grp-accounts-wrap');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const acc = await api.groups.accounts(id);
    const loans   = acc?.loanAccounts || [];
    const savings = acc?.savingsAccounts || [];
    const memberLoans   = acc?.memberLoanAccounts || [];
    const memberSavings = acc?.memberSavingsAccounts || [];

    const sect = (title, rows, mapper, cols) => `
      <h3 class="mt-3">${title}</h3>
      <table class="table"><thead><tr>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(mapper).join('') :
          `<tr><td colspan="${cols.length}" class="empty-state-row">No ${title.toLowerCase()}</td></tr>`}
        </tbody></table>`;

    wrap.innerHTML = `
      ${sect('Group Loan Accounts', loans,
        l => `<tr>
          <td>${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td class="text-right">${fmt(l.loanBalance ?? 0)}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${sect('Group Savings Accounts', savings,
        s => `<tr>
          <td>${escapeHtml(s.accountNo || '')}</td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${memberLoans.length ? sect('Member Loans', memberLoans,
        l => `<tr>
          <td>${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.clientName || '')}</td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Client', 'Product', 'Status']) : ''}
      ${memberSavings.length ? sect('Member Savings', memberSavings,
        s => `<tr>
          <td>${escapeHtml(s.accountNo || '')}</td>
          <td>${escapeHtml(s.clientName || '')}</td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Client', 'Product', 'Status']) : ''}`;
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// MEETINGS TAB
// ============================================================
async function loadMeetings(c, id) {
  const calWrap = c.querySelector('#grp-meeting-cal');
  const listWrap = c.querySelector('#grp-meeting-list');
  calWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  listWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';

  try {
    const cals = await api.calendars.list('groups', id, { calendarType: 'collection' });
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
        await api.calendars.delete('groups', id, e.target.dataset.delCal);
        toast('success', 'Schedule deleted', '');
        loadMeetings(c, id);
      } catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
    });
    calWrap.querySelector('[data-edit-cal]')?.addEventListener('click', () =>
      openScheduleMeetingModal(id, () => loadMeetings(c, id), activeCal));

    // Meeting instances
    if (activeCal) {
      const ms = await api.meetings.list('groups', id, { calendarId: activeCal.id });
      const list = Array.isArray(ms) ? ms : [];
      listWrap.innerHTML = list.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th>Present</th><th>Absent</th><th>Notes</th><th></th></tr></thead>
          <tbody>${list.map(m => `
            <tr>
              <td>${fmtDate(m.meetingDate) || '—'}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'PRESENT').length || 0}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'ABSENT').length || 0}</td>
              <td>${escapeHtml(m.transactionId || '—')}</td>
              <td class="text-right">
                ${can('SAVEORUPDATEATTENDANCE_MEETING') ? `<button class="btn-mini" data-att="${m.id}">Attendance</button>` : ''}
                ${can('DELETE_MEETING') ? `<button class="btn-mini btn-danger" data-del-meet="${m.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No meeting instances</div>';

      listWrap.querySelectorAll('[data-att]').forEach(b => b.addEventListener('click', () =>
        openAttendanceModal(id, b.dataset.att, () => loadMeetings(c, id))));
      listWrap.querySelectorAll('[data-del-meet]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Delete meeting?', danger: true, confirmText: 'Delete' })) return;
        try { await api.meetings.delete('groups', id, b.dataset.delMeet); toast('success', 'Deleted', ''); loadMeetings(c, id); }
        catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
      }));
    } else {
      listWrap.innerHTML = '<div class="empty-state-row">Schedule meetings to see instances</div>';
    }
  } catch (e) { calWrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; listWrap.innerHTML = ''; }
}

async function openScheduleMeetingModal(groupId, onSuccess, existingCal) {
  const mid = `grp-meet-${Date.now()}`;
  const isEdit = !!existingCal;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Schedule'} Meeting</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Title * <input id="m-title" class="form-control" value="${escapeHtml(existingCal?.title || 'Group Meeting')}" required/></label>
          <label class="mt-2">Start date * <input type="date" id="m-start" class="form-control" value="${existingCal?.startDate || today()}" required/></label>
          <label class="mt-2">Frequency
            <select id="m-freq" class="form-control">
              <option value="1" ${existingCal?.frequency?.id === 1 ? 'selected' : ''}>Daily</option>
              <option value="2" ${existingCal?.frequency?.id === 2 ? 'selected' : 'selected'}>Weekly</option>
              <option value="3" ${existingCal?.frequency?.id === 3 ? 'selected' : ''}>Monthly</option>
            </select>
          </label>
          <label class="mt-2">Interval (every N) <input type="number" id="m-int" class="form-control" value="${existingCal?.interval || 1}" min="1"/></label>
          <label class="mt-2">Description <textarea id="m-desc" class="form-control" rows="2">${escapeHtml(existingCal?.description || '')}</textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="m-save">${isEdit ? 'Save Changes' : 'Schedule'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#m-save').addEventListener('click', async () => {
    const payload = {
      title: el.querySelector('#m-title').value.trim(),
      startDate: el.querySelector('#m-start').value,
      frequency: parseInt(el.querySelector('#m-freq').value),
      interval: parseInt(el.querySelector('#m-int').value) || 1,
      typeId: 1,  // 1 = COLLECTION calendar
      description: el.querySelector('#m-desc').value.trim() || undefined,
      repeating: true,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    try {
      if (isEdit) await api.calendars.update('groups', groupId, existingCal.id, payload);
      else        await api.calendars.create('groups', groupId, payload);
      el.remove();
      toast('success', isEdit ? 'Schedule updated' : 'Meeting scheduled', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openAttendanceModal(groupId, meetingId, onSuccess) {
  let members = [], options = [];
  try {
    const g = await api.groups.get(groupId, { associations: 'clientMembers' });
    members = g.clientMembers || [];
    const m = await api.meetings.get('groups', groupId, meetingId);
    options = m.attendanceTypeOptions || [
      { id: 1, name: 'Present' }, { id: 2, name: 'Absent' }, { id: 3, name: 'Approved' }, { id: 4, name: 'Leave' }
    ];
  } catch {}
  const mid = `grp-att-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Save Attendance</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${members.length ? `
            <table class="table">
              <thead><tr><th>Member</th><th>Attendance</th></tr></thead>
              <tbody>${members.map(m => `
                <tr>
                  <td>${escapeHtml(m.displayName)}</td>
                  <td>
                    <select class="form-control att-sel" data-cid="${m.id}">
                      ${options.map(o => `<option value="${o.id}">${escapeHtml(o.name || o.value)}</option>`).join('')}
                    </select>
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="empty-state-row">No members</div>'}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="att-save">Save Attendance</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#att-save').addEventListener('click', async () => {
    const clientsAttendance = Array.from(el.querySelectorAll('.att-sel')).map(s => ({
      clientId: parseInt(s.dataset.cid),
      attendanceType: parseInt(s.value)
    }));
    try {
      await api.meetings.saveAttendance('groups', groupId, meetingId, {
        clientsAttendance, dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Attendance saved', '');
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// CHARGES TAB
// ============================================================
async function loadCharges(c, id) {
  const wrap = c.querySelector('#grp-charges-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.groups.charges(id);
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
              ${!ch.isPaid && !ch.isWaived && can('PAY_GROUPCHARGE')   ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.isPaid && !ch.isWaived && can('WAIVE_GROUPCHARGE') ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${can('DELETE_GROUPCHARGE') ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges applied</div>';

    wrap.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () =>
      openPayChargeModal(id, b.dataset.payCharge, () => loadCharges(c, id))));
    wrap.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive' })) return;
      try { await api.groups.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Waived', ''); loadCharges(c, id); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    wrap.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.groups.deleteCharge(id, b.dataset.delCharge); toast('success', 'Deleted', ''); loadCharges(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openApplyChargeModal(groupId, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 4 }); // 4 = Group charges in Fineract
    charges = Array.isArray(r) ? r : [];
  } catch {}
  const mid = `grp-charge-${Date.now()}`;
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
    el.querySelector('#ac-amount').value = e.target.selectedOptions[0]?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    const dueDate = el.querySelector('#ac-due').value;
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields', ''); return; }
    try {
      await api.groups.addCharge(groupId, {
        chargeId: parseInt(chargeId), amount, dueDate,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openPayChargeModal(groupId, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = `grp-pay-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
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
      await api.groups.payCharge(groupId, chargeId, {
        amount, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) })
      });
      el.remove();
      toast('success', 'Paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ============================================================
// STANDING INSTRUCTIONS (group-context)
// ============================================================
async function loadStandingInstructions(c, id, group) {
  const wrap = c.querySelector('#grp-si-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    // Fineract doesn't support groupId on /standinginstructions; show all instructions for member clients.
    const memberIds = (group.clientMembers || []).map(m => m.id);
    if (!memberIds.length) { wrap.innerHTML = '<div class="empty-state-row">Group has no members</div>'; return; }

    // Pull all; client-side filter.
    const res = await api.standingInstructions.list({ limit: 500 });
    const all = Array.isArray(res) ? res : (res?.pageItems || []);
    const list = all.filter(si => memberIds.includes(si.fromClient?.id));

    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Client</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromClient?.displayName || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${sb(si.status?.value || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions for group members</div>';
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// NOTES / DOCUMENTS
// ============================================================
async function loadNotes(c, id) {
  const listEl = c.querySelector('#grp-note-list');
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const notes = await api.notes.list('groups', id);
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
  const listEl = c.querySelector('#grp-doc-list');
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const docs = await api.documents.list('groups', id);
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
        const res = await api.documents.download('groups', id, b.dataset.docDl);
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
      try { await api.documents.delete('groups', id, b.dataset.docDel); toast('success', 'Deleted', ''); loadDocuments(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ============================================================
// EDIT / CLOSE / ASSIGN STAFF MODALS
// ============================================================
async function openEditGroupModal(g, onSuccess) {
  const mid = `grp-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Group</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Group name * <input id="eg-name" class="form-control" value="${escapeHtml(g.name || '')}" required/></label>
          <label class="mt-2">External ID <input id="eg-ext" class="form-control" value="${escapeHtml(g.externalId || '')}"/></label>
          <label class="mt-2 checkbox-row">
            <input type="checkbox" id="eg-submitted" ${g.submittedOnDate ? '' : 'checked'}/>
            Use today's submitted-on date
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="eg-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#eg-save').addEventListener('click', async () => {
    const payload = {
      name: el.querySelector('#eg-name').value.trim(),
      externalId: el.querySelector('#eg-ext').value.trim() || undefined,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    try {
      await api.groups.update(g.id, payload);
      el.remove();
      toast('success', 'Group updated', '');
      onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openCloseGroupModal(id) {
  let reasons = [];
  try {
    const tpl = await api.groups.template();
    reasons = tpl?.closureReasons || [];
  } catch {}
  const mid = `grp-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Group</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="gc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Closure reason *
            <select id="gc-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="gc-confirm">Close Group</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#gc-confirm').addEventListener('click', async () => {
    const closureDate = el.querySelector('#gc-date').value;
    const closureReasonId = el.querySelector('#gc-reason').value;
    if (!closureReasonId) { toast('warn', 'Reason required', ''); return; }
    try {
      await api.groups.close(id, {
        closureDate, closureReasonId: parseInt(closureReasonId),
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Group closed', '');
      import('../router.js').then(r => r.navigate('groups'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openAssignStaffModal(id, g) {
  let staffList = [];
  try {
    const r = await api.staff.list({ officeId: g.officeId, isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `grp-assign-${Date.now()}`;
  const hasStaff = !!g.staffId;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${hasStaff ? 'Reassign / Unassign Staff' : 'Assign Staff'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${hasStaff ? `<p class="text-muted">Currently assigned to <b>${escapeHtml(g.staffName || '')}</b>.</p>` : ''}
          <label>Staff
            <select id="as-staff" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(s => `<option value="${s.id}" ${s.id === g.staffId ? 'selected' : ''}>${escapeHtml(s.displayName)}</option>`).join('')}
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
      if (staffId) await api.groups.assignStaff(id, { staffId: parseInt(staffId) });
      else         await api.groups.unassignStaff(id, { staffId: g.staffId });
      el.remove();
      toast('success', 'Staff updated', '');
      location.reload();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}