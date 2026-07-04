/* FinCraft · pages/shares/actions.js — modal openers for share account actions.
   Auto-split from the original monolithic pages/shares.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml, fmt, num } from '../../utils.js';

export function openEditShareModal(s) {
  const mid = 'sh-edit-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Share Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Requested shares
              <input type="number" id="ed-shares" class="form-control" value="${s.totalApprovedShares || ''}"/>
            </label>
            <label>External ID
              <input id="ed-extid" class="form-control" value="${escapeHtml(s.externalId || '')}"/>
            </label>
          </div>
          <div class="text-muted small mt-2">
            <i class="fa-solid fa-circle-info"></i> Editing only available before approval.
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
    const shares = parseInt(el.querySelector('#ed-shares').value);
    if (isFinite(shares)) payload.requestedShares = shares;
    const ext = el.querySelector('#ed-extid').value.trim();
    if (ext) payload.externalId = ext;
    try {
      await api.shares.update(s.id, payload);
      el.remove();
      toast('success', 'Account updated', '');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openApplyAdditionalSharesModal(id, unitPrice) {
  const mid = 'sh-apply-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Additional Shares</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Number of shares * <input type="number" id="aa-shares" class="form-control" required min="1"/></label>
          <label class="mt-2">Application date * <input type="date" id="aa-date" class="form-control" value="${today()}" required/></label>
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            Estimated cost: <b id="aa-cost">${fmt(0)}</b> at ${fmt(unitPrice)} per share.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="aa-save">Submit Application</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#aa-shares').addEventListener('input', (e) => {
    const n = parseInt(e.target.value) || 0;
    el.querySelector('#aa-cost').textContent = fmt(n * unitPrice);
  });
  el.querySelector('#aa-save').addEventListener('click', async () => {
    const shares = parseInt(el.querySelector('#aa-shares').value);
    const date = el.querySelector('#aa-date').value;
    if (!shares || shares < 1) { toast('warn', 'Enter shares', ''); return; }
    try {
      await api.shares.applyAdditional(id, {
        requestedShares: shares,
        requestedDate: date,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Application submitted', shares + ' additional shares');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Application failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openRedeemSharesModal(id, maxShares, unitPrice) {
  const mid = 'sh-redeem-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Redeem Shares</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <p class="text-muted small">You currently hold <b>${num(maxShares)}</b> approved shares at ${fmt(unitPrice)} per share.</p>
          <label>Shares to redeem * <input type="number" id="rd-shares" class="form-control" required min="1" max="${maxShares}"/></label>
          <label class="mt-2">Redemption date * <input type="date" id="rd-date" class="form-control" value="${today()}" required/></label>
          <div class="msg-banner b-warning mt-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Estimated payout: <b id="rd-payout">${fmt(0)}</b>. Penalties may apply per product rules.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="rd-save">Redeem</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#rd-shares').addEventListener('input', (e) => {
    const n = parseInt(e.target.value) || 0;
    el.querySelector('#rd-payout').textContent = fmt(n * unitPrice);
  });
  el.querySelector('#rd-save').addEventListener('click', async () => {
    const shares = parseInt(el.querySelector('#rd-shares').value);
    const date = el.querySelector('#rd-date').value;
    if (!shares || shares < 1) { toast('warn', 'Enter shares', ''); return; }
    if (shares > maxShares) { toast('warn', 'Too many', 'Cannot redeem more than you hold'); return; }
    try {
      await api.shares.redeem(id, {
        requestedShares: shares,
        requestedDate: date,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Redemption submitted', shares + ' shares');
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', 'Redemption failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openCloseShareModal(id) {
  const mid = 'sh-close-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Close Share Account</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            All remaining shares will be redeemed at the current unit price.
          </div>
          <label>Closed on * <input type="date" id="cl-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="cl-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-danger" id="cl-save">Close Account</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cl-save').addEventListener('click', async () => {
    const closedDate = el.querySelector('#cl-date').value;
    const note = el.querySelector('#cl-note').value.trim();
    const payload = {
      closedDate,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (note) payload.note = note;
    try {
      await api.shares.close(id, payload);
      el.remove();
      toast('success', 'Account closed', '');
      import('../../router.js').then(r => r.navigate('shares'));
    } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openApplyShareChargeModal(id, onSuccess) {
  let charges = [];
  try {
    const r = await api.charges.list({ chargeAppliesTo: 7 });
    charges = Array.isArray(r) ? r : [];
    if (!charges.length) {
      const r2 = await api.charges.list({});
      charges = Array.isArray(r2) ? r2 : [];
    }
  } catch {}

  const mid = 'sh-applycharge-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Apply Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Charge *
            <select id="ac-charge" class="form-control" required>
              <option value="">Select charge…</option>
              ${charges.map(ch => `<option value="${ch.id}" data-amount="${ch.amount}">${escapeHtml(ch.name)} (${fmt(ch.amount)})</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Amount * <input type="number" step="0.01" id="ac-amount" class="form-control" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="ac-save">Apply</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ac-charge').addEventListener('change', (e) => {
    el.querySelector('#ac-amount').value = e.target.selectedOptions[0]?.dataset.amount || '';
  });
  el.querySelector('#ac-save').addEventListener('click', async () => {
    const chargeId = el.querySelector('#ac-charge').value;
    const amount = parseFloat(el.querySelector('#ac-amount').value);
    if (!chargeId || isNaN(amount)) { toast('warn', 'Required fields', ''); return; }
    try {
      await api.shares.addCharge(id, {
        chargeId: parseInt(chargeId), amount,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Charge applied', '');
      onSuccess();
    } catch (e) { toast('error', 'Apply failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openPayShareChargeModal(id, chargeId, onSuccess) {
  let paymentTypes = [];
  try { paymentTypes = await api.paymentTypes.list(); } catch {}
  const mid = 'sh-paycharge-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Pay Charge</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Amount * <input type="number" step="0.01" id="pc-amount" class="form-control" required/></label>
          <label class="mt-2">Date <input type="date" id="pc-date" class="form-control" value="${today()}"/></label>
          <label class="mt-2">Payment type
            <select id="pc-pt" class="form-control">
              <option value="">—</option>
              ${(Array.isArray(paymentTypes) ? paymentTypes : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="pc-save">Pay</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#pc-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#pc-amount').value);
    const transactionDate = el.querySelector('#pc-date').value;
    const paymentTypeId = el.querySelector('#pc-pt').value;
    if (isNaN(amount)) { toast('warn', 'Enter amount', ''); return; }
    const payload = {
      amount, transactionDate,
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (paymentTypeId) payload.paymentTypeId = parseInt(paymentTypeId);
    try {
      await api.shares.payCharge(id, chargeId, payload);
      el.remove();
      toast('success', 'Charge paid', '');
      onSuccess();
    } catch (e) { toast('error', 'Payment failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openShareSimpleCmd({ id, command, label, dateField }) {
  const mid = 'sh-cmd-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${escapeHtml(label)}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Date * <input type="date" id="shc-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Note <textarea id="shc-note" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="shc-save">${escapeHtml(label)}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#shc-save').addEventListener('click', async () => {
    const date = el.querySelector('#shc-date').value;
    if (!date) { toast('warn', 'Select a date', ''); return; }
    // Build payload without computed key syntax (defensive)
    const payload = {};
    payload[dateField] = date;
    payload.dateFormat = DATE_FORMAT;
    payload.locale = LOCALE;
    const note = el.querySelector('#shc-note').value.trim();
    if (note) payload.note = note;
    try {
      const methodMap = {
        approve: 'approve',
        activate: 'activate',
        reject: 'reject',
        withdrawApplication: 'withdrawApplication',
        close: 'close'
      };
      const m = methodMap[command];
      if (m && typeof api.shares[m] === 'function') {
      await api.shares[m](id, payload);
      } else {
      await api.shares.command(id, command, payload);
      }
      el.remove();
      toast('success', label + ' successful', '#' + id);
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) { toast('error', label + ' failed', e.detail?.defaultUserMessage || e.message); }
  });
}
