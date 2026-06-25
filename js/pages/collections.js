import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · collections.js — Live API */
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
        <input class="form-control" type="date" id="col-date" value="${new Date().toISOString().split('T')[0]}" />
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
  const offices = Array.isArray(offRes) ? offRes : [];
  const staffList = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);
  const paymentTypes = Array.isArray(ptRes) ? ptRes : [];

  const offSel = c.querySelector('#col-office');
  offices.forEach(o => { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.name; offSel.appendChild(opt); });

  const offcrSel = c.querySelector('#col-officer');
  staffList.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.displayName; offcrSel.appendChild(opt); });

  c.querySelector('#load-sheet').addEventListener('click', async () => {
    const officeId = offSel.value;
    const staffId = offcrSel.value;
    const date = c.querySelector('#col-date').value;
    if (!officeId || !staffId || !date) { toast('warn', 'Missing filters', 'Select an office, officer, and date'); return; }

    c.querySelector('#sheet-area').innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading collection sheet…</div></div>';
    try {
      const res = await api.loans.list({ officeId, loanOfficerId: staffId, status: 'active', limit: 100 });
      const rows = Array.isArray(res) ? res : (res?.pageItems || []);

      if (!rows.length) {
        c.querySelector('#sheet-area').innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-invoice-dollar"></i><div>No active loans for selected filters</div></div>';
        return;
      }

      const modeOptions = paymentTypes.length
        ? paymentTypes.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
        : '<option value="">Cash (default)</option>';

      c.querySelector('#sheet-area').innerHTML = `
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Client</th><th>Loan Account</th><th>Due Amount</th><th>Collected</th><th>Mode</th><th>Status</th></tr></thead>
          <tbody>${rows.map(l => `
            <tr>
              <td>${escapeHtml(l.clientName || l.clientDisplayName || '—')}</td>
              <td class="mono">${escapeHtml(l.accountNo || `#${l.id}`)}</td>
              <td class="mono">${fmt(l.summary?.totalOverdue || 0)}</td>
              <td><input class="form-control" type="number" min="0" step="0.01" placeholder="0.00" data-loan-id="${l.id}" style="width:140px"/></td>
              <td><select class="form-control" data-payment-type="${l.id}" style="width:140px">${modeOptions}</select></td>
              <td id="row-status-${l.id}"><span class="badge b-warn">Pending</span></td>
            </tr>`).join('')}
          </tbody></table></div>
        <div class="flex justify-between mt-4">
          <button class="btn-ghost" id="print-sheet"><i class="fa-solid fa-print"></i> Print</button>
          <button class="btn-primary" id="save-sheet"><i class="fa-solid fa-save"></i> Post Collections</button>
        </div>`;

      c.querySelector('#save-sheet').addEventListener('click', async () => {
        const rowsToPost = Array.from(c.querySelectorAll('[data-loan-id]'))
          .map(input => ({ input, amount: parseFloat(input.value) }))
          .filter(r => r.amount > 0);

        if (!rowsToPost.length) { toast('warn', 'Nothing to post', 'Enter at least one collected amount'); return; }

        // One Fineract Batch API call instead of N sequential requests. Left
        // non-atomic (enclosingTransaction omitted) on purpose: these are independent
        // loans, and one client's failed payment shouldn't block everyone else's.
        const requests = rowsToPost.map((r, i) => {
          const paymentTypeId = c.querySelector(`[data-payment-type="${r.input.dataset.loanId}"]`)?.value;
          return {
            requestId: i + 1,
            relativeUrl: `loans/${r.input.dataset.loanId}/transactions?command=repayment`,
            method: 'POST',
            body: {
              transactionDate: date, // the collection sheet date selected above, not necessarily today
              transactionAmount: r.amount,
              paymentTypeId: paymentTypeId || undefined,
              dateFormat: DATE_FORMAT, locale: LOCALE
            }
          };
        });

        let posted = 0;
        try {
          const results = await api.batch.submit(requests);
          results.forEach((res, i) => {
            const loanId = rowsToPost[i].input.dataset.loanId;
            const statusEl = c.querySelector(`#row-status-${loanId}`);
            if (res.ok) {
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
        toast(posted > 0 ? 'success' : 'warn', `${posted} of ${rowsToPost.length} repayment(s) posted`, 'Collection sheet saved');
      });

      c.querySelector('#print-sheet').addEventListener('click', () => window.print());
    } catch (e) {
      c.querySelector('#sheet-area').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
    }
  });
}
