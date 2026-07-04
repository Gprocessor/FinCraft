/* FinCraft · pages/deposits/actions/lifecycle.js — edit, premature close, and other command modals.
   Auto-split from the original monolithic pages/deposits/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export function openDepositSimpleCmd({ apiObj, id, command, label, dateField, danger = false }) {
  const mid = 'dep-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="dcmd-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="dcmd-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="dcmd-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#dcmd-save').addEventListener('click', async () => {
    const date = el.querySelector('#dcmd-date').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }
    // Build payload without computed key syntax (defensive)
    const payload = {};
    payload[dateField] = date;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;
    const note = el.querySelector('#dcmd-note').value.trim();
    if (note) payload.note = note;
    try {
      // Map our command name to the apiObj method
      const methodMap = {
        approve: 'approve', activate: 'activate', reject: 'reject',
        withdrawApplication: 'withdrawApplication', close: 'close'
      };
      const m = methodMap[command];
      if (m && typeof apiObj[m] === 'function') {
        await apiObj[m](id, payload);
      } else {
        await apiObj.command(id, command, payload);
      }
      el.remove();
      toast('success', label + ' successful', '#' + id);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEditDepositModal(apiObj, d, label) {
  const isFD = label.includes('Fixed');
  const mid = 'dep-edit-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit ${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Nominal annual interest rate (%)
              <input type="number" step="0.01" id="ed-rate" class="form-control" value="${d.nominalAnnualInterestRate ?? d.interestRate ?? ''}"/>
            </label>
            <label>${isFD ? 'Deposit amount' : 'Mandatory recommended deposit'}
              <input type="number" step="0.01" id="ed-amount" class="form-control"
                value="${d.depositAmount ?? d.mandatoryRecommendedDepositAmount ?? ''}"/>
            </label>
            <label>Deposit period
              <input type="number" id="ed-period" class="form-control" value="${d.depositPeriod ?? ''}"/>
            </label>
            <label>Period frequency
              <select id="ed-period-freq" class="form-control">
                <option value="">— No change —</option>
                <option value="0" ${d.depositPeriodFrequency?.id === 0 ? 'selected' : ''}>Days</option>
                <option value="1" ${d.depositPeriodFrequency?.id === 1 ? 'selected' : ''}>Weeks</option>
                <option value="2" ${d.depositPeriodFrequency?.id === 2 ? 'selected' : ''}>Months</option>
                <option value="3" ${d.depositPeriodFrequency?.id === 3 ? 'selected' : ''}>Years</option>
              </select>
            </label>
            <label>External ID
              <input id="ed-extid" class="form-control" value="${escapeHtml(d.externalId || '')}"/>
            </label>
            ${isFD ? `
              <label>Lock-in period
                <input type="number" id="ed-lockin" class="form-control" value="${d.lockinPeriodFrequency ?? ''}"/>
              </label>
            ` : `
              <label>Expected first deposit date
                <input type="date" id="ed-firstdep" class="form-control" value="${d.expectedFirstDepositOnDate ? (Array.isArray(d.expectedFirstDepositOnDate) ? d.expectedFirstDepositOnDate.join('-') : d.expectedFirstDepositOnDate) : ''}"/>
              </label>
            `}
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Editing only available before activation. Already-locked fields will be silently ignored.
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
    if (isFinite(rate)) payload.nominalAnnualInterestRate = rate;
    const amount = parseFloat(el.querySelector('#ed-amount').value);
    if (isFinite(amount)) {
      if (isFD) payload.depositAmount = amount;
      else      payload.mandatoryRecommendedDepositAmount = amount;
    }
    const period = parseInt(el.querySelector('#ed-period').value);
    if (isFinite(period)) payload.depositPeriod = period;
    const periodFreq = el.querySelector('#ed-period-freq').value;
    if (periodFreq !== '') payload.depositPeriodFrequencyId = parseInt(periodFreq);
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext) payload.externalId = ext;
    if (isFD) {
      const lockin = parseInt(el.querySelector('#ed-lockin').value);
      if (isFinite(lockin)) payload.lockinPeriodFrequency = lockin;
    } else {
      const fd = el.querySelector('#ed-firstdep').value;
      if (fd) payload.expectedFirstDepositOnDate = fd;
    }
    try {
      await apiObj.update(d.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openPrematureCloseModal(apiObj, id, label, prefilledDate) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}

  const mid = 'dep-prem-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Premature Close — ${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            This will close the account before maturity. The product's penalty interest rate (if configured) will apply.
          </div>
          <label>Closed on * <input type="date" id="pc-date" class="form-control" value="${prefilledDate || today()}" required/></label>
          <label class="mt-2">On-account closure type *
            <select id="pc-type" class="form-control" required>
              <option value="100">Withdraw deposit</option>
              <option value="200">Transfer to savings</option>
              <option value="300">Re-invest</option>
            </select>
          </label>
          <label class="mt-2">Target savings account ID (for transfer)
            <input type="number" id="pc-savings" class="form-control" placeholder="Required if type = Transfer"/>
          </label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">— Cash —</option>
              ${paymentTypes.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Note <textarea id="pc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="pc-save">Premature Close</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const closedOnDate = el.querySelector('#pc-date').value;
    const onAccountClosureId = parseInt(el.querySelector('#pc-type').value);
    const savingsAccountId = el.querySelector('#pc-savings').value.trim();
    const paymentTypeId = el.querySelector('#pc-pt').value;
    const note = el.querySelector('#pc-note').value.trim();
    if (!closedOnDate) { toast('warn', 'Select a date', ''); return; }
    if (onAccountClosureId === 200 && !savingsAccountId) {
      toast('warn', 'Target savings required', 'Enter the savings account ID to transfer to');
      return;
    }
    const payload = {
      closedOnDate, onAccountClosureId,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (savingsAccountId) payload.toSavingsAccountId = parseInt(savingsAccountId);
    if (paymentTypeId)    payload.paymentTypeId = parseInt(paymentTypeId);
    if (note)             payload.note = note;
    try {
      await apiObj.premature(id, payload);
      el.remove();
      toast('success', 'Account closed prematurely', '');
      import('../../../router.js').then(r => r.navigate('deposits'));
    } catch (e) { toast('error', 'Premature close failed', e.detail?.defaultUserMessage || e.message); }
  });
}
