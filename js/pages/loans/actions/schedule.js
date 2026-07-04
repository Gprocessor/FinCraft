/* FinCraft · pages/loans/actions/schedule.js — shared schedule-table renderer used by the schedule tab loaders.
   Auto-split (2nd pass) from pages/loans/actions.js for maintainability. */

import { fmt, fmtDate, sb } from '../../../utils.js';

export function renderScheduleTable(wrap, sched, isOriginal = false) {
  const periods = (sched?.periods || []).filter(p => p.period);
  if (!periods.length) { wrap.innerHTML = '<div class="empty-state-row">No schedule</div>'; return; }
  const totals = {
    principal: periods.reduce((s, p) => s + (p.principalDue || 0), 0),
    interest:  periods.reduce((s, p) => s + (p.interestDue || 0), 0),
    fees:      periods.reduce((s, p) => s + (p.feeChargesDue || 0), 0),
    penalty:   periods.reduce((s, p) => s + (p.penaltyChargesDue || 0), 0),
    due:       periods.reduce((s, p) => s + (p.totalDueForPeriod || 0), 0),
    paid:      periods.reduce((s, p) => s + (p.totalPaidForPeriod || 0), 0)
  };
  wrap.innerHTML = `
    ${isOriginal ? '<div class="msg-banner b-info mb-2"><b>Original schedule</b> — terms before any rescheduling.</div>' : ''}
    <table class="table table-compact">
      <thead><tr>
        <th>#</th><th>Due Date</th>
        <th class="text-right">Principal</th><th class="text-right">Interest</th>
        <th class="text-right">Fees</th><th class="text-right">Penalty</th>
        <th class="text-right">Total Due</th><th class="text-right">Paid</th>
        <th class="text-right">Outstanding</th><th>Status</th>
      </tr></thead>
      <tbody>${periods.map(p => `
        <tr class="${p.complete ? 'paid-row' : p.daysOverdue > 0 ? 'overdue-row' : ''}">
          <td>${p.period}</td>
          <td>${fmtDate(p.dueDate) || '—'}</td>
          <td class="text-right">${fmt(p.principalDue || 0)}</td>
          <td class="text-right">${fmt(p.interestDue || 0)}</td>
          <td class="text-right">${fmt(p.feeChargesDue || 0)}</td>
          <td class="text-right">${fmt(p.penaltyChargesDue || 0)}</td>
          <td class="text-right"><b>${fmt(p.totalDueForPeriod || 0)}</b></td>
          <td class="text-right">${fmt(p.totalPaidForPeriod || 0)}</td>
          <td class="text-right">${fmt(p.totalOutstandingForPeriod || 0)}</td>
          <td>${p.complete ? sb('Paid') : (p.daysOverdue > 0 ? sb('Overdue') : sb('Due'))}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <th colspan="2">Totals</th>
        <th class="text-right">${fmt(totals.principal)}</th>
        <th class="text-right">${fmt(totals.interest)}</th>
        <th class="text-right">${fmt(totals.fees)}</th>
        <th class="text-right">${fmt(totals.penalty)}</th>
        <th class="text-right">${fmt(totals.due)}</th>
        <th class="text-right">${fmt(totals.paid)}</th>
        <th colspan="2"></th>
      </tr></tfoot>
    </table>`;
}
