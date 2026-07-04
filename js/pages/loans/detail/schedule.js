/* FinCraft · pages/loans/detail/schedule.js — repayment schedule + original schedule tab loaders.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { renderScheduleTable } from '../actions.js';

export async function loadSchedule(c, id) {
  const wrap = c.querySelector('#ln-schedule');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const r = await api.loans.schedule(id);
    renderScheduleTable(wrap, r.repaymentSchedule);
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

export async function loadOriginalSchedule(c, id) {
  const wrap = c.querySelector('#ln-original-schedule');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const r = await api.loans.originalSchedule(id);
    const sched = r.originalSchedule || r.repaymentSchedule;
    if (!sched) {
      wrap.innerHTML = '<div class="empty-state-row">No original schedule recorded (loan has not been modified)</div>';
      return;
    }
    renderScheduleTable(wrap, sched, true);
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}
