/* FinCraft · pages/clients/detail/identity.js — identifiers, family members, addresses, and photo tab loaders.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { can } from '../shared.js';

/* Surfaces the first family member on file as "Next of Kin" for the Overview tab.
   Fineract doesn't have a dedicated next-of-kin concept — family members are the closest
   real, storable analogue, so we show the first entry rather than inventing a new field. */
export async function loadClientNextOfKin(c, id) {
  const wrap = c.querySelector('#cl-next-of-kin'); if (!wrap) return;
  try {
    const res = await api.clients.familyMembers(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const kin = list[0];
    wrap.innerHTML = `
      <div class="cv-info-row"><span class="cv-i-label">Name</span><span class="cv-i-val">${kin ? escapeHtml(((kin.firstName || '') + ' ' + (kin.lastName || '')).trim()) : '—'}</span></div>
      <div class="cv-info-row"><span class="cv-i-label">Relationship</span><span class="cv-i-val">${kin ? escapeHtml(kin.relationship?.name || '—') : '—'}</span></div>
      <div class="cv-info-row"><span class="cv-i-label">Phone</span><span class="cv-i-val">${kin ? escapeHtml(kin.mobileNumber || '—') : '—'}</span></div>`;
  } catch {
    wrap.innerHTML = `<div class="cv-info-row"><span class="cv-i-label">Name</span><span class="cv-i-val">—</span></div>`;
  }
}

export async function loadClientIdentifiers(c, id) {
  const listEl = c.querySelector('#cl-identifier-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const items = await api.clients.identifiers(id);
    const list = Array.isArray(items) ? items : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Type</th><th>Document Key</th><th>Status</th><th>Description</th><th></th></tr></thead>
        <tbody>${list.map(i => `
          <tr>
            <td>${escapeHtml(i.documentType?.name || i.documentTypeName || '—')}</td>
            <td>${escapeHtml(i.documentKey || '—')}</td>
            <td>${sb(i.status?.value || '—')}</td>
            <td>${escapeHtml(i.description || '—')}</td>
            <td>${can('DELETE_CLIENTIDENTIFIER') ? `<button class="btn-mini btn-danger" data-del-id="${i.id}">Delete</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No identifiers on file</div>';

    listEl.querySelectorAll('[data-del-id]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete identifier?', danger: true, confirmText: 'Delete' })) return;
      try { await api.clients.deleteIdentifier(id, b.dataset.delId); toast('success', 'Identifier deleted', ''); loadClientIdentifiers(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientFamilyMembers(c, id) {
  const listEl = c.querySelector('#cl-family-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.familyMembers(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Relationship</th><th>Gender</th><th>Date of Birth</th><th>Dependent</th><th></th></tr></thead>
        <tbody>${list.map(m => `
          <tr>
            <td>${escapeHtml((m.firstName || '') + (m.lastName ? ' ' + m.lastName : '')) || '—'}</td>
            <td>${escapeHtml(m.relationship?.name || m.relationshipType?.value || '—')}</td>
            <td>${escapeHtml(m.gender?.name || '—')}</td>
            <td>${fmtDate(m.dateOfBirth) || '—'}</td>
            <td>${m.isDependent ? 'Yes' : 'No'}</td>
            <td>${can('DELETE_FAMILYMEMBERS') ? `<button class="btn-mini btn-danger" data-del-fam="${m.id}">Remove</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No family members on file</div>';

    listEl.querySelectorAll('[data-del-fam]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove family member?', danger: true, confirmText: 'Remove' })) return;
      try { await api.clients.deleteFamilyMember(id, b.dataset.delFam); toast('success', 'Removed', ''); loadClientFamilyMembers(c, id); }
      catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientCollateral(c, id) {
  const listEl = c.querySelector('#cl-collateral-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.collateral(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Type</th><th class="text-right">Quantity</th><th class="text-right">Total Value</th><th></th></tr></thead>
        <tbody>${list.map(cc => {
          const value = (cc.basePrice || cc.collateral?.basePrice || 0) * (cc.quantity || 0);
          return `
          <tr>
            <td>${escapeHtml(cc.collateral?.name || cc.name || '—')}</td>
            <td class="text-right">${fmt(cc.quantity || 0)}</td>
            <td class="text-right">${fmt(value)}</td>
            <td class="text-right">
              ${can('UPDATE_CLIENT_COLLATERAL_PRODUCT') ? `<button class="btn-mini" data-edit-coll="${cc.id}">Edit</button>` : ''}
              ${can('DELETE_CLIENT_COLLATERAL_PRODUCT') ? `<button class="btn-mini btn-danger" data-del-coll="${cc.id}">Remove</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No collateral registered for this client</div>';

    listEl.querySelectorAll('[data-edit-coll]').forEach(b => b.addEventListener('click', async () => {
      const { openEditClientCollateralModal } = await import('../actions/identity.js');
      openEditClientCollateralModal(id, b.dataset.editColl, () => loadClientCollateral(c, id));
    }));
    listEl.querySelectorAll('[data-del-coll]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove collateral?', danger: true, confirmText: 'Remove' })) return;
      try { await api.clients.deleteCollateral(id, b.dataset.delColl); toast('success', 'Collateral removed', ''); loadClientCollateral(c, id); }
      catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientAddresses(c, id) {
  const listEl = c.querySelector('#cl-address-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.addresses(id);
    const list = Array.isArray(res) ? res : [];
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Type</th><th>Street</th><th>City</th><th>Postal</th><th>Country</th><th>Active</th><th></th></tr></thead>
        <tbody>${list.map((a, i) => `
          <tr>
            <td>${escapeHtml(a.addressType?.name || a.addressTypeName || a.addressType || a.addressTypeId || '—')}</td>
            <td>${escapeHtml(a.street || a.addressLine1 || '—')}</td>
            <td>${escapeHtml(a.city || '—')}</td>
            <td>${escapeHtml(a.postalCode || '—')}</td>
            <td>${escapeHtml(a.countryName || a.country?.name || a.country || '—')}</td>
            <td>${a.isActive ? 'Yes' : 'No'}</td>
            <td>${can('UPDATE_ADDRESS') ? `<button class="btn-mini" data-edit-addr="${i}">Edit</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No addresses on file</div>';

    listEl.querySelectorAll('[data-edit-addr]').forEach(b => b.addEventListener('click', async () => {
      const address = list[parseInt(b.dataset.editAddr)];
      const { openEditAddressModal } = await import('../actions/identity.js');
      openEditAddressModal(id, address, () => loadClientAddresses(c, id));
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientPhoto(c, id) {
  const wrap = c.querySelector('#cl-photo-wrap'); if (!wrap) return;
  try {
    const res = await api.images.get('clients', id);
    if (!res.ok) throw new Error('No photo');
    const blob = await res.blob();
    wrap.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Client photo" class="client-photo"/>`;
  } catch { /* leave placeholder */ }
}
