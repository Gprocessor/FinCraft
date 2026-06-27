import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · organization.js — Organization config (permission-gated, 15 sub-tabs)
   Path B restructure: SMS Campaigns moved from System tab to here */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = [
  'Offices',
  'Staff',
  'Tellers & Cashiers',
  'Holidays',
  'Working Days',
  'Currencies',
  'Payment Types',
  'Standing Instructions',
  'Funds',
  'Adhoc Queries',
  'Loan Originators',
  'External Asset Owners',
  'Entity Datatable Checks',
  'Bulk Imports',
  'SMS Campaigns'
];

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Organization</h1>
        <div class="text-muted">Offices, staff, holidays, operational config & SMS campaigns</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="og-tabs" style="flex-wrap:wrap">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="og-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="og-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    // Lazy-load on first click for new tabs
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    const newLoaders = {
      8: loadFunds,
      9: loadAdhocQueries,
      10: loadLoanOriginators,
      11: loadExternalAssetOwners,
      12: loadEntityDatatableChecks,
      13: loadBulkImports,
      14: loadSmsCampaigns
    };
    if (newLoaders[idx] && !tab.dataset.loaded) {
      tab.dataset.loaded = '1';
      newLoaders[idx](c);
    }
  }));

  // Eager-load original 8 tabs (preserves existing behaviour)
  let officeList = [];
  const officesRes = await api.offices.list().catch(() => []);
  officeList = Array.isArray(officesRes) ? officesRes : [];

  loadOffices(c, officeList);
  loadStaff(c);
  loadTellers(c);
  loadHolidays(c, officeList);
  loadWorkingDays(c);
  loadCurrencies(c);
  loadPaymentTypes(c);
  loadStandingInstructions(c);
}

// ════════════════════════════════════════════════════════════
// OFFICES (unchanged from original — permission added)
// ════════════════════════════════════════════════════════════
function loadOffices(c, officeList) {
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

async function openEditOfficeModal(officeId, allOffices, onSuccess) {
  const mid = 'edit-office-' + Date.now();
  const el = document.getElementById('modalRoot');
  if (!el) return;
  let office;
  try { office = await api.offices.get(officeId); } catch { toast('error', 'Failed to load office', ''); return; }

  el.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// STAFF (modal confirm + permission gating)
// ════════════════════════════════════════════════════════════
async function loadStaff(c) {
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

async function openEditStaffModal(staffId, onSuccess) {
  const mid = 'edit-staff-' + Date.now();
  const mr = document.getElementById('modalRoot');
  if (!mr) return;
  let s, offices;
  try {
    [s, offices] = await Promise.all([api.staff.get(staffId), api.offices.list()]);
  } catch { toast('error', 'Failed to load staff', ''); return; }
  const offList = Array.isArray(offices) ? offices : [];

  mr.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
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
    } catch (e) { toast('error', 'Update failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// TELLERS & CASHIERS (unchanged from original — permission added)
// ════════════════════════════════════════════════════════════
async function loadTellers(c) {
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

async function openAllocateCashierModal(tellerId, tellerName, onSuccess) {
  let staffList = [];
  try { const r = await api.staff.list(); staffList = Array.isArray(r) ? r : (r?.pageItems || []); } catch {}

  const mid = 'alloc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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
    } catch (e) { toast('error', 'Allocation failed', e.detail?.defaultUserMessage || e.message); }
  });
}

async function openSettleCashierModal(tellerId, cashierId, onSuccess) {
  const mid = 'settle-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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
    } catch (e) { toast('error', 'Settlement failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// HOLIDAYS (modal confirm + permission gating)
// ════════════════════════════════════════════════════════════
async function loadHolidays(c, officeList) {
  const el = c.querySelector('#og-3');
  const headOffice = officeList.find(o => o.hierarchy === '.') || officeList[0];
  try {
    const holidays = headOffice ? await api.holidays.list({ officeId: headOffice.id }) : [];
    const list = Array.isArray(holidays) ? holidays : [];
    const offOpts = officeList.map(o => `<option value="${o.id}" ${o.id === headOffice?.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');

    el.innerHTML = `
      <div class="section-header mb-2">
        <label>Office <select id="hol-office" class="form-control" style="display:inline-block;width:auto">${offOpts}</select></label>
        ${can('CREATE_HOLIDAY') ? `<button class="btn-primary" id="btn-new-hol"><i class="fa-solid fa-plus"></i> New Holiday</button>` : ''}
      </div>
      <div id="hol-list">${list.length ? `
        <table class="table">
          <thead><tr><th>Name</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.map(h => `
            <tr>
              <td>${escapeHtml(h.name)}</td>
              <td>${fmtDate(h.fromDate)}</td>
              <td>${fmtDate(h.toDate)}</td>
              <td>${sb(h.status?.value || '')}</td>
              <td class="text-right">
                ${(h.status?.value === 'Pending' && can('ACTIVATE_HOLIDAY')) ? `<button class="btn-mini btn-success" data-activate-hol="${h.id}">Activate</button>` : ''}
                ${can('DELETE_HOLIDAY') ? `<button class="btn-mini btn-danger" data-del-hol="${h.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No holidays for this office</div>'}
      </div>`;

    el.querySelector('#hol-office').addEventListener('change', async (e) => {
      const offId = parseInt(e.target.value);
      const hols = await api.holidays.list({ officeId: offId }).catch(() => []);
      const h2 = Array.isArray(hols) ? hols : [];
      el.querySelector('#hol-list').innerHTML = h2.length ? `
        <table class="table">
          <thead><tr><th>Name</th><th>From</th><th>To</th><th>Status</th></tr></thead>
          <tbody>${h2.map(h => `
            <tr>
              <td>${escapeHtml(h.name)}</td>
              <td>${fmtDate(h.fromDate)}</td>
              <td>${fmtDate(h.toDate)}</td>
              <td>${sb(h.status?.value || '')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No holidays</div>';
    });

    el.querySelector('#btn-new-hol')?.addEventListener('click', () =>
      openHolidayModal(officeList, () => loadHolidays(c, officeList)));
    el.querySelectorAll('[data-activate-hol]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.holidays.activate(b.dataset.activateHol);
        toast('success', 'Holiday activated', '');
        loadHolidays(c, officeList);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));
    el.querySelectorAll('[data-del-hol]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete this holiday?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.holidays.delete(b.dataset.delHol);
        toast('success', 'Holiday deleted', '');
        loadHolidays(c, officeList);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openHolidayModal(officeList, onSuccess) {
  const offCheckboxes = officeList.map(o => `
    <label class="checkbox-row"><input type="checkbox" class="hol-off-chk" value="${o.id}"/> ${escapeHtml(o.name)}</label>`).join('');
  const reschedTypes = `
    <option value="1">Same day</option>
    <option value="2" selected>Next repayment date</option>
    <option value="3">Next working day</option>`;

  const mid = 'hol-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>New Holiday</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Holiday name * <input id="hol-name" class="form-control" required/></label>
          <label>From date * <input type="date" id="hol-from" class="form-control" required/></label>
          <label>To date * <input type="date" id="hol-to" class="form-control" required/></label>
          <label>Repayment rescheduling <select id="hol-resched" class="form-control">${reschedTypes}</select></label>
        </div>
        <h4 class="mt-3">Apply to offices *</h4>
        <div style="max-height:200px;overflow:auto;border:1px solid var(--border);padding:8px;border-radius:4px">${offCheckboxes}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="hol-save">Create Holiday</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#hol-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#hol-name').value.trim();
    const fromDate = modalEl.querySelector('#hol-from').value;
    const toDate = modalEl.querySelector('#hol-to').value;
    const offices = [...modalEl.querySelectorAll('.hol-off-chk:checked')].map(ch => ({ officeId: parseInt(ch.value) }));
    const reschedulingType = parseInt(modalEl.querySelector('#hol-resched').value) || 2;
    if (!name || !fromDate || !toDate || !offices.length) {
      toast('warn', 'Fill all required fields and select at least one office', ''); return;
    }
    try {
      await api.holidays.create({
        name, fromDate, toDate, reschedulingType, offices,
        dateFormat: DATE_FORMAT, locale: LOCALE
      });
      modalEl.remove();
      toast('success', 'Holiday created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// WORKING DAYS (unchanged from original)
// ════════════════════════════════════════════════════════════
async function loadWorkingDays(c) {
  const el = c.querySelector('#og-4');
  try {
    const wd = await api.workingDays.get();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const currentDays = (wd?.recurrence || '').match(/BYDAY=([^;]+)/)?.[1]?.split(',') || ['MO', 'TU', 'WE', 'TH', 'FR'];
    const dayMap = { Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA', Sun: 'SU' };

    el.innerHTML = `
      <h3>Working Days Configuration</h3>
      <div style="display:flex; gap:12px; flex-wrap:wrap" class="mt-2 mb-3">
        ${days.map(d => `
          <label class="checkbox-row" style="border:1px solid var(--border); padding:8px 16px; border-radius:4px">
            <input type="checkbox" data-day="${d}" ${currentDays.includes(dayMap[d]) ? 'checked' : ''}/> ${d}
          </label>`).join('')}
      </div>
      ${can('UPDATE_WORKINGDAYS') ? `<button class="btn-primary" id="wd-save">Save Working Days</button>` : ''}`;

    el.querySelector('#wd-save')?.addEventListener('click', async (e) => {
      const selected = [...el.querySelectorAll('[data-day]:checked')].map(i => i.dataset.day);
      const recurrence = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${selected.map(d => dayMap[d]).join(',')}`;
      e.target.disabled = true;
      try {
        await api.workingDays.update({
          recurrence,
          repaymentRescheduleType: wd?.repaymentRescheduleType?.id || 1,
          extendTermDailyAppropriateInstallment: !!wd?.extendTermDailyAppropriateInstallment,
          extendTermForDailyRepayments: !!wd?.extendTermForDailyRepayments,
          locale: LOCALE
        });
        toast('success', 'Working days saved', selected.join(', '));
      } catch (err) { toast('error', 'Save failed', err.detail?.defaultUserMessage || err.message); }
      finally { e.target.disabled = false; }
    });
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

// ════════════════════════════════════════════════════════════
// CURRENCIES (now editable — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadCurrencies(c) {
  const el = c.querySelector('#og-5');
  try {
    const cur = await api.currencies.list();
    const list = Array.isArray(cur?.selectedCurrencyOptions) ? cur.selectedCurrencyOptions : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} currency${list.length !== 1 ? 'ies' : ''} configured</span>
        ${can('UPDATE_CURRENCY') ? `<button class="btn-primary" id="btn-edit-currencies"><i class="fa-solid fa-pen"></i> Edit Currencies</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Code</th><th>Name</th><th>Decimal Places</th></tr></thead>
          <tbody>${list.map(cu => `
            <tr>
              <td><b>${escapeHtml(cu.code)}</b></td>
              <td>${escapeHtml(cu.name)}</td>
              <td>${cu.decimalPlaces}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No currencies configured</div>'}`;

    el.querySelector('#btn-edit-currencies')?.addEventListener('click', () =>
      openCurrencyEditModal(() => loadCurrencies(c)));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openCurrencyEditModal(onSuccess) {
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

// ════════════════════════════════════════════════════════════
// PAYMENT TYPES (modal confirm + permission gating)
// ════════════════════════════════════════════════════════════
async function loadPaymentTypes(c) {
  const el = c.querySelector('#og-6');
  try {
    const pt = await api.paymentTypes.list();
    const list = Array.isArray(pt) ? pt : [];
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} payment type${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_PAYMENTTYPE') ? `<button class="btn-primary" id="btn-new-pt"><i class="fa-solid fa-plus"></i> Add Payment Type</button>` : ''}
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Description</th><th>Code</th><th>Is Cash</th><th>Position</th><th></th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td>${escapeHtml(p.name || '—')}</td>
            <td>${escapeHtml(p.description || '—')}</td>
            <td>${escapeHtml(p.codeName || '—')}</td>
            <td>${p.isCashPayment ? 'Yes' : 'No'}</td>
            <td>${p.position ?? '—'}</td>
            <td class="text-right">
              ${can('UPDATE_PAYMENTTYPE') ? `<button class="btn-mini" data-edit-pt="${p.id}" data-pt-name="${escapeHtml(p.name || '')}" data-pt-desc="${escapeHtml(p.description || '')}" data-pt-pos="${p.position || 0}" data-pt-cash="${p.isCashPayment ? 1 : 0}">Edit</button>` : ''}
              ${can('DELETE_PAYMENTTYPE') ? `<button class="btn-mini btn-danger" data-del-pt="${p.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-state-row">No payment types</td></tr>'}
        </tbody>
      </table>`;

    el.querySelector('#btn-new-pt')?.addEventListener('click', () => openPaymentTypeModal(null, () => loadPaymentTypes(c)));
    el.querySelectorAll('[data-edit-pt]').forEach(b => b.addEventListener('click', () =>
      openPaymentTypeModal({
        id: b.dataset.editPt,
        name: b.dataset.ptName,
        description: b.dataset.ptDesc,
        position: parseInt(b.dataset.ptPos) || 0,
        isCashPayment: b.dataset.ptCash === '1'
      }, () => loadPaymentTypes(c))));
    el.querySelectorAll('[data-del-pt]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete payment type?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.paymentTypes.delete(b.dataset.delPt);
        toast('success', 'Deleted', '');
        loadPaymentTypes(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

function openPaymentTypeModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'pt-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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

// ════════════════════════════════════════════════════════════
// STANDING INSTRUCTIONS (modal confirm + permission gating)
// ════════════════════════════════════════════════════════════
async function loadStandingInstructions(c) {
  const el = c.querySelector('#og-7');
  try {
    const res = await api.standingInstructions.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${list.length} instruction${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_STANDINGINSTRUCTION') ? `<button class="btn-primary" id="btn-new-si"><i class="fa-solid fa-plus"></i> New Instruction</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>From Account</th><th>To Account</th>
            <th class="text-right">Amount</th><th>Recurrence</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(si => `
            <tr>
              <td>${escapeHtml(si.name || '—')}</td>
              <td>${escapeHtml(si.fromAccount?.accountNo || si.fromAccountNumber || '—')}</td>
              <td>${escapeHtml(si.toAccount?.accountNo || si.toAccountNumber || '—')}</td>
              <td class="text-right">${fmt(si.amount || 0)}</td>
              <td>${escapeHtml(si.recurrenceType?.value || '—')}</td>
              <td>${sb(si.status?.value || 'Active')}</td>
              <td class="text-right">
                ${can('DELETE_STANDINGINSTRUCTION') ? `<button class="btn-mini btn-danger" data-del-si="${si.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No standing instructions</div>'}`;

    el.querySelector('#btn-new-si')?.addEventListener('click', () => openStandingInstructionModal(() => loadStandingInstructions(c)));
    el.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete standing instruction?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.standingInstructions.delete(b.dataset.delSi);
        toast('success', 'Deleted', '');
        loadStandingInstructions(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

async function openStandingInstructionModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.standingInstructions.template(); } catch {}
  const recurrenceTypes  = (tpl.recurrenceTypeOptions  || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Periodic</option><option value="2">Fixed</option>';
  const statusOptions    = (tpl.statusOptions          || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Active</option>';
  const instructionTypes = (tpl.instructionTypeOptions || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Fixed</option>';

  const mid = 'si-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>New Standing Instruction</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Instruction name * <input id="si-name" class="form-control" required/></label>
          <label>From savings account (account no) * <input id="si-from" class="form-control" required/></label>
          <label>To savings account (account no) * <input id="si-to" class="form-control" required/></label>
          <label>Amount * <input type="number" step="0.01" id="si-amount" class="form-control" required/></label>
          <label>Transfer type <select id="si-inst-type" class="form-control">${instructionTypes}</select></label>
          <label>Priority <input type="number" id="si-priority" class="form-control" value="1"/></label>
          <label>Recurrence type <select id="si-recurrence-type" class="form-control">${recurrenceTypes}</select></label>
          <label>Recurrence frequency <input type="number" id="si-recurrence-freq" class="form-control" value="1"/></label>
          <label>Recurrence interval
            <select id="si-recurrence-interval" class="form-control">
              <option value="0">Days</option><option value="1">Weeks</option>
              <option value="2">Months</option><option value="3" selected>Years</option>
            </select>
          </label>
          <label>Valid from * <input type="date" id="si-valid-from" class="form-control" required/></label>
          <label>Valid to <input type="date" id="si-valid-to" class="form-control"/></label>
          <label>Status <select id="si-status" class="form-control">${statusOptions}</select></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="si-save">Create</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#si-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#si-name').value.trim();
    const fromAccountNo = modalEl.querySelector('#si-from').value.trim();
    const toAccountNo   = modalEl.querySelector('#si-to').value.trim();
    const amount = parseFloat(modalEl.querySelector('#si-amount').value);
    const validFrom = modalEl.querySelector('#si-valid-from').value;
    if (!name || !fromAccountNo || !toAccountNo || isNaN(amount) || !validFrom) {
      toast('warn', 'Fill required fields', ''); return;
    }
    const validTo = modalEl.querySelector('#si-valid-to').value;
    const payload = {
      name, amount, locale: LOCALE, dateFormat: DATE_FORMAT,
      fromAccountNumber: fromAccountNo,
      toAccountNumber: toAccountNo,
      transferType:        parseInt(modalEl.querySelector('#si-inst-type').value) || 1,
      priority:            parseInt(modalEl.querySelector('#si-priority').value) || 1,
      instructionType:     parseInt(modalEl.querySelector('#si-inst-type').value) || 1,
      recurrenceType:      parseInt(modalEl.querySelector('#si-recurrence-type').value) || 1,
      recurrenceFrequency: parseInt(modalEl.querySelector('#si-recurrence-freq').value) || 1,
      recurrenceInterval:  parseInt(modalEl.querySelector('#si-recurrence-interval').value) || 3,
      validFrom,
      status:              parseInt(modalEl.querySelector('#si-status').value) || 1
    };
    if (validTo) payload.validTill = validTo;
    try {
      await api.standingInstructions.create(payload);
      modalEl.remove();
      toast('success', 'Standing instruction created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// FUNDS (NEW — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadFunds(c) {
  const el = c.querySelector('#og-8');
  try {
    const res = await api.funds.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Funds</h3>
          <span class="text-muted">${list.length} fund${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_FUND') ? `<button class="btn-primary" id="btn-new-fund"><i class="fa-solid fa-plus"></i> New Fund</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Funds let you tag loans with the source of capital (donor, line of credit, etc.) for reporting and compliance.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Name</th><th>External ID</th><th></th></tr></thead>
          <tbody>${list.map(f => `
            <tr>
              <td>${escapeHtml(f.name || '—')}</td>
              <td>${escapeHtml(f.externalId || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_FUND') ? `<button class="btn-mini" data-edit-fund="${f.id}" data-fund-name="${escapeHtml(f.name || '')}" data-fund-ext="${escapeHtml(f.externalId || '')}">Edit</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No funds defined</div>'}`;

    el.querySelector('#btn-new-fund')?.addEventListener('click', () => openFundModal(null, () => loadFunds(c)));
    el.querySelectorAll('[data-edit-fund]').forEach(b => b.addEventListener('click', () =>
      openFundModal({
        id: b.dataset.editFund,
        name: b.dataset.fundName,
        externalId: b.dataset.fundExt
      }, () => loadFunds(c))));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

function openFundModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'fund-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
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

// ════════════════════════════════════════════════════════════
// ADHOC QUERIES (NEW — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadAdhocQueries(c) {
  const el = c.querySelector('#og-9');
  try {
    const res = await api.adhocQueries.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Adhoc Queries</h3>
          <span class="text-muted">${list.length} quer${list.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div>
          ${list.length && can('EXECUTE_ADHOCQUERY') ? `<button class="btn-secondary mr-2" id="btn-run-all-adhoc"><i class="fa-solid fa-bolt"></i> Run All</button>` : ''}
          ${can('CREATE_ADHOCQUERY') ? `<button class="btn-primary" id="btn-new-adhoc"><i class="fa-solid fa-plus"></i> New Query</button>` : ''}
        </div>
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Adhoc queries are scheduled SQL queries that load results into a reporting datatable.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Source</th><th>Table</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(q => `
            <tr>
              <td><b>${escapeHtml(q.name || '—')}</b><div class="text-muted small">${escapeHtml((q.query || '').substring(0, 100))}…</div></td>
              <td>${escapeHtml(q.tableName || '—')}</td>
              <td>${escapeHtml(q.tableFields || '—')}</td>
              <td>${q.isActive ? sb('Active') : sb('Inactive')}</td>
              <td class="text-right">
                ${can('UPDATE_ADHOCQUERY') ? `<button class="btn-mini" data-edit-adhoc="${q.id}">Edit</button>` : ''}
                ${can('DELETE_ADHOCQUERY') ? `<button class="btn-mini btn-danger" data-del-adhoc="${q.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No adhoc queries defined</div>'}`;

    el.querySelector('#btn-new-adhoc')?.addEventListener('click', () => openAdhocQueryModal(null, () => loadAdhocQueries(c)));
    el.querySelector('#btn-run-all-adhoc')?.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Run all adhoc queries?', confirmText: 'Run All' })) return;
      try {
        await api.adhocQueries.runAll();
        toast('success', 'All adhoc queries queued', 'Check job history for status');
      } catch (e) { toast('error', 'Run failed', e.detail?.defaultUserMessage || e.message); }
    });
    el.querySelectorAll('[data-edit-adhoc]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.adhocQueries.get(b.dataset.editAdhoc);
        openAdhocQueryModal(existing, () => loadAdhocQueries(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));
    el.querySelectorAll('[data-del-adhoc]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete adhoc query?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.adhocQueries.delete(b.dataset.delAdhoc);
        toast('success', 'Deleted', '');
        loadAdhocQueries(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

function openAdhocQueryModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = 'adhoc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Adhoc Query</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">Query name * <input id="adhoc-name" class="form-control" value="${escapeHtml(existing?.name || '')}" required/></label>
          <label>Output table name * <input id="adhoc-table" class="form-control" value="${escapeHtml(existing?.tableName || '')}" required/></label>
          <label>Table fields (comma-separated) * <input id="adhoc-fields" class="form-control" value="${escapeHtml(existing?.tableFields || '')}" required/></label>
          <label>Email <input id="adhoc-email" class="form-control" value="${escapeHtml(existing?.email || '')}"/></label>
          <label>Report run frequency
            <select id="adhoc-freq" class="form-control">
              <option value="1" ${existing?.reportRunFrequency?.id === 1 ? 'selected' : ''}>Daily</option>
              <option value="2" ${existing?.reportRunFrequency?.id === 2 ? 'selected' : ''}>Weekly</option>
              <option value="3" ${existing?.reportRunFrequency?.id === 3 ? 'selected' : ''}>Monthly</option>
            </select>
          </label>
          <label>Run every N <input type="number" id="adhoc-every" class="form-control" value="${existing?.reportRunEvery ?? 1}" min="1"/></label>
          <label class="checkbox-row"><input type="checkbox" id="adhoc-active" ${existing?.isActive !== false ? 'checked' : ''}/> Active</label>
          <label class="full">SQL Query *
            <textarea id="adhoc-query" class="form-control" rows="8" required placeholder="SELECT ...">${escapeHtml(existing?.query || '')}</textarea>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="adhoc-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#adhoc-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#adhoc-name').value.trim();
    const tableName = modalEl.querySelector('#adhoc-table').value.trim();
    const tableFields = modalEl.querySelector('#adhoc-fields').value.trim();
    const query = modalEl.querySelector('#adhoc-query').value.trim();
    if (!name || !tableName || !tableFields || !query) { toast('warn', 'Fill required fields', ''); return; }

    const payload = {
      name, tableName, tableFields, query,
      reportRunFrequency: parseInt(modalEl.querySelector('#adhoc-freq').value) || 1,
      reportRunEvery: parseInt(modalEl.querySelector('#adhoc-every').value) || 1,
      isActive: modalEl.querySelector('#adhoc-active').checked
    };
    const email = modalEl.querySelector('#adhoc-email').value.trim();
    if (email) payload.email = email;

    try {
      if (isEdit) await api.adhocQueries.update(existing.id, payload);
      else        await api.adhocQueries.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Adhoc query updated' : 'Adhoc query created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// LOAN ORIGINATORS
// ════════════════════════════════════════════════════════════
async function loadLoanOriginators(c) {
  const el = c.querySelector('#og-10');
  try {
    const res = await api.loanOriginators.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Loan Originators</h3>
          <span class="text-muted">${list.length} originator${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_LOANORIGINATOR') ? `<button class="btn-primary" id="btn-new-orig"><i class="fa-solid fa-plus"></i> New Originator</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Originators identify the entity (broker, partner, or external lender) that underwrote each loan — used for securitization and reporting.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>External ID</th><th>Type</th><th>Active</th><th></th>
          </tr></thead>
          <tbody>${list.map(o => `
            <tr>
              <td><b>${escapeHtml(o.name || o.displayName || '—')}</b></td>
              <td>${escapeHtml(o.externalId || '—')}</td>
              <td>${escapeHtml(o.type?.value || o.originatorType || '—')}</td>
              <td>${o.active !== false ? sb('Active') : sb('Inactive')}</td>
              <td class="text-right">
                ${can('UPDATE_LOANORIGINATOR') ? `<button class="btn-mini" data-edit-orig="${o.id}">Edit</button>` : ''}
                ${can('DELETE_LOANORIGINATOR') ? `<button class="btn-mini btn-danger" data-del-orig="${o.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-handshake"></i>
          <h3>No loan originators defined</h3>
          ${can('CREATE_LOANORIGINATOR') ? `<div class="text-muted mt-2">Create your first originator using the button above.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-orig')?.addEventListener('click', () =>
      openLoanOriginatorModal(null, () => loadLoanOriginators(c)));

    el.querySelectorAll('[data-edit-orig]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.loanOriginators.get(b.dataset.editOrig);
        openLoanOriginatorModal(existing, () => loadLoanOriginators(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-orig]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete loan originator?',
        message: 'This will fail if any loans are linked to this originator.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.loanOriginators.delete(b.dataset.delOrig);
        toast('success', 'Originator deleted', '');
        loadLoanOriginators(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Loan originators not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

async function openLoanOriginatorModal(existing, onSuccess) {
  const isEdit = !!existing?.id;

  let tpl = {};
  try { tpl = await api.loanOriginators.template(); } catch {}

  const typeOptions = tpl.typeOptions || tpl.originatorTypeOptions || [
    { id: 1, name: 'Broker' },
    { id: 2, name: 'Partner' },
    { id: 3, name: 'External Lender' },
    { id: 4, name: 'Other' }
  ];

  const mid = 'orig-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Loan Originator</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Name *
            <input id="orig-name" class="form-control" value="${escapeHtml(existing?.name || existing?.displayName || '')}" required/>
          </label>
          <label>Originator Type *
            <select id="orig-type" class="form-control" required>
              <option value="">Select type…</option>
              ${typeOptions.map(t => {
                const selected = (existing?.type?.id === t.id || existing?.originatorTypeId === t.id) ? 'selected' : '';
                return `<option value="${t.id}" ${selected}>${escapeHtml(t.name || t.value)}</option>`;
              }).join('')}
            </select>
          </label>
          <label>External ID
            <input id="orig-extid" class="form-control" value="${escapeHtml(existing?.externalId || '')}"/>
          </label>
          <label>Email
            <input id="orig-email" type="email" class="form-control" value="${escapeHtml(existing?.email || '')}"/>
          </label>
          <label>Phone
            <input id="orig-phone" class="form-control" value="${escapeHtml(existing?.phone || existing?.mobileNumber || '')}"/>
          </label>
          <label>Commission rate (%)
            <input type="number" step="0.01" id="orig-commission" class="form-control" value="${existing?.commissionRate ?? ''}"/>
          </label>
          <label class="full">Description
            <textarea id="orig-desc" class="form-control" rows="2">${escapeHtml(existing?.description || '')}</textarea>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="orig-active" ${existing?.active !== false ? 'checked' : ''}/>
            Active
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="orig-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#orig-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#orig-name').value.trim();
    const typeId = parseInt(modalEl.querySelector('#orig-type').value);
    if (!name || !typeId) { toast('warn', 'Fill required fields', ''); return; }

    const payload = {};
    payload.name = name;
    payload.originatorTypeId = typeId;
    payload.active = modalEl.querySelector('#orig-active').checked;
    payload.locale = LOCALE;

    const ext = modalEl.querySelector('#orig-extid').value.trim();
    if (ext) payload.externalId = ext;
    const email = modalEl.querySelector('#orig-email').value.trim();
    if (email) payload.email = email;
    const phone = modalEl.querySelector('#orig-phone').value.trim();
    if (phone) payload.phone = phone;
    const commission = parseFloat(modalEl.querySelector('#orig-commission').value);
    if (isFinite(commission)) payload.commissionRate = commission;
    const desc = modalEl.querySelector('#orig-desc').value.trim();
    if (desc) payload.description = desc;

    try {
      if (isEdit) await api.loanOriginators.update(existing.id, payload);
      else        await api.loanOriginators.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Originator updated' : 'Originator created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

// ════════════════════════════════════════════════════════════
// EXTERNAL ASSET OWNERS (NEW — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadExternalAssetOwners(c) {
  const el = c.querySelector('#og-11');
  try {
    const res = await api.externalAssetOwners.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>External Asset Owners (Investors)</h3>
          <span class="text-muted">${list.length} owner${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_EXTERNAL_ASSET_OWNER') ? `<button class="btn-primary" id="btn-new-eao"><i class="fa-solid fa-plus"></i> New Owner</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        External Asset Owners are investors who can purchase securitized loan portfolios. Per-loan transfers and buy-backs are managed from each loan's detail page.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>External ID</th><th>Type</th><th>Active Transfers</th><th></th>
          </tr></thead>
          <tbody>${list.map(o => `
            <tr>
              <td><b>${escapeHtml(o.name || o.displayName || '—')}</b></td>
              <td>${escapeHtml(o.externalId || '—')}</td>
              <td>${escapeHtml(o.type?.value || o.ownerType || '—')}</td>
              <td>${num(o.activeTransfers || 0)}</td>
              <td class="text-right">
                ${can('UPDATE_EXTERNAL_ASSET_OWNER') ? `<button class="btn-mini" data-edit-eao="${o.id || o.externalId}">Edit</button>` : ''}
                ${can('DELETE_EXTERNAL_ASSET_OWNER') ? `<button class="btn-mini btn-danger" data-del-eao="${o.id || o.externalId}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="text-muted small mt-2">
          <i class="fa-solid fa-circle-info"></i>
          To view loan transfers per owner, open the <b>External Asset Owners</b> tab on any individual loan.
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-building-columns"></i>
          <h3>No external asset owners defined</h3>
          ${can('CREATE_EXTERNAL_ASSET_OWNER') ? `<div class="text-muted mt-2">Create your first owner to enable loan securitization.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-eao')?.addEventListener('click', () =>
      openExternalAssetOwnerModal(null, () => loadExternalAssetOwners(c)));

    el.querySelectorAll('[data-edit-eao]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.externalAssetOwners.get(b.dataset.editEao);
        openExternalAssetOwnerModal(existing, () => loadExternalAssetOwners(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-eao]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete external asset owner?',
        message: 'This will fail if any active loan transfers reference this owner.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.externalAssetOwners.delete(b.dataset.delEao);
        toast('success', 'Owner deleted', '');
        loadExternalAssetOwners(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">External Asset Owners not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

async function openExternalAssetOwnerModal(existing, onSuccess) {
  const isEdit = !!(existing?.id || existing?.externalId);
  const ownerKey = existing?.id || existing?.externalId;

  const typeOptions = [
    { id: 'INVESTOR',             name: 'Investor' },
    { id: 'BANK',                 name: 'Bank' },
    { id: 'SECURITIZATION_TRUST', name: 'Securitization Trust' },
    { id: 'OTHER',                name: 'Other' }
  ];

  const mid = 'eao-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} External Asset Owner</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Owner Name *
            <input id="eao-name" class="form-control" value="${escapeHtml(existing?.name || existing?.displayName || '')}" required/>
          </label>
          <label>External ID ${isEdit ? '' : '*'}
            <input id="eao-extid" class="form-control" value="${escapeHtml(existing?.externalId || '')}" ${isEdit ? 'disabled' : 'required'}/>
          </label>
          <label>Owner Type
            <select id="eao-type" class="form-control">
              ${typeOptions.map(t => {
                const selected = (existing?.type?.value === t.id || existing?.ownerType === t.id) ? 'selected' : '';
                return `<option value="${t.id}" ${selected}>${escapeHtml(t.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label>Contact email
            <input id="eao-email" type="email" class="form-control" value="${escapeHtml(existing?.email || '')}"/>
          </label>
          <label>Contact phone
            <input id="eao-phone" class="form-control" value="${escapeHtml(existing?.phone || '')}"/>
          </label>
          <label class="full">Description
            <textarea id="eao-desc" class="form-control" rows="2">${escapeHtml(existing?.description || '')}</textarea>
          </label>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          External ID is the immutable identifier used for all transfer/buy-back operations.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="eao-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#eao-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#eao-name').value.trim();
    const externalId = modalEl.querySelector('#eao-extid').value.trim();
    if (!name) { toast('warn', 'Enter owner name', ''); return; }
    if (!isEdit && !externalId) { toast('warn', 'Enter external ID', ''); return; }

    const payload = {};
    payload.name = name;
    payload.ownerType = modalEl.querySelector('#eao-type').value;
    payload.locale = LOCALE;
    if (!isEdit) payload.externalId = externalId;
    const email = modalEl.querySelector('#eao-email').value.trim();
    if (email) payload.email = email;
    const phone = modalEl.querySelector('#eao-phone').value.trim();
    if (phone) payload.phone = phone;
    const desc = modalEl.querySelector('#eao-desc').value.trim();
    if (desc) payload.description = desc;

    try {
      if (isEdit) await api.externalAssetOwners.update(ownerKey, payload);
      else        await api.externalAssetOwners.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Owner updated' : 'Owner created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

// ════════════════════════════════════════════════════════════
// ENTITY DATATABLE CHECKS (NEW — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadEntityDatatableChecks(c) {
  const el = c.querySelector('#og-12');
  try {
    const res = await api.entityDatatableChecks.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Entity Datatable Checks</h3>
          <span class="text-muted">${list.length} check${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_ENTITY_DATATABLE_CHECK') ? `<button class="btn-primary" id="btn-new-edc"><i class="fa-solid fa-plus"></i> New Check</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Datatable checks enforce that mandatory datatables (e.g. KYC, employment details) are populated before a workflow stage (Submit, Approve, Disburse, Activate) can proceed.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Entity</th><th>Datatable</th><th>Status</th><th>Product</th><th></th>
          </tr></thead>
          <tbody>${list.map(chk => `
            <tr>
              <td>${escapeHtml(chk.entity || '—')}</td>
              <td><b>${escapeHtml(chk.datatableName || '—')}</b></td>
              <td>${escapeHtml(chk.status?.value || chk.status || '—')}</td>
              <td>${escapeHtml(chk.productName || chk.productId || 'All')}</td>
              <td class="text-right">
                ${can('DELETE_ENTITY_DATATABLE_CHECK') ? `<button class="btn-mini btn-danger" data-del-edc="${chk.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-check"></i>
          <h3>No datatable checks configured</h3>
          ${can('CREATE_ENTITY_DATATABLE_CHECK') ? `<div class="text-muted mt-2">Configure checks to enforce data quality before workflow transitions.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-edc')?.addEventListener('click', () =>
      openEntityDatatableCheckModal(() => loadEntityDatatableChecks(c)));

    el.querySelectorAll('[data-del-edc]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete datatable check?',
        message: 'Workflow transitions for the affected entity will no longer require this datatable.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.entityDatatableChecks.delete(b.dataset.delEdc);
        toast('success', 'Check deleted', '');
        loadEntityDatatableChecks(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Entity datatable checks not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

async function openEntityDatatableCheckModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.entityDatatableChecks.template(); } catch {}

  const entityOptions = tpl.entities || [
    { id: 'm_client',          name: 'Client' },
    { id: 'm_group',           name: 'Group' },
    { id: 'm_loan',            name: 'Loan' },
    { id: 'm_savings_account', name: 'Savings Account' }
  ];

  const statusOptions = tpl.statusClient || tpl.statusOptions || [
    { id: 100, name: 'Pending Submission' },
    { id: 200, name: 'Pending Activation' },
    { id: 300, name: 'Pending Approval' },
    { id: 400, name: 'Pending Disbursal' }
  ];

  const datatables = tpl.datatables || [];
  const products = tpl.products || tpl.loanProducts || [];

  const mid = 'edc-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>New Entity Datatable Check</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Entity *
            <select id="edc-entity" class="form-control" required>
              <option value="">Select entity…</option>
              ${entityOptions.map(e => `<option value="${e.id || e.name}">${escapeHtml(e.name)}</option>`).join('')}
            </select>
          </label>
          <label>Status (workflow stage) *
            <select id="edc-status" class="form-control" required>
              <option value="">Select stage…</option>
              ${statusOptions.map(s => `<option value="${s.id}">${escapeHtml(s.name || s.value)}</option>`).join('')}
            </select>
          </label>
          <label>Datatable *
            <select id="edc-datatable" class="form-control" required>
              <option value="">Select datatable…</option>
              ${datatables.map(dt => `<option value="${dt.registeredTableName || dt.name}">${escapeHtml(dt.registeredTableName || dt.name)}</option>`).join('')}
            </select>
          </label>
          <label>Product (optional — leave blank for all)
            <select id="edc-product" class="form-control">
              <option value="">All products</option>
              ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="msg-banner b-warning mt-2">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Once active, the selected workflow stage will block until the datatable is populated for the entity.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="edc-save">Create Check</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#edc-save').addEventListener('click', async () => {
    const entity = modalEl.querySelector('#edc-entity').value;
    const status = parseInt(modalEl.querySelector('#edc-status').value);
    const datatableName = modalEl.querySelector('#edc-datatable').value;
    const productId = modalEl.querySelector('#edc-product').value;

    if (!entity || !status || !datatableName) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {};
    payload.entity = entity;
    payload.status = status;
    payload.datatableName = datatableName;
    if (productId) payload.productId = parseInt(productId);

    try {
      await api.entityDatatableChecks.create(payload);
      modalEl.remove();
      toast('success', 'Check created', datatableName);
      onSuccess();
    } catch (e) {
      toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

// ════════════════════════════════════════════════════════════
// BULK IMPORTS (NEW — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadBulkImports(c) {
  const el = c.querySelector('#og-13');
  try {
    // Try the canonical /imports endpoint first; fall back to a static set if not supported
    let entityTypes = [];
    try {
      const types = await api.bulkImports.types();
      entityTypes = Array.isArray(types) ? types : (types?.entityTypes || []);
    } catch {
      // Fallback to documented Fineract import entities
      entityTypes = [
        { entity: 'clients',                      label: 'Clients' },
        { entity: 'centers',                      label: 'Centers' },
        { entity: 'groups',                       label: 'Groups' },
        { entity: 'staff',                        label: 'Staff' },
        { entity: 'offices',                      label: 'Offices' },
        { entity: 'loans',                        label: 'Loans' },
        { entity: 'loanrepayments',               label: 'Loan Repayments' },
        { entity: 'savingsaccounts',              label: 'Savings Accounts' },
        { entity: 'savingstransactions',          label: 'Savings Transactions' },
        { entity: 'fixeddepositaccounts',         label: 'Fixed Deposit Accounts' },
        { entity: 'recurringdepositaccounts',     label: 'Recurring Deposit Accounts' },
        { entity: 'chartofaccounts',              label: 'Chart of Accounts' },
        { entity: 'journalentries',               label: 'Journal Entries' },
        { entity: 'shareaccounts',                label: 'Share Accounts' }
      ];
    }

    // Fetch import history (may not exist on all Fineract versions)
    let history = [];
    try {
      const r = await api.bulkImports.list({ limit: 50 });
      history = Array.isArray(r) ? r : (r?.pageItems || []);
    } catch {}

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Bulk Imports</h3>
          <span class="text-muted">${history.length} import${history.length !== 1 ? 's' : ''} in history</span>
        </div>
      </div>

      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Download an Excel template, fill it offline, then upload to create records in bulk. Status updates after the server processes the file.
      </div>

      <div class="card-inset mb-3" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4>New Import</h4>
        <div class="form-grid">
          <label>Entity type *
            <select id="imp-entity" class="form-control" required>
              <option value="">Select entity to import…</option>
              ${entityTypes.map(t => `<option value="${t.entity || t.entityType || t}">${escapeHtml(t.label || t.entityType || t.entity || t)}</option>`).join('')}
            </select>
          </label>
          <label>Office (filter for some imports)
            <select id="imp-office" class="form-control"><option value="">All offices</option></select>
          </label>
        </div>
        <div class="mt-3" style="display:flex; gap:8px; flex-wrap:wrap">
          ${can('READ_DOCUMENT') ? `<button class="btn-secondary" id="btn-imp-download"><i class="fa-solid fa-download"></i> Download Template</button>` : ''}
          ${can('CREATE_DOCUMENT') ? `<button class="btn-primary" id="btn-imp-upload"><i class="fa-solid fa-upload"></i> Upload Filled Template</button>` : ''}
        </div>
        <input type="file" id="imp-file" accept=".xlsx,.xls" hidden/>
      </div>

      <h4 class="mt-3">Import History</h4>
      ${history.length ? `
        <table class="table">
          <thead><tr>
            <th>Created</th><th>Entity</th><th>Status</th>
            <th class="text-right">Total Rows</th>
            <th class="text-right">Successful</th>
            <th class="text-right">Failed</th>
            <th></th>
          </tr></thead>
          <tbody>${history.map(h => `
            <tr>
              <td>${fmtDate(h.createdDate || h.importTime) || '—'}</td>
              <td>${escapeHtml(h.entity || h.entityType || '—')}</td>
              <td>${sb(h.completed ? 'Completed' : h.status || 'Processing')}</td>
              <td class="text-right">${num(h.totalRecords || h.total || 0)}</td>
              <td class="text-right text-success">${num(h.successfulRecords || h.successCount || 0)}</td>
              <td class="text-right text-error">${num(h.failedRecords || h.failureCount || 0)}</td>
              <td class="text-right">
                ${h.id ? `<button class="btn-mini" data-imp-download="${h.id}">Download Output</button>` : ''}
                ${h.id && can('DELETE_DOCUMENT') ? `<button class="btn-mini btn-danger" data-imp-del="${h.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No imports in history yet. Upload a template above to start.</div>'}`;

    // Populate office filter
    api.offices.list().then(offices => {
      const sel = el.querySelector('#imp-office');
      (Array.isArray(offices) ? offices : []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id; opt.textContent = o.name;
        sel.appendChild(opt);
      });
    }).catch(() => {});

    // Download template
    el.querySelector('#btn-imp-download')?.addEventListener('click', async () => {
      const entity = el.querySelector('#imp-entity').value;
      if (!entity) { toast('warn', 'Select an entity first', ''); return; }
      try {
        const res = await api.bulkImports.template(entity);
        // Fineract returns either a redirect URL or a binary blob depending on version
        if (typeof res === 'string' && res.startsWith('http')) {
          window.open(res, '_blank');
        } else if (res?.url) {
          window.open(res.url, '_blank');
        } else {
          // Treat as blob fallback
          const blob = new Blob([res], { type: 'application/vnd.ms-excel' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${entity}_import_template.xlsx`;
          a.click();
        }
        toast('success', 'Template downloaded', entity);
      } catch (e) { toast('error', 'Template download failed', e.detail?.defaultUserMessage || e.message); }
    });

    // Upload filled template
    el.querySelector('#btn-imp-upload')?.addEventListener('click', () => {
      const entity = el.querySelector('#imp-entity').value;
      if (!entity) { toast('warn', 'Select an entity first', ''); return; }
      el.querySelector('#imp-file').click();
    });

    el.querySelector('#imp-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const entity = el.querySelector('#imp-entity').value;
      const officeId = el.querySelector('#imp-office').value;

      const fd = new FormData();
      fd.append('file', file);
      fd.append('locale', LOCALE);
      fd.append('dateFormat', DATE_FORMAT);
      if (officeId) fd.append('officeId', officeId);

      try {
        toast('info', 'Uploading…', file.name);
        await api.bulkImports.upload(entity, fd);
        toast('success', 'Import queued', `${entity} · ${file.name}`);
        // Refresh history after a short delay so the server has time to register the import
        setTimeout(() => loadBulkImports(c), 2000);
      } catch (e) { toast('error', 'Upload failed', e.detail?.defaultUserMessage || e.message); }
      finally { ev.target.value = ''; }
    });

    // Download output (results) of a past import
    el.querySelectorAll('[data-imp-download]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api.bulkImports.download(b.dataset.impDownload);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        a.download = /filename="?([^";]+)"?/.exec(cd)?.[1] || `import_${b.dataset.impDownload}_output.xlsx`;
        a.click();
        toast('success', 'Output downloaded', '');
      } catch (e) { toast('error', 'Download failed', e.detail?.defaultUserMessage || e.message); }
    }));

    // Delete a past import record
    el.querySelectorAll('[data-imp-del]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete import record?',
        message: 'Imported records remain — only the audit log entry is removed.',
        danger: true, confirmText: 'Delete'
      })) return;
      try {
        await api.bulkImports.delete(b.dataset.impDel);
        toast('success', 'Import record deleted', '');
        loadBulkImports(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// SMS CAMPAIGNS (moved from System — audit gap closed)
// ════════════════════════════════════════════════════════════
async function loadSmsCampaigns(c) {
  const el = c.querySelector('#og-14');
  try {
    const res = await api.smsCampaigns.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>SMS Campaigns</h3>
          <span class="text-muted">${list.length} campaign${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_SMSCAMPAIGN') ? `<button class="btn-primary" id="btn-new-sms"><i class="fa-solid fa-plus"></i> New Campaign</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Configure SMS or email notifications triggered by Fineract events (loan disbursal, repayment due, etc.).
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Campaign Name</th><th>Type</th>
            <th>Trigger</th><th>Recipient</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(cmp => `
            <tr>
              <td><b>${escapeHtml(cmp.campaignName || cmp.name || '—')}</b></td>
              <td>${escapeHtml(cmp.campaignType?.value || cmp.campaignType || '—')}</td>
              <td>${escapeHtml(cmp.triggerType?.value || cmp.triggerType || '—')}</td>
              <td>${escapeHtml(cmp.recipientType?.value || cmp.recipientType || '—')}</td>
              <td>${sb(cmp.campaignStatus?.value || (cmp.isActive ? 'Active' : 'Inactive'))}</td>
              <td class="text-right">
                ${cmp.campaignStatus?.value !== 'Active' && can('ACTIVATE_SMSCAMPAIGN') ? `<button class="btn-mini btn-success" data-act-sms="${cmp.id}">Activate</button>` : ''}
                ${cmp.campaignStatus?.value === 'Active' && can('CLOSE_SMSCAMPAIGN') ? `<button class="btn-mini btn-warning" data-close-sms="${cmp.id}">Close</button>` : ''}
                ${can('UPDATE_SMSCAMPAIGN') ? `<button class="btn-mini" data-edit-sms="${cmp.id}">Edit</button>` : ''}
                ${can('DELETE_SMSCAMPAIGN') ? `<button class="btn-mini btn-danger" data-del-sms="${cmp.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-comment-sms"></i>
          <h3>No SMS campaigns defined</h3>
          ${can('CREATE_SMSCAMPAIGN') ? `<div class="text-muted mt-2">Create your first campaign to send automated SMS or email notifications.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-sms')?.addEventListener('click', () =>
      openSmsCampaignModal(null, () => loadSmsCampaigns(c)));

    el.querySelectorAll('[data-edit-sms]').forEach(b => b.addEventListener('click', async () => {
      try {
        const existing = await api.smsCampaigns.get(b.dataset.editSms);
        openSmsCampaignModal(existing, () => loadSmsCampaigns(c));
      } catch (e) { toast('error', 'Could not load', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-act-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Activate campaign?', message: 'Notifications will start sending immediately.', confirmText: 'Activate' })) return;
      try {
        await api.smsCampaigns.activate(b.dataset.actSms);
        toast('success', 'Campaign activated', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-close-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Close campaign?', message: 'No further notifications will be sent.', danger: true, confirmText: 'Close' })) return;
      try {
        await api.smsCampaigns.close(b.dataset.closeSms);
        toast('success', 'Campaign closed', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Close failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-sms]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete campaign?', message: 'This permanently removes the campaign and its history.', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.smsCampaigns.delete(b.dataset.delSms);
        toast('success', 'Campaign deleted', '');
        loadSmsCampaigns(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">SMS campaigns not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

async function openSmsCampaignModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  let tpl = {};
  try { tpl = await api.smsCampaigns.template(); } catch {}

  const campaignTypes = tpl.campaignTypeOptions || [
    { id: 1, value: 'Direct' },
    { id: 2, value: 'Schedule' },
    { id: 3, value: 'Triggered' }
  ];
  const triggerTypes = tpl.triggerTypeOptions || [
    { id: 1, value: 'Direct' },
    { id: 2, value: 'Schedule' },
    { id: 3, value: 'Triggered' }
  ];
  const recipientTypes = tpl.businessRuleOptions || tpl.recipientOptions || [];
  const providers = tpl.providerOptions || [{ id: 1, value: 'Default SMS' }];

  const mid = 'sms-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} SMS Campaign</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">Campaign name * <input id="sms-name" class="form-control" value="${escapeHtml(existing?.campaignName || existing?.name || '')}" required/></label>
          <label>Campaign type *
            <select id="sms-camp-type" class="form-control" required>
              <option value="">Select type…</option>
              ${campaignTypes.map(t => `<option value="${t.id}" ${existing?.campaignType?.id === t.id ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </label>
          <label>Trigger type *
            <select id="sms-trig-type" class="form-control" required>
              <option value="">Select trigger…</option>
              ${triggerTypes.map(t => `<option value="${t.id}" ${existing?.triggerType?.id === t.id ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </label>
          <label>Recipient business rule
            <select id="sms-recip" class="form-control">
              <option value="">— Select —</option>
              ${recipientTypes.map(r => `<option value="${r.reportId || r.id}" ${existing?.businessRuleId === (r.reportId || r.id) ? 'selected' : ''}>${escapeHtml(r.reportName || r.value || r.name)}</option>`).join('')}
            </select>
          </label>
          <label>SMS provider
            <select id="sms-provider" class="form-control">
              ${providers.map(p => `<option value="${p.id}" ${existing?.providerId === p.id ? 'selected' : ''}>${escapeHtml(p.value || p.name)}</option>`).join('')}
            </select>
          </label>
          <label>Recurrence (cron-style)
            <input id="sms-recurrence" class="form-control" placeholder="e.g. 0 9 * * 1" value="${escapeHtml(existing?.recurrence || '')}"/>
          </label>
          <label class="full">Message template *
            <textarea id="sms-message" class="form-control" rows="4" required placeholder="Hi {{client.displayName}}, your loan #{{loan.accountNo}} payment of {{loan.dueAmount}} is due on {{loan.dueDate}}.">${escapeHtml(existing?.message || existing?.smsMessage || '')}</textarea>
          </label>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Use <code>{{entity.field}}</code> placeholders for dynamic content (e.g. <code>{{client.displayName}}</code>, <code>{{loan.accountNo}}</code>).
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="sms-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#sms-save').addEventListener('click', async () => {
    const campaignName = modalEl.querySelector('#sms-name').value.trim();
    const campaignType = parseInt(modalEl.querySelector('#sms-camp-type').value);
    const triggerType = parseInt(modalEl.querySelector('#sms-trig-type').value);
    const message = modalEl.querySelector('#sms-message').value.trim();

    if (!campaignName || !campaignType || !triggerType || !message) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {
      campaignName, campaignType, triggerType,
      message,
      locale: LOCALE, dateFormat: DATE_FORMAT
    };
    const recipId = parseInt(modalEl.querySelector('#sms-recip').value);
    if (recipId) payload.businessRuleId = recipId;
    const providerId = parseInt(modalEl.querySelector('#sms-provider').value);
    if (providerId) payload.providerId = providerId;
    const recurrence = modalEl.querySelector('#sms-recurrence').value.trim();
    if (recurrence) payload.recurrence = recurrence;

    try {
      if (isEdit) await api.smsCampaigns.update(existing.id, payload);
      else        await api.smsCampaigns.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Campaign updated' : 'Campaign created', campaignName);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}