/* FinCraft · pages/organization/actions/offices-staff.js — office/staff/cashier modals.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openEditOfficeModal(officeId, allOffices, onSuccess) {
  const mid = 'edit-office-' + Date.now();
  const el = document.getElementById('modalRoot');
  if (!el) return;
  let office;
  try { office = await api.offices.get(officeId); } catch { toast('error', 'Failed to load office', ''); return; }

  el.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Office</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Office Name * <input id="${mid}-name" class="form-control" value="${escapeHtml(office.name || '')}" required/></label>
            <label>Opening Date * <input type="date" id="${mid}-date" class="form-control" value="${office.openingDate || ''}" required/></label>
            <label>Parent Office
              <select id="${mid}-parent" class="form-control">
                <option value="">— None (Root) —</option>
                ${allOffices.filter(o => String(o.id) !== String(officeId)).map(o => `
                  <option value="${o.id}" ${office.parentId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>
                `).join('')}
              </select>
            </label>
            <label>External ID <input id="${mid}-extid" class="form-control" value="${escapeHtml(office.externalId || '')}"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  m.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = m.querySelector('#' + mid + '-name').value.trim();
    const openingDate = m.querySelector('#' + mid + '-date').value;
    const parentId = m.querySelector('#' + mid + '-parent').value;
    const externalId = m.querySelector('#' + mid + '-extid').value.trim();
    if (!name || !openingDate) { toast('warn', 'Fill required fields', ''); return; }

    const payload = { name, openingDate, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (parentId) payload.parentId = parseInt(parentId);
    if (externalId) payload.externalId = externalId;

    try {
      await api.offices.update(officeId, payload);
      m.remove();
      toast('success', 'Office updated', name);
      onSuccess?.();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openEditStaffModal(staffId, onSuccess) {
  const mid = 'edit-staff-' + Date.now();
  const mr = document.getElementById('modalRoot');
  if (!mr) return;
  let s, offices;
  try {
    [s, offices] = await Promise.all([api.staff.get(staffId), api.offices.list()]);
  } catch { toast('error', 'Failed to load staff', ''); return; }
  const offList = Array.isArray(offices) ? offices : [];

  mr.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Edit Staff</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>First Name * <input id="${mid}-fn" class="form-control" value="${escapeHtml(s.firstname || '')}" required/></label>
            <label>Last Name * <input id="${mid}-ln" class="form-control" value="${escapeHtml(s.lastname || '')}" required/></label>
            <label>Office *
              <select id="${mid}-office" class="form-control" required>
                ${offList.map(o => `<option value="${o.id}" ${s.officeId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
              </select>
            </label>
            <label>Joining Date <input type="date" id="${mid}-joindate" class="form-control" value="${s.joiningDate || ''}"/></label>
            <label class="checkbox-row"><input type="checkbox" id="${mid}-loanoff" ${s.isLoanOfficer ? 'checked' : ''}/> Is Loan Officer</label>
            <label class="checkbox-row"><input type="checkbox" id="${mid}-active" ${s.isActive ? 'checked' : ''}/> Active</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  m.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const firstname = m.querySelector('#' + mid + '-fn').value.trim();
    const lastname = m.querySelector('#' + mid + '-ln').value.trim();
    const officeId = parseInt(m.querySelector('#' + mid + '-office').value);
    const joiningDate = m.querySelector('#' + mid + '-joindate').value;
    const isLoanOfficer = m.querySelector('#' + mid + '-loanoff').checked;
    const isActive = m.querySelector('#' + mid + '-active').checked;
    if (!firstname || !lastname || !officeId) { toast('warn', 'Fill required fields', ''); return; }

    const payload = { firstname, lastname, officeId, isLoanOfficer, isActive };
    if (joiningDate) { payload.joiningDate = joiningDate; payload.dateFormat = DATE_FORMAT; payload.locale = LOCALE; }

    try {
      await api.staff.update(staffId, payload);
      m.remove();
      toast('success', 'Staff updated', '');
      onSuccess?.();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openAllocateCashierModal(tellerId, tellerName, onSuccess) {
  let staffList = [];
  try { const r = await api.staff.list(); staffList = Array.isArray(r) ? r : (r?.pageItems || []); } catch {}

  const mid = 'alloc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Allocate Cash — ${escapeHtml(tellerName || 'Teller')}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Cashier (staff) *
            <select id="alloc-staff" class="form-control" required>
              <option value="">Select staff…</option>
              ${staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
            </select>
          </label>
          <label>Start date * <input type="date" id="alloc-start" class="form-control" value="${today()}" required/></label>
          <label>End date <input type="date" id="alloc-end" class="form-control"/></label>
          <label>Cash limit <input type="number" step="0.01" id="alloc-limit" class="form-control"/></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="alloc-confirm">Allocate</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#alloc-confirm').addEventListener('click', async () => {
    const staffId = parseInt(modalEl.querySelector('#alloc-staff').value);
    const startDate = modalEl.querySelector('#alloc-start').value;
    const endDate = modalEl.querySelector('#alloc-end').value;
    const cashLimit = parseFloat(modalEl.querySelector('#alloc-limit').value);
    if (!staffId || !startDate) { toast('warn', 'Fill required fields', ''); return; }

    const payload = { staffId, startDate, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (endDate) payload.endDate = endDate;
    if (cashLimit) { payload.cashLimit = cashLimit; payload.cashLimitCurrency = 'USD'; }

    try {
      await api.tellers.allocateCashier(tellerId, payload);
      modalEl.remove();
      toast('success', 'Cashier allocated', '');
      onSuccess();
    } catch (e) { toast('error', 'Allocation failed', extractFineractError(e)); }
  });
}

export async function openCashInModal(tellerId, cashierId, cashierName, onSuccess) {
  const mid = 'cashin-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Cash In — ${escapeHtml(cashierName || 'Cashier')}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="text-muted mb-3">Record a cash allocation transaction to this cashier's till (start-of-day float).</div>
        <div class="form-grid">
          <label>Transaction date * <input type="date" id="cashin-date" class="form-control" value="${today()}" required/></label>
          <label>Amount * <input type="number" step="0.01" min="0" id="cashin-amount" class="form-control" required/></label>
          <label class="full">Note <textarea id="cashin-note" class="form-control" rows="2"></textarea></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="cashin-confirm">Cash In</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#cashin-confirm').addEventListener('click', async () => {
    const txnDate = modalEl.querySelector('#cashin-date').value;
    const txnAmount = parseFloat(modalEl.querySelector('#cashin-amount').value);
    const txnNote = modalEl.querySelector('#cashin-note').value.trim();
    if (!txnDate || isNaN(txnAmount) || txnAmount <= 0) { toast('warn', 'Fill required fields', 'Enter a valid amount'); return; }

    const payload = { txnDate, txnAmount, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (txnNote) payload.txnNote = txnNote;

    try {
      await api.tellers.allocateCashTo(tellerId, cashierId, payload);
      modalEl.remove();
      toast('success', 'Cash allocated', fmt(txnAmount));
      onSuccess();
    } catch (e) { toast('error', 'Cash-in failed', extractFineractError(e)); }
  });
}

export async function openSettleCashierModal(tellerId, cashierId, onSuccess) {
  const mid = 'settle-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Settle Cash</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Settlement date * <input type="date" id="settle-date" class="form-control" value="${today()}" required/></label>
          <label>Amount * <input type="number" step="0.01" id="settle-amount" class="form-control" required/></label>
          <label class="full">Note <textarea id="settle-note" class="form-control" rows="2"></textarea></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="settle-confirm">Settle</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#settle-confirm').addEventListener('click', async () => {
    const txnDate = modalEl.querySelector('#settle-date').value;
    const amount = parseFloat(modalEl.querySelector('#settle-amount').value);
    const note = modalEl.querySelector('#settle-note').value.trim();
    if (!txnDate || isNaN(amount)) { toast('warn', 'Fill required fields', ''); return; }

    const payload = { txnDate, amount, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (note) payload.comments = note;

    try {
      await api.tellers.settleCashier(tellerId, cashierId, payload);
      modalEl.remove();
      toast('success', 'Cash settled', fmt(amount));
      onSuccess();
    } catch (e) { toast('error', 'Settlement failed', extractFineractError(e)); }
  });
}

export async function openEditTellerModal(tellerId, allTellers, onSuccess) {
  const t = allTellers.find(x => String(x.id) === String(tellerId));
  let officeList = [];
  try { const r = await api.offices.list(); officeList = Array.isArray(r) ? r : []; } catch {}
  const mid = 'edit-teller-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Edit Teller</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Name * <input id="et-name" class="form-control" value="${escapeHtml(t?.name || '')}" required/></label>
          <label>Office *
            <select id="et-office" class="form-control" required>
              ${officeList.map(o => `<option value="${o.id}" ${String(o.id) === String(t?.officeId) ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </label>
          <label>Start date * <input type="date" id="et-start" class="form-control" value="${(t?.startDate || []).join?.('-') || ''}" required/></label>
          <label>End date <input type="date" id="et-end" class="form-control" value="${(t?.endDate || []).join?.('-') || ''}"/></label>
          <label class="full">Description <textarea id="et-desc" class="form-control" rows="2">${escapeHtml(t?.description || '')}</textarea></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="et-save">Save</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#et-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#et-name').value.trim();
    const officeId = parseInt(modalEl.querySelector('#et-office').value);
    const startDate = modalEl.querySelector('#et-start').value;
    const endDate = modalEl.querySelector('#et-end').value;
    const description = modalEl.querySelector('#et-desc').value.trim();
    if (!name || !officeId || !startDate) { toast('warn', 'Fill required fields', ''); return; }
    const payload = { name, officeId, startDate, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (endDate) payload.endDate = endDate;
    if (description) payload.description = description;
    try {
      await api.tellers.update(tellerId, payload);
      modalEl.remove(); toast('success', 'Teller updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openEditCashierModal(tellerId, cashierId, onSuccess) {
  let record = null;
  try { record = await api.tellers.getCashier(tellerId, cashierId); } catch (e) {
    toast('error', 'Failed to load cashier', extractFineractError(e)); return;
  }
  const mid = 'edit-cashier-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Edit Cashier</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="text-muted mb-2">${escapeHtml(record?.staffName || record?.name || '—')}</div>
        <div class="form-grid">
          <label>Start date * <input type="date" id="ec-start" class="form-control" value="${record?.startDate || ''}" required/></label>
          <label>End date <input type="date" id="ec-end" class="form-control" value="${record?.endDate || ''}"/></label>
          <label>Cash limit <input type="number" step="0.01" id="ec-limit" class="form-control" value="${record?.cashLimit ?? ''}"/></label>
          <label>Description <input id="ec-desc" class="form-control" value="${escapeHtml(record?.description || '')}"/></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="ec-save">Save</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#ec-save').addEventListener('click', async () => {
    const startDate = modalEl.querySelector('#ec-start').value;
    const endDate = modalEl.querySelector('#ec-end').value;
    const cashLimit = parseFloat(modalEl.querySelector('#ec-limit').value);
    const description = modalEl.querySelector('#ec-desc').value.trim();
    if (!startDate) { toast('warn', 'Select a start date', ''); return; }
    const payload = { startDate, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (endDate) payload.endDate = endDate;
    if (isFinite(cashLimit)) payload.cashLimit = cashLimit;
    if (description) payload.description = description;
    try {
      await api.tellers.updateCashier(tellerId, cashierId, payload);
      modalEl.remove(); toast('success', 'Cashier updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openCashierTransactionsModal(tellerId, cashierId) {
  const mid = 'cashier-txns-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Cashier Transactions</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body" id="${mid}-body"><div class="empty-state-row">Loading…</div></div>
      <div class="modal-footer"><button class="btn-secondary" data-close-modal>Close</button></div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  const body = modalEl.querySelector(`#${mid}-body`);
  try {
    const res = await api.tellers.cashierSummary(tellerId, cashierId);
    const txns = res?.cashierTransactions || res?.transactions || (Array.isArray(res) ? res : []);
    body.innerHTML = `
      ${res?.summary ? `
        <div class="msg-banner b-info mb-2">
          Net: ${fmt(res.summary.netCash ?? res.summary.net ?? 0)}
        </div>` : ''}
      ${txns.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th>Type</th><th class="text-right">Amount</th><th>Currency</th></tr></thead>
          <tbody>${txns.map(t => `
            <tr>
              <td>${t.txnDate ? escapeHtml(Array.isArray(t.txnDate) ? t.txnDate.join('-') : t.txnDate) : '—'}</td>
              <td>${escapeHtml(t.txnType?.value || t.txnType || '—')}</td>
              <td class="text-right">${fmt(t.txnAmount ?? t.amount ?? 0)}</td>
              <td>${escapeHtml(t.currencyCode || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No transactions found for this cashier</div>'}`;
  } catch (e) {
    body.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}
