/* FinCraft · pages/clients/detail/accounts.js — accounts, charges, transactions, and standing instructions tab loaders.
   Auto-split from the original monolithic pages/clients/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, fmtDate, sb } from '../../../utils.js';
import { openPayChargeModal } from '../actions.js';
import { can } from '../shared.js';

export async function loadClientAccounts(c, id) {
  const wrap = c.querySelector('#cl-accounts-wrap');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const acc = await api.clients.accounts(id);
    const loans   = acc?.loanAccounts            || [];
    const savings = acc?.savingsAccounts         || [];
    const fds     = acc?.fixedDepositAccounts    || [];
    const rds     = acc?.recurringDepositAccounts|| [];
    const shares  = acc?.shareAccounts           || [];

    const tableSection = (title, rows, mapper, cols) => `
      <h3 class="mt-3">${title}</h3>
      <table class="table"><thead><tr>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(mapper).join('') :
          `<tr><td colspan="${cols.length}" class="empty-state-row">No ${title.toLowerCase()}</td></tr>`}
        </tbody>
      </table>`;

    wrap.innerHTML = `
      ${tableSection('Loan Accounts', loans,
        l => `<tr>
          <td><a href="#" data-view-loan="${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td class="text-right">${fmt(l.loanBalance ?? l.originalLoan ?? 0)}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${tableSection('Savings Accounts', savings,
        s => `<tr>
          <td><a href="#" data-view-savings="${s.id}">${escapeHtml(s.accountNo || '')}</a></td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${fds.length ? tableSection('Fixed Deposits', fds,
        d => `<tr><td>${escapeHtml(d.accountNo || '')}</td><td>${escapeHtml(d.productName || '')}</td>
          <td class="text-right">${fmt(d.accountBalance ?? 0)}</td><td>${sb(d.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status']) : ''}
      ${rds.length ? tableSection('Recurring Deposits', rds,
        d => `<tr><td>${escapeHtml(d.accountNo || '')}</td><td>${escapeHtml(d.productName || '')}</td>
          <td class="text-right">${fmt(d.accountBalance ?? 0)}</td><td>${sb(d.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status']) : ''}
      ${shares.length ? tableSection('Share Accounts', shares,
        s => `<tr><td>${escapeHtml(s.accountNo || '')}</td><td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.totalApprovedShares ?? 0)}</td><td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Shares', 'Status']) : ''}`;
    wrap.querySelectorAll('[data-view-loan]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../../router.js').then(r => r.navigate('loans', { id: b.dataset.viewLoan }));
    }));
    wrap.querySelectorAll('[data-view-savings]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../../router.js').then(r => r.navigate('savings', { id: b.dataset.viewSavings }));
    }));
  } catch (e) {
    wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadClientCharges(c, id) {
  const wrap = c.querySelector('#cl-charges-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.charges(id);
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Charge</th><th>Due</th><th>Amount</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(ch => `
          <tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td>${fmtDate(ch.dueDate)}</td>
            <td class="text-right">${fmt(ch.amount ?? 0)}</td>
            <td class="text-right">${fmt(ch.amountOutstanding ?? 0)}</td>
            <td>${sb(ch.isPaid ? 'Paid' : ch.isWaived ? 'Waived' : 'Outstanding')}</td>
            <td class="text-right">
              ${!ch.isPaid && !ch.isWaived && can('PAY_CLIENTCHARGE')    ? `<button class="btn-mini btn-success" data-pay-charge="${ch.id}">Pay</button>` : ''}
              ${!ch.isPaid && !ch.isWaived && can('WAIVE_CLIENTCHARGE')  ? `<button class="btn-mini btn-warning" data-waive-charge="${ch.id}">Waive</button>` : ''}
              ${can('DELETE_CLIENTCHARGE') ? `<button class="btn-mini btn-danger" data-del-charge="${ch.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No charges applied</div>';

    wrap.querySelectorAll('[data-pay-charge]').forEach(b => b.addEventListener('click', () => openPayChargeModal(id, b.dataset.payCharge, () => loadClientCharges(c, id))));
    wrap.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Waive charge?', confirmText: 'Waive', danger: true })) return;
      try { await api.clients.waiveCharge(id, b.dataset.waiveCharge); toast('success', 'Charge waived', ''); loadClientCharges(c, id); }
      catch (e) { toast('error', 'Waive failed', e.detail?.defaultUserMessage || e.message); }
    }));
    wrap.querySelectorAll('[data-del-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete charge?', danger: true, confirmText: 'Delete' })) return;
      try { await api.clients.deleteCharge(id, b.dataset.delCharge); toast('success', 'Charge deleted', ''); loadClientCharges(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientTransactions(c, id) {
  const wrap = c.querySelector('#cl-tx-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.clients.transactions(id, { limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Amount</th><th>Reversed</th></tr></thead>
        <tbody>${list.map(tx => `
          <tr>
            <td>${tx.id}</td>
            <td>${fmtDate(tx.date)}</td>
            <td>${escapeHtml(tx.type?.value || '—')}</td>
            <td class="text-right">${fmt(tx.amount ?? 0)}</td>
            <td>${tx.reversed ? '<span class="badge b-warning">Reversed</span>' : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No transactions</div>';
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadClientStandingInstructions(c, id) {
  const wrap = c.querySelector('#cl-si-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const res = await api.standingInstructions.list({ clientId: id });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr><th>Name</th><th>From</th><th>To</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(si => `
          <tr>
            <td>${escapeHtml(si.name || '—')}</td>
            <td>${escapeHtml(si.fromAccount?.accountNo || '—')}</td>
            <td>${escapeHtml(si.toAccount?.accountNo || '—')}</td>
            <td class="text-right">${fmt(si.amount ?? 0)}</td>
            <td>${sb(si.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DELETE_STANDINGINSTRUCTION') ? `<button class="btn-mini btn-danger" data-del-si="${si.id}">Delete</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No standing instructions</div>';

    wrap.querySelectorAll('[data-del-si]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Delete standing instruction?', danger: true, confirmText: 'Delete' })) return;
      try { await api.standingInstructions.delete(b.dataset.delSi); toast('success', 'Deleted', ''); loadClientStandingInstructions(c, id); }
      catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
