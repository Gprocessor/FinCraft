/* FinCraft · organization.js — Live API */
import { api } from '../api.js';
import { sb, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

const TABS = ['Offices','Staff','Tellers','Holidays','Working Days','Currencies','Payment Types'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Organization</h1><div class="page-subtitle">Offices, staff, holidays & operational config</div></div>
    </div>
    <div class="card">
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="og-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div id="og-${i}" class="tab-panel ${i === 0 ? 'active' : ''}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`).join('')}
    </div>
  </div>`;

  // Offices — fetched once and reused for the Holidays tab too (avoid hardcoding officeId)
  let officeList = [];
  try {
    const offices = await api.offices.list();
    officeList = Array.isArray(offices) ? offices : [];
    c.querySelector('#og-0').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${officeList.length} offices</span>
        <button class="btn-primary" data-org-new="office"><i class="fa-solid fa-plus"></i> New Office</button></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Parent</th><th>Hierarchy</th><th>Opened</th></tr></thead>
        <tbody>${officeList.map(o => `<tr>
          <td>${escapeHtml(o.name)}</td>
          <td>${escapeHtml(o.parentName || '—')}</td>
          <td class="mono">${escapeHtml(o.hierarchy || '.')}</td>
          <td>${fmtDate(o.openingDate)}</td></tr>`).join('')}</tbody>
      </table></div>`;
  } catch (e) { c.querySelector('#og-0').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div><button class="btn-primary mt-4" data-org-new="office"><i class="fa-solid fa-plus"></i> New Office</button></div>`; }

  // Staff
  try {
    const staff = await api.staff.list();
    const list = Array.isArray(staff) ? staff : (staff?.pageItems || []);
    c.querySelector('#og-1').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${list.length} staff</span>
        <button class="btn-primary" data-org-new="staff"><i class="fa-solid fa-plus"></i> New Staff</button></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th>Office</th><th>Loan Officer?</th><th>Active</th></tr></thead>
        <tbody>${list.map(s => `<tr>
          <td>${escapeHtml(s.displayName)}</td>
          <td>${escapeHtml(s.officeName || '—')}</td>
          <td>${s.isLoanOfficer ? '<span class="badge b-success">Yes</span>' : '<span class="badge">No</span>'}</td>
          <td>${sb(s.isActive ? 'Active' : 'Closed')}</td></tr>`).join('')}</tbody>
      </table></div>`;
  } catch (e) { c.querySelector('#og-1').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Tellers + Cashiers
  try {
    const tellers = await api.tellers.list();
    const list = Array.isArray(tellers) ? tellers : [];
    c.querySelector('#og-2').innerHTML = list.length
      ? `<div class="flex justify-between mb-4"><span class="text-muted">${list.length} teller(s)</span>
          <button class="btn-primary" data-org-new="teller"><i class="fa-solid fa-plus"></i> New Teller</button></div>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th>Office</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
            <tbody id="tellers-body">${list.map(t => `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                <td>${escapeHtml(t.officeName || '—')}</td>
                <td>${fmtDate(t.startDate)}</td>
                <td>${fmtDate(t.endDate)}</td>
                <td>${sb(t.status || 'Active')}</td>
                <td><button class="btn-ghost btn-sm" data-teller-cashiers="${t.id}" data-teller-name="${escapeHtml(t.name)}" title="View cashiers"><i class="fa-solid fa-user-tie"></i></button></td>
              </tr>
              <tr id="cashier-row-${t.id}" class="cashier-row" style="display:none">
                <td colspan="6" style="background:var(--bg-elev,#131929);padding:12px 16px">
                  <div id="cashier-body-${t.id}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading cashiers…</div></div></div>
                </td>
              </tr>`).join('')}
            </tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-cash-register"></i><div>No tellers configured</div><button class="btn-primary mt-4" data-org-new="teller"><i class="fa-solid fa-plus"></i> New Teller</button></div>';

    c.querySelectorAll('[data-teller-cashiers]').forEach(b => {
      b.addEventListener('click', async () => {
        const tid = b.dataset.tellerCashiers;
        const row = c.querySelector(`#cashier-row-${tid}`);
        const body = c.querySelector(`#cashier-body-${tid}`);
        if (row.style.display !== 'none') { row.style.display = 'none'; return; }
        row.style.display = '';
        try {
          const cashiers = await api.tellers.cashiers(tid);
          const clist = Array.isArray(cashiers) ? cashiers : (cashiers?.cashiers || []);
          body.innerHTML = clist.length
            ? `<b style="font-size:12px">Cashiers for ${escapeHtml(b.dataset.tellerName)}</b>
               <div class="tbl-wrap" style="margin-top:8px"><table class="tbl">
                 <thead><tr><th>Name</th><th>Start</th><th>End</th><th>Type</th></tr></thead>
                 <tbody>${clist.map(cx => `<tr>
                   <td>${escapeHtml(cx.staffName || cx.name || '—')}</td>
                   <td>${fmtDate(cx.startDate)}</td>
                   <td>${fmtDate(cx.endDate)}</td>
                   <td>${escapeHtml(cx.type || '—')}</td>
                 </tr>`).join('')}</tbody></table></div>`
            : `<span class="text-muted">No cashiers assigned to ${escapeHtml(b.dataset.tellerName)}</span>`;
        } catch (e) { body.innerHTML = `<span class="text-muted">${escapeHtml(e.message)}</span>`; }
      });
    });
  } catch (e) { c.querySelector('#og-2').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Holidays — Fineract scopes holidays by office; use the actual head office
  // (hierarchy === ".") rather than assuming officeId 1 exists
  try {
    const headOffice = officeList.find(o => o.hierarchy === '.') || officeList[0];
    const holidays = headOffice ? await api.holidays.list({ officeId: headOffice.id }) : [];
    const list = Array.isArray(holidays) ? holidays : [];
    c.querySelector('#og-3').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${list.length} holidays${headOffice ? ` · ${escapeHtml(headOffice.name)}` : ''}</span><button class="btn-primary" data-org-new="holiday"><i class="fa-solid fa-plus"></i> New Holiday</button></div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>From</th><th>To</th><th>Status</th></tr></thead>
            <tbody>${list.map(h => `<tr><td>${escapeHtml(h.name)}</td><td>${fmtDate(h.fromDate)}</td><td>${fmtDate(h.toDate)}</td><td>${sb(h.status?.value || 'Active')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><div>No holidays configured</div></div>'}`;
  } catch (e) { c.querySelector('#og-3').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Working days
  try {
    const wd = await api.workingDays.get();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    c.querySelector('#og-4').innerHTML = `
      <div class="form-grid">
        <div class="full"><h3 class="card-title mb-4">Working Days Configuration</h3></div>
        ${days.map((d, i) => `<label class="flex items-center gap-2"><input type="checkbox" ${(wd?.recurrence || '').includes(d) ? 'checked' : ''} data-day="${d}" /> ${d}</label>`).join('')}
        <div class="full"><button class="btn-primary" id="wd-save"><i class="fa-solid fa-save"></i> Save Working Days</button></div>
      </div>`;
    c.querySelector('#wd-save')?.addEventListener('click', async (e) => {
      const selected = Array.from(c.querySelectorAll('#og-4 [data-day]:checked')).map(el => el.dataset.day);
      const dayMap = { Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA', Sun:'SU' };
      const recurrence = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${selected.map(d => dayMap[d]).join(',')}`;
      e.target.closest('button').disabled = true;
      try {
        await api.workingDays.update({
          recurrence,
          repaymentRescheduleType: wd?.repaymentRescheduleType?.id || 1,
          extendTermDailyAppropriateInstallment: !!wd?.extendTermDailyAppropriateInstallment,
          extendTermForDailyRepayments: !!wd?.extendTermForDailyRepayments,
          locale: 'en'
        });
        toast('success', 'Working days saved', selected.join(', '));
      } catch (err) {
        toast('error', 'Save failed', err.message || String(err));
      } finally { e.target.closest('button').disabled = false; }
    });
  } catch (e) { c.querySelector('#og-4').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Currencies
  try {
    const cur = await api.currencies.list();
    const list = Array.isArray(cur?.selectedCurrencyOptions) ? cur.selectedCurrencyOptions : [];
    c.querySelector('#og-5').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Decimal Places</th></tr></thead>
          <tbody>${list.map(cu => `<tr><td class="mono">${escapeHtml(cu.code)}</td><td>${escapeHtml(cu.name)}</td><td>${cu.decimalPlaces}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-coins"></i><div>No currencies configured</div></div>';
  } catch (e) { c.querySelector('#og-5').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  // Payment Types
  try {
    const pt = await api.paymentTypes.list();
    const list = Array.isArray(pt) ? pt : [];
    c.querySelector('#og-6').innerHTML = list.length
      ? `<div class="flex justify-between mb-4"><span class="text-muted">${list.length} payment types</span><button class="btn-primary" data-modal="newPaymentTypeModal"><i class="fa-solid fa-plus"></i> Add Payment Type</button></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Description</th><th>Code</th><th>Is Cash</th></tr></thead>
          <tbody>${list.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.description || '—')}</td><td class="mono">${escapeHtml(p.codeName || '—')}</td><td>${p.isCashPayment ? '<span class="badge b-success">Yes</span>' : '<span class="badge">No</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-credit-card"></i><div>No payment types</div><button class="btn-primary mt-4" data-modal="newPaymentTypeModal"><i class="fa-solid fa-plus"></i> Add Payment Type</button></div>';
  } catch (e) { c.querySelector('#og-6').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`; }

  c.querySelectorAll('[data-org-new]').forEach(b => b.addEventListener('click', () => {
    const labels = { office: 'New Office', staff: 'New Staff', teller: 'New Teller', holiday: 'New Holiday' };
    toast('info', 'Builder not built yet', `${labels[b.dataset.orgNew] || 'This'} form needs its own dedicated build — planned, same as the other larger forms flagged in Products/Standing Instructions.`);
  }));
}
