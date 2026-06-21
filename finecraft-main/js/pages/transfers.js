/* FinCraft · transfers.js — Live API */
import { api } from '../api.js';
import { fmt, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Transfers & Remittances</h1><div class="page-subtitle">Account-to-account transfers</div></div>
    </div>
    <div class="card">
      <div class="tabs">
        <button class="tab active" data-tab="tr-pane">Account Transfers</button>
        <button class="tab" data-tab="rm-pane">Remittances</button>
        <button class="tab" data-tab="si-pane">Standing Instructions</button>
      </div>
      <div id="tr-pane" class="tab-panel active">
        <div class="flex justify-between mb-4">
          <span class="text-muted" id="tr-count">Loading transfers…</span>
          <button class="btn-primary" data-modal="newTransferModal"><i class="fa-solid fa-plus"></i> New Transfer</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Date</th><th>From Account</th><th>To Account</th><th>Amount</th><th>Currency</th><th>Status</th></tr></thead>
          <tbody id="tr-rows"><tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>
      <div id="rm-pane" class="tab-panel">
        <div class="flex justify-between mb-4">
          <span class="text-muted">International remittances</span>
          <button class="btn-primary" data-modal="remittanceModal"><i class="fa-solid fa-globe"></i> Send Remittance</button>
        </div>
        <div class="empty-state"><i class="fa-solid fa-globe"></i><div>No remittance records. Use "Send Remittance" to start.</div></div>
      </div>
      <div id="si-pane" class="tab-panel">
        <div class="flex justify-between mb-4">
          <span class="text-muted">Recurring transfer instructions</span>
          <button class="btn-ghost" id="newSIBtn"><i class="fa-solid fa-plus"></i> New Standing Instruction</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th>From</th><th>To</th><th>Amount</th><th>Frequency</th><th>Status</th></tr></thead>
          <tbody id="si-rows"><tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
        </table></div>
      </div>
    </div>
  </div>`;

  const [trRes, siRes] = await Promise.all([
    api.transfers.list({ limit: 50 }).catch(() => null),
    api.standingInstructions.list({ limit: 50 }).catch(() => null)
  ]);

  const trList = Array.isArray(trRes) ? trRes : (trRes?.pageItems || []);
  c.querySelector('#tr-count').textContent = `${trList.length} transfer(s)`;
  c.querySelector('#tr-rows').innerHTML = trList.length
    ? trList.map(t => `<tr>
        <td>${fmtDate(t.transferDate)}</td>
        <td class="mono">${escapeHtml(t.fromAccountNo || `#${t.fromAccount?.id || '—'}`)}</td>
        <td class="mono">${escapeHtml(t.toAccountNo || `#${t.toAccount?.id || '—'}`)}</td>
        <td class="mono">${fmt(t.transferAmount || 0)}</td>
        <td class="mono">${escapeHtml(t.currency?.code || '—')}</td>
        <td>${sb(t.transferType?.value || 'Completed')}</td></tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-right-left"></i><div>No transfers found</div></div></td></tr>';

  const siList = Array.isArray(siRes) ? siRes : (siRes?.pageItems || []);
  c.querySelector('#si-rows').innerHTML = siList.length
    ? siList.map(s => `<tr>
        <td>${escapeHtml(s.name || '—')}</td>
        <td class="mono">${escapeHtml(s.fromAccount?.accountNo || s.fromAccount?.glAccountName || (s.fromAccount?.id ? `#${s.fromAccount.id}` : '—'))}</td>
        <td class="mono">${escapeHtml(s.toAccount?.accountNo || s.toAccount?.glAccountName || (s.toAccount?.id ? `#${s.toAccount.id}` : '—'))}</td>
        <td class="mono">${fmt(s.amount || 0)}</td>
        <td>${escapeHtml(s.recurrenceType?.value || s.recurrenceType || '—')}</td>
        <td>${sb(s.status?.value || '—')}</td></tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-calendar-check"></i><div>No standing instructions</div></div></td></tr>';

  c.querySelector('#newSIBtn').addEventListener('click', () => toast('info', 'Builder not built yet',
    'Standing instructions need a multi-step from/to account + recurrence form — planned as its own task, same as the complex product builders.'));
}
