import { LOCALE, DATE_FORMAT, today } from '../config.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, escapeHtml, fmtDate, sb } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = [
  'Chart of Accounts',
  'Journal Entries',
  'Frequent Postings',
  'Accounting Rules',
  'Opening Balances',
  'Run Accruals',
  'GL Closure',
  'Provisioning',
  'Financial Activities'
];
let _glCache = null;
async function glList() {
  if (!_glCache) {
    try {
      const r = await api.glAccounts.list();
      _glCache = Array.isArray(r) ? r : [];
    } catch { _glCache = []; }
  }
  return _glCache;
}

// ── Populate JE filter dropdowns (offices + grouped GL accounts) ───
async function populateJEFilters(container) {
  const offSel = container.querySelector('#je-f-office');
  const glSel  = container.querySelector('#je-f-glacct');
  if (!offSel && !glSel) return;

  // Loading state
  if (offSel) offSel.innerHTML = '<option value="">Loading offices…</option>';
  if (glSel)  glSel.innerHTML  = '<option value="">Loading GL accounts…</option>';

  try {
    const [offRes, glAccounts] = await Promise.all([
      api.offices.list().catch(() => []),
      glList()
    ]);
    const offices = Array.isArray(offRes) ? offRes : [];

    if (offSel) {
      offSel.innerHTML = '<option value="">All offices</option>' +
        offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
    }

    if (glSel) {
      // Group GL accounts by type for usability
      const byType = {};
      glAccounts.forEach(g => {
        const type = g.type?.value || g.type || 'OTHER';
        (byType[type] ||= []).push(g);
      });
      const typeOrder = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
      const sortedTypes = Object.keys(byType).sort((a, b) => {
        const ai = typeOrder.indexOf(a), bi = typeOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

      let html = '<option value="">All GL accounts</option>';
      sortedTypes.forEach(type => {
        html += `<optgroup label="${escapeHtml(type)}">`;
        byType[type].forEach(g => {
          const label = (g.glCode ? g.glCode + ' — ' : '') + (g.name || '—');
          html += `<option value="${g.id}">${escapeHtml(label)}</option>`;
        });
        html += '</optgroup>';
      });
      glSel.innerHTML = html;
    }
  } catch (e) {
    console.warn('[je-filters]', e);
    if (offSel) offSel.innerHTML = '<option value="">Failed to load offices</option>';
    if (glSel)  glSel.innerHTML  = '<option value="">Failed to load GL accounts</option>';
  }
}
/* FinCraft · accounting.js — Full accounting (perm────────────────/* FinCraft · accounting.js — Full accounting (permission-gated, 9 sub-tabs) */
const v  = (el, id) => el.querySelector('#' + id)?.value?.trim() || '';
const vi = (el, id) => { const n = parseInt(v(el, id)); return isNaN(n) ? null : n; };
const vf = (el, id) => { const n = parseFloat(v(el, id)); return isNaN(n) ? null : n; };

function dynModal(mid, title, body, wide = false) {
  document.getElementById('modalRoot')?.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal ${wide ? 'modal-lg' : 'modal-md'}">
        <div class="modal-header"><h3>${title}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="${mid}-save">Save</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  return el;
}

// ════════════════════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════════════════════
export async function render(c) {
  _glCache = null;

  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Accounting</h1>
        <div class="text-muted">GL, journals, rules, closures, provisioning, accruals</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="acc-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="acc-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="acc-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  // Tab switching
  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
  }));

  // Load all tabs (could be lazy but small enough that eager works)
  loadChartOfAccounts(c);
  loadJournalEntries(c);
  loadFrequentPostings(c);
  loadAccountingRules(c);
  loadOpeningBalances(c);
  loadRunAccruals(c);
  loadGLClosure(c);
  loadProvisioning(c);
  loadFinancialActivities(c);
}

// ════════════════════════════════════════════════════════════
// TAB 0 — CHART OF ACCOUNTS (with tree view toggle)
// ════════════════════════════════════════════════════════════
async function loadChartOfAccounts(c) {
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
      openGLAccountModal(() => { _glCache = null; loadChartOfAccounts(c); }));

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
      openGLAccountModal(() => { _glCache = null; loadChartOfAccounts(c); }));
  }
}

// ════════════════════════════════════════════════════════════
// TAB 1 — JOURNAL ENTRIES (search + reverse)
// ════════════════════════════════════════════════════════════
async function loadJournalEntries(c, params = {}) {
  const el = c.querySelector('#acc-1');

  if (!el.querySelector('#je-filter-bar')) {
    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Journal Entries</h3>
        ${can('CREATE_JOURNALENTRY') ? `<button class="btn-primary" id="btn-new-je"><i class="fa-solid fa-plus"></i> New Entry</button>` : ''}
      </div>
   <div class="filter-bar mb-2" id="je-filter-bar">
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
  loadJournalEntries(c, p);
});

// Populate filter dropdowns with real offices + GL accounts
populateJEFilters(el);

// Clear filter button
el.querySelector('#je-filter-clear')?.addEventListener('click', () => {
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
    const res = await api.journalEntries.list(queryParams);
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
              ${je.reversed
                ? '<span class="badge b-warning">Reversed</span>'
                : (can('REVERSE_JOURNALENTRY')
                    ? `<button class="btn-mini btn-warning" data-reverse-je="${je.transactionId || je.id}">Reverse</button>`
                    : '')}
            </td>
          </tr>`).join('') : '<tr><td colspan="8" class="empty-state-row">No journal entries match</td></tr>'}
        </tbody>
      </table>`;

    wrap.querySelectorAll('[data-reverse-je]').forEach(b => b.addEventListener('click', () =>
      openReverseJEModal(b.dataset.reverseJe, () => loadJournalEntries(c))));
  } catch (e) {
    wrap.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

function openReverseJEModal(transactionId, onSuccess) {
  const mid = 'je-rev-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reverse Journal Entry</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-warning mb-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            This will create a reversing entry for transaction <b>${escapeHtml(String(transactionId))}</b>.
          </div>
          <label>Reversal Date * <input type="date" id="${mid}-date" class="form-control" value="${today()}" required/></label>
          <label class="mt-2">Comments <textarea id="${mid}-comments" class="form-control" rows="2"></textarea></label>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-warning" id="${mid}-confirm">Reverse</button>
        </div>
      </div>
    </div>`);
  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));
  m.querySelector('#' + mid + '-confirm').addEventListener('click', async () => {
    const reversalDate = m.querySelector('#' + mid + '-date').value;
    if (!reversalDate) { toast('warn', 'Select a date', ''); return; }
    const comments = m.querySelector('#' + mid + '-comments').value.trim();
    const payload = { reversalDate, dateFormat: DATE_FORMAT, locale: LOCALE };
    if (comments) payload.comments = comments;
    try {
      await api.journalEntries.reverse(transactionId, payload);
      m.remove();
      toast('success', 'Entry reversed', String(transactionId));
      onSuccess?.();
    } catch (e) { toast('error', 'Reversal failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// TAB 2 — FREQUENT POSTINGS (audit gap #1)
// ════════════════════════════════════════════════════════════
async function loadFrequentPostings(c) {
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

async function openFrequentPostingModal(ruleId, rule, onSuccess) {
  const officesRes = await api.offices.list().catch(() => []);
  const offices = Array.isArray(officesRes) ? officesRes : [];
  const offOpts = offices.map(o => `<option value="${o.id}" ${rule?.officeId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');

  const mid = 'fp-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>Post: ${escapeHtml(rule?.name || '')}</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="msg-banner b-info mb-2">
            <i class="fa-solid fa-circle-info"></i>
            <b>Debit:</b> ${escapeHtml((rule?.debitAccounts || []).map(a => a.name || a.glCode).join(', ') || '—')}
            &nbsp;<b>Credit:</b> ${escapeHtml((rule?.creditAccounts || []).map(a => a.name || a.glCode).join(', ') || '—')}
          </div>
          <div class="form-grid">
            <label>Office *
              <select id="fp-office" class="form-control" required>
                <option value="">Select…</option>${offOpts}
              </select>
            </label>
            <label>Transaction date * <input type="date" id="fp-date" class="form-control" value="${today()}" required/></label>
            <label>Amount * <input type="number" step="0.01" id="fp-amount" class="form-control" required/></label>
            <label>Reference number <input id="fp-ref" class="form-control"/></label>
            <label class="full">Comments <textarea id="fp-comments" class="form-control" rows="2"></textarea></label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="fp-save">Post Entry</button>
        </div>
      </div>
    </div>`);

  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#fp-save').addEventListener('click', async () => {
    const officeId = parseInt(el.querySelector('#fp-office').value);
    const transactionDate = el.querySelector('#fp-date').value;
    const amount = parseFloat(el.querySelector('#fp-amount').value);
    const ref = el.querySelector('#fp-ref').value.trim();
    const comments = el.querySelector('#fp-comments').value.trim();

    if (!officeId || !transactionDate || isNaN(amount)) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {
      officeId, transactionDate, amount,
      accountingRuleId: parseInt(ruleId),
      dateFormat: DATE_FORMAT, locale: LOCALE
    };
    if (ref) payload.referenceNumber = ref;
    if (comments) payload.comments = comments;

    try {
      await api.journalEntries.create(payload);
      el.remove();
      toast('success', 'Posted via rule', rule?.name || '');
      onSuccess();
    } catch (e) {
      toast('error', 'Posting failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

// ════════════════════════════════════════════════════════════
// TAB 3 — ACCOUNTING RULES
// ════════════════════════════════════════════════════════════
async function loadAccountingRules(c) {
  const el = c.querySelector('#acc-3');
  try {
    const rules = await api.accountingRules.list();
    const list = Array.isArray(rules) ? rules : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Accounting Rules</h3>
        <div>
          <span class="text-muted mr-2">${list.length} rule${list.length !== 1 ? 's' : ''}</span>
          ${can('CREATE_ACCOUNTINGRULE') ? `<button class="btn-primary" id="btn-new-rule"><i class="fa-solid fa-plus"></i> Add Rule</button>` : ''}
        </div>
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Office</th>
            <th>Debit Tags / Accounts</th>
            <th>Credit Tags / Accounts</th>
            <th></th>
          </tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td>${escapeHtml(r.name || '—')}</td>
              <td>${escapeHtml(r.officeName || 'All')}</td>
              <td>${(r.debitAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td>${(r.creditAccounts || []).map(a => escapeHtml(a.name || a.glCode || '—')).join(', ') || '—'}</td>
              <td class="text-right">
                ${can('UPDATE_ACCOUNTINGRULE') ? `<button class="btn-mini" data-edit-rule="${r.id}">Edit</button>` : ''}
                ${can('DELETE_ACCOUNTINGRULE') ? `<button class="btn-mini btn-danger" data-del-rule="${r.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No accounting rules</div>'}`;

    el.querySelector('#btn-new-rule')?.addEventListener('click', () =>
      openAccountingRuleModal(null, () => loadAccountingRules(c)));
    el.querySelectorAll('[data-edit-rule]').forEach(b => b.addEventListener('click', () =>
      openAccountingRuleModal(b.dataset.editRule, () => loadAccountingRules(c))));
    el.querySelectorAll('[data-del-rule]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete accounting rule?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.accountingRules.delete(b.dataset.delRule);
        toast('success', 'Rule deleted', '');
        loadAccountingRules(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 4 — OPENING BALANCES
// ════════════════════════════════════════════════════════════
async function loadOpeningBalances(c) {
  const el = c.querySelector('#acc-4');
  try {
    const officesRes = await api.offices.list().catch(() => []);
    const offices = Array.isArray(officesRes) ? officesRes : [];
    const glAccounts = await glList();

    el.innerHTML = `
      <h3>Define Opening Balances</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Set initial GL balances for a new office or accounting period start.
      </div>

      <div class="form-grid">
        <label>Office *
          <select id="ob-office" class="form-control" required>
            <option value="">Select office…</option>
            ${offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </label>
        <label>Transaction date * <input type="date" id="ob-date" class="form-control" value="${today()}" required/></label>
        <label class="full">Comments <textarea id="ob-comments" class="form-control" rows="2"></textarea></label>
      </div>

      <h4 class="mt-3">Credit accounts (balances to set)</h4>
      <div id="ob-credits">${openingBalanceRow(glAccounts, 'c', 0)}</div>
      <button class="btn-secondary btn-sm mt-2" id="ob-add-credit"><i class="fa-solid fa-plus"></i> Add credit row</button>

      <h4 class="mt-3">Debit accounts</h4>
      <div id="ob-debits">${openingBalanceRow(glAccounts, 'd', 0)}</div>
      <button class="btn-secondary btn-sm mt-2" id="ob-add-debit"><i class="fa-solid fa-plus"></i> Add debit row</button>

      <div class="mt-3">
        ${can('CREATE_JOURNALENTRY') ? `<button class="btn-primary" id="ob-submit">Submit Opening Balances</button>` : ''}
      </div>`;

    let cIdx = 1, dIdx = 1;
    el.querySelector('#ob-add-credit').addEventListener('click', () => {
      el.querySelector('#ob-credits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts, 'c', cIdx++));
    });
    el.querySelector('#ob-add-debit').addEventListener('click', () => {
      el.querySelector('#ob-debits').insertAdjacentHTML('beforeend', openingBalanceRow(glAccounts, 'd', dIdx++));
    });
    el.querySelector('#ob-submit')?.addEventListener('click', () => submitOpeningBalances(el));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

function openingBalanceRow(accounts, prefix, idx) {
  const opts = accounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  return `
    <div class="ob-row form-grid" data-prefix="${prefix}" data-idx="${idx}" style="margin-bottom:8px">
      <label>GL Account
        <select name="ob_gl_${prefix}_${idx}" class="form-control">
          <option value="">— GL Account —</option>${opts}
        </select>
      </label>
      <label>Amount
        <input type="number" step="0.01" name="ob_amt_${prefix}_${idx}" class="form-control"/>
      </label>
    </div>`;
}

async function submitOpeningBalances(el) {
  const officeId = parseInt(el.querySelector('#ob-office')?.value);
  const transactionDate = el.querySelector('#ob-date')?.value;
  const comments = el.querySelector('#ob-comments')?.value?.trim();
  if (!officeId || !transactionDate) { toast('warn', 'Select office and date', ''); return; }

  const credits = [], debits = [];
  el.querySelectorAll('.ob-row').forEach(row => {
    const prefix = row.dataset.prefix;
    const idx = row.dataset.idx;
    const glId = parseInt(row.querySelector('[name="ob_gl_' + prefix + '_' + idx + '"]')?.value);
    const amount = parseFloat(row.querySelector('[name="ob_amt_' + prefix + '_' + idx + '"]')?.value);
    if (glId && !isNaN(amount) && amount > 0) {
      (prefix === 'c' ? credits : debits).push({ glAccountId: glId, amount });
    }
  });
  if (!credits.length && !debits.length) { toast('warn', 'Add at least one balance entry', ''); return; }

  const payload = {
    officeId, transactionDate,
    dateFormat: DATE_FORMAT, locale: LOCALE,
    credits, debits
  };
  if (comments) payload.comments = comments;

  try {
    await api.openingBalances.define(officeId, payload);
    toast('success', 'Opening balances submitted', credits.length + ' credits, ' + debits.length + ' debits');
  } catch (e) {
    toast('error', 'Submission failed', e.detail?.defaultUserMessage || e.message);
  }
}

// ════════════════════════════════════════════════════════════
// TAB 5 — RUN ACCRUALS
// ════════════════════════════════════════════════════════════
async function loadRunAccruals(c) {
  const el = c.querySelector('#acc-5');
  try {
    const entries = await api.provisioning.entries().catch(() => []);
    const recent = Array.isArray(entries) ? entries.slice(0, 5) : [];

    el.innerHTML = `
      <h3>Run Accruals</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Post periodic accruals up to a given date for all active loans. This applies to products configured with Accrual accounting.
      </div>

      <div class="form-grid">
        <label>Till date * <input type="date" id="acc-till" class="form-control" value="${today()}" required/></label>
      </div>

      <div class="mt-3">
        ${can('EXECUTE_ACCRUAL') ? `<button class="btn-primary" id="btn-run-accruals">Run Accruals</button>` : ''}
      </div>
      <div id="acc-run-result" class="mt-3"></div>

      <h3 class="mt-4">Recent Provisioning Entries</h3>
      ${recent.length ? `
        <table class="table">
          <thead><tr><th>Date</th><th class="text-right">Amount</th></tr></thead>
          <tbody>${recent.map(e => `
            <tr>
              <td>${fmtDate(e.createdDate) || '—'}</td>
              <td class="text-right">${e.provisioningEntryAmount != null ? fmt(e.provisioningEntryAmount) : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No provisioning entries yet</div>'}`;

    el.querySelector('#btn-run-accruals')?.addEventListener('click', async () => {
      const tillDate = el.querySelector('#acc-till').value;
      if (!tillDate) { toast('warn', 'Select a date', ''); return; }
      const btn = el.querySelector('#btn-run-accruals');
      btn.disabled = true;
      const result = el.querySelector('#acc-run-result');
      result.innerHTML = '<div class="msg-banner b-info"><i class="fa-solid fa-circle-notch fa-spin"></i> Running accruals…</div>';
      try {
        await api.runAccruals.run(tillDate);
        result.innerHTML = '<div class="msg-banner b-success"><i class="fa-solid fa-check"></i> Accruals completed for ' + escapeHtml(tillDate) + '</div>';
        toast('success', 'Accruals completed', 'Up to ' + tillDate);
      } catch (e) {
        result.innerHTML = '<div class="text-error">' + escapeHtml(e.detail?.defaultUserMessage || e.message) + '</div>';
        toast('error', 'Accruals failed', e.detail?.defaultUserMessage || e.message);
      }
      btn.disabled = false;
    });
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 6 — GL CLOSURE
// ════════════════════════════════════════════════════════════
async function loadGLClosure(c) {
  const el = c.querySelector('#acc-6');
  try {
    const officesRes = await api.offices.list().catch(() => []);
    const officeList = Array.isArray(officesRes) ? officesRes : [];
    const headOffice = officeList.find(o => o.hierarchy === '.') || officeList[0];
    const closures = headOffice ? await api.glClosures.list({ officeId: headOffice.id }) : [];
    const list = Array.isArray(closures) ? closures : [];
    const officeOpts = officeList.map(o => `<option value="${o.id}" ${o.id === headOffice?.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');

    el.innerHTML = `
      <h3>GL Closure</h3>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Close the GL period for an office. After closure, no entries can be back-dated to before the closure date.
      </div>

      <div class="form-grid">
        <label>Office
          <select id="gl-close-office" class="form-control">
            ${officeOpts}
          </select>
        </label>
      </div>

      <div class="mt-3">
        ${can('CREATE_GLCLOSURE') ? `<button class="btn-danger" id="gl-close-btn"><i class="fa-solid fa-lock"></i> Close Period as of ${today()}</button>` : ''}
      </div>

      <h3 class="mt-4">Closure History</h3>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Office</th><th>Closing Date</th><th>Closed By</th><th>Comments</th></tr></thead>
          <tbody>${list.map(cl => `
            <tr>
              <td>${escapeHtml(cl.officeName || '—')}</td>
              <td>${fmtDate(cl.closingDate) || '—'}</td>
              <td>${escapeHtml(cl.createdByUsername || cl.lastModifiedByUsername || '—')}</td>
              <td>${escapeHtml(cl.comments || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No GL closures on record</div>'}`;

    el.querySelector('#gl-close-btn')?.addEventListener('click', async () => {
      const officeId = parseInt(el.querySelector('#gl-close-office')?.value) || headOffice?.id;
      const name = officeList.find(o => o.id === officeId)?.name || ('#' + officeId);
      if (!officeId) { toast('warn', 'No office selected', ''); return; }
      if (!await modalConfirm({
        title: 'Close GL period for ' + name + '?',
        message: 'As of ' + today() + '. This cannot be easily undone.',
        danger: true, confirmText: 'Close Period'
      })) return;
      try {
        await api.glClosures.create({
          closingDate: today(), officeId,
          comments: 'Manual closure',
          dateFormat: DATE_FORMAT, locale: LOCALE
        });
        toast('success', 'GL period closed', today());
        loadGLClosure(c);
      } catch (e) { toast('error', 'GL closure failed', e.detail?.defaultUserMessage || e.message); }
    });
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 7 — PROVISIONING
// ════════════════════════════════════════════════════════════
async function loadProvisioning(c) {
  const el = c.querySelector('#acc-7');
  try {
    const [criteria, entries] = await Promise.all([
      api.provisioning.criteria(),
      api.provisioning.entries().catch(() => [])
    ]);
    const clist = Array.isArray(criteria) ? criteria : [];
    const elist = Array.isArray(entries) ? entries : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Provisioning</h3>
        <div>
          <span class="text-muted mr-2">${clist.length} criteria</span>
          ${elist.length && can('CREATE_PROVISIONINGENTRY') ? `<button class="btn-secondary" id="btn-prov-journal"><i class="fa-solid fa-receipt"></i> Create Journal Entry</button>` : ''}
          ${can('CREATE_PROVISIONINGENTRY') ? `<button class="btn-secondary" id="btn-prov-entry"><i class="fa-solid fa-plus"></i> Create Provisioning Entry</button>` : ''}
          ${can('CREATE_PROVISIONINGCRITERIA') ? `<button class="btn-primary" id="btn-prov-new"><i class="fa-solid fa-plus"></i> New Criteria</button>` : ''}
        </div>
      </div>

      ${clist.length ? `
        <table class="table">
          <thead><tr>
            <th>Criteria Name</th><th>Created By</th><th></th>
          </tr></thead>
          <tbody>${clist.map(p => `
            <tr>
              <td>${escapeHtml(p.criteriaName || p.name || '—')}</td>
              <td>${escapeHtml(p.createdBy || '—')}</td>
              <td class="text-right">
                ${can('DELETE_PROVISIONINGCRITERIA') ? `<button class="btn-mini btn-danger" data-del-prov="${p.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No provisioning criteria</div>'}`;

    el.querySelector('#btn-prov-new')?.addEventListener('click', () => openProvisioningModal(() => loadProvisioning(c)));
    el.querySelector('#btn-prov-entry')?.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Create provisioning entry?', message: 'For all active loans.', confirmText: 'Create' })) return;
      try {
        await api.provisioning.createEntry({ dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Provisioning entry created', '');
        loadProvisioning(c);
      } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    el.querySelector('#btn-prov-journal')?.addEventListener('click', async () => {
      const latest = elist[elist.length - 1];
      if (!latest) return;
      if (!await modalConfirm({ title: 'Create journal entries from provisioning entry #' + latest.id + '?', confirmText: 'Create JEs' })) return;
      try {
        await api.provisioning.createJournal(latest.id);
        toast('success', 'Journal entries created', '');
      } catch (e) { toast('error', 'Failed', e.detail?.defaultUserMessage || e.message); }
    });
    el.querySelectorAll('[data-del-prov]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete provisioning criteria?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.provisioning.deleteCriteria(b.dataset.delProv);
        toast('success', 'Deleted', '');
        loadProvisioning(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 8 — FINANCIAL ACTIVITIES
// ════════════════════════════════════════════════════════════
async function loadFinancialActivities(c) {
  const el = c.querySelector('#acc-8');
  try {
    const [fa, tpl] = await Promise.all([
      api.financialActivityAccounts.list(),
      api.financialActivityAccounts.list().catch(() => ({ financialActivityOptions: [] }))
    ]);
    const list = Array.isArray(fa) ? fa : [];
    const actOpts = (tpl?.financialActivityOptions || []).map(a => `<option value="${a.id}">${escapeHtml(a.name || a.value || '')}</option>`).join('');

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Financial Activity Mappings</h3>
        <div>
          <span class="text-muted mr-2">${list.length} mapping${list.length !== 1 ? 's' : ''}</span>
          ${can('CREATE_FINANCIALACTIVITYACCOUNT') ? `<button class="btn-primary" id="btn-fa-new"><i class="fa-solid fa-plus"></i> Add Mapping</button>` : ''}
        </div>
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Financial Activity</th><th>GL Account</th><th></th>
          </tr></thead>
          <tbody>${list.map(f => `
            <tr>
              <td>${escapeHtml(f.financialActivityData?.name || String(f.financialActivityId) || '—')}</td>
              <td>${escapeHtml(f.glAccountData?.name || '—')}</td>
              <td class="text-right">
                ${can('DELETE_FINANCIALACTIVITYACCOUNT') ? `<button class="btn-mini btn-danger" data-del-fa="${f.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No financial activity mappings</div>'}`;

    el.querySelector('#btn-fa-new')?.addEventListener('click', () => openFAModal(actOpts, () => loadFinancialActivities(c)));
    el.querySelectorAll('[data-del-fa]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete financial activity mapping?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.financialActivityAccounts.delete(b.dataset.delFa);
        toast('success', 'Deleted', '');
        loadFinancialActivities(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════

// ─── GL Account ────────────────────────────────────────────
async function openGLAccountModal(onSuccess) {
  let tpl = {};
  try { tpl = await api.glAccounts.template(); } catch {}
  const types = (tpl.accountTypeOptions || [
    { id: 1, value: 'ASSET' }, { id: 2, value: 'LIABILITY' },
    { id: 3, value: 'EQUITY' }, { id: 4, value: 'INCOME' }, { id: 5, value: 'EXPENSE' }
  ]).map(t => `<option value="${t.id}">${escapeHtml(t.value)}</option>`).join('');
  const usages = (tpl.usageOptions || [
    { id: 1, value: 'HEADER' }, { id: 2, value: 'DETAIL' }
  ]).map(u => `<option value="${u.id}">${escapeHtml(u.value)}</option>`).join('');
  const parentOpts = (Array.isArray(tpl.allowedParents) ? tpl.allowedParents : [])
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.glCode})</option>`).join('');

  const mid = 'gl-acc-' + Date.now();
  const el = dynModal(mid, 'Add GL Account', `
    <div class="form-grid">
      <label>Account name * <input id="gla-name" class="form-control" required/></label>
      <label>GL Code * <input id="gla-code" class="form-control" required/></label>
      <label>Account type *
        <select id="gla-type" class="form-control" required>
          <option value="">Select…</option>${types}
        </select>
      </label>
      <label>Usage *
        <select id="gla-usage" class="form-control" required>
          <option value="">Select…</option>${usages}
        </select>
      </label>
      <label>Parent account
        <select id="gla-parent" class="form-control">
          <option value="">— None (top-level) —</option>${parentOpts}
        </select>
      </label>
      <label class="full">Description <textarea id="gla-desc" class="form-control" rows="2"></textarea></label>
      <label class="checkbox-row"><input type="checkbox" id="gla-manual" checked/> Allow manual entries</label>
    </div>`);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'gla-name'), glCode = v(el, 'gla-code');
    const type = vi(el, 'gla-type'), usage = vi(el, 'gla-usage');
    if (!name || !glCode || !type || !usage) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    const payload = {
      name, glCode, type, usage,
      manualEntriesAllowed: el.querySelector('#gla-manual').checked
    };
    const desc = v(el, 'gla-desc'); if (desc) payload.description = desc;
    const parentId = vi(el, 'gla-parent'); if (parentId) payload.parentId = parentId;
    try {
      await api.glAccounts.create(payload);
      el.remove();
      toast('success', 'GL account created', name);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ─── Journal Entry ─────────────────────────────────────────
async function openJournalEntryModal(onSuccess) {
  const [officesRes, glAccounts] = await Promise.all([
    api.offices.list().catch(() => []),
    glList()
  ]);
  const offices = Array.isArray(officesRes) ? officesRes : [];
  const offOpts = offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = 'je-' + Date.now();
  const el = dynModal(mid, 'New Journal Entry', `
    <div class="form-grid">
      <label>Office *
        <select id="je-office" class="form-control" required>
          <option value="">Select…</option>${offOpts}
        </select>
      </label>
      <label>Transaction date * <input type="date" id="je-date" class="form-control" value="${today()}" required/></label>
      <label class="full">Reference / comments <input id="je-ref" class="form-control"/></label>
    </div>

    <h4 class="mt-3">Debits</h4>
    <div id="je-debits">
      <div class="form-grid" style="margin-bottom:8px">
        <label>Account
          <select class="form-control je-gl">
            <option value="">— Account —</option>${glOptsHtml}
          </select>
        </label>
        <label>Amount <input type="number" step="0.01" class="form-control je-amt"/></label>
      </div>
    </div>
    <button class="btn-secondary btn-sm mt-1" id="je-add-dr"><i class="fa-solid fa-plus"></i> Add debit</button>

    <h4 class="mt-3">Credits</h4>
    <div id="je-credits">
      <div class="form-grid" style="margin-bottom:8px">
        <label>Account
          <select class="form-control je-gl">
            <option value="">— Account —</option>${glOptsHtml}
          </select>
        </label>
        <label>Amount <input type="number" step="0.01" class="form-control je-amt"/></label>
      </div>
    </div>
    <button class="btn-secondary btn-sm mt-1" id="je-add-cr"><i class="fa-solid fa-plus"></i> Add credit</button>`, true);

  const rowTpl = () => `
    <div class="form-grid" style="margin-bottom:8px">
      <label>Account
        <select class="form-control je-gl">
          <option value="">— Account —</option>${glOptsHtml}
        </select>
      </label>
      <label>Amount <input type="number" step="0.01" class="form-control je-amt"/></label>
    </div>`;

  el.querySelector('#je-add-dr').addEventListener('click', () =>
    el.querySelector('#je-debits').insertAdjacentHTML('beforeend', rowTpl()));
  el.querySelector('#je-add-cr').addEventListener('click', () =>
    el.querySelector('#je-credits').insertAdjacentHTML('beforeend', rowTpl()));

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const officeId = vi(el, 'je-office');
    const transactionDate = v(el, 'je-date');
    const comments = v(el, 'je-ref');
    if (!officeId || !transactionDate) { toast('warn', 'Fill required fields', ''); return; }

    const collectRows = (containerId) => {
      const rows = [];
      el.querySelectorAll('#' + containerId + ' .form-grid').forEach(grp => {
        const glId = parseInt(grp.querySelector('.je-gl')?.value);
        const amt = parseFloat(grp.querySelector('.je-amt')?.value);
        if (glId && amt > 0) rows.push({ glAccountId: glId, amount: amt });
      });
      return rows;
    };

    const debits = collectRows('je-debits');
    const credits = collectRows('je-credits');
    if (!debits.length || !credits.length) {
      toast('warn', 'Add at least one debit and one credit', '');
      return;
    }

    const payload = {
      officeId, transactionDate,
      dateFormat: DATE_FORMAT, locale: LOCALE,
      debits, credits
    };
    if (comments) payload.comments = comments;

    try {
      await api.journalEntries.create(payload);
      el.remove();
      toast('success', 'Journal entry created', '');
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ─── Accounting Rule ───────────────────────────────────────
async function openAccountingRuleModal(ruleId, onSuccess) {
  const isEdit = !!ruleId;
  const [officesRes, glAccounts] = await Promise.all([
    api.offices.list().catch(() => []),
    glList()
  ]);
  const offices = Array.isArray(officesRes) ? officesRes : [];
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');
  const offOpts = offices.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');

  const mid = 'ar-' + Date.now();
  const el = dynModal(mid, isEdit ? 'Edit Accounting Rule' : 'Add Accounting Rule', `
    <div class="form-grid">
      <label>Rule name * <input id="ar-name" class="form-control" required/></label>
      <label>Office (blank = all)
        <select id="ar-office" class="form-control">
          <option value="">All Offices</option>${offOpts}
        </select>
      </label>
      <label class="full">Description <textarea id="ar-desc" class="form-control" rows="2"></textarea></label>
    </div>

    <h4 class="mt-3">Debit</h4>
    <label>Debit GL Account *
      <select id="ar-debit" class="form-control" required>
        <option value="">— Select account —</option>${glOptsHtml}
      </select>
    </label>

    <h4 class="mt-3">Credit</h4>
    <label>Credit GL Account *
      <select id="ar-credit" class="form-control" required>
        <option value="">— Select account —</option>${glOptsHtml}
      </select>
    </label>`);

  if (isEdit) {
    try {
      const rule = await api.accountingRules.get(ruleId);
      el.querySelector('#ar-name').value = rule.name || '';
      el.querySelector('#ar-desc').value = rule.description || '';
      if (rule.officeId) el.querySelector('#ar-office').value = String(rule.officeId);
      const debitId = rule.debitAccounts?.[0]?.glAccountId || rule.debitAccounts?.[0]?.id;
      const creditId = rule.creditAccounts?.[0]?.glAccountId || rule.creditAccounts?.[0]?.id;
      if (debitId)  el.querySelector('#ar-debit').value  = String(debitId);
      if (creditId) el.querySelector('#ar-credit').value = String(creditId);
    } catch {}
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'ar-name');
    const debitId = vi(el, 'ar-debit'), creditId = vi(el, 'ar-credit');
    if (!name || !debitId || !creditId) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    const payload = {
      name,
      debitAccounts: [{ glAccountId: debitId }],
      creditAccounts: [{ glAccountId: creditId }]
    };
    const offId = vi(el, 'ar-office'); if (offId) payload.officeId = offId;
    const desc = v(el, 'ar-desc'); if (desc) payload.description = desc;
    try {
      if (isEdit) await api.accountingRules.update(ruleId, payload);
      else        await api.accountingRules.create(payload);
      el.remove();
      toast('success', isEdit ? 'Rule updated' : 'Rule created', name);
      onSuccess?.();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ─── Provisioning Criteria ─────────────────────────────────
async function openProvisioningModal(onSuccess) {
  const glAccounts = await glList();
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = 'prov-' + Date.now();
  const el = dynModal(mid, 'New Provisioning Criteria', `
    <label>Criteria name * <input id="pc-name" class="form-control" required/></label>

    <h4 class="mt-3">Provision Categories</h4>
    <table class="table">
      <thead><tr>
        <th>Category name</th>
        <th>Min days</th><th>Max days</th>
        <th>Min amount</th><th>Provision %</th>
        <th>Liability GL</th><th>Expense GL</th>
        <th></th>
      </tr></thead>
      <tbody id="pc-tbody">
        ${provRow(glOptsHtml, 0)}
      </tbody>
    </table>
    <button class="btn-secondary btn-sm mt-2" id="pc-add-row"><i class="fa-solid fa-plus"></i> Add category</button>`, true);

  let pIdx = 1;
  el.querySelector('#pc-add-row').addEventListener('click', () => {
    el.querySelector('#pc-tbody').insertAdjacentHTML('beforeend', provRow(glOptsHtml, pIdx++));
  });

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const criteriaName = v(el, 'pc-name');
    if (!criteriaName) { toast('warn', 'Enter criteria name', ''); return; }

    const definitions = [...el.querySelector('#pc-tbody').querySelectorAll('tr')].map(row => {
      const inputs = row.querySelectorAll('input,select');
      return {
        categoryName: inputs[0]?.value?.trim(),
        minimumAgeDays: parseInt(inputs[1]?.value) || 0,
        maximumAgeDays: parseInt(inputs[2]?.value) || undefined,
        minBalancePercentage: parseFloat(inputs[3]?.value) || 0,
        provisioningPercentage: parseFloat(inputs[4]?.value) || 0,
        liabilityAccount: parseInt(inputs[5]?.value) || undefined,
        expenseAccount: parseInt(inputs[6]?.value) || undefined
      };
    }).filter(d => d.categoryName);

    if (!definitions.length) { toast('warn', 'Add at least one provision category', ''); return; }

    try {
      await api.provisioning.createCriteria({ criteriaName, definitions, locale: LOCALE });
      el.remove();
      toast('success', 'Provisioning criteria created', criteriaName);
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

function provRow(glOptsHtml, idx) {
  return `
    <tr>
      <td><input class="form-control" placeholder="Name"/></td>
      <td><input type="number" class="form-control" placeholder="0"/></td>
      <td><input type="number" class="form-control" placeholder="—"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0"/></td>
      <td><input type="number" step="0.01" class="form-control" placeholder="0"/></td>
      <td><select class="form-control"><option value="">— GL —</option>${glOptsHtml}</select></td>
      <td><select class="form-control"><option value="">— GL —</option>${glOptsHtml}</select></td>
      <td><button class="btn-mini btn-danger" onclick="this.closest('tr').remove()">&times;</button></td>
    </tr>`;
}

// ─── Financial Activity Mapping ────────────────────────────
async function openFAModal(actOpts, onSuccess) {
  const glAccounts = await glList();
  const glOptsHtml = glAccounts.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${g.glCode})</option>`).join('');

  const mid = 'fa-' + Date.now();
  const el = dynModal(mid, 'Add Financial Activity Mapping', `
    <div class="form-grid">
      <label>Financial activity *
        <select id="fa-activity" class="form-control" required>
          <option value="">Select activity…</option>${actOpts}
        </select>
      </label>
      <label>GL Account *
        <select id="fa-gl" class="form-control" required>
          <option value="">— Select GL account —</option>${glOptsHtml}
        </select>
      </label>
    </div>`);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const financialActivityId = vi(el, 'fa-activity'), glAccountId = vi(el, 'fa-gl');
    if (!financialActivityId || !glAccountId) {
      toast('warn', 'Fill required fields', '');
      return;
    }
    try {
      await api.financialActivityAccounts.create({ financialActivityId, glAccountId });
      el.remove();
      toast('success', 'Mapping created', '');
      onSuccess();
    } catch (e) { toast('error', 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}




