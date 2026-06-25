import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · loans.js — Full loan lifecycle */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, openModal } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Loans</h1><div class="page-subtitle">Loan portfolio · all statuses</div></div>
      <button class="btn-primary" data-modal="newLoanModal"><i class="fa-solid fa-plus"></i> New Loan</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active</div><div class="value" id="ln-active">—</div></div>
      <div class="stat-card c-warn"><div class="label">Pending Approval</div><div class="value" id="ln-pending">—</div></div>
      <div class="stat-card c-danger"><div class="label">Overdue</div><div class="value" id="ln-overdue">—</div></div>
      <div class="stat-card c-info"><div class="label">Total Records</div><div class="value" id="ln-total">—</div></div>
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control" id="lf-search" placeholder="Search by account or client…" />
        <select class="form-control" id="lf-status">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="approvalPending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="overpaid">Overpaid</option>
          <option value="closedObligationsMet">Closed</option>
        </select>
        <select class="form-control" id="lf-product"><option value="">All Products</option></select>
        <span style="flex:1"></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Principal</th><th>Outstanding</th><th>Disbursed</th><th>Status</th><th>Officer</th><th></th></tr></thead>
        <tbody id="loans-rows"><tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading loans…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  api.loanProducts.list().then(products => {
    const sel = c.querySelector('#lf-product');
    (Array.isArray(products) ? products : []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  async function loadLoans() {
    c.querySelector('#loans-rows').innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params    = { limit: 100 };
      const status    = c.querySelector('#lf-status')?.value;
      const productId = c.querySelector('#lf-product')?.value;
      if (status)    params.status = status;
      if (productId) params.loanProductId = productId;

      const res  = await api.loans.list(params);
      const raw  = Array.isArray(res) ? res : (res?.pageItems || []);
      let list   = raw.map(l => ({
        id: l.id, accountNo: l.accountNo || `#${l.id}`,
        clientName: l.clientName || l.clientDisplayName || '—',
        product: l.loanProductName || l.productName || '—',
        principal: l.principal || l.approvedPrincipal || 0,
        outstanding: l.summary?.totalOutstanding ?? 0,
        totalOverdue: l.summary?.totalOverdue ?? 0,
        disbursedOn: l.timeline?.actualDisbursementDate || l.timeline?.expectedDisbursementDate,
        status: l.status?.value || '—',
        officer: l.loanOfficerName || '—'
      }));

      const q = c.querySelector('#lf-search')?.value?.toLowerCase() || '';
      if (q) list = list.filter(l =>
        l.accountNo.toLowerCase().includes(q) || l.clientName.toLowerCase().includes(q));

      c.querySelector('#ln-total').textContent   = num(res?.totalFilteredRecords ?? list.length);
      c.querySelector('#ln-active').textContent  = num(list.filter(l => l.status === 'Active').length);
      c.querySelector('#ln-pending').textContent = num(list.filter(l =>
        ['Submitted and pending approval', 'Approved'].includes(l.status)).length);
      c.querySelector('#ln-overdue').textContent = num(list.filter(l => l.totalOverdue > 0).length);

      c.querySelector('#loans-rows').innerHTML = list.map(l => `
        <tr data-id="${l.id}">
          <td class="mono">${escapeHtml(l.accountNo)}</td>
          <td>${escapeHtml(l.clientName)}</td>
          <td>${escapeHtml(l.product)}</td>
          <td class="mono">${fmt(l.principal)}</td>
          <td class="mono">${fmt(l.outstanding)}</td>
          <td>${fmtDate(l.disbursedOn)}</td>
          <td>${sb(l.status)}</td>
          <td>${escapeHtml(l.officer)}</td>
          <td>
            <button class="btn-ghost btn-sm" data-loan-approve="${l.id}" title="Approve"
              style="${l.status === 'Submitted and pending approval' ? '' : 'display:none'}">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="btn-ghost btn-sm" data-loan-repay="${l.id}" title="Repayment"
              style="${l.status === 'Active' ? '' : 'display:none'}">
              <i class="fa-solid fa-money-bill"></i>
            </button>
            <button class="btn-ghost btn-sm" data-loan-view="${l.id}" title="View detail">
              <i class="fa-solid fa-eye"></i>
            </button>
          </td>
        </tr>`).join('')
        || '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-hand-holding-dollar"></i><div>No loans match</div></div></td></tr>';

      c.querySelectorAll('[data-loan-view]').forEach(b =>
        b.addEventListener('click', () => renderLoanDetail(document.getElementById('contentArea'), b.dataset.loanView, loadLoans)));
      c.querySelectorAll('[data-loan-approve]').forEach(b =>
        b.addEventListener('click', async () => {
          try {
            await api.loans.approve(b.dataset.loanApprove, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
            toast('success', 'Loan approved', `#${b.dataset.loanApprove}`);
            loadLoans();
          } catch (e) { toast('error', 'Approval failed', e.message); }
        }));
      c.querySelectorAll('[data-loan-repay]').forEach(b =>
        b.addEventListener('click', () => {
          const modal = openModal('repaymentModal');
          if (modal) modal.dataset.loanId = b.dataset.loanRepay;
        }));
    } catch (e) {
      c.querySelector('#loans-rows').innerHTML =
        `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message || 'Failed to load loans')}</div></div></td></tr>`;
    }
  }

  await loadLoans();
  let t;
  c.querySelector('#lf-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadLoans, 400); });
  c.querySelector('#lf-status').addEventListener('change', loadLoans);
  c.querySelector('#lf-product').addEventListener('change', loadLoans);
}

// ============================================================
// DETAIL VIEW
// ============================================================
async function renderLoanDetail(c, id, onListRefresh) {
  c.innerHTML = `<div class="page active"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading loan…</div></div></div>`;
  try {
    const l      = await api.loans.get(id, 'all');
    const status = l.status?.value || '';

    const canApprove      = status === 'Submitted and pending approval';
    const canUndoApproval = status === 'Approved';
    const canDisburse     = status === 'Approved';
    const canUndoDisburse = status === 'Active' && !(l.summary?.totalRepayment > 0);
    const canRepay        = status === 'Active';
    const canWaiveInt     = status === 'Active';
    const canWriteOff     = status === 'Active';
    const canForeclose    = status === 'Active';
    const canReschedule   = status === 'Active';

    c.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <div>
          <h1 class="page-title">Loan #${escapeHtml(l.accountNo || id)}</h1>
          <div class="page-subtitle">${escapeHtml(l.clientName || '—')} · ${escapeHtml(l.loanProductName || '—')}</div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost" id="back-to-loans"><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${canApprove      ? `<button class="btn-primary btn-sm" id="btn-approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
          ${canUndoApproval ? `<button class="btn-ghost btn-sm" id="btn-undo-approval"><i class="fa-solid fa-rotate-left"></i> Undo Approval</button>` : ''}
          ${canDisburse     ? `<button class="btn-primary btn-sm" id="btn-disburse"><i class="fa-solid fa-paper-plane"></i> Disburse</button>` : ''}
          ${canUndoDisburse ? `<button class="btn-ghost btn-sm" id="btn-undo-disburse"><i class="fa-solid fa-rotate-left"></i> Undo Disbursal</button>` : ''}
          ${canRepay        ? `<button class="btn-primary btn-sm" id="btn-repay"><i class="fa-solid fa-money-bill"></i> Repayment</button>` : ''}
          ${canWaiveInt     ? `<button class="btn-ghost btn-sm" id="btn-waive-int"><i class="fa-solid fa-eraser"></i> Waive Interest</button>` : ''}
          ${canWriteOff     ? `<button class="btn-ghost btn-sm" id="btn-writeoff"><i class="fa-solid fa-skull-crossbones"></i> Write Off</button>` : ''}
          ${canForeclose    ? `<button class="btn-ghost btn-sm" id="btn-foreclose"><i class="fa-solid fa-ban"></i> Foreclose</button>` : ''}
          ${canReschedule   ? `<button class="btn-ghost btn-sm" id="btn-reschedule"><i class="fa-solid fa-calendar-days"></i> Reschedule</button>` : ''}
          <button class="btn-ghost btn-sm" id="btn-assign-officer"><i class="fa-solid fa-user-tie"></i> Assign Officer</button>
        </div>
      </div>

      <div class="tabs mb-4">
        <button class="tab active" data-tab="ln-tab-overview">Overview</button>
        <button class="tab" data-tab="ln-tab-charges">Charges</button>
        <button class="tab" data-tab="ln-tab-guarantors">Guarantors</button>
        <button class="tab" data-tab="ln-tab-collateral">Collateral</button>
        <button class="tab" data-tab="ln-tab-docs">Documents</button>
        <button class="tab" data-tab="ln-tab-notes">Notes</button>
      </div>

      <div class="tab-panel active" id="ln-tab-overview">
        <div class="grid-2">
          <div class="card">
            <h3 class="card-title mb-4">Loan Details</h3>
            <div class="form-grid">
              <label><span class="form-label">Status</span><div>${escapeHtml(status)}</div></label>
              <label><span class="form-label">Officer</span><div>${escapeHtml(l.loanOfficerName || 'Unassigned')}</div></label>
              <label><span class="form-label">Principal</span><div class="mono">${fmt(l.principal || 0)}</div></label>
              <label><span class="form-label">Interest Rate</span><div>${num(l.interestRatePerPeriod || 0)}%</div></label>
              <label><span class="form-label">Outstanding</span><div class="mono">${fmt(l.summary?.totalOutstanding || 0)}</div></label>
              <label><span class="form-label">Overdue</span><div class="mono">${fmt(l.summary?.totalOverdue || 0)}</div></label>
              <label><span class="form-label">Submitted</span><div>${fmtDate(l.timeline?.submittedOnDate) || '—'}</div></label>
              <label><span class="form-label">Disbursed</span><div>${fmtDate(l.timeline?.actualDisbursementDate) || '—'}</div></label>
            </div>
          </div>
          <div class="card">
            <h3 class="card-title mb-4">Repayment Schedule</h3>
            <div class="tbl-wrap"><table class="tbl">
              <thead><tr><th>#</th><th>Due Date</th><th>Principal</th><th>Interest</th><th>Status</th></tr></thead>
              <tbody>${(l.repaymentSchedule?.periods || []).filter(p => p.period).map(p => `<tr>
                <td>${p.period}</td>
                <td>${fmtDate(p.dueDate) || '—'}</td>
                <td class="mono">${fmt(p.principalDue || 0)}</td>
                <td class="mono">${fmt(p.interestDue || 0)}</td>
                <td>${p.complete ? '<span class="badge b-success">Paid</span>' : '<span class="badge b-warn">Due</span>'}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted" style="padding:14px">No schedule</td></tr>'}</tbody>
            </table></div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="ln-tab-charges">
        <div class="card">
          <h3 class="card-title mb-4">Charges</h3>
          <div id="ln-charges-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="ln-tab-guarantors">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="card-title">Guarantors</h3>
            <button class="btn-primary btn-sm" id="btn-add-guarantor"><i class="fa-solid fa-plus"></i> Add Guarantor</button>
          </div>
          <div id="ln-guarantors-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="ln-tab-collateral">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h3 class="card-title">Collateral</h3>
            <button class="btn-primary btn-sm" id="btn-add-collateral"><i class="fa-solid fa-plus"></i> Add Collateral</button>
          </div>
          <div id="ln-collateral-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
        </div>
      </div>

      <div class="tab-panel" id="ln-tab-docs">
        <div class="card">
          <h3 class="card-title mb-4">Documents</h3>
          <div id="ln-doc-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
          <form id="ln-doc-form" class="form-grid mt-4">
            <label><span class="form-label">Name *</span><input name="name" required class="form-control" placeholder="e.g. Loan Agreement"/></label>
            <label><span class="form-label">Description</span><input name="description" class="form-control"/></label>
            <label class="full"><span class="form-label">File *</span><input name="file" type="file" required class="form-control"/></label>
            <label class="full"><button type="submit" class="btn-primary"><i class="fa-solid fa-upload"></i> Upload</button></label>
          </form>
        </div>
      </div>

      <div class="tab-panel" id="ln-tab-notes">
        <div class="card">
          <h3 class="card-title mb-4">Notes</h3>
          <div id="ln-note-list"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></div>
          <div class="flex gap-2 mt-3">
            <input id="ln-note-input" class="form-control" placeholder="Add a note…" style="flex:1"/>
            <button class="btn-primary btn-sm" id="ln-note-save"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>
    </div>`;

    const refresh = () => renderLoanDetail(c, id, onListRefresh);

    // ---- Tab switching (re-use .tabs/.tab/.tab-panel pattern) ----
    c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      c.querySelector(`#${tab.dataset.tab}`)?.classList.add('active');
    }));

    c.querySelector('#back-to-loans').addEventListener('click', () => {
      import('../router.js').then(r => r.navigate('loans'));
    });

    // ---- Lifecycle buttons ----
    c.querySelector('#btn-approve')?.addEventListener('click', async () => {
      if (!confirm('Approve this loan?')) return;
      try {
        await api.loans.approve(id, { approvedOnDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Loan approved', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Approval failed', e.message); }
    });

    c.querySelector('#btn-undo-approval')?.addEventListener('click', async () => {
      if (!confirm('Undo approval — return loan to pending?')) return;
      try {
        await api.loans.undoApproval(id);
        toast('success', 'Approval undone', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Failed', e.message); }
    });

    c.querySelector('#btn-disburse')?.addEventListener('click', async () => {
      if (!confirm(`Disburse loan #${id} today (${today()})?`)) return;
      try {
        await api.loans.disburse(id, { actualDisbursementDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Loan disbursed', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Disburse failed', e.message); }
    });

    c.querySelector('#btn-undo-disburse')?.addEventListener('click', async () => {
      if (!confirm('Undo disbursal — return loan to Approved status?')) return;
      try {
        await api.loans.undoDisbursal(id);
        toast('success', 'Disbursal undone', `#${id}`); onListRefresh?.(); refresh();
      } catch (e) { toast('error', 'Failed', e.message); }
    });

    c.querySelector('#btn-repay')?.addEventListener('click', () => {
      const modal = openModal('repaymentModal');
      if (modal) modal.dataset.loanId = id;
    });

    c.querySelector('#btn-waive-int')?.addEventListener('click', () => openWaiveInterestModal(id, refresh));

    c.querySelector('#btn-writeoff')?.addEventListener('click', () => {
      const modal = openModal('writeOffModal');
      if (modal) modal.dataset.loanId = id;
    });

    c.querySelector('#btn-foreclose')?.addEventListener('click', async () => {
      if (!confirm('Foreclose this loan? This cannot be undone.')) return;
      try {
        await api.loans.foreclose(id, { transactionDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
        toast('success', 'Loan foreclosed', `#${id}`); onListRefresh?.();
        import('../router.js').then(r => r.navigate('loans'));
      } catch (e) { toast('error', 'Foreclose failed', e.message); }
    });

    c.querySelector('#btn-reschedule')?.addEventListener('click', () => {
      const modal = openModal('rescheduleModal');
      if (modal) {
        modal.dataset.loanId = id;
        const hidden = document.getElementById('rs-loanid');
        if (hidden) hidden.value = id;
      }
    });

    c.querySelector('#btn-assign-officer')?.addEventListener('click', () =>
      openAssignOfficerModal(id, l.loanOfficerName, refresh));

    // ---- Sub-tab loaders ----
    loadLoanCharges(c, id);
    loadLoanGuarantors(c, id);
    loadLoanCollateral(c, id);
    loadLoanDocuments(c, id);
    loadLoanNotes(c, id);

    c.querySelector('#btn-add-guarantor')?.addEventListener('click', () =>
      openAddGuarantorModal(id, () => loadLoanGuarantors(c, id)));
    c.querySelector('#btn-add-collateral')?.addEventListener('click', () =>
      openAddCollateralModal(id, () => loadLoanCollateral(c, id)));

    c.querySelector('#ln-doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target, fd = new FormData(form);
      if (!fd.get('file')?.name) { toast('warn', 'No file', 'Choose a file'); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api.documents.upload('loans', id, fd);
        toast('success', 'Document uploaded', fd.get('name'));
        form.reset(); loadLoanDocuments(c, id);
      } catch (err) { toast('error', 'Upload failed', err.message); }
      finally { btn.disabled = false; }
    });

    c.querySelector('#ln-note-save').addEventListener('click', async () => {
      const inp = c.querySelector('#ln-note-input');
      const note = inp.value.trim();
      if (!note) return;
      try {
        await api.notes.create('loans', id, { note });
        inp.value = ''; loadLoanNotes(c, id);
        toast('success', 'Note added', '');
      } catch (e) { toast('error', 'Failed', e.message); }
    });

  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load loan</b></div><div class="text-muted mt-2">${escapeHtml(e.message)}</div></div></div>`;
  }
}

// ============================================================
// WAIVE INTEREST MODAL
// ============================================================
function openWaiveInterestModal(loanId, onSuccess) {
  const mid = `ln-waive-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Waive Interest</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Transaction date *</span>
              <input type="date" id="wi-date" class="form-control" value="${today()}" required/></label>
            <label class="full"><span class="form-label">Amount to waive *</span>
              <input type="number" id="wi-amount" min="0.01" step="0.01" class="form-control" required placeholder="Enter amount"/></label>
            <label class="full"><span class="form-label">Note</span>
              <textarea id="wi-note" class="form-control" rows="2" placeholder="Optional reason"></textarea></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="wi-confirm"><i class="fa-solid fa-eraser"></i> Waive Interest</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#wi-confirm').addEventListener('click', async () => {
    const transactionDate   = el.querySelector('#wi-date').value;
    const transactionAmount = parseFloat(el.querySelector('#wi-amount').value);
    if (!transactionDate || isNaN(transactionAmount)) { toast('warn', 'Fill required fields', ''); return; }
    try {
      await api.loans.waiveInterest(loanId, {
        transactionDate, transactionAmount, dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove();
      toast('success', 'Interest waived', `${transactionAmount} waived on loan #${loanId}`);
      onSuccess?.();
    } catch (e) { toast('error', 'Waive failed', e.message); }
  });
}

// ============================================================
// ASSIGN OFFICER MODAL
// ============================================================
async function openAssignOfficerModal(loanId, currentOfficer, onSuccess) {
  let staffList = [];
  try {
    const r = await api.staff.list({ isLoanOfficer: true });
    staffList = Array.isArray(r) ? r : (r?.pageItems || []);
  } catch {}

  const mid = `ln-officer-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Assign Loan Officer</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <p class="text-muted mb-3">Current officer: <b>${escapeHtml(currentOfficer || 'Unassigned')}</b></p>
          <div class="form-grid">
            <label class="full"><span class="form-label">New loan officer *</span>
              <select id="ao-officer" class="form-control" required>
                <option value="">Select officer…</option>
                ${staffList.map(s => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join('')}
              </select></label>
            <label class="full"><span class="form-label">Assignment date *</span>
              <input type="date" id="ao-date" class="form-control" value="${today()}" required/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          ${currentOfficer ? `<button class="btn-ghost" id="ao-unassign"><i class="fa-solid fa-user-minus"></i> Unassign</button>` : ''}
          <button class="btn-primary" id="ao-confirm"><i class="fa-solid fa-user-check"></i> Assign</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ao-confirm').addEventListener('click', async () => {
    const officerId      = el.querySelector('#ao-officer').value;
    const assignmentDate = el.querySelector('#ao-date').value;
    if (!officerId) { toast('warn', 'Select an officer', ''); return; }
    try {
      await api.loans.assignOfficer(loanId, {
        toLoanOfficerId: parseInt(officerId), assignmentDate, dateFormat: DATE_FORMAT, locale: LOCALE
      });
      el.remove(); toast('success', 'Officer assigned', ''); onSuccess?.();
    } catch (e) { toast('error', 'Assign failed', e.message); }
  });
  el.querySelector('#ao-unassign')?.addEventListener('click', async () => {
    if (!confirm('Unassign current officer?')) return;
    try {
      await api.loans.removeOfficer(loanId, { unassignedDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
      el.remove(); toast('success', 'Officer unassigned', ''); onSuccess?.();
    } catch (e) { toast('error', 'Failed', e.message); }
  });
}

// ============================================================
// CHARGES SUB-TAB
// ============================================================
async function loadLoanCharges(c, id) {
  const el = c.querySelector('#ln-charges-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const charges = await api.loans.listCharges(id);
    const list    = Array.isArray(charges) ? charges : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Amount</th><th>Due</th><th>Paid</th><th>Timing</th><th></th></tr></thead>
          <tbody>${list.map(ch => `<tr>
            <td>${escapeHtml(ch.name || '—')}</td>
            <td class="mono">${fmt(ch.amount || 0)}</td>
            <td class="mono">${fmt(ch.amountDue || 0)}</td>
            <td class="mono">${fmt(ch.amountPaid || 0)}</td>
            <td>${escapeHtml(ch.chargeTimeType?.value || '—')}</td>
            <td>${!ch.paid ? `<button class="btn-ghost btn-sm" data-waive-charge="${ch.id}" title="Waive"><i class="fa-solid fa-eraser"></i></button>` : '<span class="badge b-success">Paid</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-receipt"></i><div>No charges on this loan</div></div>';
    el.querySelectorAll('[data-waive-charge]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Waive this charge?')) return;
      try {
        await api.loans.waiveCharge(id, b.dataset.waiveCharge);
        toast('success', 'Charge waived', ''); loadLoanCharges(c, id);
      } catch (e) { toast('error', 'Waive failed', e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ============================================================
// GUARANTORS SUB-TAB
// ============================================================
async function loadLoanGuarantors(c, id) {
  const el = c.querySelector('#ln-guarantors-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const res  = await api.loans.guarantors(id);
    const list = Array.isArray(res) ? res : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Type</th><th>Amount Guaranteed</th><th></th></tr></thead>
          <tbody>${list.map(g => {
            const name = g.clientName || [g.firstname, g.lastname].filter(Boolean).join(' ') || '—';
            return `<tr>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(g.guarantorType?.value || '—')}</td>
              <td class="mono">${fmt(g.amount || 0)}</td>
              <td><button class="btn-ghost btn-sm" data-del-guarantor="${g.id}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-user-shield"></i><div>No guarantors on file</div></div>';
    el.querySelectorAll('[data-del-guarantor]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this guarantor?')) return;
      try {
        await api.loans.deleteGuarantor(id, b.dataset.delGuarantor);
        toast('success', 'Guarantor removed', ''); loadLoanGuarantors(c, id);
      } catch (e) { toast('error', 'Remove failed', e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAddGuarantorModal(loanId, onSuccess) {
  const mid = `ln-guar-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal lg">
        <div class="modal-head"><h3 class="modal-title">Add Guarantor</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Guarantor type *</span>
              <select id="gar-type" class="form-control">
                <option value="1">Existing client</option>
                <option value="2">External person</option>
              </select></label>
            <div id="gar-client-wrap" class="full form-grid">
              <label class="full"><span class="form-label">Client name *</span>
                <input id="gar-client-search" class="form-control" placeholder="Type client name to search…" autocomplete="off"/>
                <input type="hidden" id="gar-client-id"/>
                <div id="gar-client-results" style="display:none;border:1px solid var(--color-border-secondary);border-radius:6px;margin-top:4px;max-height:180px;overflow-y:auto;background:var(--color-background-primary)"></div>
              </label>
            </div>
            <div id="gar-external-wrap" class="full form-grid" style="display:none">
              <label><span class="form-label">First name *</span><input id="gar-fname" class="form-control"/></label>
              <label><span class="form-label">Last name *</span><input id="gar-lname" class="form-control"/></label>
              <label><span class="form-label">Mobile</span><input id="gar-mobile" class="form-control" type="tel"/></label>
            </div>
            <label class="full"><span class="form-label">Amount guaranteed</span>
              <input type="number" id="gar-amount" min="0" step="0.01" class="form-control" placeholder="Optional"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="gar-save"><i class="fa-solid fa-check"></i> Add Guarantor</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));

  el.querySelector('#gar-type').addEventListener('change', (e) => {
    el.querySelector('#gar-client-wrap').style.display   = e.target.value === '1' ? '' : 'none';
    el.querySelector('#gar-external-wrap').style.display = e.target.value === '2' ? '' : 'none';
  });

  // Client search autocomplete
  const searchEl   = el.querySelector('#gar-client-search');
  const resultsEl  = el.querySelector('#gar-client-results');
  const clientIdEl = el.querySelector('#gar-client-id');
  let debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = searchEl.value.trim();
    if (q.length < 2) { resultsEl.style.display = 'none'; return; }
    debounce = setTimeout(async () => {
      try {
        const res  = await api.clients.list({ displayName: q, limit: 8 });
        const rows = Array.isArray(res) ? res : (res?.pageItems || []);
        resultsEl.innerHTML = rows.map(cl =>
          `<div style="padding:8px 12px;cursor:pointer" class="search-result" data-id="${cl.id}" data-name="${escapeHtml(cl.displayName)}">${escapeHtml(cl.displayName)} <span class="mono text-muted" style="font-size:11px">#${cl.accountNo}</span></div>`
        ).join('') || '<div style="padding:8px 12px;color:var(--color-text-secondary)">No results</div>';
        resultsEl.style.display = 'block';
        resultsEl.querySelectorAll('[data-id]').forEach(r => r.addEventListener('click', () => {
          clientIdEl.value  = r.dataset.id;
          searchEl.value    = r.dataset.name;
          resultsEl.style.display = 'none';
        }));
      } catch {}
    }, 300);
  });

  el.querySelector('#gar-save').addEventListener('click', async () => {
    const typeVal = el.querySelector('#gar-type').value;
    const amount  = el.querySelector('#gar-amount').value;
    const payload = { guarantorTypeId: parseInt(typeVal), ...(amount && { amount: parseFloat(amount) }) };
    if (typeVal === '1') {
      const cid = clientIdEl.value;
      if (!cid) { toast('warn', 'Search and select a client', ''); return; }
      payload.entityId = parseInt(cid);
    } else {
      const fname = el.querySelector('#gar-fname').value.trim();
      const lname = el.querySelector('#gar-lname').value.trim();
      if (!fname || !lname) { toast('warn', 'Enter first and last name', ''); return; }
      payload.firstname = fname; payload.lastname = lname;
      const mobile = el.querySelector('#gar-mobile').value.trim();
      if (mobile) payload.mobileNumber = mobile;
    }
    try {
      await api.loans.addGuarantor(loanId, payload);
      el.remove(); toast('success', 'Guarantor added', ''); onSuccess();
    } catch (e) { toast('error', 'Failed to add guarantor', e.message); }
  });
}

// ============================================================
// COLLATERAL SUB-TAB
// ============================================================
async function loadLoanCollateral(c, id) {
  const el = c.querySelector('#ln-collateral-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const res  = await api.loans.listCollaterals(id);
    const list = Array.isArray(res) ? res : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Type</th><th>Value</th><th>Description</th><th></th></tr></thead>
          <tbody>${list.map(col => `<tr>
            <td>${escapeHtml(col.collateralType?.name || col.type || '—')}</td>
            <td class="mono">${fmt(col.value || 0)}</td>
            <td>${escapeHtml(col.description || '—')}</td>
            <td><button class="btn-ghost btn-sm" data-del-col="${col.id}"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-box-archive"></i><div>No collateral on file</div></div>';
    el.querySelectorAll('[data-del-col]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove this collateral item?')) return;
      try {
        await api.loans.deleteCollateral(id, b.dataset.delCol);
        toast('success', 'Collateral removed', ''); loadLoanCollateral(c, id);
      } catch (e) { toast('error', 'Remove failed', e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

async function openAddCollateralModal(loanId, onSuccess) {
  const mid = `ln-col-${Date.now()}`;
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div id="${mid}" class="modal-overlay open">
      <div class="modal">
        <div class="modal-head"><h3 class="modal-title">Add Collateral</h3>
          <button class="icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="full"><span class="form-label">Description / Type *</span>
              <input id="col-desc" class="form-control" required placeholder="e.g. Land title, Vehicle, Equipment"/></label>
            <label class="full"><span class="form-label">Value *</span>
              <input type="number" id="col-value" min="0" step="0.01" class="form-control" required placeholder="Market value"/></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-close-modal>Cancel</button>
          <button class="btn-primary" id="col-save"><i class="fa-solid fa-check"></i> Add</button>
        </div>
      </div>
    </div>`);
  const el = document.getElementById(mid);
  el.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => el.remove()));
  el.querySelector('#col-save').addEventListener('click', async () => {
    const description = el.querySelector('#col-desc').value.trim();
    const value       = parseFloat(el.querySelector('#col-value').value);
    if (!description || isNaN(value)) { toast('warn', 'Fill all required fields', ''); return; }
    try {
      await api.loans.addCollateral(loanId, { description, value, locale: LOCALE });
      el.remove(); toast('success', 'Collateral added', description); onSuccess();
    } catch (e) { toast('error', 'Failed to add collateral', e.message); }
  });
}

// ============================================================
// DOCUMENTS SUB-TAB
// ============================================================
async function loadLoanDocuments(c, id) {
  const el = c.querySelector('#ln-doc-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const docs = await api.documents.list('loans', id);
    const list = Array.isArray(docs) ? docs : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Description</th><th></th></tr></thead>
          <tbody>${list.map(d => `<tr>
            <td>${escapeHtml(d.name || '—')}</td>
            <td>${escapeHtml(d.description || '—')}</td>
            <td>
              <button class="btn-ghost btn-sm" data-doc-dl="${d.id}"><i class="fa-solid fa-download"></i></button>
              <button class="btn-ghost btn-sm" data-doc-del="${d.id}"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><i class="fa-solid fa-file-circle-question"></i><div>No documents yet</div></div>';
    el.querySelectorAll('[data-doc-dl]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res  = await api.documents.download('loans', id, b.dataset.docDl);
        const blob = await res.blob();
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `loan-doc-${b.dataset.docDl}`; a.click();
      } catch (e) { toast('error', 'Download failed', e.message); }
    }));
    el.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this document?')) return;
      try {
        await api.documents.delete('loans', id, b.dataset.docDel);
        toast('success', 'Deleted', ''); loadLoanDocuments(c, id);
      } catch (e) { toast('error', 'Delete failed', e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div>`;
  }
}

// ============================================================
// NOTES SUB-TAB
// ============================================================
async function loadLoanNotes(c, id) {
  const el = c.querySelector('#ln-note-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>';
  try {
    const notes = await api.notes.list('loans', id);
    const list  = Array.isArray(notes) ? notes : [];
    el.innerHTML = list.length
      ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Note</th><th>By</th><th>Date</th></tr></thead>
          <tbody>${list.map(n => `<tr>
            <td>${escapeHtml(n.note || '—')}</td>
            <td>${escapeHtml(n.createdByUsername || '—')}</td>
            <td>${fmtDate(n.createdOn) || '—'}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="text-muted" style="padding:8px 0">No notes yet</div>';
  } catch {
    el.innerHTML = '<div class="text-muted" style="padding:8px 0">Could not load notes</div>';
  }
}
