/* FinCraft · pages/misc/remittances.js — the Remittances view.
   Auto-split from the original monolithic pages/misc.js for maintainability. */

import { api } from '../../api.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../utils.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function remittances(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Remittances</h1>
        <div class="page-subtitle">Send money to beneficiaries; view recent transfers</div>
      </div>
      <div class="page-actions">
        <button class="btn-primary btn-sm" id="newRemitBtn">
          <i class="fa-solid fa-paper-plane"></i> New Remittance
        </button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><h3 class="card-title">Recent Account Transfers</h3></div>
      <div id="remit-list">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </div>
    </div>

    <div class="msg-banner b-info">
      <i class="fa-solid fa-circle-info"></i>
      <div>
        <b>How remittances work in FinCraft</b><br/>
        Remittances are implemented as Fineract account-to-account transfers between two savings accounts.
        The "New Remittance" button launches a 4-step stepper (Sender → Beneficiary → Transfer → Confirm)
        and posts the transaction via the <code>/accounttransfers</code> endpoint.
      </div>
    </div>
  `;

  c.querySelector('#newRemitBtn').addEventListener('click', () =>
    import('../../remit.js').then(m => m.Remit.open())
  );

  try {
    const res = await api.transfers.list({ limit: 50 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const listEl = c.querySelector('#remit-list');

    if (!list.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-paper-plane empty-state-icon"></i>
          <h3>No transfers yet</h3>
          <p>Click "New Remittance" above to send your first transfer.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>Date</th>
            <th>From</th>
            <th>To</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Reference</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            ${list.map(t => `
              <tr>
                <td>${fmtDate(t.transferDate) || '—'}</td>
                <td>${escapeHtml(t.fromAccountNo || `#${t.fromAccount?.id || '—'}`)}<div class="text-muted small">${escapeHtml(t.fromClientName || '')}</div></td>
                <td>${escapeHtml(t.toAccountNo || `#${t.toAccount?.id || '—'}`)}<div class="text-muted small">${escapeHtml(t.toClientName || '')}</div></td>
                <td class="mono text-teal">${fmt(t.transferAmount || 0)}</td>
                <td>${escapeHtml(t.currency?.code || '—')}</td>
                <td class="mono small">${escapeHtml(t.transferDescription || '—')}</td>
                <td>${sb(t.transferType?.value || 'Completed')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    c.querySelector('#remit-list').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load transfers</h3>
        <p>${escapeHtml(extractFineractError(e) || '')}</p>
      </div>
    `;
  }
}
