/* FinCraft · pages/organization/actions/calendar.js — holiday modal.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openHolidayModal(officeList, onSuccess) {
  const offCheckboxes = officeList.map(o => `
    <label class="checkbox-row"><input type="checkbox" class="hol-off-chk" value="${o.id}"/> ${escapeHtml(o.name)}</label>`).join('');
  const reschedTypes = `
    <option value="1">Same day</option>
    <option value="2" selected>Next repayment date</option>
    <option value="3">Next working day</option>`;

  const mid = 'hol-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>New Holiday</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Holiday name * <input id="hol-name" class="form-control" required/></label>
          <label>From date * <input type="date" id="hol-from" class="form-control" required/></label>
          <label>To date * <input type="date" id="hol-to" class="form-control" required/></label>
          <label>Holiday description <input id="hol-desc" class="form-control" placeholder="e.g. Public Holiday"/></label>
          <label>Repayment rescheduling <select id="hol-resched" class="form-control">${reschedTypes}</select></label>
          <label>Reschedule repayments to (date) <input type="date" id="hol-resched-date" class="form-control"/></label>
        </div>
        <h4 class="mt-3">Apply to offices *</h4>
        <div style="max-height:200px;overflow:auto;border:1px solid var(--border);padding:8px;border-radius:4px">${offCheckboxes}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="hol-save">Create Holiday</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#hol-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#hol-name').value.trim();
    const fromDate = modalEl.querySelector('#hol-from').value;
    const toDate = modalEl.querySelector('#hol-to').value;
    const offices = [...modalEl.querySelectorAll('.hol-off-chk:checked')].map(ch => ({ officeId: parseInt(ch.value) }));
    const reschedulingType = parseInt(modalEl.querySelector('#hol-resched').value) || 2;
    // AUDIT FIX (Org ORG-01/ORG-02): collect description + repaymentsRescheduledTo, both documented
    // mandatory on POST /holidays. description is sent when provided (Fineract tolerates its absence,
    // but the spec lists it mandatory); repaymentsRescheduledTo is sent when provided and is required
    // by the server for specific-date rescheduling types (previously impossible to supply -> 400).
    // NOTE: verify the reschedulingType enum values/labels against GET /holidays/template on target.
    const description = modalEl.querySelector('#hol-desc').value.trim();
    const repaymentsRescheduledTo = modalEl.querySelector('#hol-resched-date').value;
    if (!name || !fromDate || !toDate || !offices.length) {
      toast('warn', 'Fill all required fields and select at least one office', ''); return;
    }
    try {
      await api.holidays.create({
        name, fromDate, toDate, reschedulingType, offices,
        ...(description && { description }),
        ...(repaymentsRescheduledTo && { repaymentsRescheduledTo }),
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      modalEl.remove();
      toast('success', 'Holiday created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', extractFineractError(e)); }
  });
}
