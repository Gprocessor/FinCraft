/* FinCraft · pages/clients/actions/lifecycle.js — edit, close, reject, transfer, and assign-staff modals.
   Auto-split from the original monolithic pages/clients/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export async function openEditClientModal(cl, onSuccess) {
  const mid = `cl-edit-modal-${Date.now()}`;
  const isEntity = cl.legalForm?.id === 2;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            ${isEntity
              ? `<label class="full">Full name * <input id="ec-fullname" class="form-control" value="${escapeHtml(cl.fullname || cl.displayName || '')}" required/></label>`
              : `<label>First name * <input id="ec-firstname" class="form-control" value="${escapeHtml(cl.firstname || '')}" required/></label>
                 <label>Middle <input id="ec-middlename" class="form-control" value="${escapeHtml(cl.middlename || '')}"/></label>
                 <label>Last name * <input id="ec-lastname" class="form-control" value="${escapeHtml(cl.lastname || '')}" required/></label>`}
            <label>Mobile <input id="ec-mobile" class="form-control" value="${escapeHtml(cl.mobileNo || '')}"/></label>
            <label>Email <input id="ec-email" type="email" class="form-control" value="${escapeHtml(cl.emailAddress || '')}"/></label>
            <label>External ID <input id="ec-extid" class="form-control" value="${escapeHtml(cl.externalId || '')}"/></label>
            <label>Date of birth <input id="ec-dob" type="date" class="form-control" value="${cl.dateOfBirth || ''}"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ec-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ec-save').addEventListener('click', async () => {
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
    if (isEntity) payload.fullname = el.querySelector('#ec-fullname').value.trim();
    else {
      payload.firstname  = el.querySelector('#ec-firstname').value.trim();
      payload.lastname   = el.querySelector('#ec-lastname').value.trim();
      const mid_ = el.querySelector('#ec-middlename').value.trim();
      if (mid_) payload.middlename = mid_;
    }
    const mob = el.querySelector('#ec-mobile').value.trim(); if (mob) payload.mobileNo = mob;
    const em  = el.querySelector('#ec-email').value.trim(); if (em) payload.emailAddress = em;
    const ext = el.querySelector('#ec-extid').value.trim(); if (ext) payload.externalId = ext;
    const dob = el.querySelector('#ec-dob').value; if (dob) payload.dateOfBirth = dob;
    try {
      await api.clients.update(cl.id, payload);
      el.remove();
      toast('success', 'Client updated', cl.displayName);
      onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openCloseClientModal(id) {
  let reasons = [];
  try {
    // Fineract uses ClientClosureReason CodeValues
    const tpl = await api.clients.template();
    reasons = tpl?.clientClosureReasons || tpl?.closureReasons || [];
  } catch {}
  const mid = `cl-close-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="lc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Closure reason *
            <select id="lc-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="lc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="lc-confirm">Close Client</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#lc-confirm').addEventListener('click', async () => {
    const closureDate = el.querySelector('#lc-date').value;
    const closureReasonId = el.querySelector('#lc-reason').value;
    const note = el.querySelector('#lc-note').value.trim();
    if (!closureReasonId) { toast('warn', 'Reason required', 'Select a closure reason'); return; }
    try {
      await api.clients.close(id, {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        closureDate, closureReasonId: parseInt(closureReasonId),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Client closed', `#${id}`);
      import('../../../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openRejectClientModal(id) {
  let reasons = [];
  try {
    const tpl = await api.clients.template();
    reasons = tpl?.clientRejectionReasons || tpl?.rejectionReasons || [];
  } catch {}
  const mid = `cl-reject-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Application</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Rejected on * <input type="date" id="rj-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Rejection reason *
            <select id="rj-reason" class="form-control" required>
              <option value="">Select reason…</option>
              ${reasons.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="rj-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="rj-confirm">Reject</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#rj-confirm').addEventListener('click', async () => {
    const rejectionDate = el.querySelector('#rj-date').value;
    const rejectionReasonId = el.querySelector('#rj-reason').value;
    const note = el.querySelector('#rj-note').value.trim();
    if (!rejectionReasonId) { toast('warn', 'Reason required', 'Select a rejection reason'); return; }
    try {
      await api.clients.reject(id, {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        rejectionDate, rejectionReasonId: parseInt(rejectionReasonId),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Application rejected', '');
      import('../../../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Reject failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openTransferModal(id, displayName) {
  let offices = [];
  try { offices = await api.offices.list(); } catch {}
  const mid = `cl-transfer-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Transfer Client</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p>Propose transfer of <b>${escapeHtml(displayName)}</b> to another office.</p>
          <label>Destination office *
            <select id="tr-office" class="form-control" required>
              <option value="">Select office…</option>
              ${(Array.isArray(offices) ? offices : []).map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Transfer date * <input type="date" id="tr-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="tr-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="tr-confirm">Propose Transfer</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#tr-confirm').addEventListener('click', async () => {
    const destinationOfficeId = el.querySelector('#tr-office').value;
    const transferDate = el.querySelector('#tr-date').value;
    const note = el.querySelector('#tr-note').value;
    if (!destinationOfficeId) { toast('warn', 'Select an office', ''); return; }
    try {
      await api.clients.transfer(id, {
        destinationOfficeId: parseInt(destinationOfficeId),
        transferDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Transfer proposed', 'Awaiting acceptance at destination office');
      import('../../../router.js').then(r => r.navigate('clients'));
    } catch (e) { toast('error', 'Transfer failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAssignStaffModal(id, cl) {
  let staffList = [];
  try { const r = await api.staff.list({ officeId: cl.officeId }); staffList = Array.isArray(r) ? r : (r?.pageItems || []); } catch {}
  const mid = `cl-assign-modal-${Date.now()}`;
  const hasStaff = !!cl.staffId;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${hasStaff ? 'Reassign / Unassign Staff' : 'Assign Staff'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${hasStaff ? `<p class="text-muted">Currently assigned to <b>${escapeHtml(cl.staffName || '')}</b>.</p>` : ''}
          <label>Staff
            <select id="as-staff" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(s => `<option value="${s.id}" ${s.id === cl.staffId ? 'selected' : ''}>${escapeHtml(s.displayName)}</option>`).join('')}
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
      if (staffId) await api.clients.assignStaff(id, { staffId: parseInt(staffId) });
      else         await api.clients.unassignStaff(id, { staffId: cl.staffId });
      el.remove();
      toast('success', 'Staff updated', '');
      import('../../../router.js').then(r => r.navigate('client-detail', { id }));
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}
