/* FinCraft · pages/organization/loaders/calendar.js — holidays and working days tab loaders.
   Auto-split (2nd pass) from pages/organization/loaders.js for maintainability. */

import { LOCALE } from '../../../config.js';
import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, fmtDate, sb } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openHolidayModal } from '../actions.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadHolidays(c, officeList) {
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
      } catch (e) { toast('error', 'Activation failed', extractFineractError(e)); }
    }));
    el.querySelectorAll('[data-del-hol]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete this holiday?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.holidays.delete(b.dataset.delHol);
        toast('success', 'Holiday deleted', '');
        loadHolidays(c, officeList);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadWorkingDays(c) {
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
      } catch (err) { toast('error', 'Save failed', extractFineractError(err)); }
      finally { e.target.disabled = false; }
    });
  } catch (e) { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
