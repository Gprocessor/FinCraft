import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · accounting.js — Full accounting (Phase 5) */
import { api } from '../api.js';
import { fmt, escapeHtml, fmtDate } from '../utils.js';
import { toast } from '../ui.js';

const TABS = ['Chart of Accounts','Journal Entries','Accounting Rules','Opening Balances','Run Accruals','GL Closure','Provisioning','Financial Activities'];

// ── GL account option cache ──────────────────────────────────
let _glCache = null;
async function glList() {
  if (!_glCache) {
    try { const r = await api.glAccounts.list(); _glCache = Array.isArray(r) ? r : []; }
    catch { _glCache = []; }
  }
  return _glCache;
}
async function glOpts() {
  return (await glList()).map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
}
function glSel(elId, label, req=false) {
  return `<label class="full"><span class="form-label">${label}${req?' *':''}</span>
    <select id="${elId}" class="form-control"${req?' required':''}><option value="">— Select —</option></select></label>`;
}
async function fillGl(el) {
  const opts = await glOpts();
  el.querySelectorAll('select[id^="gl-"]').forEach(s => { s.innerHTML = `<option value="">— Select —</option>${opts}`; });
}

function dynModal(mid, title, body, wide=false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal${wide?' xl':' lg'}">
        <div class="modal-head"><h3 class="modal-title">${title}</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save"><i class="fa-solid fa-check"></i> Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  return el;
}

// ── helpers ──────────────────────────────────────────────────
const v  = (el, id) => el.querySelector(`#${id}`)?.value?.trim() || '';
const vi = (el, id) => { const n = parseInt(v(el,id)); return isNaN(n) ? null : n; };
const vf = (el, id) => { const n = parseFloat(v(el,id)); return isNaN(n) ? null : n; };

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
export async function render(c) {
  _glCache = null; // reset cache on each page load
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Accounting</h1><div class="page-subtitle">GL, journals, rules, closures, provisioning, accruals</div></div>
    </div>
    <div class="card">
      <div class="tabs" style="flex-wrap:wrap">${TABS.map((t,i) =>
        `<button class="tab${i===0?' active':''}" data-tab="acc-${i}">${t}</button>`).join('')}</div>
      ${TABS.map((_,i) =>
        `<div id="acc-${i}" class="tab-panel${i===0?' active':''}">
          <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
        </div>`).join('')}
    </div>
  </div>`;

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
  }));

  loadChartOfAccounts(c);
  loadJournalEntries(c);
  loadAccountingRules(c);
  loadOpeningBalances(c);
  loadRunAccruals(c);
  loadGLClosure(c);
  loadProvisioning(c);
  loadFinancialActivities(c);
}

// ════════════════════════════════════════════════════════════
// TAB 0 — CHART OF ACCOUNTS
// ════════════════════════════════════════════════════════════
async function loadChartOfAccounts(c) {
  const el = c.querySelector('#acc-0');
  try {
    const gl       = await api.glAccounts.list();
    const accounts = Array.isArray(gl) ? gl : [];
    const grouped  = accounts.reduce((acc, a) => { (acc[a.type?.value||a.type||'Other'] ||= []).push(a); return acc; }, {});
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${accounts.length} accounts</span>
        <button class="btn-primary btn-sm" id="btn-add-gl"><i class="fa-solid fa-plus"></i> Add GL Account</button>
      </div>
      ${Object.entries(grouped).map(([type, list]) => `
        <div style="margin-bottom:1.5rem">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:8px">${escapeHtml(type)} <span class="badge">${list.length}</span></h4>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Code</th><th>Name</th><th>Parent</th><th>Usage</th><th>Manual?</th></tr></thead>
            <tbody>${list.map(a => `<tr>
              <td class="mono">${escapeHtml(a.glCode||'—')}</td>
              <td>${escapeHtml(a.name||'—')}</td>
              <td class="text-muted">${escapeHtml(a.nameDecorated?.split('.').slice(0,-1).join('.')||'—')}</td>
              <td>${escapeHtml(a.usage?.value||'DETAIL')}</td>
              <td>${a.manualEntriesAllowed?'<span class="badge b-success">Yes</span>':'<span class="badge">No</span>'}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>`).join('')}`;
    el.querySelector('#btn-add-gl').addEventListener('click', () => openGLAccountModal(() => { _glCache=null; loadChartOfAccounts(c); }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div>
      <button class="btn-primary mt-4" id="btn-add-gl-err"><i class="fa-solid fa-plus"></i> Add GL Account</button></div>`;
    el.querySelector('#btn-add-gl-err')?.addEventListener('click', () => openGLAccountModal(() => { _glCache=null; loadChartOfAccounts(c); }));
  }
}

// ════════════════════════════════════════════════════════════
// TAB 1 — JOURNAL ENTRIES
// ════════════════════════════════════════════════════════════
async function loadJournalEntries(c) {
  const el = c.querySelector('#acc-1');
  try {
    const res     = await api.journalEntries.list({ limit: 50 });
    const entries = Array.isArray(res) ? res : (res?.pageItems || []);
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${entries.length} recent entries</span>
        <button class="btn-primary btn-sm" id="btn-new-je"><i class="fa-solid fa-plus"></i> New Entry</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Tx ID</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Reference</th></tr></thead>
        <tbody>${entries.length
          ? entries.map(je => `<tr>
              <td>${fmtDate(je.transactionDate)||'—'}</td>
              <td class="mono">${escapeHtml(je.transactionId||`#${je.id}`)}</td>
              <td>${escapeHtml(je.glAccount?.name||'—')}</td>
              <td><span class="badge b-teal">${escapeHtml(je.type?.value||'—')}</span></td>
              <td class="mono">${je.type?.value==='DEBIT'?fmt(je.amount):'—'}</td>
              <td class="mono">${je.type?.value==='CREDIT'?fmt(je.amount):'—'}</td>
              <td class="text-muted">${escapeHtml(je.comments||'—')}</td>
            </tr>`).join('')
          : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-book"></i><div>No journal entries</div></div></td></tr>'
        }</tbody>
      </table></div>`;
    el.querySelector('#btn-new-je').addEventListener('click', () => openJournalEntryModal(() => loadJournalEntries(c)));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div>
      <button class="btn-primary mt-4" id="btn-new-je-err"><i class="fa-solid fa-plus"></i> New Entry</button></div>`;
    el.querySelector('#btn-new-je-err')?.addEventListener('click', () => openJournalEntryModal(() => loadJournalEntries(c)));
  }
}

// ════════════════════════════════════════════════════════════
// TAB 2 — ACCOUNTING RULES (P5-1 — was placeholder)
// ════════════════════════════════════════════════════════════
async function loadAccountingRules(c) {
  const el = c.querySelector('#acc-2');
  try {
    const rules = await api.accountingRules.list();
    const list  = Array.isArray(rules) ? rules : [];
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} rule${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-new-rule"><i class="fa-solid fa-plus"></i> Add Rule</button>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th>Office</th><th>Debit Tags / Accounts</th><th>Credit Tags / Accounts</th><th></th></tr></thead>
            <tbody>${list.map(r => `<tr>
              <td>${escapeHtml(r.name||'—')}</td>
              <td>${escapeHtml(r.officeName||'All')}</td>
              <td>${(r.debitAccounts||[]).map(a=>escapeHtml(a.name||a.glCode||'—')).join(', ')||'—'}</td>
              <td>${(r.creditAccounts||[]).map(a=>escapeHtml(a.name||a.glCode||'—')).join(', ')||'—'}</td>
              <td><button class="btn-ghost btn-sm" data-del-rule="${r.id}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No accounting rules</div></div>'}`;
    el.querySelector('#btn-new-rule').addEventListener('click', () => openAccountingRuleModal(() => loadAccountingRules(c)));
    el.querySelectorAll('[data-del-rule]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this accounting rule?')) return;
      try { await api.accountingRules.delete(b.dataset.delRule); toast('success','Rule deleted',''); loadAccountingRules(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 3 — OPENING BALANCES (P5-2 — new)
// ════════════════════════════════════════════════════════════
async function loadOpeningBalances(c) {
  const el = c.querySelector('#acc-3');
  try {
    const officesRes = await api.offices.list().catch(() => []);
    const offices    = Array.isArray(officesRes) ? officesRes : [];
    const glAccounts = await glList();
    el.innerHTML = `
      <div class="mb-4">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:4px">Define Opening Balances</h3>
        <p class="text-muted" style="font-size:13px">Set initial GL balances for a new office or accounting period start.</p>
      </div>
      <div class="form-grid">
        <label><span class="form-label">Office *</span>
          <select id="ob-office" class="form-control" required>
            <option value="">Select office…</option>
            ${offices.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          </select></label>
        <label><span class="form-label">Transaction date *</span>
          <input type="date" id="ob-date" class="form-control" value="${today()}" required/></label>
        <label><span class="form-label">Comments</span>
          <input id="ob-comments" class="form-control" placeholder="Optional note"/></label>
      </div>
      <div style="margin:16px 0 8px;font-size:13px;font-weight:600">Credit accounts (balances to set)</div>
      <div id="ob-credits">
        ${openingBalanceRow(glAccounts,'c',0)}
      </div>
      <button class="btn-ghost btn-sm" id="ob-add-credit"><i class="fa-solid fa-plus"></i> Add credit row</button>
      <div style="margin:16px 0 8px;font-size:13px;font-weight:600">Debit accounts</div>
      <div id="ob-debits">
        ${openingBalanceRow(glAccounts,'d',0)}
      </div>
      <button class="btn-ghost btn-sm" id="ob-add-debit"><i class="fa-solid fa-plus"></i> Add debit row</button>
      <div class="flex justify-end mt-4">
        <button class="btn-primary" id="ob-submit"><i class="fa-solid fa-check"></i> Submit Opening Balances</button>
      </div>`;

    let cIdx = 1, dIdx = 1;
    el.querySelector('#ob-add-credit').addEventListener('click', () => {
      el.querySelector('#ob-credits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts,'c',cIdx++));
    });
    el.querySelector('#ob-add-debit').addEventListener('click', () => {
      el.querySelector('#ob-debits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts,'d',dIdx++));
    });
    el.querySelector('#ob-submit').addEventListener('click', () => submitOpeningBalances(el));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function openingBalanceRow(accounts, prefix, idx) {
  const opts = accounts.map(g=>`<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  return `<div class="flex gap-2 mb-2 ob-row" data-prefix="${prefix}" data-idx="${idx}">
    <select class="form-control" name="ob_gl_${prefix}_${idx}" style="flex:2">
      <option value="">— GL Account —</option>${opts}
    </select>
    <input type="number" class="form-control" name="ob_amt_${prefix}_${idx}" min="0" step="0.01" placeholder="Amount" style="flex:1"/>
    <button type="button" class="btn-ghost btn-sm ob-remove-row"><i class="fa-solid fa-trash"></i></button>
  </div>`;
}

async function submitOpeningBalances(el) {
  const officeId = parseInt(el.querySelector('#ob-office')?.value);
  const transactionDate = el.querySelector('#ob-date')?.value;
  const comments = el.querySelector('#ob-comments')?.value?.trim();
  if (!officeId || !transactionDate) { toast('warn','Select office and date',''); return; }

  const credits = [], debits = [];
  el.querySelectorAll('.ob-row').forEach(row => {
    const prefix = row.dataset.prefix;
    const idx    = row.dataset.idx;
    const glId   = parseInt(row.querySelector(`[name="ob_gl_${prefix}_${idx}"]`)?.value);
    const amount = parseFloat(row.querySelector(`[name="ob_amt_${prefix}_${idx}"]`)?.value);
    if (glId && !isNaN(amount) && amount > 0) {
      (prefix==='c' ? credits : debits).push({ glAccountId: glId, amount });
    }
  });
  if (!credits.length && !debits.length) { toast('warn','Add at least one balance entry',''); return; }

  try {
    await api.openingBalances.define(officeId, {
      officeId, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
      credits, debits, ...(comments && { comments })
    });
    toast('success','Opening balances submitted',`${credits.length} credits, ${debits.length} debits`);
  } catch (e) { toast('error','Submission failed',e.message); }
}

// ════════════════════════════════════════════════════════════
// TAB 4 — RUN ACCRUALS (P5-3 — new)
// ════════════════════════════════════════════════════════════
async function loadRunAccruals(c) {
  const el = c.querySelector('#acc-4');
  try {
    const entries = await api.provisioning.entries().catch(() => []);
    const recent  = Array.isArray(entries) ? entries.slice(0,5) : [];
    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title mb-4">Run Accruals</h3>
          <p class="text-muted mb-4" style="font-size:13px">Post periodic accruals up to a given date for all active loans. This applies to products configured with Accrual accounting.</p>
          <div class="form-grid">
            <label class="full"><span class="form-label">Till date *</span>
              <input type="date" id="acc-till" class="form-control" value="${today()}" required/></label>
          </div>
          <div class="flex gap-2 mt-4">
            <button class="btn-primary" id="btn-run-accruals"><i class="fa-solid fa-calculator"></i> Run Accruals</button>
          </div>
          <div id="acc-run-result" class="mt-4"></div>
        </div>
        <div class="card">
          <h3 class="card-title mb-4">Recent Provisioning Entries</h3>
          ${recent.length
            ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Status</th></tr></thead>
                <tbody>${recent.map(e=>`<tr><td>${fmtDate(e.createdDate)||'—'}</td><td>${escapeHtml(e.provisioningEntryAmount!=null?fmt(e.provisioningEntryAmount):'—')}</td></tr>`).join('')}</tbody>
              </table></div>`
            : '<div class="empty-state"><i class="fa-solid fa-file-invoice"></i><div>No provisioning entries yet</div></div>'}
        </div>
      </div>`;
    el.querySelector('#btn-run-accruals').addEventListener('click', async () => {
      const tillDate = el.querySelector('#acc-till').value;
      if (!tillDate) { toast('warn','Select a date',''); return; }
      const btn = el.querySelector('#btn-run-accruals');
      btn.disabled = true;
      const result = el.querySelector('#acc-run-result');
      result.innerHTML = '<div class="text-muted" style="font-size:13px"><i class="fa-solid fa-circle-notch fa-spin"></i> Running accruals…</div>';
      try {
        await api.runAccruals.run(tillDate);
        result.innerHTML = `<div class="badge b-success" style="padding:8px 12px;font-size:13px"><i class="fa-solid fa-check"></i> Accruals completed for ${tillDate}</div>`;
        toast('success','Accruals completed',`Up to ${tillDate}`);
      } catch (e) {
        result.innerHTML = `<div class="badge b-danger" style="padding:8px 12px;font-size:13px">${escapeHtml(e.message)}</div>`;
        toast('error','Accruals failed',e.message);
      }
      btn.disabled = false;
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 5 — GL CLOSURE (unchanged, moved to index 5)
// ════════════════════════════════════════════════════════════
async function loadGLClosure(c) {
  const el = c.querySelector('#acc-5');
  try {
    const officesRes  = await api.offices.list().catch(() => []);
    const officeList  = Array.isArray(officesRes) ? officesRes : [];
    const headOffice  = officeList.find(o => o.hierarchy === '.') || officeList[0];
    const closures    = headOffice ? await api.glClosures.list({ officeId: headOffice.id }) : [];
    const list        = Array.isArray(closures) ? closures : [];
    const officeOpts  = officeList.map(o => `<option value="${o.id}"${o.id===headOffice?.id?' selected':''}>${escapeHtml(o.name)}</option>`).join('');
    el.innerHTML = `
      <div class="flex justify-between mb-4 items-center">
        <span class="text-muted">${list.length} closure${list.length!==1?'s':''}</span>
        <div class="flex gap-2 items-center">
          <select class="form-control" id="gl-close-office" style="width:200px">${officeOpts}</select>
          <button class="btn-primary btn-sm" id="gl-close-btn"><i class="fa-solid fa-lock"></i> New GL Closure</button>
        </div>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Closing Date</th><th>Office</th><th>Comments</th></tr></thead>
            <tbody>${list.map(cl=>`<tr><td>${fmtDate(cl.closingDate)||'—'}</td><td>${escapeHtml(cl.officeName||'—')}</td><td>${escapeHtml(cl.comments||'—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-lock-open"></i><div>No GL closures on record</div></div>'}`;
    el.querySelector('#gl-close-btn').addEventListener('click', async () => {
      const officeId = parseInt(el.querySelector('#gl-close-office')?.value) || headOffice?.id;
      const name     = officeList.find(o=>o.id===officeId)?.name || `#${officeId}`;
      if (!officeId) { toast('warn','No office selected',''); return; }
      if (!confirm(`Close GL period for ${name} as of ${today()}? This cannot be easily undone.`)) return;
      try {
        await api.glClosures.create({ closingDate: today(), officeId, comments: 'Manual closure', dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success','GL period closed',today()); loadGLClosure(c);
      } catch (e) { toast('error','GL closure failed',e.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 6 — PROVISIONING (P5-4 — full builder)
// ════════════════════════════════════════════════════════════
async function loadProvisioning(c) {
  const el = c.querySelector('#acc-6');
  try {
    const [criteria, entries] = await Promise.all([
      api.provisioning.criteria(),
      api.provisioning.entries().catch(() => [])
    ]);
    const clist = Array.isArray(criteria) ? criteria : [];
    const elist = Array.isArray(entries)  ? entries  : [];

    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${clist.length} criteria</span>
        <div class="flex gap-2">
          ${elist.length ? `<button class="btn-ghost btn-sm" id="btn-prov-journal"><i class="fa-solid fa-paper-plane"></i> Create Journal Entry</button>` : ''}
          <button class="btn-primary btn-sm" id="btn-prov-entry"><i class="fa-solid fa-bolt"></i> Create Provisioning Entry</button>
          <button class="btn-primary btn-sm" id="btn-prov-new"><i class="fa-solid fa-plus"></i> New Criteria</button>
        </div>
      </div>
      ${clist.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Criteria Name</th><th>Created By</th><th></th></tr></thead>
            <tbody>${clist.map(p=>`<tr>
              <td>${escapeHtml(p.criteriaName||p.name||'—')}</td>
              <td>${escapeHtml(p.createdBy||'—')}</td>
              <td><button class="btn-ghost btn-sm" data-del-prov="${p.id}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No provisioning criteria</div></div>'}`;

    el.querySelector('#btn-prov-new').addEventListener('click', () => openProvisioningModal(() => loadProvisioning(c)));
    el.querySelector('#btn-prov-entry').addEventListener('click', async () => {
      if (!confirm('Create a new provisioning entry for all active loans?')) return;
      try {
        await api.provisioning.createEntry({ dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success','Provisioning entry created',''); loadProvisioning(c);
      } catch (e) { toast('error','Failed',e.message); }
    });
    el.querySelector('#btn-prov-journal')?.addEventListener('click', async () => {
      const latest = elist[elist.length-1];
      if (!latest) return;
      if (!confirm(`Create journal entries from provisioning entry #${latest.id}?`)) return;
      try {
        await api.provisioning.createJournal(latest.id);
        toast('success','Journal entries created','');
      } catch (e) { toast('error','Failed',e.message); }
    });
    el.querySelectorAll('[data-del-prov]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this provisioning criteria?')) return;
      try { await api.provisioning.deleteCriteria(b.dataset.delProv); toast('success','Deleted',''); loadProvisioning(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 7 — FINANCIAL ACTIVITIES
// ════════════════════════════════════════════════════════════
async function loadFinancialActivities(c) {
  const el = c.querySelector('#acc-7');
  try {
    const [fa, tpl] = await Promise.all([
      api.financialActivityAccounts.list(),
      api.financialActivityAccounts.list().catch(()=>({financialActivityOptions:[]}))
    ]);
    const list     = Array.isArray(fa) ? fa : [];
    const actOpts  = (tpl?.financialActivityOptions||[]).map(a=>`<option value="${a.id}">${escapeHtml(a.name||a.value||'')}</option>`).join('');
    el.innerHTML = `
      <div class="flex justify-between mb-4">
        <span class="text-muted">${list.length} mapping${list.length!==1?'s':''}</span>
        <button class="btn-primary btn-sm" id="btn-fa-new"><i class="fa-solid fa-plus"></i> Add Mapping</button>
      </div>
      ${list.length
        ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Financial Activity</th><th>GL Account</th><th></th></tr></thead>
            <tbody>${list.map(f=>`<tr>
              <td>${escapeHtml(f.financialActivityData?.name||String(f.financialActivityId)||'—')}</td>
              <td>${escapeHtml(f.glAccountData?.name||'—')}</td>
              <td><button class="btn-ghost btn-sm" data-del-fa="${f.id}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><div>No financial activity mappings</div></div>'}`;
    el.querySelector('#btn-fa-new').addEventListener('click', () => openFAModal(actOpts, () => loadFinancialActivities(c)));
    el.querySelectorAll('[data-del-fa]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this mapping?')) return;
      try { await api.financialActivityAccounts.delete(b.dataset.delFa); toast('success','Deleted',''); loadFinancialActivities(c); }
      catch (e) { toast('error','Delete failed',e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════

// GL Account
async function openGLAccountModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.glAccounts.template(); } catch {}
  const types    = (tpl.accountTypeOptions||[{id:1,value:'ASSET'},{id:2,value:'LIABILITY'},{id:3,value:'EQUITY'},{id:4,value:'INCOME'},{id:5,value:'EXPENSE'}]).map(t=>`<option value="${t.id}">${escapeHtml(t.value)}</option>`).join('');
  const usages   = (tpl.usageOptions||[{id:1,value:'HEADER'},{id:2,value:'DETAIL'}]).map(u=>`<option value="${u.id}">${escapeHtml(u.value)}</option>`).join('');
  const parentOpts = (Array.isArray(tpl.allowedParents)?tpl.allowedParents:[]).map(p=>`<option value="${p.id}">${escapeHtml(p.name)} (${p.glCode})</option>`).join('');

  const mid = `gl-acc-${Date.now()}`;
  const el = dynModal(mid, 'Add GL Account', `
    <div class="form-grid">
      <label><span class="form-label">Account name *</span><input id="gla-name" class="form-control" required/></label>
      <label><span class="form-label">GL Code *</span><input id="gla-code" class="form-control" required/></label>
      <label><span class="form-label">Account type *</span><select id="gla-type" class="form-control" required>${types}</select></label>
      <label><span class="form-label">Usage *</span><select id="gla-usage" class="form-control" required>${usages}</select></label>
      <label class="full"><span class="form-label">Parent account</span><select id="gla-parent" class="form-control"><option value="">— None (top-level) —</option>${parentOpts}</select></label>
      <label class="full"><span class="form-label">Description</span><textarea id="gla-desc" class="form-control" rows="2"></textarea></label>
      <label class="flex items-center gap-2" style="align-items:center"><input type="checkbox" id="gla-manual" checked/> <span>Allow manual entries</span></label>
    </div>`);
  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'gla-name'), glCode = v(el,'gla-code'), type = vi(el,'gla-type'), usage = vi(el,'gla-usage');
    if (!name || !glCode || !type || !usage) { toast('warn','Fill required fields',''); return; }
    try {
      await api.glAccounts.create({ name, glCode, type, usage, manualEntriesAllowed: el.querySelector('#gla-manual').checked,
        description: v(el,'gla-desc')||undefined, parentId: vi(el,'gla-parent')||undefined });
      el.remove(); toast('success','GL account created',name); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// Journal Entry
async function openJournalEntryModal(onSuccess) {
  const [officesRes, glAccounts] = await Promise.all([api.offices.list().catch(()=>[]), glList()]);
  const offices  = Array.isArray(officesRes) ? officesRes : [];
  const offOpts  = offices.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  const glOpts   = glAccounts.map(g=>`<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = `je-${Date.now()}`;
  const el = dynModal(mid, 'New Journal Entry', `
    <div class="form-grid">
      <label><span class="form-label">Office *</span><select id="je-office" class="form-control" required><option value="">Select…</option>${offOpts}</select></label>
      <label><span class="form-label">Transaction date *</span><input type="date" id="je-date" class="form-control" value="${today()}" required/></label>
      <label class="full"><span class="form-label">Reference / comments</span><input id="je-ref" class="form-control" placeholder="Optional"/></label>
    </div>
    <h4 style="font-size:13px;font-weight:600;margin:16px 0 8px">Debits</h4>
    <div id="je-debits">
      <div class="je-dr flex gap-2 mb-2">
        <select class="form-control je-gl" style="flex:2"><option value="">— Account —</option>${glOpts}</select>
        <input type="number" class="form-control je-amt" min="0" step="0.01" placeholder="Amount" style="flex:1"/>
      </div>
    </div>
    <button type="button" class="btn-ghost btn-sm mb-3" id="je-add-dr"><i class="fa-solid fa-plus"></i> Add debit</button>
    <h4 style="font-size:13px;font-weight:600;margin:8px 0">Credits</h4>
    <div id="je-credits">
      <div class="je-cr flex gap-2 mb-2">
        <select class="form-control je-gl" style="flex:2"><option value="">— Account —</option>${glOpts}</select>
        <input type="number" class="form-control je-amt" min="0" step="0.01" placeholder="Amount" style="flex:1"/>
      </div>
    </div>
    <button type="button" class="btn-ghost btn-sm" id="je-add-cr"><i class="fa-solid fa-plus"></i> Add credit</button>`, true);

  const rowTpl = () => `<div class="flex gap-2 mb-2 je-extra-row">
    <select class="form-control je-gl" style="flex:2"><option value="">— Account —</option>${glOpts}</select>
    <input type="number" class="form-control je-amt" min="0" step="0.01" placeholder="Amount" style="flex:1"/>
    <button type="button" class="btn-ghost btn-sm" onclick="this.closest('.je-extra-row').remove()"><i class="fa-solid fa-trash"></i></button>
  </div>`;
  el.querySelector('#je-add-dr').addEventListener('click', () => el.querySelector('#je-debits').insertAdjacentHTML('beforeend', rowTpl()));
  el.querySelector('#je-add-cr').addEventListener('click', () => el.querySelector('#je-credits').insertAdjacentHTML('beforeend', rowTpl()));

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const officeId = vi(el,'je-office'), transactionDate = v(el,'je-date'), comments = v(el,'je-ref');
    if (!officeId || !transactionDate) { toast('warn','Fill required fields',''); return; }
    const debits  = [...el.querySelector('#je-debits').querySelectorAll('.je-gl')].map((s,i) => ({
      glAccountId: parseInt(s.value), amount: parseFloat(el.querySelector('#je-debits').querySelectorAll('.je-amt')[i]?.value||0)
    })).filter(d => d.glAccountId && d.amount > 0);
    const credits = [...el.querySelector('#je-credits').querySelectorAll('.je-gl')].map((s,i) => ({
      glAccountId: parseInt(s.value), amount: parseFloat(el.querySelector('#je-credits').querySelectorAll('.je-amt')[i]?.value||0)
    })).filter(d => d.glAccountId && d.amount > 0);
    if (!debits.length || !credits.length) { toast('warn','Add at least one debit and one credit',''); return; }
    try {
      await api.journalEntries.create({ officeId, transactionDate, dateFormat: DATE_FORMAT, locale: LOCALE,
        debits, credits, ...(comments && { comments }) });
      el.remove(); toast('success','Journal entry created',''); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// Accounting Rule (P5-1)
async function openAccountingRuleModal(onSuccess) {
  const [officesRes, glAccounts] = await Promise.all([api.offices.list().catch(()=>[]), glList()]);
  const offices = Array.isArray(officesRes) ? officesRes : [];
  const glOpts  = glAccounts.map(g=>`<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  const offOpts = offices.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  const mid = `ar-${Date.now()}`;
  const el = dynModal(mid, 'Add Accounting Rule', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Rule name *</span><input id="ar-name" class="form-control" required/></label>
      <label class="full"><span class="form-label">Office (blank = all)</span>
        <select id="ar-office" class="form-control"><option value="">All Offices</option>${offOpts}</select></label>
      <label class="full"><span class="form-label">Description</span><textarea id="ar-desc" class="form-control" rows="2"></textarea></label>
      <h4 class="full" style="font-size:13px;font-weight:600;margin-top:8px">Debit</h4>
      <label class="full"><span class="form-label">Debit GL Account *</span>
        <select id="ar-debit" class="form-control" required><option value="">— Select account —</option>${glOpts}</select></label>
      <h4 class="full" style="font-size:13px;font-weight:600;margin-top:8px">Credit</h4>
      <label class="full"><span class="form-label">Credit GL Account *</span>
        <select id="ar-credit" class="form-control" required><option value="">— Select account —</option>${glOpts}</select></label>
    </div>`);
  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const name = v(el,'ar-name'), debitId = vi(el,'ar-debit'), creditId = vi(el,'ar-credit');
    if (!name || !debitId || !creditId) { toast('warn','Fill required fields',''); return; }
    const payload = { name, debitAccounts: [{glAccountId: debitId}], creditAccounts: [{glAccountId: creditId}],
      ...(vi(el,'ar-office') && { officeId: vi(el,'ar-office') }),
      ...(v(el,'ar-desc') && { description: v(el,'ar-desc') })
    };
    try {
      await api.accountingRules.create(payload);
      el.remove(); toast('success','Accounting rule created',name); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

// Provisioning Criteria (P5-4)
async function openProvisioningModal(onSuccess) {
  const glAccounts = await glList();
  const glOpts     = glAccounts.map(g=>`<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = `prov-${Date.now()}`;
  const el = dynModal(mid, 'New Provisioning Criteria', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Criteria name *</span><input id="pc-name" class="form-control" required/></label>
    </div>
    <h4 style="font-size:13px;font-weight:600;margin:16px 0 8px">Provision Categories</h4>
    <div class="tbl-wrap"><table class="tbl" id="pc-table">
      <thead><tr><th>Category name</th><th>Min days</th><th>Max days</th><th>Min amount</th><th>Provision %</th><th>Liability GL</th><th>Expense GL</th><th></th></tr></thead>
      <tbody id="pc-tbody">
        ${provRow(glOpts, 0)}
      </tbody>
    </table></div>
    <button type="button" class="btn-ghost btn-sm mt-2" id="pc-add-row"><i class="fa-solid fa-plus"></i> Add category</button>`, true);

  let pIdx = 1;
  el.querySelector('#pc-add-row').addEventListener('click', () => {
    el.querySelector('#pc-tbody').insertAdjacentHTML('beforeend', provRow(glOpts, pIdx++));
  });

  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const criteriaName = v(el,'pc-name');
    if (!criteriaName) { toast('warn','Enter criteria name',''); return; }
    const definitions = [...el.querySelector('#pc-tbody').querySelectorAll('tr')].map(row => {
      const inputs = row.querySelectorAll('input,select');
      return {
        categoryName:          inputs[0]?.value?.trim(),
        minimumAgeDays:        parseInt(inputs[1]?.value)||0,
        maximumAgeDays:        parseInt(inputs[2]?.value)||undefined,
        minBalancePercentage:  parseFloat(inputs[3]?.value)||0,
        provisioningPercentage:parseFloat(inputs[4]?.value)||0,
        liabilityAccount:      parseInt(inputs[5]?.value)||undefined,
        expenseAccount:        parseInt(inputs[6]?.value)||undefined
      };
    }).filter(d => d.categoryName);
    if (!definitions.length) { toast('warn','Add at least one provision category',''); return; }
    try {
      await api.provisioning.createCriteria({ criteriaName, definitions, locale: LOCALE });
      el.remove(); toast('success','Provisioning criteria created',criteriaName); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}

function provRow(glOpts, idx) {
  return `<tr>
    <td><input class="form-control" style="min-width:120px" placeholder="e.g. Standard"/></td>
    <td><input type="number" class="form-control" value="0" min="0" style="width:70px"/></td>
    <td><input type="number" class="form-control" min="0" style="width:70px" placeholder="∞"/></td>
    <td><input type="number" class="form-control" value="0" min="0" step="0.01" style="width:80px"/></td>
    <td><input type="number" class="form-control" value="1" min="0" max="100" step="0.01" style="width:70px"/></td>
    <td><select class="form-control" style="min-width:140px"><option value="">— GL —</option>${glOpts}</select></td>
    <td><select class="form-control" style="min-width:140px"><option value="">— GL —</option>${glOpts}</select></td>
    <td><button type="button" class="btn-ghost btn-sm" onclick="this.closest('tr').remove()"><i class="fa-solid fa-trash"></i></button></td>
  </tr>`;
}

// Financial Activity Mapping
async function openFAModal(actOpts, onSuccess) {
  const glAccounts = await glList();
  const glOpts = glAccounts.map(g=>`<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  const mid = `fa-${Date.now()}`;
  const el = dynModal(mid, 'Add Financial Activity Mapping', `
    <div class="form-grid">
      <label class="full"><span class="form-label">Financial activity *</span>
        <select id="fa-activity" class="form-control" required><option value="">Select activity…</option>${actOpts}</select></label>
      <label class="full"><span class="form-label">GL Account *</span>
        <select id="fa-gl" class="form-control" required><option value="">— Select GL account —</option>${glOpts}</select></label>
    </div>`);
  el.querySelector(`#${mid}-save`).addEventListener('click', async () => {
    const financialActivityId = vi(el,'fa-activity'), glAccountId = vi(el,'fa-gl');
    if (!financialActivityId || !glAccountId) { toast('warn','Fill required fields',''); return; }
    try {
      await api.financialActivityAccounts.create({ financialActivityId, glAccountId });
      el.remove(); toast('success','Mapping created',''); onSuccess();
    } catch (e) { toast('error','Create failed',e.message); }
  });
}
