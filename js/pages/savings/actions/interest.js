/* FinCraft · pages/savings/actions/interest.js — post-interest-as-on and annual fees modals.
   Auto-split from the original monolithic pages/savings/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export function openPostInterestAsOnModal(id) {
  const mid = `sv-pi-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Post Interest As-On</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">Post accrued interest as of a specific historical date (used for back-dated postings).</p>
          <label>Transaction date * <input type="date" id="pi-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pi-save">Post Interest</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pi-save').addEventListener('click', async () => {
    const transactionDate = el.querySelector('#pi-date').value;
    if (!transactionDate) { toast('warn', 'Select a date', ''); return; }
    try {
      await api.savings.postInterestAsOn(id, transactionDate);
      el.remove();
      toast('success', 'Interest posted as-on', transactionDate);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Failed', extractFineractError(e)); }
  });
}

export function openAnnualFeesModal(id) {
  const mid = `sv-af-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Annual Fees</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">Apply all annual fee charges configured on this account that are due as of the selected date.</p>
          <label>Effective date * <input type="date" id="af-date" class="form-control" value="${today()}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="af-save">Apply Fees</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#af-save').addEventListener('click', async () => {
    try {
      await api.savings.applyAnnualFees(id, {
        transactionDate: el.querySelector('#af-date').value,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Annual fees applied', '');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Apply failed', extractFineractError(e)); }
  });
}
