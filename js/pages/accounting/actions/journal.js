/* FinCraft · pages/accounting/actions/journal.js — journal entry, reversal, and frequent posting modals.
   Auto-split from the original monolithic pages/accounting/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';
import { dynModal, glList, v, vi } from '../shared.js';

export function openReverseJEModal(transactionId, onSuccess) {
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

export async function openFrequentPostingModal(ruleId, rule, onSuccess) {
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

export async function openJournalEntryModal(onSuccess) {
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
