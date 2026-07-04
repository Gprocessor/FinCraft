/* FinCraft · pages/groups/detail/members.js — members and accounts tab loaders.
   Auto-split from the original monolithic pages/groups/detail.js for maintainability. */

import { api } from '../../../api.js';
import { confirm, toast } from '../../../ui.js';
import { escapeHtml, fmt, ini, sb } from '../../../utils.js';
import { can } from '../shared.js';

export async function loadMembers(c, id, group) {
  const wrap = c.querySelector('#grp-members-list');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const fresh = await api.groups.get(id, { associations: 'clientMembers' });
    const list = fresh.clientMembers || [];
    wrap.innerHTML = list.length ? `
      <table class="table">
        <thead><tr>
          <th><input type="checkbox" id="mem-all"/></th>
          <th>Name</th><th>Account</th><th>Office</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${list.map(m => `
          <tr>
            <td><input type="checkbox" class="mem-chk" value="${m.id}"/></td>
            <td>
              <div class="user-cell">
                <div class="avatar">${ini(m.displayName)}</div>
                <a href="#" data-view-client="${m.id}">${escapeHtml(m.displayName || '—')}</a>
              </div>
            </td>
            <td>${escapeHtml(m.accountNo || '')}</td>
            <td>${escapeHtml(m.officeName || '—')}</td>
            <td>${sb(m.status?.value || '—')}</td>
            <td class="text-right">
              ${can('DISASSOCIATECLIENTS_GROUP') ?
                `<button class="btn-mini btn-danger" data-remove-member="${m.id}">Remove</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state-row">No members in this group</div>';

    wrap.querySelector('#mem-all')?.addEventListener('change', (e) => {
      wrap.querySelectorAll('.mem-chk').forEach(cb => cb.checked = e.target.checked);
    });
    wrap.querySelectorAll('[data-view-client]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../../router.js').then(r => r.navigate('client-detail', { id: b.dataset.viewClient }));
    }));
    wrap.querySelectorAll('[data-remove-member]').forEach(b => b.addEventListener('click', async () => {
      if (!await confirm({ title: 'Remove member?', message: 'Disassociate this client from the group?', danger: true, confirmText: 'Remove' })) return;
      try {
        await api.groups.disassociateClients(id, { clientMembers: [parseInt(b.dataset.removeMember)] });
        toast('success', 'Member removed', '');
        loadMembers(c, id, group);
      } catch (e) { toast('error', 'Remove failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}

export async function loadAccounts(c, id) {
  const wrap = c.querySelector('#grp-accounts-wrap');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';
  try {
    const acc = await api.groups.accounts(id);
    const loans   = acc?.loanAccounts || [];
    const savings = acc?.savingsAccounts || [];
    const memberLoans   = acc?.memberLoanAccounts || [];
    const memberSavings = acc?.memberSavingsAccounts || [];

    const sect = (title, rows, mapper, cols) => `
      <h3 class="mt-3">${title}</h3>
      <table class="table"><thead><tr>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(mapper).join('') :
          `<tr><td colspan="${cols.length}" class="empty-state-row">No ${title.toLowerCase()}</td></tr>`}
        </tbody></table>`;

    wrap.innerHTML = `
      ${sect('Group Loan Accounts', loans,
        l => `<tr>
          <td><a href="#" data-view-loan="${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td class="text-right">${fmt(l.loanBalance ?? 0)}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${sect('Group Savings Accounts', savings,
        s => `<tr>
          <td>${escapeHtml(s.accountNo || '')}</td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td class="text-right">${fmt(s.accountBalance ?? 0)}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Product', 'Balance', 'Status'])}
      ${memberLoans.length ? sect('Member Loans', memberLoans,
        l => `<tr>
          <td><a href="#" data-view-loan="${l.id}">${escapeHtml(l.accountNo || '')}</a></td>
          <td>${escapeHtml(l.clientName || '')}</td>
          <td>${escapeHtml(l.productName || '')}</td>
          <td>${sb(l.status?.value || '—')}</td></tr>`,
        ['Account', 'Client', 'Product', 'Status']) : ''}
      ${memberSavings.length ? sect('Member Savings', memberSavings,
        s => `<tr>
          <td>${escapeHtml(s.accountNo || '')}</td>
          <td>${escapeHtml(s.clientName || '')}</td>
          <td>${escapeHtml(s.productName || '')}</td>
          <td>${sb(s.status?.value || '—')}</td></tr>`,
        ['Account', 'Client', 'Product', 'Status']) : ''}`;
    wrap.querySelectorAll('[data-view-loan]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      import('../../../router.js').then(r => r.navigate('loans', { id: b.dataset.viewLoan }));
    }));
  } catch (e) { wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; }
}
