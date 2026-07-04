/* FinCraft · pages/loans/detail/lifecycle.js — delinquency, reschedule, and buy-down tab loaders.
   Auto-split (2nd pass) from pages/loans/detail.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { can } from '../shared.js';
import { confirm, openModal, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openDelinquencyActionModal } from '../actions.js';

export async function loadLoanDelinquency(c, loanId) {
  const wrap = c.querySelector('#ln-delq-wrap');
  wrap.innerHTML = `
    <div class="grid-2">
      <div>
        <h3>Current Delinquency</h3>
        <div id="ln-delq-current"><div class="empty-state-row">Loading…</div></div>
      </div>
      <div>
        <div class="section-header">
          <h3>Delinquency Actions</h3>
          ${can('CREATE_DELINQUENCY_ACTION') ? `<button class="btn-primary btn-sm" id="ln-add-delq"><i class="fa-solid fa-plus"></i> Pause / Resume</button>` : ''}
        </div>
        <div id="ln-delq-actions"><div class="empty-state-row">Loading…</div></div>
      </div>
    </div>
    <h3 class="mt-4">Delinquency Tag History</h3>
    <div id="ln-delq-tags"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-add-delq')?.addEventListener('click', () =>
    openDelinquencyActionModal(loanId, () => loadLoanDelinquency(c, loanId)));

  // Current delinquency snapshot (from loan detail)
  const cur = wrap.querySelector('#ln-delq-current');
  try {
    const l = await api.loans.get(loanId, 'delinquent');
    cur.innerHTML = `
      <dl class="dl-grid">
        <dt>Range</dt><dd>${escapeHtml(l.delinquencyRange?.classification || '—')}</dd>
        <dt>Bucket</dt><dd>${escapeHtml(l.delinquentBucket?.name || '—')}</dd>
        <dt>Delinquent since</dt><dd>${fmtDate(l.delinquent?.delinquentDate) || '—'}</dd>
        <dt>Days overdue</dt><dd>${l.delinquent?.delinquentDays ?? '—'}</dd>
        <dt>Past due interest</dt><dd class="text-right">${fmt(l.delinquent?.delinquentInterest || 0)}</dd>
        <dt>Past due principal</dt><dd class="text-right">${fmt(l.delinquent?.delinquentPrincipal || 0)}</dd>
      </dl>`;
  } catch (e) { cur.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }

  // Delinquency actions (pause/resume)
  const actEl = wrap.querySelector('#ln-delq-actions');
  try {
    const res = await api.loans.delinquency(loanId);
    const list = Array.isArray(res) ? res : (res?.delinquencyActions || []);
    actEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr><th>Action</th><th>Start</th><th>End</th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>${escapeHtml(a.action || '—')}</td>
            <td>${fmtDate(a.startDate) || '—'}</td>
            <td>${fmtDate(a.endDate) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No delinquency actions</div>';
  } catch (e) { actEl.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }

  // Tag history
  const tagsEl = wrap.querySelector('#ln-delq-tags');
  try {
    const tags = await api.loans.delinquencyTags(loanId);
    const list = Array.isArray(tags) ? tags : [];
    tagsEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr><th>Classification</th><th>Range</th><th>Added On</th><th>Lifted On</th></tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td>${escapeHtml(t.classification || t.delinquencyRange?.classification || '—')}</td>
            <td>${t.minimumAgeDays ?? '—'} - ${t.maximumAgeDays ?? '—'} days</td>
            <td>${fmtDate(t.addedOnDate) || '—'}</td>
            <td>${fmtDate(t.liftedOnDate) || (t.liftedOnDate === null ? '<span class="text-muted">Active</span>' : '—')}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No tag history</div>';
  } catch { tagsEl.innerHTML = '<div class="empty-state-row text-muted">Tag history not available for this loan</div>'; }
}

export async function loadLoanReschedule(c, loanId) {
  const wrap = c.querySelector('#ln-rs-wrap');
  wrap.innerHTML = `
    ${can('CREATE_RESCHEDULELOAN') ? `
      <div class="section-header mb-2">
        <h3>Reschedule Requests</h3>
        <button class="btn-primary btn-sm" id="ln-new-rs"><i class="fa-solid fa-calendar-plus"></i> New Request</button>
      </div>` : '<h3>Reschedule Requests</h3>'}
    <div id="ln-rs-list"><div class="empty-state-row">Loading…</div></div>`;

  wrap.querySelector('#ln-new-rs')?.addEventListener('click', () => {
    const modal = openModal('rescheduleModal');
    if (modal) {
      modal.dataset.loanId = loanId;
      const hidden = document.getElementById('rs-loanid');
      if (hidden) hidden.value = loanId;
    }
  });

  const listEl = wrap.querySelector('#ln-rs-list');
  try {
    const res = await api.loans.rescheduleRequests(loanId);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    listEl.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th>#</th><th>Submitted</th><th>From Date</th><th>Adjusted Due</th>
          <th>Reason</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td>${r.id}</td>
            <td>${fmtDate(r.timeline?.submittedOnDate) || '—'}</td>
            <td>${fmtDate(r.rescheduleFromDate) || '—'}</td>
            <td>${fmtDate(r.adjustedDueDate) || '—'}</td>
            <td>${escapeHtml(r.rescheduleReasonCodeValue?.name || r.rescheduleReasonComment || '—')}</td>
            <td>${sb(r.statusEnum?.value || (r.approved ? 'Approved' : r.rejected ? 'Rejected' : 'Pending'))}</td>
            <td class="text-right">
              ${!r.approved && !r.rejected && can('APPROVE_RESCHEDULELOAN') ?
                `<button class="btn-mini btn-success" data-rs-approve="${r.id}">Approve</button>` : ''}
              ${!r.approved && !r.rejected && can('REJECT_RESCHEDULELOAN') ?
                `<button class="btn-mini btn-warning" data-rs-reject="${r.id}">Reject</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No reschedule requests</div>';

    listEl.querySelectorAll('[data-rs-approve]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Approve reschedule request?', confirmText: 'Approve' })) return;
      try {
        await api.loans.approveReschedule(b.dataset.rsApprove, {
          approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Reschedule approved', `#${b.dataset.rsApprove}`);
        loadLoanReschedule(c, loanId);
      } catch (e) { toast('error', 'Approve failed', e.detail?.defaultUserMessage || e.message); }
    }));
    listEl.querySelectorAll('[data-rs-reject]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Reject reschedule request?', confirmText: 'Reject', danger: true })) return;
      try {
        await api.loans.rejectReschedule(b.dataset.rsReject, {
          rejectedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'Reschedule rejected', `#${b.dataset.rsReject}`);
        loadLoanReschedule(c, loanId);
      } catch (e) { toast('error', 'Reject failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { listEl.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`; }
}

export async function loadLoanBuyDown(c, loanId) {
  const wrap = c.querySelector('#ln-bd-wrap');
  wrap.innerHTML = `
    <div class="grid-2">
      <div>
        <h3>Buy-down Fees</h3>
        <div class="text-muted small mb-2">
          Buy-down fees discount the borrower's effective interest rate, amortised across the loan term.
        </div>
        <div id="ln-bd-list"><div class="empty-state-row">Loading…</div></div>
      </div>
      <div>
        <h3>Capitalized Income</h3>
        <div class="text-muted small mb-2">
          Capitalized income lines are recognised over time on progressive loan products.
        </div>
        <div id="ln-ci-list"><div class="empty-state-row">Loading…</div></div>
      </div>
    </div>
    <h3 class="mt-4">Deferred Income</h3>
    <div id="ln-di-list"><div class="empty-state-row">Loading…</div></div>`;

  // Buy-down fees
  const bdEl = wrap.querySelector('#ln-bd-list');
  try {
    const r = await api.loans.buyDownFees(loanId);
    const list = Array.isArray(r) ? r : (r?.buyDownFees || r?.pageItems || []);
    bdEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Tx Date</th><th class="text-right">Amount</th>
          <th class="text-right">Amortised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(b => `
          <tr>
            <td>${fmtDate(b.transactionDate || b.date) || '—'}</td>
            <td class="text-right">${fmt(b.amount || 0)}</td>
            <td class="text-right">${fmt(b.amortisedAmount || b.amortized || 0)}</td>
            <td class="text-right">${fmt(b.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No buy-down fees recorded</div>';
  } catch {
    bdEl.innerHTML = '<div class="empty-state-row text-muted">Buy-down fees not enabled for this loan product</div>';
  }

  // Capitalized income
  const ciEl = wrap.querySelector('#ln-ci-list');
  try {
    const r = await api.loans.capitalizedIncomes(loanId);
    const list = Array.isArray(r) ? r : (r?.capitalizedIncomes || r?.pageItems || []);
    ciEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Tx Date</th><th class="text-right">Amount</th>
          <th class="text-right">Recognised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(i => `
          <tr>
            <td>${fmtDate(i.transactionDate || i.date) || '—'}</td>
            <td class="text-right">${fmt(i.amount || 0)}</td>
            <td class="text-right">${fmt(i.recognisedAmount || i.amortisedAmount || 0)}</td>
            <td class="text-right">${fmt(i.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No capitalized income</div>';
  } catch {
    ciEl.innerHTML = '<div class="empty-state-row text-muted">Capitalized income not enabled for this loan product</div>';
  }

  // Deferred income
  const diEl = wrap.querySelector('#ln-di-list');
  try {
    const r = await api.loans.deferredIncome(loanId);
    const list = Array.isArray(r) ? r : (r?.deferredIncomes || r?.pageItems || []);
    diEl.innerHTML = list.length ? `
      <table class="table table-compact">
        <thead><tr>
          <th>Date</th><th class="text-right">Amount</th>
          <th class="text-right">Recognised</th>
          <th class="text-right">Outstanding</th>
        </tr></thead>
        <tbody>${list.map(d => `
          <tr>
            <td>${fmtDate(d.date || d.transactionDate) || '—'}</td>
            <td class="text-right">${fmt(d.amount || 0)}</td>
            <td class="text-right">${fmt(d.recognisedAmount || 0)}</td>
            <td class="text-right">${fmt(d.outstandingAmount || 0)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No deferred income</div>';
  } catch { diEl.innerHTML = '<div class="empty-state-row text-muted">Deferred income not available</div>'; }
}
