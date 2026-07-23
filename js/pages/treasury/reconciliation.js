/* FinCraft · pages/treasury/reconciliation.js — the Daily Reconciliation view.
   Fifth (and final) WRITE screen in Phase 11 — the most complex remaining flow, wrapping Phase
   10's js/treasury/reconciliation.js. A "Start Reconciliation" form (office/teller/cashier/date)
   opens a reconciliation and shows FinCraft's computed expected cash; the per-office list then
   surfaces the one action valid for each row's status (OPEN -> submit physical count; SUBMITTED
   with a non-zero variance -> approve, which posts the shortage/overage JE and self-corrects the
   teller's operational balance; APPROVED -> read-only). A zero-variance count auto-approves inside
   the service, so it lands straight in APPROVED with no manual step — the UI reflects that rather
   than showing a pointless "approve" button. Same expandable-detail-row + TreasuryReconciliation-
   GapError "action required" conventions as every other treasury write screen. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { toast, confirm } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import {
  startDailyReconciliation, submitPhysicalCashCount, approveReconciliation, RECONCILIATION_STATUS
} from '../../treasury/reconciliation.js';
import { TreasuryReconciliationGapError } from '../../treasury/errors.js';
import {
  officeOptionsHtml, statusBadgeClass, fmtMoney,
  loadOfficeTellerCashierList, tellerCashierOptionsHtml
} from './shared.js';

function today() { return new Date().toISOString().slice(0, 10); }
function currentUser() { return (store.get('auth') || {}).username || 'unknown'; }

function reportActionError(err, ordinaryTitle) {
  if (err instanceof TreasuryReconciliationGapError) {
    toast('error', 'Reconciliation gap — action required', err.message);
  } else {
    toast('error', ordinaryTitle, err?.message || String(err));
  }
}

/** variance is stored physical − expected: negative == shortage, positive == overage. */
function varianceLabel(variance) {
  if (variance === null || variance === undefined) return '<span class="text-muted">—</span>';
  const v = Number(variance);
  if (Math.abs(v) < 0.01) return `<span class="text-success">${fmtMoney(0)}</span>`;
  return v < 0
    ? `<span class="text-danger">Shortage ${fmtMoney(Math.abs(v))}</span>`
    : `<span class="text-success">Overage ${fmtMoney(v)}</span>`;
}

function reconRowsHtml(recons) {
  if (!recons.length) return '<tr><td colspan="7" class="text-muted text-center">No reconciliations recorded for this office yet</td></tr>';
  return recons
    .slice()
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .map(r => {
      let action = '<span class="text-muted">—</span>';
      if (r.status === RECONCILIATION_STATUS.OPEN) {
        action = `<button class="btn-primary btn-sm" data-count="${r.id}"><i class="fa-solid fa-calculator"></i> Enter Count</button>`;
      } else if (r.status === RECONCILIATION_STATUS.SUBMITTED) {
        action = `<button class="btn-primary btn-sm" data-approve="${r.id}"><i class="fa-solid fa-stamp"></i> Approve</button>`;
      }
      return `
        <tr>
          <td>#${r.id}</td>
          <td>Teller ${escapeHtml(String(r.teller_id ?? ''))} · Cashier ${escapeHtml(String(r.cashier_id ?? ''))}</td>
          <td>${escapeHtml(r.reconciliation_date || '')}</td>
          <td class="text-right">${fmtMoney(r.expected_cash)}</td>
          <td class="text-right">${r.physical_cash === null || r.physical_cash === undefined ? '<span class="text-muted">—</span>' : fmtMoney(r.physical_cash)}</td>
          <td class="text-right">${varianceLabel(r.variance)}</td>
          <td><span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(r.status || '')}</span> ${action}</td>
        </tr>
        <tr class="hidden" id="txr-detail-${r.id}"><td colspan="7"></td></tr>`;
    }).join('');
}

function detailRow(c, id) { return c.querySelector(`#txr-detail-${id}`); }
function detailCell(c, id) { return c.querySelector(`#txr-detail-${id} td`); }

function openCountForm(c, officeId, reconciliationId, expectedCash) {
  const row = detailRow(c, reconciliationId);
  if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  detailCell(c, reconciliationId).innerHTML = `
    <div class="form-grid">
      <div class="text-muted">Expected cash (FinCraft): <strong>${fmtMoney(expectedCash)}</strong></div>
      <label><span class="form-label">Physical Cash Counted</span>
        <input class="form-control" id="txr-count-${reconciliationId}" type="number" min="0" step="0.01" placeholder="0.00"/>
      </label>
      <button class="btn-primary btn-sm mt-2" id="txr-count-go-${reconciliationId}"><i class="fa-solid fa-check"></i> Submit Count</button>
    </div>`;
  c.querySelector(`#txr-count-go-${reconciliationId}`).addEventListener('click', async () => {
    const goBtn = c.querySelector(`#txr-count-go-${reconciliationId}`);
    const raw = c.querySelector(`#txr-count-${reconciliationId}`).value;
    if (raw === '' || !(Number(raw) >= 0)) { toast('warn', 'Invalid count', 'Enter the physical cash counted (zero or more)'); return; }
    goBtn.disabled = true;
    try {
      const result = await submitPhysicalCashCount(officeId, reconciliationId, Number(raw));
      if (result.requiresApproval) {
        toast('warn', 'Variance found', `Variance of ${fmtMoney(Math.abs(result.variance))} — reconciliation #${reconciliationId} is SUBMITTED and awaits approval to post the adjustment.`);
      } else {
        toast('success', 'Reconciled', `No variance — reconciliation #${reconciliationId} auto-approved.`);
      }
      row.classList.add('hidden');
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Submit failed'); goBtn.disabled = false; }
  });
}

function wireRowActions(c, officeId, byId) {
  c.querySelectorAll('[data-count]').forEach(btn => btn.addEventListener('click', () => {
    const id = Number(btn.dataset.count);
    openCountForm(c, officeId, id, byId.get(id)?.expected_cash ?? 0);
  }));

  c.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
    const id = Number(btn.dataset.approve);
    const recon = byId.get(id);
    const v = Number(recon?.variance);
    const kind = v < 0 ? 'shortage' : 'overage';
    const ok = await confirm({
      title: `Approve ${kind}`,
      message: `Approve reconciliation #${id}? This posts the ${kind} journal entry for ${fmtMoney(Math.abs(v))} and adjusts the teller's operational balance. This cannot be undone automatically.`,
      confirmText: 'Approve & Post',
      danger: true
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      const result = await approveReconciliation(officeId, id, currentUser(), { transactionDate: today() });
      toast('success', `${result.isShortage ? 'Shortage' : 'Overage'} posted`, `Reconciliation #${id} approved (Fineract transaction ${result.fineractTransactionId}).`);
      await reloadList(c, officeId);
    } catch (err) { reportActionError(err, 'Approval failed'); btn.disabled = false; }
  }));
}

async function reloadList(c, officeId) {
  const listBody = c.querySelector('#txr-list-body');
  listBody.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading reconciliations…</div></div>';
  let recons = [];
  try {
    const rows = await api.treasury.queryRows('dt_daily_cash_reconciliation', officeId);
    recons = Array.isArray(rows) ? rows : [];
  } catch (err) {
    listBody.innerHTML = `<div class="empty-state">Failed to load reconciliations: ${escapeHtml(err?.message || String(err))}</div>`;
    return;
  }
  const byId = new Map(recons.map(r => [r.id, r]));
  listBody.innerHTML = `
    <table class="table">
      <thead><tr><th>ID</th><th>Cashier</th><th>Date</th><th class="text-right">Expected</th><th class="text-right">Physical</th><th class="text-right">Variance</th><th>Status / Action</th></tr></thead>
      <tbody>${reconRowsHtml(recons)}</tbody>
    </table>`;
  wireRowActions(c, officeId, byId);
}

async function loadFormForOffice(c, officeId) {
  const body = c.querySelector('#txr-start-body');
  body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading tellers…</div></div>';
  const tellerCashierList = await loadOfficeTellerCashierList(officeId).catch(err => { toast('error', 'Failed to load tellers', err?.message || String(err)); return []; });

  body.innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Teller / Cashier</span>
        <select class="form-control" id="txr-tc">${tellerCashierOptionsHtml(tellerCashierList)}</select>
      </label>
      <label><span class="form-label">Reconciliation Date</span>
        <input class="form-control" id="txr-date" type="date" value="${today()}"/>
      </label>
      <button class="btn-primary mt-2" id="txr-start" ${tellerCashierList.length ? '' : 'disabled'}>
        <i class="fa-solid fa-play"></i> Start Reconciliation
      </button>
    </div>`;

  c.querySelector('#txr-start')?.addEventListener('click', async () => {
    const btn = c.querySelector('#txr-start');
    const tcValue = c.querySelector('#txr-tc').value;
    const [tellerId, cashierId] = tcValue.split(':').map(Number);
    const reconciliationDate = c.querySelector('#txr-date').value;
    if (!tellerId || !cashierId) { toast('warn', 'Select a teller/cashier', 'Choose which cashier to reconcile'); return; }
    if (!reconciliationDate) { toast('warn', 'Missing date', 'Select a reconciliation date'); return; }

    btn.disabled = true;
    try {
      const { reconciliationId, expectedCash } = await startDailyReconciliation(officeId, tellerId, cashierId, reconciliationDate);
      toast('success', 'Reconciliation opened', `Reconciliation #${reconciliationId} opened. Expected cash: ${fmtMoney(expectedCash)}. Enter the physical count below.`);
      await reloadList(c, officeId);
    } catch (err) {
      toast('error', 'Could not start', err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });

  await reloadList(c, officeId);
}

export async function reconciliation(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Daily Reconciliation</h1>
        <div class="page-subtitle">Count each cashier's physical cash against expected, and post approved shortage/overage adjustments</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3 class="card-title">Office</h3></div>
      <div class="card-body">
        <div class="form-grid">
          <label><span class="form-label">Office</span>
            <select class="form-control" id="txr-office"><option>Loading…</option></select>
          </label>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Start Reconciliation</h3></div>
      <div class="card-body" id="txr-start-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Reconciliations</h3></div>
      <div class="card-body" id="txr-list-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [];
  try { offices = await api.offices.list(); } catch (err) { toast('error', 'Failed to load offices', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];

  const officeSelect = c.querySelector('#txr-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#txr-start-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    c.querySelector('#txr-list-body').innerHTML = '';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadFormForOffice(c, offices[0].id);

  officeSelect.addEventListener('change', () => loadFormForOffice(c, Number(officeSelect.value)));
}
