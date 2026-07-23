/* FinCraft · pages/treasury/cash-allocation.js — the Cash Allocation view.
   The first WRITE screen in Phase 11 (Settings/Dashboard/Teller Console were read-only) — moves
   cash from the vault to a cashier via Phase 5's allocateCashToCashier, which itself wraps
   Fineract's native allocate API and records the matching Phase 3 teller event. Shows the current
   vault status (balance/buffer/available) before submission so the operator can see whether a
   request will be blocked before trying it, not just after. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { toast } from '../../ui.js';
import { getVaultBalance, getReserveBuffer, allocateCashToCashier } from '../../treasury/vault-control.js';
import { TreasuryReconciliationGapError } from '../../treasury/errors.js';
import { officeOptionsHtml, loadOfficeTellerCashierList, fmtMoney } from './shared.js';

function today() { return new Date().toISOString().slice(0, 10); }

function tellerCashierOptionsHtml(list) {
  if (!list.length) return '<option value="">No tellers/cashiers configured</option>';
  return list.map(tc => `<option value="${tc.tellerId}:${tc.cashierId}">${tc.tellerName || `Teller ${tc.tellerId}`} — ${tc.cashierName}</option>`).join('');
}

async function loadVaultStatus(c, officeId) {
  const statusEl = c.querySelector('#tca-vault-status');
  statusEl.innerHTML = '<span class="text-muted">Loading vault status…</span>';
  try {
    const [balance, buffer] = await Promise.all([getVaultBalance(officeId), getReserveBuffer(officeId)]);
    const available = balance - buffer;
    statusEl.innerHTML = `
      Vault: <strong>${fmtMoney(balance)}</strong> &nbsp;·&nbsp;
      Reserve Buffer: <strong>${fmtMoney(buffer)}</strong> &nbsp;·&nbsp;
      Available to Allocate: <strong class="${available > 0 ? 'text-success' : 'text-danger'}">${fmtMoney(available)}</strong>`;
    return { balance, buffer, available };
  } catch (err) {
    const notConfigured = /has no treasury configuration/i.test(err?.message || '');
    statusEl.innerHTML = notConfigured
      ? '<span class="text-danger">This office has no treasury configuration yet. <a href="#/treasury">Configure it first</a>.</span>'
      : `<span class="text-danger">Failed to load vault status: ${err?.message || String(err)}</span>`;
    return null;
  }
}

async function loadFormForOffice(c, officeId) {
  const vaultStatus = await loadVaultStatus(c, officeId);

  const body = c.querySelector('#tca-form-body');
  body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading tellers…</div></div>';
  const tellerCashierList = await loadOfficeTellerCashierList(officeId).catch(err => { toast('error', 'Failed to load tellers', err?.message || String(err)); return []; });

  body.innerHTML = `
    <div class="form-grid">
      <label><span class="form-label">Teller / Cashier</span>
        <select class="form-control" id="tca-tc">${tellerCashierOptionsHtml(tellerCashierList)}</select>
      </label>
      <label><span class="form-label">Amount</span>
        <input class="form-control" id="tca-amount" type="number" min="0.01" step="0.01" placeholder="0.00"/>
      </label>
      <label><span class="form-label">Transaction Date</span>
        <input class="form-control" id="tca-date" type="date" value="${today()}"/>
      </label>
      <label><span class="form-label">Note</span>
        <input class="form-control" id="tca-note" placeholder="Optional"/>
      </label>
      <button class="btn-primary mt-2" id="tca-submit" ${tellerCashierList.length ? '' : 'disabled'}>
        <i class="fa-solid fa-right-left"></i> Allocate Cash
      </button>
    </div>`;

  c.querySelector('#tca-submit')?.addEventListener('click', async () => {
    const btn = c.querySelector('#tca-submit');
    const tcValue = c.querySelector('#tca-tc').value;
    const [tellerId, cashierId] = tcValue.split(':').map(Number);
    const amount = Number(c.querySelector('#tca-amount').value);
    const transactionDate = c.querySelector('#tca-date').value;
    const note = c.querySelector('#tca-note').value.trim();
    const performedBy = (store.get('auth') || {}).username;

    if (!(amount > 0)) { toast('warn', 'Invalid amount', 'Enter an amount greater than zero'); return; }
    if (!transactionDate) { toast('warn', 'Missing date', 'Select a transaction date'); return; }

    btn.disabled = true;
    try {
      const result = await allocateCashToCashier(officeId, tellerId, cashierId, amount, transactionDate, note, performedBy);
      toast('success', 'Cash allocated', `${fmtMoney(amount)} allocated. Available vault after: ${fmtMoney(result.availableVaultAfter)}`);
      c.querySelector('#tca-amount').value = '';
      c.querySelector('#tca-note').value = '';
      await loadVaultStatus(c, officeId); // refresh the status line to reflect the new balance
    } catch (err) {
      if (err instanceof TreasuryReconciliationGapError) {
        // Real cash already moved in Fineract even though this failed — this is not an ordinary
        // validation error, so it must not look like one (see js/treasury/errors.js).
        toast('error', 'Reconciliation gap — action required', err.message);
      } else {
        toast('error', 'Allocation failed', err?.message || String(err));
      }
    } finally {
      btn.disabled = false;
    }
  });
}

export async function cashAllocation(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Cash Allocation</h1>
        <div class="page-subtitle">Move cash from the vault to a cashier, subject to the office's reserve buffer</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Office</h3>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <label><span class="form-label">Office</span>
            <select class="form-control" id="tca-office"><option>Loading…</option></select>
          </label>
        </div>
        <div class="mt-2" id="tca-vault-status"><span class="text-muted">Loading…</span></div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Allocate</h3></div>
      <div class="card-body" id="tca-form-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [];
  try { offices = await api.offices.list(); } catch (err) { toast('error', 'Failed to load offices', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];

  const officeSelect = c.querySelector('#tca-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#tca-form-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadFormForOffice(c, offices[0].id);

  officeSelect.addEventListener('change', () => loadFormForOffice(c, Number(officeSelect.value)));
}
