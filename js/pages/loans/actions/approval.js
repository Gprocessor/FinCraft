/* FinCraft · pages/loans/actions/approval.js — approve and assign-loan-officer modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { toast } from '../../../ui.js';

export async function openApproveModal(id) {
  let tpl = {};
  try { tpl = await api.loans.approvalTemplate(id); } catch {}
  const mid = `ln-app-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Approve Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Approved on * <input type="date" id="ap-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Approved amount * <input type="number" step="0.01" id="ap-amount" class="form-control" value="${tpl.approvalAmount ?? ''}" required/></label>
          <label class="mt-2">Expected disbursement date <input type="date" id="ap-disb" class="form-control" value="${tpl.expectedDisbursementDate || today()}"/></label>
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
      approvedLoanAmount: parseFloat(el.querySelector('#ap-amount').value),
      expectedDisbursementDate: el.querySelector('#ap-disb').value,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    const note = el.querySelector('#ap-note').value.trim();
    if (note) payload.note = note;
    try {
      await api.loans.approve(id, payload);
      el.remove();
      toast('success', 'Loan approved', `#${id}`);
      location.reload();
    } catch (e) { toast('error', 'Approval failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAssignOfficerModal(loanId, currentOfficer) {
  let staffList = [];
  try {
    const r = await api.staff.list({ isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `ln-officer-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Assign Loan Officer</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted">Current officer: <b>${escapeHtml(currentOfficer || 'Unassigned')}</b></p>
          <label>New loan officer
            <select id="ao-officer" class="form-control">
              <option value="">— Unassign —</option>
              ${staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Assignment date * <input type="date" id="ao-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ao-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ao-save').addEventListener('click', async () => {
    const officerId = el.querySelector('#ao-officer').value;
    const dateVal = el.querySelector('#ao-date').value;
    try {
      if (officerId) {
        await api.loans.assignOfficer(loanId, {
          toLoanOfficerId: parseInt(officerId),
          assignmentDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      } else {
        await api.loans.removeOfficer(loanId, {
          unassignedDate: dateVal,
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
      }
      el.remove();
      toast('success', 'Officer updated', '');
      location.reload();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}
