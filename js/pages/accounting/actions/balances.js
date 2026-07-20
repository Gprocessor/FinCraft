/* FinCraft · pages/accounting/actions/balances.js — opening balance row helper and submit handler.
   Auto-split from the original monolithic pages/accounting/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export function openingBalanceRow(accounts, prefix, idx) {
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

export async function submitOpeningBalances(el) {
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
    toast('error', 'Submission failed', extractFineractError(e));
  }
}
