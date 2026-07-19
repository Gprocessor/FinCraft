/* FinCraft · pages/clients/actions/identity.js — add identifier/family member/address modals.
   Auto-split from the original monolithic pages/clients/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmt } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openAddIdentifierModal(clientId, onSuccess) {
  let docTypes = [];
  try {
    const tpl = await api.clients.template();
    // Real Fineract field is clientIdentifierTypeOptions
    docTypes = tpl?.clientIdentifierTypeOptions || tpl?.documentTypeOptions || [];
  } catch {}
  const mid = `cl-id-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Identifier</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <label>Document type *
            <select id="id-doctype" class="form-control" required>
              <option value="">Select…</option>
              ${docTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </label>
          <label class="mt-2">Document key * <input id="id-dockey" class="form-control" required/></label>
          <label class="mt-2">Description <input id="id-desc" class="form-control"/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="id-save">Add</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#id-save').addEventListener('click', async () => {
    const documentTypeId = el.querySelector('#id-doctype').value;
    const documentKey = el.querySelector('#id-dockey').value.trim();
    const description = el.querySelector('#id-desc').value.trim();
    if (!documentTypeId || !documentKey) { toast('warn', 'Required fields missing', ''); return; }
    try {
      await api.clients.createIdentifier(clientId, {
        documentTypeId: parseInt(documentTypeId),
        documentKey,
        ...(description && { description })
      });
      el.remove(); toast('success', 'Identifier added', documentKey); onSuccess();
    } catch (e) { toast('error', 'Failed to add', extractFineractError(e)); }
  });
}

export async function openAddClientCollateralModal(clientId, onSuccess) {
  let options = [];
  try {
    const tpl = await api.clients.collateralTemplate(clientId);
    // Field name per Fineract ClientCollateralManagementApiResource template response.
    options = tpl?.clientCollateralOptions || tpl?.collateralOptions || [];
  } catch {}
  if (!options.length) {
    // Fallback to the organisation-wide collateral catalogue if the client template came back empty.
    try {
      const r = await api.collateralManagement.list();
      options = Array.isArray(r) ? r : (r?.pageItems || []);
    } catch {}
  }
  const mid = `cl-coll-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Collateral</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          ${options.length ? `
            <label>Collateral type *
              <select id="cc-type" class="form-control" required>
                <option value="">Select…</option>
                ${options.map(o => `<option value="${o.id}" data-base="${o.basePrice || 0}">${escapeHtml(o.name)} · base ${fmt(o.basePrice || 0)}</option>`).join('')}
              </select>
            </label>
            <label class="mt-2">Quantity * <input type="number" step="0.01" min="0" id="cc-qty" class="form-control" required/></label>
            <div class="text-muted small mt-2" id="cc-value-preview"></div>
          ` : `<div class="msg-banner b-warning">No collateral types configured. Add one under Organization → Collateral Types first.</div>`}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          ${options.length ? `<button class="btn-primary" id="cc-save">Add</button>` : ''}
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  const updatePreview = () => {
    const sel = el.querySelector('#cc-type'); const qty = parseFloat(el.querySelector('#cc-qty')?.value);
    const base = parseFloat(sel?.selectedOptions?.[0]?.dataset.base || 0);
    const prev = el.querySelector('#cc-value-preview');
    if (prev) prev.textContent = isFinite(qty) && qty > 0 ? `Estimated value: ${fmt(base * qty)}` : '';
  };
  el.querySelector('#cc-type')?.addEventListener('change', updatePreview);
  el.querySelector('#cc-qty')?.addEventListener('input', updatePreview);

  el.querySelector('#cc-save')?.addEventListener('click', async () => {
    const collateralId = el.querySelector('#cc-type').value;
    const quantity = parseFloat(el.querySelector('#cc-qty').value);
    if (!collateralId || !isFinite(quantity) || quantity <= 0) { toast('warn', 'Select a type and enter a valid quantity', ''); return; }
    try {
      await api.clients.addCollateral(clientId, { collateralId: parseInt(collateralId), quantity, locale: LOCALE });
      el.remove(); toast('success', 'Collateral added', ''); onSuccess();
    } catch (e) { toast('error', 'Failed to add', extractFineractError(e)); }
  });
}

export async function openEditClientCollateralModal(clientId, collateralId, onSuccess) {
  let record = null;
  try { record = await api.clients.getCollateral(clientId, collateralId); } catch (e) {
    toast('error', 'Failed to load collateral', extractFineractError(e)); return;
  }
  const mid = `cl-coll-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Collateral</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(record?.collateral?.name || record?.name || '—')}</div>
          <label>Quantity * <input type="number" step="0.01" min="0" id="cc-edit-qty" class="form-control" value="${record?.quantity ?? ''}" required/></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="cc-edit-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#cc-edit-save').addEventListener('click', async () => {
    const quantity = parseFloat(el.querySelector('#cc-edit-qty').value);
    if (!isFinite(quantity) || quantity <= 0) { toast('warn', 'Enter a valid quantity', ''); return; }
    try {
      await api.clients.updateCollateral(clientId, collateralId, { quantity, locale: LOCALE });
      el.remove(); toast('success', 'Collateral updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}

export async function openAddFamilyModal(clientId, onSuccess) {
  let relationships = [], genders = [];
  try {
    const tpl = await api.clients.template();
    relationships = tpl?.familyMemberOptions?.relationshipIdOptions || [];
    genders = tpl?.familyMemberOptions?.genderIdOptions || tpl?.genderOptions || [];
  } catch {}
  const mid = `cl-fam-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Family Member</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>First name * <input id="fam-fname" class="form-control" required/></label>
            <label>Last name <input id="fam-lname" class="form-control"/></label>
            <label>Relationship *
              <select id="fam-rel" class="form-control" required>
                <option value="">Select…</option>
                ${relationships.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
              </select>
            </label>
            <label>Gender
              <select id="fam-gender" class="form-control">
                <option value="">— Not specified —</option>
                ${genders.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
              </select>
            </label>
            <label>Date of birth <input id="fam-dob" type="date" class="form-control"/></label>
            <label class="checkbox-row"><input type="checkbox" id="fam-dependent"/> Dependent</label>
            <label class="full">Occupation <input id="fam-occupation" class="form-control"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="fam-save">Add Member</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#fam-save').addEventListener('click', async () => {
    const firstName = el.querySelector('#fam-fname').value.trim();
    const lastName = el.querySelector('#fam-lname').value.trim();
    const relationshipId = el.querySelector('#fam-rel').value;
    const genderId = el.querySelector('#fam-gender').value;
    const dateOfBirth = el.querySelector('#fam-dob').value;
    const isDependent = el.querySelector('#fam-dependent').checked;
    const occupation = el.querySelector('#fam-occupation').value.trim();
    if (!firstName || !relationshipId) { toast('warn', 'Required fields missing', ''); return; }
    try {
      await api.clients.createFamilyMember(clientId, {
        firstName, locale: LOCALE,
        ...(lastName && { lastName }),
        relationshipId: parseInt(relationshipId),
        ...(genderId && { genderId: parseInt(genderId) }),
        ...(dateOfBirth && { dateOfBirth, dateFormat: DATE_FORMAT }),
        isDependent,
        ...(occupation && { occupation })
      });
      el.remove(); toast('success', 'Family member added', firstName); onSuccess();
    } catch (e) { toast('error', 'Failed to add', extractFineractError(e)); }
  });
}

export async function openAddAddressModal(clientId, onSuccess) {
  let addressTypes = [], countries = [];
  try {
    const tpl = await api.clients.addressTemplate();
    addressTypes = tpl?.addressTypeIdOptions || [];
    countries = tpl?.countryIdOptions || [];
  } catch {}
  const mid = `cl-addr-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Add Address</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Address type *
              <select id="addr-type" class="form-control" required>
                <option value="">Select type…</option>
                ${addressTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
              </select>
            </label>
            <label>Street <input id="addr-street" class="form-control"/></label>
            <label>City <input id="addr-city" class="form-control"/></label>
            <label>Postal code <input id="addr-postal" class="form-control"/></label>
            <label>State / Province <input id="addr-state" class="form-control"/></label>
            <label>Country
              <select id="addr-country" class="form-control">
                <option value="">— Select country —</option>
                ${countries.map(co => `<option value="${co.id}">${escapeHtml(co.name)}</option>`).join('')}
              </select>
            </label>
            <label class="checkbox-row"><input type="checkbox" id="addr-active" checked/> Active address</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="addr-save">Add Address</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#addr-save').addEventListener('click', async () => {
    const addressTypeId = el.querySelector('#addr-type').value;
    if (!addressTypeId) { toast('warn', 'Select address type', ''); return; }
    try {
      await api.clients.createAddress(clientId, {
        addressTypeId: parseInt(addressTypeId),
        street: el.querySelector('#addr-street').value.trim() || undefined,
        city: el.querySelector('#addr-city').value.trim() || undefined,
        postalCode: el.querySelector('#addr-postal').value.trim() || undefined,
        stateProvinceId: el.querySelector('#addr-state').value.trim() || undefined,
        countryId: el.querySelector('#addr-country').value ? parseInt(el.querySelector('#addr-country').value) : undefined,
        isActive: el.querySelector('#addr-active').checked
      });
      el.remove(); toast('success', 'Address added', ''); onSuccess();
    } catch (e) { toast('error', 'Failed to add', extractFineractError(e)); }
  });
}

/* Fineract stores at most one address per addressType per client, and
   ClientAddressApiResource's PUT shares the exact same path as POST (no {addressId}
   segment) — the addressTypeId in the body is what identifies which address gets
   updated. That also means the address type itself isn't editable here (changing it
   would just create/target a different address record), so it's shown read-only. */
export async function openEditAddressModal(clientId, address, onSuccess) {
  const addressTypeId = address.addressTypeId ?? address.addressType?.id;
  if (!addressTypeId) {
    toast('error', 'Cannot edit address', 'Missing address type on this record'); return;
  }
  let countries = [];
  try {
    const tpl = await api.clients.addressTemplate();
    countries = tpl?.countryIdOptions || [];
  } catch {}
  const typeLabel = address.addressType?.name || address.addressTypeName || address.addressType || 'Address';
  const countryId = address.countryId ?? address.country?.id ?? '';
  const mid = `cl-addr-edit-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Edit Address</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="text-muted mb-2">${escapeHtml(typeLabel)} address</div>
          <div class="form-grid">
            <label>Street <input id="addr-edit-street" class="form-control" value="${escapeHtml(address.street || address.addressLine1 || '')}"/></label>
            <label>City <input id="addr-edit-city" class="form-control" value="${escapeHtml(address.city || '')}"/></label>
            <label>Postal code <input id="addr-edit-postal" class="form-control" value="${escapeHtml(address.postalCode || '')}"/></label>
            <label>State / Province <input id="addr-edit-state" class="form-control" value="${escapeHtml(address.stateName || address.stateProvinceId || '')}"/></label>
            <label>Country
              <select id="addr-edit-country" class="form-control">
                <option value="">— Select country —</option>
                ${countries.map(co => `<option value="${co.id}" ${String(co.id) === String(countryId) ? 'selected' : ''}>${escapeHtml(co.name)}</option>`).join('')}
              </select>
            </label>
            <label class="checkbox-row"><input type="checkbox" id="addr-edit-active" ${address.isActive ? 'checked' : ''}/> Active address</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="addr-edit-save">Save Changes</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#addr-edit-save').addEventListener('click', async () => {
    try {
      await api.clients.updateAddress(clientId, {
        addressTypeId: parseInt(addressTypeId),
        street: el.querySelector('#addr-edit-street').value.trim() || undefined,
        city: el.querySelector('#addr-edit-city').value.trim() || undefined,
        postalCode: el.querySelector('#addr-edit-postal').value.trim() || undefined,
        stateProvinceId: el.querySelector('#addr-edit-state').value.trim() || undefined,
        countryId: el.querySelector('#addr-edit-country').value ? parseInt(el.querySelector('#addr-edit-country').value) : undefined,
        isActive: el.querySelector('#addr-edit-active').checked
      });
      el.remove(); toast('success', 'Address updated', ''); onSuccess();
    } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
  });
}
