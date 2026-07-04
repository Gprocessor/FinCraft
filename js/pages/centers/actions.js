/* FinCraft · pages/centers/actions.js — modal openers for center actions.
   Auto-split from the original monolithic pages/centers.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { confirm, toast } from '../../ui.js';
import { escapeHtml, sb } from '../../utils.js';

export async function disassociateSelectedGroups(c, id) {
  const checked = Array.from(c.querySelectorAll('.ctr-grp-chk:checked')).map(cb => parseInt(cb.value));
  if (!checked.length) { toast('warn', 'No groups selected', 'Tick at least one group'); return; }
  if (!await confirm({
    title: `Disassociate ${checked.length} group(s)?`,
    message: 'The groups will no longer be linked to this center.',
    danger: true, confirmText: 'Disassociate'
  })) return;
  try {
    await api.centers.disassociateGroups(id, { groupMembers: checked });
    toast('success', 'Groups disassociated', '');
    document.dispatchEvent(new CustomEvent('fc:reload'));
  } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
}

export async function openAddGroupsModal(centerId, center, onSuccess) {
  const mid = `ctr-addgrp-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Associate Groups</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Search groups in <b>${escapeHtml(center.officeName || '')}</b>
            <input id="ag-search" class="form-control" placeholder="Type to search…" autocomplete="off"/>
          </label>
          <div id="ag-results" class="search-results-inline mt-2"><div class="empty-state-row">Type at least 2 characters</div></div>
          <h4 class="mt-3">Selected (<span id="ag-count">0</span>)</h4>
          <div id="ag-selected" class="chip-list"><span class="text-muted">None</span></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ag-save">Associate Selected</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  const selected = new Map();
  const refreshSelected = () => {
    el.querySelector('#ag-count').textContent = selected.size;
    el.querySelector('#ag-selected').innerHTML = [...selected.values()].map(g => `
      <span class="chip">${escapeHtml(g.name)}
        <button data-unselect="${g.id}">&times;</button>
      </span>`).join('') || '<span class="text-muted">None</span>';
    el.querySelectorAll('[data-unselect]').forEach(b => b.addEventListener('click', () => {
      selected.delete(parseInt(b.dataset.unselect)); refreshSelected();
    }));
  };

  let st;
  el.querySelector('#ag-search').addEventListener('input', (e) => {
    clearTimeout(st);
    const q = e.target.value.trim();
    if (q.length < 2) { el.querySelector('#ag-results').innerHTML = '<div class="empty-state-row">Type at least 2 characters</div>'; return; }
    st = setTimeout(async () => {
      try {
        const res = await api.groups.list({
          name: q, officeId: center.officeId, limit: 20, paged: true
        });
        const list = Array.isArray(res) ? res : (res?.pageItems || []);
        // Skip groups already associated to this center
        const existingIds = new Set((center.groupMembers || []).map(g => g.id));
        const available = list.filter(g => !existingIds.has(g.id));
        el.querySelector('#ag-results').innerHTML = available.length ? available.map(g => `
          <button class="search-result" data-pick="${g.id}" data-name="${escapeHtml(g.name)}">
            <i class="fa-solid fa-people-group"></i>
            <div>
              <strong>${escapeHtml(g.name)}</strong>
              <div class="text-muted small">${escapeHtml(g.accountNo || '')} · ${sb(g.status?.value || '—')}</div>
            </div>
          </button>`).join('') : '<div class="search-empty">No available groups</div>';
        el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
          const gid = parseInt(b.dataset.pick);
          selected.set(gid, { id: gid, name: b.dataset.name });
          refreshSelected();
        }));
      } catch (er) { el.querySelector('#ag-results').innerHTML = `<div class="text-error">${escapeHtml(er.message)}</div>`; }
    }, 300);
  });

  refreshSelected();

  el.querySelector('#ag-save').addEventListener('click', async () => {
    if (!selected.size) { toast('warn', 'No groups selected', ''); return; }
    try {
      await api.centers.associateGroups(centerId, { groupMembers: [...selected.keys()] });
      el.remove();
      toast('success', 'Groups associated', `${selected.size} group(s) added`);
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openScheduleMeetingModal(centerId, onSuccess, existingCal) {
  const mid = `ctr-meet-${Date.now()}`;
  const isEdit = !!existingCal;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'Schedule'} Meeting</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Title * <input id="m-title" class="form-control" value="${escapeHtml(existingCal?.title || 'Center Meeting')}" required/></label>
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
      typeId: 1, // 1 = COLLECTION
      description: el.querySelector('#m-desc').value.trim() || undefined,
      repeating: true,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    try {
      if (isEdit) await api.calendars.update('centers', centerId, existingCal.id, payload);
      else        await api.calendars.create('centers', centerId, payload);
      el.remove();
      toast('success', isEdit ? 'Schedule updated' : 'Meeting scheduled', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEditCenterModal(ctr, onSuccess) {
  const mid = `ctr-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Center</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Center name * <input id="ec-name" class="form-control" value="${escapeHtml(ctr.name || '')}" required/></label>
          <label class="mt-2">External ID <input id="ec-ext" class="form-control" value="${escapeHtml(ctr.externalId || '')}"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ec-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ec-save').addEventListener('click', async () => {
    const payload = {
      name: el.querySelector('#ec-name').value.trim(),
      externalId: el.querySelector('#ec-ext').value.trim() || undefined,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    try {
      await api.centers.update(ctr.id, payload);
      el.remove();
      toast('success', 'Center updated', '');
      onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openCloseCenterModal(id) {
  let reasons = [];
  try {
    const tpl = await api.centers.template();
    reasons = tpl?.closureReasons || [];
  } catch {}
  const mid = `ctr-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Center</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="cc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Closure reason *
            <select id="cc-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="cc-confirm">Close Center</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cc-confirm').addEventListener('click', async () => {
    const closureDate = el.querySelector('#cc-date').value;
    const closureReasonId = el.querySelector('#cc-reason').value;
    if (!closureReasonId) { toast('warn', 'Reason required', ''); return; }
    try {
      await api.centers.close(id, {
        closureDate, closureReasonId: parseInt(closureReasonId),
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Center closed', '');
      import('../../router.js').then(r => r.navigate('centers'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}
