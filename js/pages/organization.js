import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · organization.js — Full org (Phase 6) */
import { api } from '../api.js';
import { fmt, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal } from '../ui.js';

const TABS = ['Offices','Staff','Tellers & Cashiers','Holidays','Working Days','Currencies','Payment Types','Standing Instructions'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Organization</h1><div class="page-subtitle">Offices, staff, holidays & operational config</div></div>
    </div>
    <div class="card">
      <div class="tabs" style="flex-wrap:wrap">${TABS.map((t,i)=>
        `<button class="tab${i===0?' active':''}" data-tab="og-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((_,i)=>
        `<div id="og-${i}" class="tab-panel${i===0?' active':''}">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
        </div>`).join('')}
    </div>
  </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
  }));

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
// OFFICES
// ════════════════════════════════════════════════════════════
function loadOffices(c, officeList) {
  const el = c.querySelector('#og-0');
  el.innerHTML = `
    <div class="flex justify-between mb-4">
      <span class="text-muted">${officeList.length} office${officeList.length!==1?'s':''}</span>
      <button class="btn-primary btn-sm" id="btn-new-office"><i class="fa-solid fa-plus"></i> New Office</button>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Parent</th><th>Hierarchy</th><th>Opened</th></tr></thead>
      <tbody>${officeList.map(o=>`<tr>
        <td>${escapeHtml(o.name)}</td>
        <td>${escapeHtml(o.parentName||'—')}</td>
        <td class="mono">${escapeHtml(o.hierarchy||'.')}</td>
        <td>${fmtDate(o.openingDate)||'—'}</td>
      </tr>`).join('')||'<tr><td colspan="4" class="text-center text-muted" style="padding:16px">No offices</td></tr>'}
      </tbody>
    </table></div>`;
  el.querySelector('#btn-new-office').addEventListener('click', () => openModal('newOfficeModal'));
}

// ════════════════════════════════════════════════════════════
// STAFF
// ════════════════════════════════════════════════════════════
async function loadStaff(c) {
  const el = c.querySelector('#og-1');
  try {
    const res  = await api.staff.list();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} staff</span>
        <button class="btn-primary btn-sm" id="btn-new-staff"><i class="fa-solid fa-plus"></i> New Staff</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Office</th><th>Loan Officer?</th><th>Active</th></tr></thead>
        <tbody>${list.map(s=>`<tr>
          <td>${escapeHtml(s.displayName||'—')}</td>
          <td>${escapeHtml(s.officeName||'—')}</td>
          <td>${s.isLoanOfficer?'<span class="badge b-success">Yes</span>':'<span class="badge">No</span>'}</td>
          <td>${sb(s.isActive?'Active':'Closed')}</td>
        </tr>`).join('')||'<tr><td colspan="4" class="text-center text-muted" style="padding:16px">No staff</td></tr>'}
        </tbody>
      </table></div>`;
    el.querySelector('#btn-new-staff').addEventListener('click', () => openModal('newStaffModal'));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TELLERS & CASHIERS (P6-1 — allocate/settle)
// ════════════════════════════════════════════════════════════
async function loadTellers(c) {
  const el = c.querySelector('#og-2');
  try {
    const tellers = await api.tellers.list();
    const list    = Array.isArray(tellers) ? tellers : [];
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-cash-register"></i><div>No tellers configured</div>
        <button class="btn-primary mt-4" id="btn-new-teller"><i class="fa-solid fa-plus"></i> New Teller</button></div>`;
      el.querySelector('#btn-new-teller').addEventListener('click', () => openModal('newTellerModal'));
      return;
    }
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} teller${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-teller"><i class="fa-solid fa-plus"></i> New Teller</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Office</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(t=>`
          <tr>
            <td>${escapeHtml(t.name||'—')}</td>
            <td>${escapeHtml(t.officeName||'—')}</td>
            <td>${fmtDate(t.startDate)||'—'}</td>
            <td>${fmtDate(t.endDate)||'—'}</td>
            <td>${sb(t.status||'Active')}</td>
            <td>
              <button class="btn-ghost btn-sm" data-teller-cashiers="${t.id}" data-teller-name="${escapeHtml(t.name||'')}" title="View cashiers"><i class="fa-solid fa-users"></i></button>
              <button class="btn-ghost btn-sm" data-teller-allocate="${t.id}" title="Allocate cash"><i class="fa-solid fa-plus-circle"></i></button>
            </td>
          </tr>
          <tr id="cashier-row-${t.id}" style="display:none">
            <td colspan="6" style="background:var(--color-background-secondary);padding:12px 16px">
              <div id="cashier-body-${t.id}"></div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    el.querySelector('#btn-new-teller').addEventListener('click', () => openModal('newTellerModal'));

    el.querySelectorAll('[data-teller-cashiers]').forEach(b => b.addEventListener('click', async () => {
      const tid  = b.dataset.tellerCashiers;
      const row  = c.querySelector(`#cashier-row-${tid}`);
      const body = c.querySelector(`#cashier-body-${tid}`);
      if (row.style.display !== 'none') { row.style.display = 'none'; return; }
      row.style.display = '';
      body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading cashiers…</div></div>';
      try {
        const cashiers = await api.tellers.cashiers(tid);
        const clist    = Array.isArray(cashiers) ? cashiers : (cashiers?.cashiers || []);
        body.innerHTML = `
          <div class="flex justify-between mb-2">
            <b style="font-size:12px">Cashiers — ${escapeHtml(b.dataset.tellerName)}</b>
            <button class="btn-ghost btn-sm" data-alloc-teller="${tid}"><i class="fa-solid fa-plus"></i> Allocate</button>
          </div>
          ${clist.length
            ? `<div class="tbl-wrap"><table class="tbl">
                <thead><tr><th>Staff</th><th>Start</th><th>End</th><th>Type</th><th></th></tr></thead>
                <tbody>${clist.map(cx=>`<tr>
                  <td>${escapeHtml(cx.staffName||cx.name||'—')}</td>
                  <td>${fmtDate(cx.startDate)||'—'}</td>
                  <td>${fmtDate(cx.endDate)||'—'}</td>
                  <td>${escapeHtml(cx.type||'—')}</td>
                  <td>
                    <button class="btn-ghost btn-sm" data-settle-teller="${tid}" data-settle-cashier="${cx.id}" title="Settle cash"><i class="fa-solid fa-handshake"></i> Settle</button>
                  </td>
                </tr>`).join('')}</tbody>
              </table></div>`
            : `<span class="text-muted" style="font-size:13px">No cashiers assigned</span>`}`;

        body.querySelector(`[data-alloc-teller]`)?.addEventListener('click', () =>
          openAllocateCashierModal(tid, b.dataset.tellerName, () => { row.style.display='none'; loadTellers(c); }));

        body.querySelectorAll('[data-settle-teller]').forEach(sb2 => sb2.addEventListener('click', () =>
          openSettleCashierModal(sb2.dataset.settleTeller, sb2.dataset.settleCashier, () => { row.style.display='none'; loadTellers(c); })));
      } catch (e) { body.innerHTML = `<span class="text-muted">${escapeHtml(e.message)}</span>`; }
    }));

    el.querySelectorAll('[data-teller-allocate]').forEach(b => b.addEventListener('click', () =>
      openAllocateCashierModal(b.dataset.tellerAllocate, '', () => loadTellers(c))));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAllocateCashierModal(tellerId, tellerName, onSuccess) {
  let staffList = [];
  try { const r = await api.staff.list(); staffList = Array.isArray(r) ? r : (r?.pageItems || []); } catch {}
  const mid = `alloc-${Date.now()}`;
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3 class="modal-title">Allocate Cash — ${escapeHtml(tellerName||'Teller')}</h3>
        <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full"><span class="form-label">Cashier (staff) *</span>
            <select id="alloc-staff" class="form-control" required>
              <option value="">Select staff…</option>
              ${staffList.map(s=>`<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
            </select></label>
          <label><span class="form-label">Start date *</span>
            <input type="date" id="alloc-start" class="form-control" value="${today()}" required/></label>
          <label><span class="form-label">End date</span>
            <input type="date" id="alloc-end" class="form-control"/></label>
          <label class="full"><span class="form-label">Cash limit</span>
            <input type="number" id="alloc-limit" min="0" step="0.01" class="form-control" placeholder="Optional cash limit"/></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-close-modal>Cancel</button>
        <button class="btn-primary" id="alloc-confirm"><i class="fa-solid fa-check"></i> Allocate</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#alloc-confirm').addEventListener('click', async () => {
    const staffId   = parseInt(modalEl.querySelector('#alloc-start')?.closest('.modal-body')?.querySelector('#alloc-staff')?.value||modalEl.querySelector('#alloc-staff')?.value);
    const startDate = modalEl.querySelector('#alloc-start').value;
    const endDate   = modalEl.querySelector('#alloc-end').value;
    const cashLimit = parseFloat(modalEl.querySelector('#alloc-limit').value);
    if (!staffId || !startDate) { toast('warn','Fill required fields',''); return; }
    try {
      await api.tellers.allocateCashier(tellerId, {
        staffId, startDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(endDate && { endDate }),
        ...(cashLimit && { cashLimit, cashLimitCurrency: 'USD' })
      });
      modalEl.remove(); toast('success','Cashier allocated',''); onSuccess();
    } catch (e) { toast('error','Allocation failed',e.message); }
  });
}

async function openSettleCashierModal(tellerId, cashierId, onSuccess) {
  const mid = `settle-${Date.now()}`;
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3 class="modal-title">Settle Cash</h3>
        <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full"><span class="form-label">Settlement date *</span>
            <input type="date" id="settle-date" class="form-control" value="${today()}" required/></label>
          <label class="full"><span class="form-label">Amount *</span>
            <input type="number" id="settle-amount" min="0.01" step="0.01" class="form-control" required placeholder="0.00"/></label>
          <label class="full"><span class="form-label">Note</span>
            <textarea id="settle-note" class="form-control" rows="2" placeholder="Optional settlement note"></textarea></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-close-modal>Cancel</button>
        <button class="btn-primary" id="settle-confirm"><i class="fa-solid fa-handshake"></i> Settle</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#settle-confirm').addEventListener('click', async () => {
    const txnDate = modalEl.querySelector('#settle-date').value;
    const amount  = parseFloat(modalEl.querySelector('#settle-amount').value);
    const note    = modalEl.querySelector('#settle-note').value.trim();
    if (!txnDate || isNaN(amount)) { toast('warn','Fill required fields',''); return; }
    try {
      await api.tellers.settleCashier(tellerId, cashierId, {
        txnDate, amount, dateFormat: DATE_FORMAT, locale: LOCALE,
        ...(note && { comments: note })
      });
      modalEl.remove(); toast('success','Cash settled',fmt(amount)); onSuccess();
    } catch (e) { toast('error','Settlement failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// HOLIDAYS (P6-2 — multi-office association)
// ════════════════════════════════════════════════════════════
async function loadHolidays(c, officeList) {
  const el         = c.querySelector('#og-3');
  const headOffice = officeList.find(o=>o.hierarchy==='.')||officeList[0];
  try {
    const holidays = headOffice ? await api.holidays.list({ officeId: headOffice.id }) : [];
    const list     = Array.isArray(holidays) ? holidays : [];
    const offOpts  = officeList.map(o=>`<option value="${o.id}"${o.id===headOffice?.id?' selected':''}>${escapeHtml(o.name)}</option>`).join('');
    el.innerHTML = `
      <div class="flex justify-between mb-4 items-center flex-wrap gap-2">
        <span class="text-muted">${list.length} holiday${list.length!==1?'s':''} · filter by office:</span>
        <div class="flex gap-2 items-center">
          <select class="form-control" id="hol-office" style="width:200px">${offOpts}</select>
          <button class="btn-primary btn-sm" id="btn-new-hol"><i class="fa-solid fa-plus"></i> New Holiday</button>
        </div>
      </div>
      <div id="hol-list">
        ${list.length
          ? `<div class="tbl-wrap"><table class="tbl">
              <thead><tr><th>Name</th><th>From</th><th>To</th><th>Rescheduling</th><th>Status</th><th></th></tr></thead>
              <tbody>${list.map(h=>`<tr>
                <td>${escapeHtml(h.name||'—')}</td>
                <td>${fmtDate(h.fromDate)||'—'}</td>
                <td>${fmtDate(h.toDate)||'—'}</td>
                <td>${escapeHtml(h.reschedulingType?.value||'—')}</td>
                <td>${sb(h.status?.value||'Active')}</td>
                <td>
                  ${h.status?.value!=='Active' ? `<button class="btn-ghost btn-sm" data-activate-hol="${h.id}" title="Activate"><i class="fa-solid fa-check"></i></button>` : ''}
                  <button class="btn-ghost btn-sm" data-del-hol="${h.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}</tbody>
            </table></div>`
          : '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><div>No holidays for this office</div></div>'}
      </div>`;

    el.querySelector('#hol-office').addEventListener('change', async (e) => {
      const offId = parseInt(e.target.value);
      const hols  = await api.holidays.list({ officeId: offId }).catch(()=>[]);
      const h2    = Array.isArray(hols) ? hols : [];
      el.querySelector('#hol-list').innerHTML = h2.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>From</th><th>To</th><th>Status</th></tr></thead>
            <tbody>${h2.map(h=>`<tr><td>${escapeHtml(h.name)}</td><td>${fmtDate(h.fromDate)}</td><td>${fmtDate(h.toDate)}</td><td>${sb(h.status?.value||'')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><div>No holidays</div></div>';
    });

    el.querySelector('#btn-new-hol').addEventListener('click', () => openHolidayModal(officeList, () => loadHolidays(c, officeList)));

    el.querySelectorAll('[data-activate-hol]').forEach(b => b.addEventListener('click', async () => {
      try { await api.holidays.activate(b.dataset.activateHol); toast('success','Holiday activated',''); loadHolidays(c, officeList); }
      catch (e) { toast('error','Activation failed',e.message); }
    }));
    el.querySelectorAll('[data-del-hol]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this holiday?')) return;
      try { await api.holidays.delete(b.dataset.delHol); toast('success','Holiday deleted',''); loadHolidays(c, officeList); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openHolidayModal(officeList, onSuccess) {
  const offCheckboxes = officeList.map(o=>
    `<label class="flex items-center gap-2"><input type="checkbox" class="hol-off-chk" value="${o.id}" ${o.hierarchy==='.'?'checked':''}/> ${escapeHtml(o.name)}</label>`
  ).join('');
  const reschedTypes = `<option value="1">Same day</option><option value="2">Next repayment date</option><option value="3">Next working day</option>`;

  const mid = `hol-${Date.now()}`;
  const modalEl = document.createElement('div');
  modalEl.id = mid; modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal lg">
      <div class="modal-head"><h3 class="modal-title">New Holiday</h3>
        <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full"><span class="form-label">Holiday name *</span><input id="hol-name" class="form-control" required/></label>
          <label><span class="form-label">From date *</span><input type="date" id="hol-from" class="form-control" required/></label>
          <label><span class="form-label">To date *</span><input type="date" id="hol-to" class="form-control" required/></label>
          <label class="full"><span class="form-label">Repayment rescheduling</span>
            <select id="hol-resched" class="form-control">${reschedTypes}</select></label>
          <div class="full">
            <span class="form-label">Apply to offices *</span>
            <div class="flex flex-wrap gap-2 mt-1">${offCheckboxes}</div>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-close-modal>Cancel</button>
        <button class="btn-primary" id="hol-save"><i class="fa-solid fa-check"></i> Create Holiday</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#hol-save').addEventListener('click', async () => {
    const name     = modalEl.querySelector('#hol-name').value.trim();
    const fromDate = modalEl.querySelector('#hol-from').value;
    const toDate   = modalEl.querySelector('#hol-to').value;
    const offices  = [...modalEl.querySelectorAll('.hol-off-chk:checked')].map(ch=>({ officeId: parseInt(ch.value) }));
    const reschedulingType = parseInt(modalEl.querySelector('#hol-resched').value)||2;
    if (!name || !fromDate || !toDate || !offices.length) { toast('warn','Fill all required fields and select at least one office',''); return; }
    try {
      await api.holidays.create({ name, fromDate, toDate, reschedulingType, offices, dateFormat: DATE_FORMAT, locale: LOCALE });
      modalEl.remove(); toast('success','Holiday created',name); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// WORKING DAYS
// ════════════════════════════════════════════════════════════
async function loadWorkingDays(c) {
  const el = c.querySelector('#og-4');
  try {
    const wd   = await api.workingDays.get();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    el.innerHTML = `
      <div class="form-grid">
        <div class="full"><h3 class="card-title mb-4">Working Days Configuration</h3></div>
        ${days.map(d=>`<label class="flex items-center gap-2"><input type="checkbox" ${(wd?.recurrence||'').includes(d)?'checked':''} data-day="${d}"/> ${d}</label>`).join('')}
        <div class="full"><button class="btn-primary btn-sm" id="wd-save"><i class="fa-solid fa-save"></i> Save Working Days</button></div>
      </div>`;
    el.querySelector('#wd-save').addEventListener('click', async (e) => {
      const selected = [...el.querySelectorAll('[data-day]:checked')].map(i=>i.dataset.day);
      const dayMap   = { Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA', Sun:'SU' };
      const recurrence = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${selected.map(d=>dayMap[d]).join(',')}`;
      e.target.disabled = true;
      try {
        await api.workingDays.update({ recurrence, repaymentRescheduleType: wd?.repaymentRescheduleType?.id||1,
          extendTermDailyAppropriateInstallment: !!wd?.extendTermDailyAppropriateInstallment,
          extendTermForDailyRepayments: !!wd?.extendTermForDailyRepayments, locale: LOCALE });
        toast('success','Working days saved',selected.join(', '));
      } catch (err) { toast('error','Save failed',err.message); }
      finally { e.target.disabled = false; }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// CURRENCIES
// ════════════════════════════════════════════════════════════
async function loadCurrencies(c) {
  const el = c.querySelector('#og-5');
  try {
    const cur  = await api.currencies.list();
    const list = Array.isArray(cur?.selectedCurrencyOptions) ? cur.selectedCurrencyOptions : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Decimal Places</th></tr></thead>
          <tbody>${list.map(cu=>`<tr><td class="mono">${escapeHtml(cu.code)}</td><td>${escapeHtml(cu.name)}</td><td>${cu.decimalPlaces}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-coins"></i><div>No currencies configured</div></div>';
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// PAYMENT TYPES (P6-3 — full CRUD)
// ════════════════════════════════════════════════════════════
async function loadPaymentTypes(c) {
  const el = c.querySelector('#og-6');
  try {
    const pt   = await api.paymentTypes.list();
    const list = Array.isArray(pt) ? pt : [];
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} payment type${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-pt"><i class="fa-solid fa-plus"></i> Add Payment Type</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Description</th><th>Code</th><th>Is Cash</th><th>Position</th><th></th></tr></thead>
        <tbody>${list.map(p=>`<tr>
          <td>${escapeHtml(p.name||'—')}</td>
          <td>${escapeHtml(p.description||'—')}</td>
          <td class="mono">${escapeHtml(p.codeName||'—')}</td>
          <td>${p.isCashPayment?'<span class="badge b-success">Yes</span>':'<span class="badge">No</span>'}</td>
          <td>${p.position??'—'}</td>
          <td>
            <button class="btn-ghost btn-sm" data-edit-pt="${p.id}" data-pt-name="${escapeHtml(p.name)}" data-pt-desc="${escapeHtml(p.description||'')}" data-pt-pos="${p.position||0}" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-ghost btn-sm" data-del-pt="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`).join('')||'<tr><td colspan="6" class="text-center text-muted" style="padding:16px">No payment types</td></tr>'}
        </tbody>
      </table></div>`;

    el.querySelector('#btn-new-pt').addEventListener('click', () => openPaymentTypeModal(null, () => loadPaymentTypes(c)));
    el.querySelectorAll('[data-edit-pt]').forEach(b => b.addEventListener('click', () =>
      openPaymentTypeModal({ id: b.dataset.editPt, name: b.dataset.ptName, description: b.dataset.ptDesc, position: parseInt(b.dataset.ptPos)||0 }, () => loadPaymentTypes(c))));
    el.querySelectorAll('[data-del-pt]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this payment type?')) return;
      try { await api.paymentTypes.delete(b.dataset.delPt); toast('success','Deleted',''); loadPaymentTypes(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function openPaymentTypeModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  const mid = `pt-${Date.now()}`;
  const modalEl = document.createElement('div');
  modalEl.id = mid; modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3 class="modal-title">${isEdit?'Edit':'New'} Payment Type</h3>
        <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full"><span class="form-label">Name *</span>
            <input id="pt-name" class="form-control" required value="${escapeHtml(existing?.name||'')}"/></label>
          <label class="full"><span class="form-label">Description</span>
            <input id="pt-desc" class="form-control" value="${escapeHtml(existing?.description||'')}"/></label>
          <label><span class="form-label">Position</span>
            <input type="number" id="pt-pos" min="0" class="form-control" value="${existing?.position??0}"/></label>
          <label class="flex items-center gap-2" style="align-items:center">
            <input type="checkbox" id="pt-cash" ${existing?.isCashPayment?'checked':''}/> <span>Is cash payment</span></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-close-modal>Cancel</button>
        <button class="btn-primary" id="pt-save"><i class="fa-solid fa-check"></i> ${isEdit?'Update':'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#pt-save').addEventListener('click', async () => {
    const name     = modalEl.querySelector('#pt-name').value.trim();
    const description = modalEl.querySelector('#pt-desc').value.trim();
    const position = parseInt(modalEl.querySelector('#pt-pos').value)||0;
    const isCashPayment = modalEl.querySelector('#pt-cash').checked;
    if (!name) { toast('warn','Enter a name',''); return; }
    try {
      if (isEdit) await api.paymentTypes.update(existing.id, { name, description, position, isCashPayment });
      else        await api.paymentTypes.create({ name, description, position, isCashPayment });
      modalEl.remove(); toast('success',isEdit?'Payment type updated':'Payment type created',name); onSuccess();
    } catch (e) { toast('error','Save failed',e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// STANDING INSTRUCTIONS (P6-4 — new tab)
// ════════════════════════════════════════════════════════════
async function loadStandingInstructions(c) {
  const el = c.querySelector('#og-7');
  try {
    const res  = await api.standingInstructions.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} instruction${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-si"><i class="fa-solid fa-plus"></i> New Instruction</button>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th>From Account</th><th>To Account</th><th>Amount</th><th>Recurrence</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.map(si=>`<tr>
              <td>${escapeHtml(si.name||'—')}</td>
              <td class="mono">${escapeHtml(si.fromAccount?.accountNo||si.fromAccountNumber||'—')}</td>
              <td class="mono">${escapeHtml(si.toAccount?.accountNo||si.toAccountNumber||'—')}</td>
              <td class="mono">${fmt(si.amount||0)}</td>
              <td>${escapeHtml(si.recurrenceType?.value||'—')}</td>
              <td>${sb(si.status?.value||'Active')}</td>
              <td><button class="btn-ghost btn-sm" data-del-si="${si.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-repeat"></i><div>No standing instructions</div></div>'}`;

    el.querySelector('#btn-new-si').addEventListener('click', () => openStandingInstructionModal(() => loadStandingInstructions(c)));
    el.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this standing instruction?')) return;
      try { await api.standingInstructions.delete(b.dataset.delSi); toast('success','Deleted',''); loadStandingInstructions(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openStandingInstructionModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.standingInstructions.template(); } catch {}
  const recurrenceTypes  = (tpl.recurrenceTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Periodic</option><option value="2">Fixed</option>';
  const statusOptions    = (tpl.statusOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Active</option>';
  const instructionTypes = (tpl.instructionTypeOptions||[]).map(o=>`<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Fixed</option>';

  const mid = `si-${Date.now()}`;
  const modalEl = document.createElement('div');
  modalEl.id = mid; modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = `
    <div class="modal lg">
      <div class="modal-head"><h3 class="modal-title">New Standing Instruction</h3>
        <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full"><span class="form-label">Instruction name *</span>
            <input id="si-name" class="form-control" required/></label>
          <label class="full"><span class="form-label">From savings account (account no) *</span>
            <input id="si-from" class="form-control" required placeholder="e.g. 000000001"/></label>
          <label class="full"><span class="form-label">To savings account (account no) *</span>
            <input id="si-to" class="form-control" required placeholder="e.g. 000000002"/></label>
          <label><span class="form-label">Amount *</span>
            <input type="number" id="si-amount" min="0.01" step="0.01" class="form-control" required placeholder="0.00"/></label>
          <label><span class="form-label">Transfer type</span>
            <select id="si-inst-type" class="form-control">${instructionTypes}</select></label>
          <label><span class="form-label">Priority</span>
            <input type="number" id="si-priority" min="1" value="1" class="form-control"/></label>
          <label><span class="form-label">Recurrence type</span>
            <select id="si-recurrence-type" class="form-control">${recurrenceTypes}</select></label>
          <label><span class="form-label">Recurrence frequency</span>
            <input type="number" id="si-recurrence-freq" min="1" value="1" class="form-control"/></label>
          <label><span class="form-label">Recurrence interval</span>
            <select id="si-recurrence-interval" class="form-control">
              <option value="1">Days</option><option value="2">Weeks</option><option value="3" selected>Months</option><option value="4">Years</option>
            </select></label>
          <label><span class="form-label">Valid from *</span>
            <input type="date" id="si-valid-from" class="form-control" value="${today()}" required/></label>
          <label><span class="form-label">Valid to</span>
            <input type="date" id="si-valid-to" class="form-control"/></label>
          <label class="full"><span class="form-label">Status</span>
            <select id="si-status" class="form-control">${statusOptions}</select></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-close-modal>Cancel</button>
        <button class="btn-primary" id="si-save"><i class="fa-solid fa-check"></i> Create</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#si-save').addEventListener('click', async () => {
    const name          = modalEl.querySelector('#si-name').value.trim();
    const fromAccountNo = modalEl.querySelector('#si-from').value.trim();
    const toAccountNo   = modalEl.querySelector('#si-to').value.trim();
    const amount        = parseFloat(modalEl.querySelector('#si-amount').value);
    const validFrom     = modalEl.querySelector('#si-valid-from').value;
    if (!name || !fromAccountNo || !toAccountNo || isNaN(amount) || !validFrom) { toast('warn','Fill required fields',''); return; }
    const validTo = modalEl.querySelector('#si-valid-to').value;
    try {
      await api.standingInstructions.create({
        name, amount, locale: LOCALE, dateFormat: DATE_FORMAT,
        fromAccountNumber: fromAccountNo,
        toAccountNumber: toAccountNo,
        transferType: parseInt(modalEl.querySelector('#si-inst-type').value)||1,
        priority: parseInt(modalEl.querySelector('#si-priority').value)||1,
        instructionType: parseInt(modalEl.querySelector('#si-inst-type').value)||1,
        recurrenceType: parseInt(modalEl.querySelector('#si-recurrence-type').value)||1,
        recurrenceFrequency: parseInt(modalEl.querySelector('#si-recurrence-freq').value)||1,
        recurrenceInterval: parseInt(modalEl.querySelector('#si-recurrence-interval').value)||3,
        validFrom,
        ...(validTo && { validTill: validTo }),
        status: parseInt(modalEl.querySelector('#si-status').value)||1
      });
      modalEl.remove(); toast('success','Standing instruction created',name); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}
