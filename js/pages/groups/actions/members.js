/* FinCraft · pages/groups/actions/members.js — add/transfer member modals.
   Auto-split from the original monolithic pages/groups/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml, ini } from '../../../utils.js';

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
