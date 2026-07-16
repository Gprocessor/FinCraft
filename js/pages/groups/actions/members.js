/* FinCraft · pages/groups/actions/members.js — add/transfer member modals.
   Auto-split from the original monolithic pages/groups/actions.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, ini } from '../../../utils.js';

export async function openGlimDetailModal(glimId) {
  const mid = `glim-view-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>GLIM Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="${mid}-body"><div class="empty-state-row">Loading…</div></div>
        <div class="modal-footer" id="${mid}-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);
  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  const body = m.querySelector(`#${mid}-body`);
  const footer = m.querySelector(`#${mid}-footer`);

  const reload = () => openGlimAccountData();
  async function openGlimAccountData() {
    try {
      const g = await api.loans.getGlimAccount(glimId);
      const memberLoans = g?.loans || g?.childLoans || g?.memberLoans || [];
      body.innerHTML = `
        <dl class="dl-grid">
          <dt>Status</dt><dd>${escapeHtml(g?.status?.value || g?.status || '—')}</dd>
          <dt>Total Principal</dt><dd>${fmt(g?.principalAmount ?? g?.totalPrincipal ?? 0)}</dd>
          <dt>Product</dt><dd>${escapeHtml(g?.productName || '—')}</dd>
        </dl>
        ${memberLoans.length ? `
          <h4 class="mt-2">Member Loans</h4>
          <table class="table">
            <thead><tr><th>Client</th><th class="text-right">Principal</th><th>Status</th></tr></thead>
            <tbody>${memberLoans.map(l => `
              <tr>
                <td>${escapeHtml(l.clientName || '—')}</td>
                <td class="text-right">${fmt(l.principal ?? l.principalAmount ?? 0)}</td>
                <td>${escapeHtml(l.status?.value || l.status || '—')}</td>
              </tr>`).join('')}</tbody>
          </table>` : ''}
        <div class="text-muted small mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Fineract's GLIM command names aren't published in the API reference beyond
          a summary line, so the actions below use the same command vocabulary as
          regular loans (approve / reject / disburse) by convention — verify against
          your Fineract instance if an action returns an unexpected error.
        </div>`;

      const st = (g?.status?.value || g?.status || '').toLowerCase();
      const btn = (label, cmd, cls = 'btn-secondary') =>
        `<button class="${cls}" data-glim-cmd="${cmd}">${label}</button>`;
      let actions = '';
      if (st.includes('pending') || st.includes('submitted')) actions += btn('Approve', 'approve', 'btn-primary') + btn('Reject', 'reject', 'btn-danger');
      else if (st.includes('approved')) actions += btn('Undo Approval', 'undoApproval') + btn('Disburse', 'disburse', 'btn-primary');
      else if (st.includes('active')) actions += btn('Undo Disbursal', 'undoDisbursal');
      footer.innerHTML = actions + `<button class="btn-secondary" data-close-modal>Close</button>`;
      footer.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
      footer.querySelectorAll('[data-glim-cmd]').forEach(b => b.addEventListener('click', async () => {
        const cmd = b.dataset.glimCmd;
        if (['reject', 'undoApproval', 'undoDisbursal'].includes(cmd) &&
            !await confirm({ title: `${b.textContent}?`, danger: cmd === 'reject', confirmText: b.textContent })) return;
        try {
          await api.loans.glimAccountCommand(glimId, cmd, {});
          toast('success', `${b.textContent} successful`, '');
          reload();
        } catch (e) { toast('error', `${b.textContent} failed`, e.detail?.defaultUserMessage || e.message); }
      }));
    } catch (e) {
      body.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
    }
  }
  openGlimAccountData();
}

export async function openAssignRoleModal(groupId, group, onSuccess) {
  const isUpdate = !!group?.roleId;
  let roleValues = [];
  try { roleValues = await api.codes.valuesByName('GROUPROLE'); } catch {}
  const mid = `grp-role-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isUpdate ? 'Change Role' : 'Assign Role'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${!isUpdate ? `
          <label>Member *
            <select id="ar-client" class="form-control" required>
              <option value="">Select member…</option>
              ${(group.clientMembers || []).map(m => `<option value="${m.id}">${escapeHtml(m.displayName)}</option>`).join('')}
            </select>
          </label>` : ''}
          <label class="mt-2">Role *
            <select id="ar-role" class="form-control" required>
              <option value="">Select role…</option>
              ${roleValues.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('')}
            </select>
          </label>
          ${!roleValues.length ? `<div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i>
            No values found under the <b>GROUPROLE</b> system code — add some from
            Admin &rsaquo; System &rsaquo; Manage Codes first.
          </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ar-save">${isUpdate ? 'Save' : 'Assign'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ar-save').addEventListener('click', async () => {
    const role = el.querySelector('#ar-role').value;
    if (!role) { toast('warn', 'Select a role', ''); return; }
    try {
      if (isUpdate) {
        await api.groups.updateRole(groupId, group.roleId, { role: parseInt(role) });
        toast('success', 'Role updated', '');
      } else {
        const clientId = el.querySelector('#ar-client').value;
        if (!clientId) { toast('warn', 'Select a member', ''); return; }
        await api.groups.assignRole(groupId, { clientId: parseInt(clientId), role: parseInt(role) });
        toast('success', 'Role assigned', '');
      }
      el.remove();
      onSuccess?.();
    } catch (e) { toast('error', isUpdate ? 'Update failed' : 'Assign failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAddMembersModal(groupId, group, onSuccess) {
  const mid = `grp-addmem-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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

export async function openTransferMembersModal(groupId, group) {
  const checked = Array.from(document.querySelectorAll('.mem-chk:checked')).map(cb => parseInt(cb.value));
  if (!checked.length) { toast('warn', 'No members selected', 'Tick at least one member to transfer'); return; }
  let groups = [];
  try {
    const r = await api.groups.list({ officeId: group.officeId, limit: 500 });
    groups = (Array.isArray(r) ? r : r?.pageItems || []).filter(x => x.id !== groupId);
  } catch {}
  const mid = `grp-xfer-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Transfer failed', e.detail?.defaultUserMessage || e.message); }
  });
}
