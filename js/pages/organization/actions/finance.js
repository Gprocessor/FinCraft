/* FinCraft · pages/organization/actions/finance.js — currency, payment type, and fund modals.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export async function openCurrencyEditModal(onSuccess) {
  let allCurrencies = [], selectedCodes = new Set();
  try {
    const res = await api.currencies.all();
    const all = res?.currencyOptions || [];
    const selected = res?.selectedCurrencyOptions || [];
    allCurrencies = all;
    selectedCodes = new Set(selected.map(c => c.code));
  } catch { toast('error', 'Failed to load currencies', ''); return; }

  const mid = 'cur-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>Edit Currencies</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="text-muted small mb-2">
          <i class="fa-solid fa-circle-info"></i>
          Check currencies you want available across the tenant.
        </div>
        <div style="max-height:400px;overflow:auto;border:1px solid var(--border);padding:8px;border-radius:4px">
          ${allCurrencies.map(co => `
            <label class="checkbox-row" style="display:block; padding:4px 0">
              <input type="checkbox" class="cur-chk" value="${co.code}" ${selectedCodes.has(co.code) ? 'checked' : ''}/>
              <b>${escapeHtml(co.code)}</b> — ${escapeHtml(co.name)}
              <span class="text-muted small">(${co.decimalPlaces} dp)</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="cur-save">Save</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#cur-save').addEventListener('click', async () => {
    const currencies = [...modalEl.querySelectorAll('.cur-chk:checked')].map(cb => cb.value);
    if (!currencies.length) { toast('warn', 'Select at least one currency', ''); return; }
    try {
      await api.currencies.update({ currencies });
      modalEl.remove();
      toast('success', 'Currencies updated', `${currencies.length} selected`);
      onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openPaymentTypeModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'pt-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Payment Type</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Name * <input id="pt-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
          <label>Description <input id="pt-desc" class="form-control" value="${escapeHtml(existing?.description || '')}"/></label>
          <label>Position <input type="number" id="pt-pos" class="form-control" value="${existing?.position ?? 0}"/></label>
          <label class="checkbox-row"><input type="checkbox" id="pt-cash" ${existing?.isCashPayment ? 'checked' : ''}/> Is cash payment</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="pt-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#pt-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#pt-name').value.trim();
    const description = modalEl.querySelector('#pt-desc').value.trim();
    const position = parseInt(modalEl.querySelector('#pt-pos').value) || 0;
    const isCashPayment = modalEl.querySelector('#pt-cash').checked;
    if (!name) { toast('warn', 'Enter a name', ''); return; }
    try {
      if (isEdit) await api.paymentTypes.update(existing.id, { name, description, position, isCashPayment });
      else        await api.paymentTypes.create({ name, description, position, isCashPayment });
      modalEl.remove();
      toast('success', isEdit ? 'Payment type updated' : 'Payment type created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export function openFundModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'fund-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Fund</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Name * <input id="fund-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
          <label>External ID <input id="fund-ext" class="form-control" value="${escapeHtml(existing?.externalId || '')}"/></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="fund-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#fund-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#fund-name').value.trim();
    const externalId = modalEl.querySelector('#fund-ext').value.trim();
    if (!name) { toast('warn', 'Enter a name', ''); return; }
    const payload = { name };
    if (externalId) payload.externalId = externalId;
    try {
      if (isEdit) await api.funds.update(existing.id, payload);
      else        await api.funds.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Fund updated' : 'Fund created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}
