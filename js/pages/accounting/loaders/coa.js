/* FinCraft · pages/accounting/loaders/coa.js — chart of accounts, journal entries, and frequent postings tab loaders.
   Auto-split from the original monolithic pages/accounting/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { escapeHtml, fmt, fmtDate } from '../../../utils.js';
import { openFrequentPostingModal, openGLAccountModal, openJournalEntryDetailModal, openJournalEntryModal, openReverseJEModal } from '../actions.js';
import { can, populateJEFilters, resetGlCache } from '../shared.js';

export async function loadChartOfAccounts(c) {
  const el = c.querySelector('#acc-0');
  try {
    const gl = await api.glAccounts.list();
    const accounts = Array.isArray(gl) ? gl : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Chart of Accounts</h3>
          <span class="text-muted">${accounts.length} accounts</span>
        </div>
        <div>
          <div class="btn-group" style="display:inline-flex; margin-right:8px">
            <button class="btn-secondary btn-sm active" id="coa-view-grouped">Grouped</button>
            <button class="btn-secondary btn-sm" id="coa-view-tree">Tree</button>
          </div>
          ${can('CREATE_GLACCOUNT') ? `<button class="btn-primary" id="btn-add-gl"><i class="fa-solid fa-plus"></i> Add GL Account</button>` : ''}
        </div>
      </div>
      <div id="coa-content"></div>`;

    el.querySelector('#btn-add-gl')?.addEventListener('click', () =>
      openGLAccountModal(() => { resetGlCache(); loadChartOfAccounts(c); }));

    const renderGrouped = () => {
      const grouped = accounts.reduce((acc, a) => {
        (acc[a.type?.value || a.type || 'Other'] ||= []).push(a);
        return acc;
      }, {});
      el.querySelector('#coa-content').innerHTML = Object.entries(grouped).map(([type, list]) => `
        <h4 class="mt-3">${escapeHtml(type)} <span class="text-muted">${list.length}</span></h4>
        <table class="table">
          <thead><tr>
            <th>Code</th><th>Name</th><th>Parent</th><th>Usage</th><th>Manual?</th>
          </tr></thead>
          <tbody>${list.map(a => `
            <tr>
              <td>${escapeHtml(a.glCode || '—')}</td>
              <td>${escapeHtml(a.name || '—')}</td>
              <td>${escapeHtml(a.nameDecorated?.split('.').slice(0, -1).join('.') || '—')}</td>
              <td>${escapeHtml(a.usage?.value || 'DETAIL')}</td>
              <td>${a.manualEntriesAllowed ? 'Yes' : 'No'}</td>
            </tr>`).join('')}</tbody>
        </table>`).join('');
    };

    const renderTree = () => {
      const byParent = {};
      accounts.forEach(a => {
        const p = a.parentId || 'root';
        (byParent[p] ||= []).push(a);
      });

      const treeNode = (a, depth = 0) => {
        const children = byParent[a.id] || [];
        const indent = '&nbsp;'.repeat(depth * 4);
        const icon = children.length
          ? '<i class="fa-solid fa-folder-open"></i>'
          : '<i class="fa-regular fa-circle"></i>';
        return `
          <tr>
            <td>${indent}${icon} ${escapeHtml(a.glCode || '—')}</td>
            <td>${escapeHtml(a.name || '—')}</td>
            <td>${escapeHtml(a.type?.value || '—')}</td>
            <td>${escapeHtml(a.usage?.value || '—')}</td>
          </tr>
          ${children.map(child => treeNode(child, depth + 1)).join('')}`;
      };

      const roots = byParent['root'] || accounts.filter(a => !a.parentId);
      el.querySelector('#coa-content').innerHTML = `
        <table class="table">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Usage</th></tr></thead>
          <tbody>${roots.map(a => treeNode(a)).join('')}</tbody>
        </table>`;
    };

    el.querySelector('#coa-view-grouped').addEventListener('click', () => {
      el.querySelector('#coa-view-grouped').classList.add('active');
      el.querySelector('#coa-view-tree').classList.remove('active');
      renderGrouped();
    });
    el.querySelector('#coa-view-tree').addEventListener('click', () => {
      el.querySelector('#coa-view-tree').classList.add('active');
      el.querySelector('#coa-view-grouped').classList.remove('active');
      renderTree();
    });

    renderGrouped();
  } catch (e) {
    el.innerHTML = `
      <div class="text-error">${escapeHtml(e.message)}</div>
      ${can('CREATE_GLACCOUNT') ? `<button class="btn-primary mt-2" id="btn-add-gl-err"><i class="fa-solid fa-plus"></i> Add GL Account</button>` : ''}`;
    el.querySelector('#btn-add-gl-err')?.addEventListener('click', () =>
      openGLAccountModal(() => { resetGlCache(); loadChartOfAccounts(c); }));
  }
}

export async function loadJournalEntries(c, params = {}) {
  const el = c.querySelector('#acc-1');

  if (!el.querySelector('#je-filter-bar')) {
    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Journal Entries</h3>
        ${can('CREATE_JOURNALENTRY') ? `<button class="btn-primary" id="btn-new-je"><i class="fa-solid fa-plus"></i> New Entry</button>` : ''}
      </div>
   <div class="filter-bar mb-2" id="je-filter-bar">
  <select id="je-f-set" class="form-control" style="min-width:170px">
    <option value="">All entries</option>
    <option value="provisioning">Provisioning entries</option>
    <option value="openingbalance">Opening balance entries</option>
  </select>
  <select id="je-f-office" class="form-control" style="min-width:180px">
    <option value="">All offices</option>
  </select>
  <select id="je-f-glacct" class="form-control" style="min-width:240px">
    <option value="">All GL accounts</option>
  </select>
  <input id="je-f-txid" class="form-control" placeholder="Transaction ID" style="min-width:140px"/>
  <input id="je-f-from" class="form-control" type="date" title="From date" style="min-width:140px"/>
  <input id="je-f-to" class="form-control" type="date" title="To date" style="min-width:140px"/>
  <button class="btn-secondary" id="je-filter-go"><i class="fa-solid fa-filter"></i> Filter</button>
  <button class="btn-ghost" id="je-filter-clear" title="Clear filters"><i class="fa-solid fa-xmark"></i></button>
</div>
      <div id="je-table-wrap"><div class="empty-state-row">Loading…</div></div>`;

   el.querySelector('#je-filter-go').addEventListener('click', () => {
  const p = {};
  const entrySet = el.querySelector('#je-f-set').value;
  const offId = el.querySelector('#je-f-office').value.trim();
  const glId  = el.querySelector('#je-f-glacct').value.trim();
  const txId  = el.querySelector('#je-f-txid').value.trim();
  const from  = el.querySelector('#je-f-from').value;
  const to    = el.querySelector('#je-f-to').value;
  if (offId) p.officeId      = offId;
  if (glId)  p.glAccountId   = glId;
  if (txId)  p.transactionId = txId;
  if (from)  p.fromDate      = from;
  if (to)    p.toDate        = to;
  if (from || to) { p.dateFormat = DATE_FORMAT; p.locale = LOCALE; }
  if (entrySet) p.__entrySet = entrySet;
  loadJournalEntries(c, p);
});

// Populate filter dropdowns with real offices + GL accounts
populateJEFilters(el);

// Clear filter button
el.querySelector('#je-filter-clear')?.addEventListener('click', () => {
  el.querySelector('#je-f-set').value    = '';
  el.querySelector('#je-f-office').value = '';
  el.querySelector('#je-f-glacct').value = '';
  el.querySelector('#je-f-txid').value   = '';
  el.querySelector('#je-f-from').value   = '';
  el.querySelector('#je-f-to').value     = '';
  loadJournalEntries(c);
});

el.querySelector('#btn-new-je')?.addEventListener('click', () =>
  openJournalEntryModal(() => loadJournalEntries(c)));
}

  const wrap = el.querySelector('#je-table-wrap');
  wrap.innerHTML = '<div class="empty-state-row">Loading…</div>';

  try {
    const queryParams = { limit: 50 };
    Object.assign(queryParams, params);
    const entrySet = queryParams.__entrySet; delete queryParams.__entrySet;
    const res = entrySet === 'provisioning'   ? await api.journalEntries.provisioning(queryParams)
              : entrySet === 'openingbalance' ? await api.journalEntries.openingBalances(queryParams)
              : await api.journalEntries.list(queryParams);
    const entries = Array.isArray(res) ? res : (res?.pageItems || []);

    wrap.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Date</th><th>Tx ID</th><th>Account</th><th>Type</th>
          <th class="text-right">Debit</th><th class="text-right">Credit</th>
          <th>Reference</th><th></th>
        </tr></thead>
        <tbody>${entries.length ? entries.map(je => `
          <tr>
            <td>${fmtDate(je.transactionDate) || '—'}</td>
            <td>${escapeHtml(je.transactionId || ('#' + je.id))}</td>
            <td>${escapeHtml(je.glAccount?.name || '—')}</td>
            <td>${escapeHtml(je.type?.value || '—')}</td>
            <td class="text-right">${je.type?.value === 'DEBIT'  ? fmt(je.amount) : '—'}</td>
            <td class="text-right">${je.type?.value === 'CREDIT' ? fmt(je.amount) : '—'}</td>
            <td>${escapeHtml(je.comments || '—')}</td>
            <td class="text-right">
              <button class="btn-mini" data-view-je="${je.id}">View</button>
              ${je.reversed
                ? '<span class="badge b-warning">Reversed</span>'
                : (can('REVERSE_JOURNALENTRY')
                    ? `<button class="btn-mini btn-warning" data-reverse-je="${je.transactionId || je.id}">Reverse</button>`
                    : '')}
            </td>
          </tr>`).join('') : '<tr><td colspan="8" class="empty-state-row">No journal entries match</td></tr>'}
        </tbody>
      </table>`;

    wrap.querySelectorAll('[data-view-je]').forEach(b => b.addEventListener('click', () =>
      openJournalEntryDetailModal(b.dataset.viewJe)));
    wrap.querySelectorAll('[data-reverse-je]').forEach(b => b.addEventListener('click', () =>
      openReverseJEModal(b.dataset.reverseJe, () => loadJournalEntries(c))));
  } catch (e) {
    wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

export async function loadFrequentPostings(c) {
  const el = c.querySelector('#acc-2');
  try {
    const rules = await api.accountingRules.list();
    const list = Array.isArray(rules) ? rules : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Frequent Postings</h3>
        <span class="text-muted">${list.length} accounting rule${list.length !== 1 ? 's' : ''} available</span>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Pick a pre-defined accounting rule to post a journal entry without re-entering debits and credits.
        Rules are managed under the <b>Accounting Rules</b> tab.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Rule</th><th>Office</th>
            <th>Debit Account</th><th>Credit Account</th>
            <th></th>
          </tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td><b>${escapeHtml(r.name || '—')}</b><div class="text-muted small">${escapeHtml(r.description || '')}</div></td>
              <td>${escapeHtml(r.officeName || 'All offices')}</td>
              <td>${(r.debitAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td>${(r.creditAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td class="text-right">
                ${can('CREATE_JOURNALENTRY')
                  ? `<button class="btn-primary btn-sm" data-fp-rule="${r.id}"><i class="fa-solid fa-plus"></i> Post</button>`
                  : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-receipt"></i>
          <h3>No accounting rules defined</h3>
          <div class="text-muted">Create accounting rules under the <b>Accounting Rules</b> tab to enable frequent postings.</div>
        </div>`}`;

    el.querySelectorAll('[data-fp-rule]').forEach(b => b.addEventListener('click', () =>
      openFrequentPostingModal(b.dataset.fpRule, list.find(r => String(r.id) === b.dataset.fpRule), () => loadFrequentPostings(c))));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}
