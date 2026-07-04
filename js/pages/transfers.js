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

  c.querySelector('#newSIBtn').addEventListener('click', () => {
    openStandingInstructionModal(() => render(c));
  });
}

async function openStandingInstructionModal(onSuccess) {
  const { render: _unused, ...rest } = await import('./organization.js').catch(() => ({}));
  // Fallback: dynamic import the SI modal from organization.js
  const mod = await import('./organization.js');
  if (mod && typeof mod._openSIModal === 'function') {
    mod._openSIModal(onSuccess);
  } else {
    // Inline minimal SI modal so transfers.js stays self-contained
    const { api } = await import('../api.js');
    const { toast } = await import('../ui.js');
    const { LOCALE, DATE_FORMAT } = await import('../config.js');
    const { escapeHtml } = await import('../utils.js');
    let tpl = {};
    try { tpl = await api.standingInstructions.template(); } catch {}
    const recurrenceTypes = (tpl.recurrenceTypeOptions || []).map(o => `<option value="${o.id}">${escapeHtml(o.value)}</option>`).join('') || '<option value="1">Periodic</option><option value="2">Fixed</option>';
    const mid = 'si-tr-' + Date.now();
    const modalEl = document.createElement('div');
    modalEl.id = mid;
    modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-header"><h3>New Standing Instruction</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Instruction name * <input id="si-name" class="form-control" required/></label>
            <label>From account no * <input id="si-from" class="form-control" required/></label>
            <label>To account no * <input id="si-to" class="form-control" required/></label>
            <label>Amount * <input type="number" step="0.01" id="si-amount" class="form-control" required/></label>
            <label>Recurrence type <select id="si-rec-type" class="form-control">${recurrenceTypes}</select></label>
            <label>Frequency <input type="number" id="si-freq" class="form-control" value="1"/></label>
            <label>Valid from * <input type="date" id="si-valid-from" class="form-control" required/></label>
            <label>Valid to <input type="date" id="si-valid-to" class="form-control"/></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="si-save">Create</button>
        </div>
      </div>`;
    document.getElementById('modalRoot').appendChild(modalEl);
    modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
    modalEl.querySelector('#si-save').addEventListener('click', async () => {
      const name = modalEl.querySelector('#si-name').value.trim();
      const fromAccountNumber = modalEl.querySelector('#si-from').value.trim();
      const toAccountNumber = modalEl.querySelector('#si-to').value.trim();
      const amount = parseFloat(modalEl.querySelector('#si-amount').value);
      const validFrom = modalEl.querySelector('#si-valid-from').value;
      if (!name || !fromAccountNumber || !toAccountNumber || isNaN(amount) || !validFrom) {
        toast('warn', 'Fill required fields', ''); return;
      }
      try {
        await api.standingInstructions.create({
          name, amount, locale: LOCALE, dateFormat: DATE_FORMAT,
          fromAccountNumber, toAccountNumber, validFrom,
          recurrenceType: parseInt(modalEl.querySelector('#si-rec-type').value) || 1,
          recurrenceFrequency: parseInt(modalEl.querySelector('#si-freq').value) || 1,
          validTo: modalEl.querySelector('#si-valid-to').value || undefined
        });
        toast('success', 'Standing instruction created', name);
        modalEl.remove();
        if (onSuccess) onSuccess();
      } catch (e) { toast('error', 'Failed', e.message || String(e)); }
    });
  }
}
