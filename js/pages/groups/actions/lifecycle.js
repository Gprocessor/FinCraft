/* FinCraft · pages/groups/actions/lifecycle.js — edit, close, and assign-staff modals.
   Auto-split from the original monolithic pages/groups/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openEditGroupModal(g, onSuccess) {
  const mid = `grp-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openCloseGroupModal(id) {
  let reasons = [];
  try {
    const tpl = await api.groups.template();
    reasons = tpl?.closureReasons || [];
  } catch {}
  const mid = `grp-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      import('../../../router.js').then(r => r.navigate('groups'));
    } catch (e) { toast('error', 'Close failed', extractFineractError(e)); }
  });
}

export async function openAssignStaffModal(id, g) {
  let staffList = [];
  try {
    const r = await api.staff.list({ officeId: g.officeId, isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `grp-assign-${Date.now()}`;
  const hasStaff = !!g.staffId;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
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
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}
