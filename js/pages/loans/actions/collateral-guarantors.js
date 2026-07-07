/* FinCraft · pages/loans/actions/collateral-guarantors.js — collateral, guarantor, originator, and EAO transfer modals.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml, fmt, ini } from '../../../utils.js';
import { toast } from '../../../ui.js';

export async function openAddLoanCollateralModal(loanId, clientId, onSuccess) {
  // Try to fetch client's pre-registered collateral pool
  let clientCollaterals = [];
  if (clientId) {
    try {
      const r = await api.clients.collateral?.(clientId) || await api._g?.(`/clients/${clientId}/collaterals`);
      clientCollaterals = Array.isArray(r) ? r : (r?.pageItems || []);
    } catch {}
  }

  const mid = `ln-col-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Collateral to Loan</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${clientCollaterals.length ? `
            <label>Client Collateral *
              <select id="col-pick" class="form-control" required>
                <option value="">Select from client's collateral pool…</option>
                ${clientCollaterals.map(cc => `<option value="${cc.id}" data-qty="${cc.quantity || 1}">
                  ${escapeHtml(cc.collateral?.name || cc.name || '—')} · base ${fmt(cc.basePrice || 0)}
                </option>`).join('')}
              </select>
            </label>
            <label class="mt-2">Quantity to pledge * <input type="number" step="0.01" id="col-qty" class="form-control" required/></label>
          ` : `
            <div class="msg-banner b-warning mb-2">
              No collateral registered on the client yet. Add collateral on the client first, then return here.
            </div>
            <label>Description (legacy field) * <input id="col-desc" class="form-control"/></label>
            <label class="mt-2">Value (legacy field) <input type="number" step="0.01" id="col-value" class="form-control"/></label>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="col-save">Add</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#col-save').addEventListener('click', async () => {
    let payload;
    if (clientCollaterals.length) {
      const clientCollateralId = el.querySelector('#col-pick').value;
      const quantity = parseFloat(el.querySelector('#col-qty').value);
      if (!clientCollateralId || isNaN(quantity)) { toast('warn', 'Select and enter quantity', ''); return; }
      payload = { clientCollateralId: parseInt(clientCollateralId), quantity, locale: LOCALE };
    } else {
      const description = el.querySelector('#col-desc')?.value.trim();
      const value = parseFloat(el.querySelector('#col-value')?.value);
      if (!description) { toast('warn', 'Enter description', ''); return; }
      payload = { description, ...(isFinite(value) && { value }), locale: LOCALE };
    }
    try {
      await api.loans.addCollateral(loanId, payload);
      el.remove();
      toast('success', 'Collateral added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEditLoanCollateralModal(loanId, collateralId, onSuccess) {
  let record = null;
  try { record = await api.loans.getCollateral(loanId, collateralId); } catch (e) {
    toast('error', 'Failed to load collateral', e.detail?.defaultUserMessage || e.message); return;
  }
  const isPooled = record?.clientCollateralId != null;
  const mid = `ln-col-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Collateral</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(record?.collateralType?.name || record?.description || '—')}</div>
          ${isPooled ? `
            <label>Quantity pledged * <input type="number" step="0.01" id="col-edit-qty" class="form-control" value="${record?.quantity ?? ''}" required/></label>
          ` : `
            <label>Description <input id="col-edit-desc" class="form-control" value="${escapeHtml(record?.description || '')}"/></label>
            <label class="mt-2">Value <input type="number" step="0.01" id="col-edit-value" class="form-control" value="${record?.value ?? ''}"/></label>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="col-edit-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#col-edit-save').addEventListener('click', async () => {
    let payload;
    if (isPooled) {
      const quantity = parseFloat(el.querySelector('#col-edit-qty').value);
      if (!isFinite(quantity) || quantity <= 0) { toast('warn', 'Enter a valid quantity', ''); return; }
      payload = { quantity, locale: LOCALE };
    } else {
      const description = el.querySelector('#col-edit-desc').value.trim();
      const value = parseFloat(el.querySelector('#col-edit-value').value);
      if (!description) { toast('warn', 'Enter description', ''); return; }
      payload = { description, ...(isFinite(value) && { value }), locale: LOCALE };
    }
    try {
      await api.loans.updateCollateral(loanId, collateralId, payload);
      el.remove(); toast('success', 'Collateral updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAddGuarantorModal(loanId, onSuccess) {
  // Pull guarantor type options + on-hold savings template if available
  let tpl = {};
  try { tpl = await api.loans.guarantorTemplate(loanId); } catch {}
  const guarantorTypeOptions = tpl?.guarantorTypeOptions || [
    { id: 1, name: 'Customer' },
    { id: 2, name: 'Staff' },
    { id: 3, name: 'External' }
  ];

  const mid = `ln-guar-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Add Guarantor</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Guarantor type *
            <select id="gar-type" class="form-control">
              ${guarantorTypeOptions.map(o => `<option value="${o.id}">${escapeHtml(o.name || o.value)}</option>`).join('')}
            </select>
          </label>

          <div id="gar-client-wrap" class="mt-3">
            <label>Search existing client
              <input id="gar-client-search" class="form-control" placeholder="Type to search…" autocomplete="off"/>
            </label>
            <input type="hidden" id="gar-client-id"/>
            <div id="gar-client-results" class="search-results-inline mt-1" style="display:none"></div>
          </div>

          <div id="gar-external-wrap" class="mt-3" style="display:none">
            <div class="form-grid">
              <label>First name * <input id="gar-fname" class="form-control"/></label>
              <label>Last name * <input id="gar-lname" class="form-control"/></label>
              <label>Mobile <input id="gar-mobile" class="form-control"/></label>
              <label>Address <input id="gar-address" class="form-control"/></label>
            </div>
          </div>

          <label class="mt-3">Amount guaranteed <input type="number" step="0.01" id="gar-amount" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="gar-save">Add Guarantor</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  // Toggle client vs external on guarantor type change
  el.querySelector('#gar-type').addEventListener('change', (e) => {
    const isExternal = parseInt(e.target.value) === 3;
    el.querySelector('#gar-client-wrap').style.display = isExternal ? 'none' : '';
    el.querySelector('#gar-external-wrap').style.display = isExternal ? '' : 'none';
  });

  // Client search autocomplete
  const searchEl = el.querySelector('#gar-client-search');
  const resultsEl = el.querySelector('#gar-client-results');
  const clientIdEl = el.querySelector('#gar-client-id');
  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = searchEl.value.trim();
    if (q.length < 2) { resultsEl.style.display = 'none'; return; }
    debounce = setTimeout(async () => {
      try {
        const res = await api.clients.list({ displayName: q, limit: 8 });
        const rows = Array.isArray(res) ? res : (res?.pageItems || []);
        resultsEl.innerHTML = rows.length ? rows.map(cl => `
          <button class="search-result" data-pick-id="${cl.id}" data-pick-name="${escapeHtml(cl.displayName)}">
            <div class="avatar">${ini(cl.displayName)}</div>
            <div>
              <strong>${escapeHtml(cl.displayName)}</strong>
              <div class="text-muted small">#${escapeHtml(cl.accountNo || cl.id)}</div>
            </div>
          </button>`).join('') : '<div class="search-empty">No results</div>';
        resultsEl.style.display = 'block';
        resultsEl.querySelectorAll('[data-pick-id]').forEach(b => b.addEventListener('click', () => {
          clientIdEl.value = b.dataset.pickId;
          searchEl.value = b.dataset.pickName;
          resultsEl.style.display = 'none';
        }));
      } catch {}
    }, 300);
  });

  el.querySelector('#gar-save').addEventListener('click', async () => {
    const typeVal = parseInt(el.querySelector('#gar-type').value);
    const amount = parseFloat(el.querySelector('#gar-amount').value);
    const payload = {
      guarantorTypeId: typeVal,
      ...(isFinite(amount) && { amount })
    };
    if (typeVal !== 3) {
      const cid = clientIdEl.value;
      if (!cid) { toast('warn', 'Search and select a client', ''); return; }
      payload.entityId = parseInt(cid);
    } else {
      const fname = el.querySelector('#gar-fname').value.trim();
      const lname = el.querySelector('#gar-lname').value.trim();
      if (!fname || !lname) { toast('warn', 'Enter first and last name', ''); return; }
      payload.firstname = fname;
      payload.lastname = lname;
      const mobile = el.querySelector('#gar-mobile').value.trim();
      if (mobile) payload.mobileNumber = mobile;
      const addr = el.querySelector('#gar-address').value.trim();
      if (addr) payload.addressLine1 = addr;
    }
    try {
      await api.loans.addGuarantor(loanId, payload);
      el.remove();
      toast('success', 'Guarantor added', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEditGuarantorModal(loanId, guarantorId, onSuccess) {
  let record = null;
  try { record = await api.loans.getGuarantor(loanId, guarantorId); } catch (e) {
    toast('error', 'Failed to load guarantor', e.detail?.defaultUserMessage || e.message); return;
  }
  const name = record?.clientName || record?.entityDisplayName ||
    [record?.firstname, record?.lastname].filter(Boolean).join(' ') || '—';
  const mid = `ln-guar-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Guarantor</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(name)}</div>
          <label>Amount guaranteed <input type="number" step="0.01" id="gar-edit-amount" class="form-control" value="${record?.amount ?? ''}"/></label>
          ${record?.firstname != null ? `
            <label class="mt-2">First name <input id="gar-edit-fname" class="form-control" value="${escapeHtml(record?.firstname || '')}"/></label>
            <label class="mt-2">Last name <input id="gar-edit-lname" class="form-control" value="${escapeHtml(record?.lastname || '')}"/></label>
            <label class="mt-2">Mobile <input id="gar-edit-mobile" class="form-control" value="${escapeHtml(record?.mobileNumber || '')}"/></label>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="gar-edit-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#gar-edit-save').addEventListener('click', async () => {
    const amount = parseFloat(el.querySelector('#gar-edit-amount').value);
    const payload = { ...(isFinite(amount) && { amount }) };
    const fnameEl = el.querySelector('#gar-edit-fname');
    if (fnameEl) {
      payload.firstname = fnameEl.value.trim();
      payload.lastname = el.querySelector('#gar-edit-lname').value.trim();
      const mobile = el.querySelector('#gar-edit-mobile').value.trim();
      if (mobile) payload.mobileNumber = mobile;
    }
    try {
      await api.loans.updateGuarantor(loanId, guarantorId, payload);
      el.remove(); toast('success', 'Guarantor updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openAttachOriginatorModal(loanId, onSuccess) {
  let originators = [];
  try {
    const r = await api.loanOriginators.list({ limit: 200 });
    originators = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}
  const mid = `ln-attorig-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Attach Originator</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${originators.length ? `
            <label>Originator *
              <select id="ao-pick" class="form-control" required>
                <option value="">Select originator…</option>
                ${originators.map(o => `<option value="${o.id}">${escapeHtml(o.name || o.displayName || '—')}</option>`).join('')}
              </select>
            </label>
            <label class="mt-2">Attachment date <input type="date" id="ao-date" class="form-control" value="${today()}"/></label>
            <label class="mt-2">Note <textarea id="ao-note" class="form-control" rows="2"></textarea></label>
          ` : `
            <div class="msg-banner b-warning">
              No originators registered. Create one in Organization → Loan Originators first.
            </div>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          ${originators.length ? `<button class="btn-primary" id="ao-save">Attach</button>` : ''}
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ao-save')?.addEventListener('click', async () => {
    const originatorId = el.querySelector('#ao-pick').value;
    if (!originatorId) { toast('warn', 'Select an originator', ''); return; }
    const payload = {
      dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(el.querySelector('#ao-date').value && { attachedOn: el.querySelector('#ao-date').value }),
      ...(el.querySelector('#ao-note').value.trim() && { note: el.querySelector('#ao-note').value.trim() })
    };
    try {
      await api.loans.attachOriginator(loanId, originatorId, payload);
      el.remove();
      toast('success', 'Originator attached', '');
      onSuccess();
    } catch (e) { toast('error', 'Attach failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openEAOTransferModal(loanId, mode, onSuccess) {
  let owners = [];
  try {
    const r = await api.externalAssetOwners.list({ limit: 200 });
    owners = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}

  const isBuyback = mode === 'buyback';
  const mid = `ln-eao-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>${isBuyback ? 'Buy-back Loan' : 'Transfer to External Asset Owner'}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${!isBuyback ? `
            <label>External Asset Owner *
              <select id="eao-owner" class="form-control" required>
                <option value="">Select owner…</option>
                ${owners.map(o => `<option value="${o.externalId || o.id}">${escapeHtml(o.name || o.displayName || '—')}</option>`).join('')}
              </select>
            </label>
          ` : ''}
          <label class="mt-2">Settlement date * <input type="date" id="eao-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Purchase price ratio (0.0 - 1.0) <input type="number" step="0.0001" min="0" max="1" id="eao-ratio" class="form-control" value="1.0"/></label>
          <label class="mt-2">Transfer external ID
            <input id="eao-extid" class="form-control" placeholder="Auto-generated if blank"/>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="eao-save">${isBuyback ? 'Buy-back' : 'Transfer'}</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#eao-save').addEventListener('click', async () => {
    const settlementDate = el.querySelector('#eao-date').value;
    const ratio = parseFloat(el.querySelector('#eao-ratio').value);
    const extId = el.querySelector('#eao-extid')?.value.trim();
    const payload = {
      settlementDate, dateFormat: DATE_FORMAT, locale: LOCALE,
      ...(isFinite(ratio) && { purchasePriceRatio: ratio }),
      ...(extId && { transferExternalId: extId })
    };
    if (!isBuyback) {
      const owner = el.querySelector('#eao-owner').value;
      if (!owner) { toast('warn', 'Select an owner', ''); return; }
      payload.ownerExternalId = owner;
    }
    try {
      if (isBuyback) await api.loans.eaoBuyBack(loanId, payload);
      else           await api.loans.eaoTransfer(loanId, payload);
      el.remove();
      toast('success', isBuyback ? 'Buy-back recorded' : 'Transfer initiated', '');
      onSuccess();
    } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
  });
}
