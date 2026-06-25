import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · tasks.js — Live API */
import { api } from '../api.js';
import { sb, fmt, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm } from '../ui.js';

const TABS = ['Checker Inbox', 'Loan Approvals', 'Client Approvals', 'Reschedule Requests'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Checker Inbox & Tasks</h1><div class="page-subtitle">Pending approvals across the platform</div></div>
    </div>
    <div class="card">
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="tk-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div id="tk-${i}" class="tab-panel ${i === 0 ? 'active' : ''}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`).join('')}
    </div>
  </div>`;

  // Checker inbox (maker-checker)
  try {
    const res = await api.makerchecker.list({ limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#tk-0').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>ID</th><th>Action</th><th>Entity</th><th>Maker</th><th>Made on</th><th>Actions</th></tr></thead>
          <tbody id="tk-rows">${list.map(t => `
            <tr data-id="${t.id}">
              <td class="mono">${t.id || '—'}</td>
              <td><b>${escapeHtml(t.actionName || t.action || '—')}</b></td>
              <td>${escapeHtml(t.entityName || t.entity || '—')}</td>
              <td>${escapeHtml(t.maker || '—')}</td>
              <td>${escapeHtml(typeof t.madeOnDate === 'object' ? fmtDate(t.madeOnDate) : (t.madeOnDate || '—'))}</td>
              <td>
                <button class="btn-sm btn-primary" data-approve="${t.id}"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn-sm btn-danger" data-reject="${t.id}"><i class="fa-solid fa-xmark"></i> Reject</button>
              </td>
            </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-inbox"></i><div>No pending checker tasks</div></div>';

    c.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      try { await api.makerchecker.approve(b.dataset.approve); }
      catch (e) { toast('error', 'Approval failed', e.message); return; }
      b.closest('tr')?.remove();
      toast('success', 'Approved', `Task #${b.dataset.approve} approved`);
    }));
    c.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reject task?', message: `Reject task #${b.dataset.reject}?`, danger: true, confirmText: 'Reject' })) return;
      try { await api.makerchecker.reject(b.dataset.reject); }
      catch (e) { toast('error', 'Rejection failed', e.message); return; }
      b.closest('tr')?.remove();
      toast('warn', 'Rejected', `Task #${b.dataset.reject} rejected`);
    }));
  } catch (e) {
    c.querySelector('#tk-0').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Loan approvals
  try {
    const res = await api.loans.list({ status: 'approvalPending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#tk-1').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Principal</th><th>Submitted</th><th></th></tr></thead>
          <tbody>${list.map(l => `<tr>
            <td class="mono">${escapeHtml(l.accountNo)}</td>
            <td>${escapeHtml(l.clientName || l.clientDisplayName)}</td>
            <td>${escapeHtml(l.loanProductName || '—')}</td>
            <td class="mono">${fmt(l.principal || l.approvedPrincipal || 0)}</td>
            <td>${fmtDate(l.timeline?.submittedOnDate)}</td>
            <td><button class="btn-sm btn-primary" data-loan-approve="${l.id}"><i class="fa-solid fa-check"></i> Approve</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-check-double"></i><div>No loans pending approval</div></div>';

    c.querySelectorAll('[data-loan-approve]').forEach(b => b.addEventListener('click', async () => {
      // today() from config.js
      try {
        await api.loans.approve(b.dataset.loanApprove, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        b.closest('tr')?.remove();
        toast('success', 'Loan approved', `#${b.dataset.loanApprove}`);
      } catch (e) { toast('error', 'Failed', e.message); }
    }));
  } catch (e) {
    c.querySelector('#tk-1').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Client approvals
  try {
    const res = await api.clients.list({ status: 'pending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#tk-2').innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Account</th><th>Name</th><th>Office</th><th>Submitted</th><th></th></tr></thead>
          <tbody>${list.map(cl => `<tr>
            <td class="mono">${escapeHtml(cl.accountNo)}</td>
            <td>${escapeHtml(cl.displayName)}</td>
            <td>${escapeHtml(cl.officeName || '—')}</td>
            <td>${fmtDate(cl.submittedOnDate)}</td>
            <td><button class="btn-sm btn-primary" data-client-activate="${cl.id}"><i class="fa-solid fa-check"></i> Activate</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-user-check"></i><div>No clients pending activation</div></div>';

    c.querySelectorAll('[data-client-activate]').forEach(b => b.addEventListener('click', async () => {
      // today() from config.js
      try {
        await api.clients.activate(b.dataset.clientActivate, today());
        b.closest('tr')?.remove();
        toast('success', 'Client activated', `#${b.dataset.clientActivate}`);
      } catch (e) { toast('error', 'Failed', e.message); }
    }));
  } catch (e) {
    c.querySelector('#tk-2').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Fineract has no endpoint to list ALL pending reschedule requests system-wide —
  // /rescheduleloans/{requestId} only retrieves a single request by id, scoped to a loan.
  // A real implementation here would need a custom report or per-loan polling.
  c.querySelector('#tk-3').innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-days"></i><div><b>Not available as a global list</b></div><div class="text-muted mt-2">Fineract only exposes reschedule requests per-loan, not a system-wide pending list. Approve/reject from the individual loan\'s detail view instead.</div></div>';
}
