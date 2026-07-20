/* FinCraft · pages/tasks/approvals.js — loan, client, and reschedule-request approval queue tab loaders.
   Auto-split from the original monolithic pages/tasks.js for maintainability. */

import { api } from '../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';
import { toast } from '../../ui.js';
import { escapeHtml, fmt, fmtDate } from '../../utils.js';
import { can } from './shared.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function loadLoanApprovals(c) {
  const el = c.querySelector('#tk-1');
  el.innerHTML = '<div class="empty-state-row">Loading loan approvals…</div>';
  try {
    const res = await api.loans.list({ status: 'approvalPending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const canApprove = can('APPROVE_LOAN');

    const headerHtml = '<div class="section-header mb-2"><span class="text-muted">' +
      list.length + ' loan' + (list.length !== 1 ? 's' : '') + ' pending approval</span></div>';

    let bodyHtml;
    if (list.length) {
      const rows = list.map(function(l) {
        const approveBtn = canApprove
          ? '<button class="btn-mini btn-success" data-loan-approve="' + l.id + '">Approve</button>'
          : '';
        return '<tr>' +
          '<td><a href="#/loans?id=' + l.id + '">' + escapeHtml(l.accountNo) + '</a></td>' +
          '<td>' + escapeHtml(l.clientName || l.clientDisplayName || '—') + '</td>' +
          '<td>' + escapeHtml(l.loanProductName || '—') + '</td>' +
          '<td class="text-right">' + fmt(l.principal || l.approvedPrincipal || 0) + '</td>' +
          '<td>' + fmtDate(l.timeline?.submittedOnDate) + '</td>' +
          '<td class="text-right">' + approveBtn + '</td>' +
          '</tr>';
      }).join('');

      bodyHtml = '<table class="table"><thead><tr>' +
        '<th>Account</th><th>Client</th><th>Product</th>' +
        '<th class="text-right">Principal</th><th>Submitted</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      bodyHtml = '<div class="empty-state-row">No loans pending approval</div>';
    }

    el.innerHTML = headerHtml + bodyHtml;

    el.querySelectorAll('[data-loan-approve]').forEach(function(b) {
      b.addEventListener('click', async function() {
        try {
          await api.loans.approve(b.dataset.loanApprove, {
            approvedOnDate: today(),
            dateFormat: DATE_FORMAT,
            locale: LOCALE
          });
          b.closest('tr')?.remove();
          toast('success', 'Loan approved', '#' + b.dataset.loanApprove);
        } catch (e) {
          toast('error', 'Approval failed', extractFineractError(e));
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<div class="text-error">' + escapeHtml(extractFineractError(e)) + '</div>';
  }
}

export async function loadClientApprovals(c) {
  const el = c.querySelector('#tk-2');
  el.innerHTML = '<div class="empty-state-row">Loading client approvals…</div>';
  try {
    const res = await api.clients.list({ status: 'pending', limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    const canActivate = can('ACTIVATE_CLIENT');

    const headerHtml = '<div class="section-header mb-2"><span class="text-muted">' +
      list.length + ' client' + (list.length !== 1 ? 's' : '') + ' pending activation</span></div>';

    let bodyHtml;
    if (list.length) {
      const rows = list.map(function(cl) {
        const activateBtn = canActivate
          ? '<button class="btn-mini btn-success" data-client-activate="' + cl.id + '">Activate</button>'
          : '';
        return '<tr>' +
          '<td><a href="#/client-detail?id=' + cl.id + '">' + escapeHtml(cl.accountNo) + '</a></td>' +
          '<td>' + escapeHtml(cl.displayName) + '</td>' +
          '<td>' + escapeHtml(cl.officeName || '—') + '</td>' +
          '<td>' + fmtDate(cl.submittedOnDate) + '</td>' +
          '<td class="text-right">' + activateBtn + '</td>' +
          '</tr>';
      }).join('');

      bodyHtml = '<table class="table"><thead><tr>' +
        '<th>Account</th><th>Name</th><th>Office</th><th>Submitted</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
    } else {
      bodyHtml = '<div class="empty-state-row">No clients pending activation</div>';
    }

    el.innerHTML = headerHtml + bodyHtml;

    el.querySelectorAll('[data-client-activate]').forEach(function(b) {
      b.addEventListener('click', async function() {
        try {
          await api.clients.activate(b.dataset.clientActivate, today());
          b.closest('tr')?.remove();
          toast('success', 'Client activated', '#' + b.dataset.clientActivate);
        } catch (e) {
          toast('error', 'Failed', extractFineractError(e));
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<div class="text-error">' + escapeHtml(extractFineractError(e)) + '</div>';
  }
}

export async function loadRescheduleRequests(c) {
  const el = c.querySelector('#tk-3');
  el.innerHTML =
    '<div class="empty-state">' +
      '<i class="fa-solid fa-circle-info"></i>' +
      '<h3>Reschedule Requests are managed per-loan</h3>' +
      '<div class="text-muted mt-2" style="max-width:500px; margin:0 auto">' +
        'Fineract does not expose a system-wide list of pending reschedule requests. ' +
        'Each loan\'s <b>Reschedule</b> tab shows its own requests and allows approve/reject.' +
      '</div>' +
      '<div class="mt-3" style="display:flex; gap:8px; justify-content:center">' +
        '<button class="btn-primary" data-nav-loans><i class="fa-solid fa-list"></i> Go to Loans</button>' +
        '<button class="btn-secondary" data-nav-checker><i class="fa-solid fa-inbox"></i> Use Checker Inbox</button>' +
      '</div>' +
    '</div>';

  el.querySelector('[data-nav-loans]').addEventListener('click', function() {
    import('../../router.js').then(function(r) { r.navigate('loans'); });
  });
  el.querySelector('[data-nav-checker]').addEventListener('click', function() {
    c.querySelector('[data-tab="tk-0"]').click();
  });
}
