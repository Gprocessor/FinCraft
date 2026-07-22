/* FinCraft · pages/treasury/dashboard.js — the Treasury Dashboard view.
   Pure read-only screen over Phase 9's getTreasuryDashboard() — no writes happen here. Reuses the
   app's existing .stat-card tile markup (see js/pages/dashboard/index.js) rather than inventing
   new dashboard-tile CSS. If the selected office has no treasury configuration yet (Phase 5's
   requireThresholds() throws), shows a clear pointer to the Treasury Settings screen instead of a
   confusing error. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { getTreasuryDashboard } from '../../treasury/dashboard.js';
import { officeOptionsHtml, liquidityBadgeClass, liquidityAccentClass, fmtMoney } from './shared.js';

function tile(accent, icon, label, value, foot = '') {
  return `
    <div class="stat-card c-${accent}">
      <div class="stat-icon c-${accent}"><i class="fa-solid ${icon}"></i></div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      <div class="kpi-foot text-muted">${foot}</div>
    </div>`;
}

function breakdownRowsHtml(perCashier, currencyCode) {
  if (!perCashier.length) return '<tr><td colspan="4" class="text-muted text-center">No teller activity recorded yet for this office</td></tr>';
  return perCashier.map(c => `
    <tr>
      <td>Teller ${c.tellerId}</td>
      <td>Cashier ${c.cashierId}</td>
      <td class="text-right">${fmtMoney(c.expectedCash, currencyCode)}</td>
      <td class="text-right text-muted">In ${fmtMoney(c.cashIn ?? 0)} / Out ${fmtMoney(c.cashOut ?? 0)}</td>
    </tr>`).join('');
}

async function loadDashboardForOffice(c, officeId) {
  const body = c.querySelector('#trd-body');
  body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';

  let dash;
  try {
    dash = await getTreasuryDashboard(officeId);
  } catch (err) {
    const notConfigured = /has no treasury configuration/i.test(err?.message || '');
    body.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid ${notConfigured ? 'fa-gear' : 'fa-triangle-exclamation'}"></i>
        <div>${notConfigured
          ? 'This office has no treasury configuration yet.'
          : `Failed to load the dashboard: ${err?.message || String(err)}`}</div>
        ${notConfigured ? '<a class="btn-secondary mt-2" href="#/treasury">Go to Treasury Settings</a>' : ''}
      </div>`;
    if (!notConfigured) toast('error', 'Dashboard load failed', err?.message || String(err));
    return;
  }

  const diffLabel = dash.tellerGlDifference === null ? 'Cash At Tellers GL not configured'
    : Math.abs(dash.tellerGlDifference) < 0.01 ? 'Reconciled with pooled GL'
    : `${dash.tellerGlDifference > 0 ? 'Over' : 'Under'} pooled GL by ${fmtMoney(Math.abs(dash.tellerGlDifference), dash.currencyCode)}`;

  body.innerHTML = `
    <div class="stat-grid kpi-grid">
      ${tile('blue',   'fa-building-columns',  'Bank Balance',            fmtMoney(dash.bankBalance, dash.currencyCode))}
      ${tile('teal',   'fa-vault',             'Vault Balance',           fmtMoney(dash.vaultBalance, dash.currencyCode))}
      ${tile(liquidityAccentClass(dash.liquidityStatus), 'fa-shield-halved', 'Available Vault',
             fmtMoney(dash.availableVault, dash.currencyCode),
             `<span class="badge ${liquidityBadgeClass(dash.liquidityStatus)}">${dash.liquidityStatus}</span> · buffer ${fmtMoney(dash.reserveBuffer, dash.currencyCode)}`)}
      ${tile('purple', 'fa-users-rectangle',   'Teller Operational Total', fmtMoney(dash.tellerOperationalTotal, dash.currencyCode), diffLabel)}
      ${tile('amber',  'fa-hand-holding-dollar','Borrowings Outstanding',  fmtMoney(dash.borrowingsOutstanding, dash.currencyCode), `${dash.borrowingsActiveCount} active`)}
      ${tile('red',    'fa-receipt',           'Pending Expenses',        fmtMoney(dash.pendingExpensesTotal, dash.currencyCode))}
      ${tile('blue',   'fa-file-invoice-dollar','Interest Payable',       dash.interestPayableBalance === null ? 'Not configured' : fmtMoney(dash.interestPayableBalance, dash.currencyCode))}
      ${tile('teal',   'fa-scale-balanced',    'Cash At Tellers GL',      dash.cashAtTellersGlBalance === null ? 'Not configured' : fmtMoney(dash.cashAtTellersGlBalance, dash.currencyCode))}
    </div>

    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Teller Breakdown</h3></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Teller</th><th>Cashier</th><th class="text-right">Expected Cash</th><th class="text-right">Activity</th></tr></thead>
          <tbody>${breakdownRowsHtml(dash.tellerBreakdown, dash.currencyCode)}</tbody>
        </table>
      </div>
    </div>`;
}

export async function dashboard(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Treasury Dashboard</h1>
        <div class="page-subtitle">Vault, bank, teller reconciliation, borrowings, and pending expenses at a glance</div>
      </div>
      <div class="page-actions">
        <label style="display:flex;align-items:center;gap:6px"><span class="form-label">Office</span>
          <select class="form-control" id="trd-office"><option>Loading…</option></select>
        </label>
      </div>
    </div>
    <div id="trd-body">
      <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
    </div>`;

  let offices = [];
  try { offices = await api.offices.list(); } catch (err) { toast('error', 'Failed to load offices', err?.message || String(err)); }
  offices = Array.isArray(offices) ? offices : [];

  const officeSelect = c.querySelector('#trd-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#trd-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    return;
  }
  officeSelect.innerHTML = officeOptionsHtml(offices, offices[0].id);
  await loadDashboardForOffice(c, offices[0].id);

  officeSelect.addEventListener('change', () => loadDashboardForOffice(c, Number(officeSelect.value)));
}
