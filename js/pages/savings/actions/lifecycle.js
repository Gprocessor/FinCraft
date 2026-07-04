/* FinCraft · pages/savings/actions/lifecycle.js — approve, close, edit, and assign-staff modals.
   Auto-split from the original monolithic pages/savings/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export function openSavingsSimpleCmd({ id, command, label, dateField }) {
  // Default the date field name based on the command
  if (!dateField) {
    if (command === 'reject') dateField = 'rejectedOnDate';
    else if (command === 'withdrawnByApplicant') dateField = 'withdrawnOnDate';
    else dateField = 'transactionDate';
  }

  const mid = 'sv-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="svc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="svc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="svc-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  el.querySelector('#svc-save').addEventListener('click', async () => {
    // Build the payload without computed properties — works around the chat bracket issue
    const payload = {};
    payload[dateField] = el.querySelector('#svc-date').value;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;

    const note = el.querySelector('#svc-note').value.trim();
    if (note) payload.note = note;

    try {
      await api.savings.command(id, command, payload);
      el.remove();
      toast('success', label + ' successful', '#' + id);
      location.reload();
    } catch (e) {
      toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

export function openSavingsCloseModal(id) {
  const mid = `sv-close-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Closed on * <input type="date" id="svclose-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Payment type
            <select id="svclose-paytype" class="form-control"><option value="">— Cash —</option></select>
          </label>
          <label class="mt-2">Note <textarea id="svclose-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="svclose-save">Close Account</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  api.paymentTypes.list().then(types => {
    const sel = el.querySelector('#svclose-paytype');
    (Array.isArray(types) ? types : []).forEach(pt => {
      const opt = document.createElement('option');
      opt.value = pt.id; opt.textContent = pt.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#svclose-save').addEventListener('click', async () => {
    const closedOnDate = el.querySelector('#svclose-date').value;
    const paymentTypeId = el.querySelector('#svclose-paytype').value;
    const note = el.querySelector('#svclose-note').value.trim();
    try {
      await api.savings.close(id, {
        closedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(paymentTypeId && { paymentTypeId: parseInt(paymentTypeId) }),
        ...(note && { note })
      });
      el.remove();
      toast('success', 'Account closed', `#${id}`);
      import('../../../router.js').then(r => r.navigate('savings'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEditSavingsModal(s) {
  const mid = `sv-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Nominal annual interest rate
              <input type="number" step="0.01" id="ed-rate" class="form-control" value="${s.nominalAnnualInterestRate ?? ''}"/>
            </label>
            <label>Min required opening balance
              <input type="number" step="0.01" id="ed-min-open" class="form-control" value="${s.minRequiredOpeningBalance ?? ''}"/>
            </label>
            <label>Withdrawal fee for transfers
              <select id="ed-wfee" class="form-control">
                <option value="">— No change —</option>
                <option value="true"  ${s.withdrawalFeeForTransfers ? 'selected' : ''}>Yes</option>
                <option value="false" ${s.withdrawalFeeForTransfers === false ? 'selected' : ''}>No</option>
              </select>
            </label>
            <label>External ID <input id="ed-extid" class="form-control" value="${escapeHtml(s.externalId || '')}"/></label>
            <label class="full">Sub-account note <textarea id="ed-note" class="form-control" rows="2"></textarea></label>
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Most fields locked once activated. Edit only available pre-activation.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ed-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ed-save').addEventListener('click', async () => {
    const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
    const rate = parseFloat(el.querySelector('#ed-rate').value);
    if (isFinite(rate))   payload.nominalAnnualInterestRate = rate;
    const minOpen = parseFloat(el.querySelector('#ed-min-open').value);
    if (isFinite(minOpen)) payload.minRequiredOpeningBalance = minOpen;
    const wfee = el.querySelector('#ed-wfee').value;
    if (wfee !== '')      payload.withdrawalFeeForTransfers = wfee === 'true';
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext)              payload.externalId = ext;
    const note = el.querySelector('#ed-note').value.trim();
    if (note)             payload.note = note;
    try {
      await api.savings.update(s.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      location.reload();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openApproveSavingsModal(id) {
  const mid = `sv-app-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Approve Savings Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Approved on * <input type="date" id="ap-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="ap-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-success" id="ap-save">Approve</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ap-save').addEventListener('click', async () => {
    const payload = {
      approvedOnDate: el.querySelector('#ap-date').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const note = el.querySelector('#ap-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.savings.approve(id, payload);
      el.remove();
      toast('success', 'Account approved', `#${id}`);
      location.reload();
    } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openSavingsAssignStaffModal(id, s) {
  let staffList = [];
  try {
    const r = await api.staff.list({ officeId: s.officeId || s.clientOfficeId, isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}

  const currentId = s.fieldOfficerId || s.savingsOfficerId || null;
  const currentName = s.fieldOfficerName || s.savingsOfficerName || '';
  const hasStaff = !!currentId;
  const mid = `sv-as-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${hasStaff ? 'Reassign / Unassign Staff' : 'Assign Staff'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${hasStaff ? `<p class="text-muted">Currently assigned to <b>${escapeHtml(currentName)}</b>.</p>` : ''}
          <label>Staff
            <select id="as-staff" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(st => `<option value="${st.id}" ${st.id === currentId ? 'selected' : ''}>${escapeHtml(st.displayName)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Effective date * <input type="date" id="as-date" class="form-control" value="${today()}" required/></label>
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
    const dateVal = el.querySelector('#as-date').value;
    try {
      if (staffId) {
        await api.savings.assignStaff(id, {
          toSavingsOfficerId: parseInt(staffId),
          assignmentDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      } else {
        await api.savings.unassignStaff(id, {
          unassignedDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      }
      el.remove();
      toast('success', 'Staff updated', '');
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}
