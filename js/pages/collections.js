/* FinCraft · collections.js — Live API */
import { LOCALE, DATE_FORMAT, today } from '../config.js';
import { api } from '../api.js';
import { fmt, escapeHtml } from '../utils.js';
import { toast } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Collections</h1><div class="page-subtitle">Collection sheets for loan officers</div></div>
    </div>
    <div class="card">
      <div class="filter-bar">
        <select class="form-control" id="col-office"><option value="">Select Office…</option></select>
        <select class="form-control" id="col-officer"><option value="">Select Officer…</option></select>
        <input class="form-control" type="date" id="col-date" value="${today()}" style="max-width:170px"/>
        <button class="btn-primary" id="load-sheet"><i class="fa-solid fa-play"></i> Load Sheet</button>
      </div>
      <div id="sheet-area"><div class="empty-state"><i class="fa-solid fa-file-invoice-dollar"></i><div>Select filters and click <b>Load Sheet</b>.</div></div></div>
    </div>
  </div>`;

  const [offRes, staffRes, ptRes] = await Promise.all([
    api.offices.list().catch(() => []),
    api.staff.list({ isLoanOfficer: true }).catch(() => []),
    api.paymentTypes.list().catch(() => [])
  ]);
  const offices     = Array.isArray(offRes)   ? offRes   : [];
  const staffList   = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);
  const paymentTypes = Array.isArray(ptRes)   ? ptRes    : [];

  const offSel  = c.querySelector('#col-office');
  const offcrSel = c.querySelector('#col-officer');
  offices.forEach(o => { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.name; offSel.appendChild(opt); });
  staffList.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.displayName; offcrSel.appendChild(opt); });

  const modeOptions = paymentTypes.length
    ? '<option value="">— None —</option>' + paymentTypes.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
    : '<option value="">Cash (default)</option>';

  c.querySelector('#load-sheet').addEventListener('click', async () => {
    const officeId = offSel.value;
    const staffId  = offcrSel.value;
    const dateVal  = c.querySelector('#col-date').value;
    if (!dateVal) { toast('warn', 'Missing date', 'Select a meeting date'); return; }

    c.querySelector('#sheet-area').innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading collection sheet…</div></div>';

    try {
      // Real Fineract collection sheet endpoint — returns center→group→client→loan tree
      const params = {
        officeId:    officeId || undefined,
        staffId:     staffId  || undefined,
        meetingDate: dateVal,
        dateFormat:  DATE_FORMAT,
        locale:      LOCALE
      };
      const sheet = await api.collectionSheet.get(params);

      // Flatten tree into rows for display: sheet.groups[].clients[].loans[]
      const groups = Array.isArray(sheet.groups) ? sheet.groups : [];
      const flatRows = [];
      groups.forEach(g => {
        (g.clients || []).forEach(cl => {
          (cl.loans || []).forEach(ln => {
            flatRows.push({ group: g.groupName || '—', clientName: cl.clientName || '—', clientId: cl.clientId,
              accountNo: ln.accountNo || `#${ln.loanId}`, loanId: ln.loanId,
              due: ln.charges?.reduce((s, ch) => s + (ch.dueAmount || 0), 0) || 0 });
          });
        });
      });

      if (!flatRows.length) {
        c.querySelector('#sheet-area').innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-invoice-dollar"></i><div>No loans in collection sheet for selected filters</div></div>';
        return;
      }

      c.querySelector('#sheet-area').innerHTML = `
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Group</th><th>Client</th><th>Loan Account</th><th>Due Amount</th><th>Collected</th><th>Mode</th><th>Status</th></tr></thead>
          <tbody>${flatRows.map(r => `
            <tr>
              <td>${escapeHtml(r.group)}</td>
              <td>${escapeHtml(r.clientName)}</td>
              <td class="mono">${escapeHtml(r.accountNo)}</td>
              <td class="mono">${fmt(r.due)}</td>
              <td><input class="form-control" type="number" min="0" step="0.01" placeholder="0.00" data-loan-id="${r.loanId}" style="width:130px"/></td>
              <td><select class="form-control" data-payment-type="${r.loanId}" style="width:130px">${modeOptions}</select></td>
              <td id="row-status-${r.loanId}"><span class="badge b-warn">Pending</span></td>
            </tr>`).join('')}
          </tbody></table></div>
        <div class="flex justify-between mt-4">
          <button class="btn-ghost" id="print-sheet"><i class="fa-solid fa-print"></i> Print</button>
          <button class="btn-primary" id="save-sheet"><i class="fa-solid fa-save"></i> Post Collections</button>
        </div>`;

      c.querySelector('#save-sheet').addEventListener('click', async () => {
        const toPost = Array.from(c.querySelectorAll('[data-loan-id]'))
          .map(inp => ({ inp, amount: parseFloat(inp.value) }))
          .filter(r => r.amount > 0);

        if (!toPost.length) { toast('warn', 'Nothing to post', 'Enter at least one collected amount'); return; }

        const btn = c.querySelector('#save-sheet');
        btn.disabled = true;

        const requests = toPost.map((r, i) => ({
          requestId: i + 1,
          relativeUrl: `loans/${r.inp.dataset.loanId}/transactions?command=repayment`,
          method: 'POST',
          body: {
            transactionDate: dateVal, transactionAmount: r.amount,
            paymentTypeId: c.querySelector(`[data-payment-type="${r.inp.dataset.loanId}"]`)?.value || undefined,
            dateFormat: DATE_FORMAT, locale: LOCALE
          }
        }));

        let posted = 0;
        try {
          const results = await api.batch.submit(requests);
          results.forEach((res, i) => {
            const loanId  = toPost[i].inp.dataset.loanId;
            const statusEl = c.querySelector(`#row-status-${loanId}`);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              if (statusEl) statusEl.innerHTML = '<span class="badge b-success">Posted</span>';
              posted++;
            } else {
              const msg = res.body?.errors?.[0]?.defaultUserMessage || res.body?.defaultUserMessage || `HTTP ${res.statusCode}`;
              if (statusEl) statusEl.innerHTML = `<span class="badge b-danger" title="${escapeHtml(msg)}">Failed</span>`;
            }
          });
        } catch (e) {
          toast('error', 'Batch submission failed', e.message || String(e));
        }
        toast(posted > 0 ? 'success' : 'warn', `${posted} of ${toPost.length} repayment(s) posted`, 'Collection sheet saved');
        btn.disabled = false;
      });

      c.querySelector('#print-sheet').addEventListener('click', () => window.print());
    } catch (e) {
      c.querySelector('#sheet-area').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    }
  });
}
