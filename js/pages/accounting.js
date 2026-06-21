/* FinCraft · accounting.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

const TABS = ['Chart of Accounts','Journal Entries','Accounting Rules','GL Closure','Provisioning','Financial Activities'];

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Accounting</h1><div class="page-subtitle">GL, journal entries, closures, rules</div></div>
    </div>
    <div class="card">
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="acc-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div id="acc-${i}" class="tab-panel ${i === 0 ? 'active' : ''}"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>`).join('')}
    </div>
  </div>`;

  // Chart of Accounts
  try {
    const gl = await api.glAccounts.list();
    const accounts = Array.isArray(gl) ? gl : [];
    const grouped = accounts.reduce((acc, a) => { (acc[a.type] ||= []).push(a); return acc; }, {});
    c.querySelector('#acc-0').innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${accounts.length} accounts</span>
        <button class="btn-primary" data-modal="glAccountModal"><i class="fa-solid fa-plus"></i> Add GL Account</button>
      </div>
      ${Object.entries(grouped).map(([type, list]) => `
        <div class="card-header"><h3 class="card-title">${escapeHtml(type)} <span class="badge">${list.length}</span></h3></div>
        <div class="tbl-wrap mb-4"><table class="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Usage</th><th>Manual?</th></tr></thead>
          <tbody>${list.map(a => `<tr>
            <td class="mono">${escapeHtml(a.glCode)}</td>
            <td>${escapeHtml(a.name)}</td>
            <td>${escapeHtml(a.usage?.value || 'DETAIL')}</td>
            <td>${a.manualEntriesAllowed ? '<span class="badge b-success">Yes</span>' : '<span class="badge">No</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`).join('')}`;
  } catch (e) {
    c.querySelector('#acc-0').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div>
      <button class="btn-primary mt-4" data-modal="glAccountModal"><i class="fa-solid fa-plus"></i> Add GL Account</button></div>`;
  }

  // Journal Entries
  try {
    const res = await api.journalEntries.list({ limit: 50 });
    const entries = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#acc-1').innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${entries.length} recent entries</span>
        <button class="btn-primary" data-modal="journalEntryModal"><i class="fa-solid fa-plus"></i> New Entry</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Tx ID</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Reference</th></tr></thead>
        <tbody>${entries.length
          ? entries.map(je => `<tr>
              <td>${fmtDate(je.transactionDate)}</td>
              <td class="mono">${escapeHtml(je.transactionId || `#${je.id}`)}</td>
              <td>${escapeHtml(je.glAccount?.name || '—')}</td>
              <td><span class="badge b-teal">${escapeHtml(je.type?.value || '—')}</span></td>
              <td class="mono">${je.type?.value === 'DEBIT' ? fmt(je.amount) : '—'}</td>
              <td class="mono">${je.type?.value === 'CREDIT' ? fmt(je.amount) : '—'}</td>
              <td class="text-muted">${escapeHtml(je.comments || '—')}</td></tr>`).join('')
          : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-book"></i><div>No journal entries</div></div></td></tr>'
        }</tbody>
      </table></div>`;
  } catch (e) {
    c.querySelector('#acc-1').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div>
      <button class="btn-primary mt-4" data-modal="journalEntryModal"><i class="fa-solid fa-plus"></i> New Entry</button></div>`;
  }

  // Accounting Rules
  try {
    const rules = await api.accountingRules.list();
    const list = Array.isArray(rules) ? rules : [];
    c.querySelector('#acc-2').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${list.length} rules</span><button class="btn-primary" id="acc-rule-new"><i class="fa-solid fa-plus"></i> Add Rule</button></div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Office</th><th>Debit Account</th><th>Credit Account</th></tr></thead>
            <tbody>${list.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.officeName || 'All')}</td><td>${escapeHtml(r.debitAccounts?.[0]?.name || '—')}</td><td>${escapeHtml(r.creditAccounts?.[0]?.name || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No accounting rules</div></div>'}`;
    c.querySelector('#acc-rule-new')?.addEventListener('click', () => toast('info', 'Builder not built yet', 'Accounting rule creation needs a debit/credit account-tag mapping form — planned as its own task.'));
  } catch (e) {
    c.querySelector('#acc-2').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Offices — needed because /glclosures requires an officeId (confirmed against Fineract's
  // GLClosuresApiResource — it's a required @QueryParam, not optional)
  const officesRes = await api.offices.list().catch(() => []);
  const officeList = Array.isArray(officesRes) ? officesRes : [];
  const headOffice = officeList.find(o => o.hierarchy === '.') || officeList[0];

  // GL Closure
  try {
    const closures = headOffice ? await api.glClosures.list({ officeId: headOffice.id }) : [];
    const list = Array.isArray(closures) ? closures : [];
    const officeOptions = officeList.map(o => `<option value="${o.id}" ${o.id === headOffice?.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');
    c.querySelector('#acc-3').innerHTML = `
      <div class="flex justify-between mb-4 items-center">
        <span class="text-muted">${list.length} closures · ${escapeHtml(headOffice?.name || '—')}</span>
        <div class="flex gap-2 items-center">
          <select class="form-control" id="gl-close-office" style="width:200px">${officeOptions}</select>
          <button class="btn-primary" id="gl-close-btn"><i class="fa-solid fa-lock"></i> New GL Closure</button>
        </div>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Closing Date</th><th>Office</th><th>Comments</th></tr></thead>
            <tbody>${list.map(cl => `<tr><td>${fmtDate(cl.closingDate)}</td><td>${escapeHtml(cl.officeName || 'All')}</td><td>${escapeHtml(cl.comments || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-lock-open"></i><div>No GL closures</div></div>'}`;
    c.querySelector('#gl-close-btn')?.addEventListener('click', async () => {
      const today = new Date().toISOString().split('T')[0];
      const officeId = parseInt(c.querySelector('#gl-close-office')?.value) || headOffice?.id;
      if (!officeId) { toast('warn', 'No office', 'No office available to close'); return; }
      if (!confirm(`Close the accounting period for ${officeList.find(o=>o.id===officeId)?.name || `office #${officeId}`} as of ${today}? This cannot be easily undone.`)) return;
      try {
        await api.glClosures.create({ closingDate: today, officeId, comments: 'Manual closure', dateFormat: 'yyyy-MM-dd', locale: 'en' });
        toast('success', 'GL period closed', today); render(c);
      } catch (e) { toast('error', 'GL closure failed', e.message); }
    });
  } catch (e) {
    c.querySelector('#acc-3').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Provisioning — real data, was previously a permanent static stub despite api.provisioning existing
  try {
    const criteria = await api.provisioning.criteria();
    const list = Array.isArray(criteria) ? criteria : [];
    c.querySelector('#acc-4').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${list.length} provisioning criteria</span>
        <button class="btn-primary" id="prov-new"><i class="fa-solid fa-plus"></i> New Criteria</button></div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Criteria Name</th><th>Created By</th></tr></thead>
            <tbody>${list.map(p => `<tr><td>${escapeHtml(p.criteriaName || p.name || '—')}</td><td>${escapeHtml(p.createdBy || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No provisioning criteria configured</div></div>'}`;
    c.querySelector('#prov-new')?.addEventListener('click', () => toast('info', 'Builder not built yet', 'Provisioning criteria need a category/age-bracket mapping form — planned as its own task.'));
  } catch (e) {
    c.querySelector('#acc-4').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }

  // Financial Activity Accounts — real data, same situation as Provisioning above
  try {
    const fa = await api.financialActivityAccounts.list();
    const list = Array.isArray(fa) ? fa : [];
    c.querySelector('#acc-5').innerHTML = `
      <div class="flex justify-between mb-4"><span class="text-muted">${list.length} mappings</span>
        <button class="btn-primary" id="fa-new"><i class="fa-solid fa-plus"></i> Add Mapping</button></div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Financial Activity</th><th>GL Account</th></tr></thead>
            <tbody>${list.map(f => `<tr><td>${escapeHtml(f.financialActivityData?.name || f.financialActivityId || '—')}</td><td>${escapeHtml(f.glAccountData?.name || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No financial activity mappings configured</div></div>'}`;
    c.querySelector('#fa-new')?.addEventListener('click', () => toast('info', 'Builder not built yet', 'Financial activity → GL account mapping needs its own form — planned as its own task.'));
  } catch (e) {
    c.querySelector('#acc-5').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}
