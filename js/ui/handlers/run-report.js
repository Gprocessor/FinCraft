/* FinCraft · ui/handlers/run-report.js — RUN REPORT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { toast } from '../core.js';
import { extractFineractError, setSubmitting } from '../dom-helpers.js';
import { escapeHtml } from '../../utils.js';

export const RunReportHandlers = {
    'run-report': async (btn) => {
      const modal = document.getElementById('runReportModal');
      const reportName = modal?.dataset?.report || document.getElementById('run-report-name')?.textContent;
      if (!reportName || reportName === '—') { toast('warn', 'Report required', ''); return; }
      const params = {};
      const from = modal?.querySelector('#rep-from')?.value;
      const to   = modal?.querySelector('#rep-to')?.value;
      const fmt  = modal?.querySelector('#rep-fmt')?.value || 'JSON';
      const officeSel = modal?.querySelector('[data-populate="offices"]');
      if (from) params.R_fromDate = from;
      if (to) params.R_toDate = to;
      if (officeSel?.value) params.R_officeId = officeSel.value;
      const out = modal?.querySelector('#rep-output');
      if (out) out.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Running…</h3></div>';

      setSubmitting(btn, true);
      try {
        if (fmt === 'JSON') {
          const r = await api.runReports.run(reportName, params);
          const headers = (r.columnHeaders || []).map(h => `<th>${escapeHtml(h.columnName)}</th>`).join('');
          const rows = (r.data || []).map(d => `<tr>${(d.row || []).map(v => `<td>${escapeHtml(String(v ?? ''))}</td>`).join('')}</tr>`).join('');
          if (out) out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${headers}</tr></thead><tbody>${rows || '<tr><td>No data</td></tr>'}</tbody></table></div>`;
        } else {
          const res = await api.runReports.run(reportName, { ...params, 'output-type': fmt }, { raw: true });
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = reportName.replace(/\s+/g, '_') + '.' + fmt.toLowerCase();
          a.click();
          if (out) out.innerHTML = `<div class="msg-banner b-success"><i class="fa-solid fa-check"></i> ${fmt} downloaded</div>`;
        }
        toast('success', 'Report ready', reportName);
      } catch (e) {
        toast('error', 'Report failed', extractFineractError(e));
        if (out) out.innerHTML = `<div class="msg-banner b-danger">${escapeHtml(extractFineractError(e))}</div>`;
      } finally { setSubmitting(btn, false); }
      return;
    },
};
