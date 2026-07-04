/* FinCraft · pages/clients/actions/identity.js — add identifier/family member/address modals.
   Auto-split from the original monolithic pages/clients/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

export async function openAddIdentifierModal(clientId, onSuccess) {
  let docTypes = [];
  try {
    const tpl = await api.clients.template();
    // Real Fineract field is clientIdentifierTypeOptions
    docTypes = tpl?.clientIdentifierTypeOptions || tpl?.documentTypeOptions || [];
  } catch {}
  const mid = `cl-id-modal-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
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
    <div class="modal-overlay open" id="${mid}">
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
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
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
    <div class="modal-overlay open" id="${mid}">
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
    } catch (e) { toast('error', 'Failed to add', e.detail?.defaultUserMessage || e.message); }
  });
}
