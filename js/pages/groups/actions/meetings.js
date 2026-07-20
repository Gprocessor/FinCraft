/* FinCraft · pages/groups/actions/meetings.js — schedule meeting and attendance modals.
   Auto-split from the original monolithic pages/groups/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openScheduleMeetingModal(groupId, onSuccess, existingCal) {
  const mid = `grp-meet-${Date.now()}`;
  const isEdit = !!existingCal;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
    } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
  });
}

export async function openAttendanceModal(groupId, meetingId, onSuccess) {
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
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}
