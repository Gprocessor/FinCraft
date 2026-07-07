/* FinCraft · pages/groups/detail/meetings-charges.js — meetings, charges, and standing instructions tab loaders.
   Auto-split from the original monolithic pages/groups/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openAttendanceModal, openScheduleMeetingModal } from '../actions.js';
import { can } from '../shared.js';

export async function loadMeetings(c, id) {
  const calWrap = c.querySelector('#grp-meeting-cal');
  const listWrap = c.querySelector('#grp-meeting-list');
  calWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  listWrap.innerHTML = '<div class="empty-state-row">Loading…</div>';

  try {
    const cals = await api.calendars.list('groups', id, { calendarType: 'collection' });
    const calList = Array.isArray(cals) ? cals : [];
    const activeCal = calList[0];

    calWrap.innerHTML = activeCal ? `
      <div class="calendar-summary">
        <div><b>Title:</b> ${escapeHtml(activeCal.title || '—')}</div>
        <div><b>Starts:</b> ${fmtDate(activeCal.startDate) || '—'}</div>
        <div><b>Frequency:</b> ${escapeHtml(activeCal.repeatingDescription || activeCal.frequency?.value || '—')}</div>
        <div class="mt-2">
          ${can('UPDATE_CALENDAR') ? `<button class="btn-secondary btn-sm" data-edit-cal="${activeCal.id}">Edit Schedule</button>` : ''}
          ${can('DELETE_CALENDAR') ? `<button class="btn-danger btn-sm" data-del-cal="${activeCal.id}">Delete Schedule</button>` : ''}
        </div>
      </div>` : '<div class="empty-state-row">No meeting schedule set</div>';

    calWrap.querySelector('[data-del-cal]')?.addEventListener('click', async (e) => {
      if (!await confirm({ title: 'Delete meeting schedule?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.calendars.delete('groups', id, e.target.dataset.delCal);
        toast('success', 'Schedule deleted', '');
        loadMeetings(c, id);
      } catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
    });
    calWrap.querySelector('[data-edit-cal]')?.addEventListener('click', () =>
      openScheduleMeetingModal(id, () => loadMeetings(c, id), activeCal));

    // Meeting instances
    if (activeCal) {
      const ms = await api.meetings.list('groups', id, { calendarId: activeCal.id });
      const list = Array.isArray(ms) ? ms : [];
      listWrap.innerHTML = list.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th>Present</th><th>Absent</th><th>Notes</th><th></th></tr></thead>
          <tbody>${list.map(m => `
            <tr>
              <td>${fmtDate(m.meetingDate) || '—'}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'PRESENT').length || 0}</td>
              <td>${m.clientsAttendance?.filter(a => a.attendanceType?.value === 'ABSENT').length || 0}</td>
              <td>${escapeHtml(m.transactionId || '—')}</td>
              <td class="text-right">
                ${can('SAVEORUPDATEATTENDANCE_MEETING') ? `<button class="btn-mini" data-att="${m.id}">Attendance</button>` : ''}
                ${can('DELETE_MEETING') ? `<button class="btn-mini btn-danger" data-del-meet="${m.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No meeting instances</div>';

      listWrap.querySelectorAll('[data-att]').forEach(b => b.addEventListener('click', () =>
        openAttendanceModal(id, b.dataset.att, () => loadMeetings(c, id))));
      listWrap.querySelectorAll('[data-del-meet]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirm({ title: 'Delete meeting?', danger: true, confirmText: 'Delete' })) return;
        try { await api.meetings.delete('groups', id, b.dataset.delMeet); toast('success', 'Deleted', ''); loadMeetings(c, id); }
        catch (er) { toast('error', 'Delete failed', er.detail?.defaultUserMessage || er.message); }
      }));
    } else {
      listWrap.innerHTML = '<div class="empty-state-row">Schedule meetings to see instances</div>';
    }
  } catch (e) { calWrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; listWrap.innerHTML = ''; }
}

export async function loadCharges(c, id) {
  const wrap = c.querySelector('#grp-charges-list');
  // NOTE: Fineract's GroupsApiResource has no /charges sub-path at all (only
  // template, {groupId}, command/unassign_staff, accounts, downloadtemplate,
  // uploadtemplate, glimaccounts, gsimaccounts). Unlike clients, there is no
  // GroupChargesApiResource. This tab always 404'd — show a clear notice
  // instead of a silently-broken table.
  wrap.innerHTML = `
    <div class="msg-banner b-warning">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Fineract has no group-level charges API. If you need charges tied to a group,
      apply them to the individual member clients instead (Client Charges), which is
      fully supported.
    </div>`;
}

export async function loadStandingInstructions(c, id, group) {
  const wrap = c.querySelector('#grp-si-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    // Fineract doesn't support groupId on /standinginstructions; show all instructions for member clients.
    const memberIds = (group.clientMembers || []).map(m => m.id);
    if (!memberIds.length) { wrap.innerHTML = '<div class="empty-state-row">Group has no members</div>'; return; }

    // Pull all; client-side filter.
    const res = await api.standingInstructions.list({ limit: 500 });
    const all = Array.isArray(res) ? res : (res?.pageItems || []);
    const list = all.filter(si => memberIds.includes(si.fromClient?.id));

    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>Client</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromClient?.displayName || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${sb(si.status?.value || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions for group members</div>';
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
