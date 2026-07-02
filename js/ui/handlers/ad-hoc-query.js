/* FinCraft · ui/handlers/ad-hoc-query.js — AD-HOC QUERY form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { toast } from '../core.js';
import { extractFineractError, setSubmitting } from '../dom-helpers.js';
import { escapeHtml } from '../../utils.js';

export const AdHocQueryHandlers = {
    'run-sql': async (btn) => {
      const queryName = document.getElementById('sqlQuery')?.value?.trim();
      if (!queryName) { toast('warn', 'Query required', 'Enter a registered report name'); return; }
      const out = document.getElementById('sqlResult');
      if (out) out.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Running…</h3></div>';

      setSubmitting(btn, true);
      try {
        const r = await api.runReports.run(queryName, {});
        const headers = (r.columnHeaders || []).map(h => `<th>${escapeHtml(h.columnName)}</th>`).join('');
        const rows = (r.data || []).map(d => `<tr>${(d.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('');
        if (out) out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows || '<tr><td>No data</td></tr>'}</tbody></table></div>`;
      } catch (e) {
        if (out) out.innerHTML = `<div class="msg-banner b-danger">${escapeHtml(extractFineractError(e))}</div>`;
      } finally { setSubmitting(btn, false); }
      return;
    },
};
