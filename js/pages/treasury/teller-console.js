/* FinCraft · pages/treasury/teller-console.js — the Teller Console view.
   Lists every teller/cashier at an office with FinCraft's computed expected cash (Phase 4) next
   to Fineract's own cashierSummary netCash, so a drift between the two (see log §5 risks) is
   visible at a glance rather than requiring someone to go compare two systems by hand. Each row
   can be expanded to show that cashier's recent Phase 3 events, for tracing exactly what produced
   the current figure. Read-only — no writes happen on this screen (cash allocation, disbursement,
   etc. are their own screens, still to be built per the integration log). */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { getOfficeTellerBreakdown, compareCashierBalanceToFineract } from '../../treasury/teller-balance.js';
import { getCashierEvents } from '../../treasury/teller-events.js';
import { officeOptionsHtml, matchBadgeClass, fmtMoney, loadOfficeTellerCashierList } from './shared.js';

function eventRowsHtml(events) {
  if (!events.length) return '<tr><td colspan="4" class="text-muted text-center">No events recorded</td></tr>';
  return events
    .slice() // don't mutate the array the caller still holds
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)))
    .slice(0, 20)
    .map(e => `
      <tr>
        <td>${escapeHtml(e.transaction_date || '')}</td>
        <td>${escapeHtml(e.transaction_type || '')}</td>
        <td class="text-right ${e.direction === 'CASH_OUT' ? 'text-danger' : 'text-success'}">${e.direction === 'CASH_OUT' ? '−' : '+'}${fmtMoney(e.amount)}</td>
        <td>${e.reversed ? '<span class="badge b-warning">Reversed</span>' : ''}</td>
      </tr>`).join('');
}

async function toggleEventsRow(c, officeId, cashierId, triggerRow, detailRow) {
  const isOpen = !detailRow.classList.contains('hidden');
  if (isOpen) { detailRow.classList.add('hidden'); return; }
  detailRow.classList.remove('hidden');
  const cell = detailRow.querySelector('td');
  cell.innerHTML = '<div class="empty-state-row">Loading events…</div>';
  try {
    const events = await getCashierEvents(officeId, cashierId);
    cell.innerHTML = `
      <table class="table">
        <thead><tr><th>Date</th><th>Type</th><th class="text-right">Amount</th><th></th></tr></thead>
        <tbody>${eventRowsHtml(events)}</tbody>
      </table>`;
  } catch (err) {
    cell.innerHTML = `<div class="text-muted">Failed to load events: ${escapeHtml(err?.message || String(err))}</div>`;
  }
}

async function loadConsoleForOffice(c, officeId) {
  const body = c.querySelector('#ttc-body');
  body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading tellers and cashiers…</div></div>';

  let tellerCashierList;
  try {
    tellerCashierList = await loadOfficeTellerCashierList(officeId);
  } catch (err) {
    body.innerHTML = `<div class="empty-state">Failed to load tellers: ${escapeHtml(err?.message || String(err))}</div>`;
    toast('error', 'Load failed', err?.message || String(err));
    return;
  }

  if (!tellerCashierList.length) {
    body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No tellers/cashiers configured for this office in Fineract.</div></div>';
    return;
  }

  const breakdown = await getOfficeTellerBreakdown(officeId, tellerCashierList).catch(err => { toast('error', 'Failed to compute balances', err?.message || String(err)); return { perCashier: [] }; });
  const byKey = new Map(breakdown.perCashier.map(b => [`${b.tellerId}:${b.cashierId}`, b]));

  // Fetch each cashier's Fineract-vs-FinCraft comparison in parallel (one call per cashier —
  // fine for a console screen refreshed on demand, not something hit at high frequency).
  const comparisons = await Promise.all(tellerCashierList.map(tc =>
    compareCashierBalanceToFineract(officeId, tc.tellerId, tc.cashierId).catch(() => null)));

  body.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Teller</th><th>Cashier</th><th class="text-right">FinCraft Expected</th><th class="text-right">Fineract Net Cash</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${tellerCashierList.map((tc, i) => {
          const b = byKey.get(`${tc.tellerId}:${tc.cashierId}`);
          const cmp = comparisons[i];
          const rowId = `ttc-row-${tc.tellerId}-${tc.cashierId}`;
          return `
            <tr>
              <td>${escapeHtml(tc.tellerName || `Teller ${tc.tellerId}`)}</td>
              <td>${escapeHtml(tc.cashierName)}</td>
              <td class="text-right">${fmtMoney(b?.expectedCash ?? 0)}</td>
              <td class="text-right">${cmp?.fineractNetCash === null || cmp?.fineractNetCash === undefined ? '—' : fmtMoney(cmp.fineractNetCash)}</td>
              <td><span class="badge ${matchBadgeClass(cmp?.matches ?? null)}">${cmp?.matches === true ? 'Reconciled' : cmp?.matches === false ? 'Mismatch' : 'Unknown'}</span></td>
              <td><button class="btn-secondary btn-sm" data-toggle-events="${tc.tellerId}:${tc.cashierId}">Events</button></td>
            </tr>
            <tr class="hidden" id="${rowId}"><td colspan="6"></td></tr>`;
        }).join('')}
      </tbody>
    </table>`;

  body.querySelectorAll('[data-toggle-events]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [tellerId, cashierId] = btn.dataset.toggleEvents.split(':').map(Number);
      const detailRow = c.querySelector(`#ttc-row-${tellerId}-${cashierId}`);
      toggleEventsRow(c, officeId, cashierId, btn, detailRow);
    });
  });
}

export async function tellerConsole(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Teller Console</h1>
        <div class="page-subtitle">Per-cashier expected cash, reconciled against Fineract's own teller ledger</div>
      </div>
      <div class="page-actions">
        <label style="display:flex;align-items:center;gap:6px"><span class="form-label">Office</span>
          <select class="form-control" id="ttc-office"><option>Loading…</option></select>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-body" id="ttc-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [];
  try { offices = await api.offices.list(); } catch (err) { toast('error', 'Failed to load offices', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];

  const officeSelect = c.querySelector('#ttc-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#ttc-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadConsoleForOffice(c, offices[0].id);

  officeSelect.addEventListener('change', () => loadConsoleForOffice(c, Number(officeSelect.value)));
}
