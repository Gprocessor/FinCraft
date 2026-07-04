/* FinCraft · pages/organization/loaders/offices-staff.js — offices, staff, and tellers tab loaders.
   Auto-split (2nd pass) from pages/organization/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, fmtDate, sb } from '../../../utils.js';
import { confirm as modalConfirm, openModal, toast } from '../../../ui.js';
import { openAllocateCashierModal, openEditOfficeModal, openEditStaffModal, openSettleCashierModal } from '../actions.js';

export function loadOffices(c, officeList) {
  const el = c.querySelector('#og-0');
  el.innerHTML = `
    <div class="section-header mb-2">
      <span class="text-muted">${officeList.length} office${officeList.length !== 1 ? 's' : ''}</span>
      ${can('CREATE_OFFICE') ? `<button class="btn-primary" id="btn-new-office"><i class="fa-solid fa-plus"></i> New Office</button>` : ''}
    </div>
    <table class="table">
      <thead><tr>
        <th>Name</th><th>Parent</th><th>Hierarchy</th><th>Opened</th><th></th>
      </tr></thead>
      <tbody>${officeList.length ? officeList.map(o => `
        <tr>
          <td>${escapeHtml(o.name)}</td>
          <td>${escapeHtml(o.parentName || '—')}</td>
          <td>${escapeHtml(o.hierarchy || '.')}</td>
          <td>${fmtDate(o.openingDate) || '—'}</td>
          <td class="text-right">
            ${can('UPDATE_OFFICE') ? `<button class="btn-mini" data-edit-office="${o.id}">Edit</button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="5" class="empty-state-row">No offices</td></tr>'}
      </tbody>
    </table>`;

  el.querySelector('#btn-new-office')?.addEventListener('click', () => openModal('newOfficeModal'));
  el.querySelectorAll('[data-edit-office]').forEach(b => b.addEventListener('click', () =>
    openEditOfficeModal(b.dataset.editOffice, officeList, () =>
      document.dispatchEvent(new CustomEvent('fc:reload', { detail: { page: 'organization' } }))
    )));
}

export async function loadStaff(c) {
  const el = c.querySelector('#og-1');
  try {
    const res = await api.staff.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} staff</span>
        ${can('CREATE_STAFF') ? `<button class="btn-primary" id="btn-new-staff"><i class="fa-solid fa-plus"></i> New Staff</button>` : ''}
      </div>
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Office</th><th>Loan Officer?</th><th>Active</th><th></th>
        </tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td>${escapeHtml(s.displayName || '—')}</td>
            <td>${escapeHtml(s.officeName || '—')}</td>
            <td>${s.isLoanOfficer ? 'Yes' : 'No'}</td>
            <td>${sb(s.isActive ? 'Active' : 'Closed')}</td>
            <td class="text-right">
              ${can('UPDATE_STAFF') ? `<button class="btn-mini" data-edit-staff="${s.id}">Edit</button>` : ''}
              ${s.isActive && can('UPDATE_STAFF') ? `<button class="btn-mini btn-danger" data-deactivate-staff="${s.id}">Deactivate</button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty-state-row">No staff</td></tr>'}
        </tbody>
      </table>`;

    el.querySelector('#btn-new-staff')?.addEventListener('click', () => openModal('newStaffModal'));
    el.querySelectorAll('[data-edit-staff]').forEach(b => b.addEventListener('click', () =>
      openEditStaffModal(b.dataset.editStaff, () => loadStaff(c))));
    el.querySelectorAll('[data-deactivate-staff]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Deactivate staff member?', danger: true, confirmText: 'Deactivate' })) return;
      try {
        await api.staff.update(b.dataset.deactivateStaff, { isActive: false });
        toast('success', 'Staff deactivated', '');
        loadStaff(c);
      } catch (e) { toast('error', 'Deactivation failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadTellers(c) {
  const el = c.querySelector('#og-2');
  try {
    const tellers = await api.tellers.list();
    const list = Array.isArray(tellers) ? tellers : [];
    if (!list.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-cash-register"></i>
          <h3>No tellers configured</h3>
          ${can('CREATE_TELLER') ? `<button class="btn-primary mt-3" id="btn-new-teller"><i class="fa-solid fa-plus"></i> New Teller</button>` : ''}
        </div>`;
      el.querySelector('#btn-new-teller')?.addEventListener('click', () => openModal('newTellerModal'));
      return;
    }
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} teller${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_TELLER') ? `<button class="btn-primary" id="btn-new-teller"><i class="fa-solid fa-plus"></i> New Teller</button>` : ''}
      </div>
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Office</th><th>Start</th><th>End</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td>${escapeHtml(t.name || '—')}</td>
            <td>${escapeHtml(t.officeName || '—')}</td>
            <td>${fmtDate(t.startDate) || '—'}</td>
            <td>${fmtDate(t.endDate) || '—'}</td>
            <td>${sb(t.status || 'Active')}</td>
            <td class="text-right">
              <button class="btn-mini" data-teller-cashiers="${t.id}" data-teller-name="${escapeHtml(t.name || '')}">Cashiers</button>
            </td>
          </tr>
          <tr id="cashier-row-${t.id}" style="display:none">
            <td colspan="6"><div id="cashier-body-${t.id}"></div></td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    el.querySelector('#btn-new-teller')?.addEventListener('click', () => openModal('newTellerModal'));
    el.querySelectorAll('[data-teller-cashiers]').forEach(b => b.addEventListener('click', async () => {
      const tid = b.dataset.tellerCashiers;
      const row = c.querySelector('#cashier-row-' + tid);
      const body = c.querySelector('#cashier-body-' + tid);
      if (row.style.display !== 'none') { row.style.display = 'none'; return; }
      row.style.display = '';
      body.innerHTML = '<div class="empty-state-row">Loading cashiers…</div>';
      try {
        const cashiers = await api.tellers.cashiers(tid);
        const clist = Array.isArray(cashiers) ? cashiers : (cashiers?.cashiers || []);
        body.innerHTML = `
          <div class="section-header mb-2">
            <b>Cashiers — ${escapeHtml(b.dataset.tellerName)}</b>
            ${can('ALLOCATE_CASHIERS_TELLER') ? `<button class="btn-secondary btn-sm" data-alloc-teller="${tid}"><i class="fa-solid fa-plus"></i> Allocate</button>` : ''}
          </div>
          ${clist.length ? `
            <table class="table">
              <thead><tr><th>Staff</th><th>Start</th><th>End</th><th>Type</th><th></th></tr></thead>
              <tbody>${clist.map(cx => `
                <tr>
                  <td>${escapeHtml(cx.staffName || cx.name || '—')}</td>
                  <td>${fmtDate(cx.startDate) || '—'}</td>
                  <td>${fmtDate(cx.endDate) || '—'}</td>
                  <td>${escapeHtml(cx.type || '—')}</td>
                  <td class="text-right">
                    ${can('SETTLE_CASHIERS_TELLER') ? `<button class="btn-mini" data-settle-teller="${tid}" data-settle-cashier="${cx.id}">Settle</button>` : ''}
                  </td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="empty-state-row">No cashiers assigned</div>'}`;

        body.querySelector('[data-alloc-teller]')?.addEventListener('click', () =>
          openAllocateCashierModal(tid, b.dataset.tellerName, () => { row.style.display = 'none'; loadTellers(c); }));
        body.querySelectorAll('[data-settle-teller]').forEach(sb2 =>
          sb2.addEventListener('click', () =>
            openSettleCashierModal(sb2.dataset.settleTeller, sb2.dataset.settleCashier, () => { row.style.display = 'none'; loadTellers(c); })));
      } catch (e) { body.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
