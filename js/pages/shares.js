/* FinCraft · shares.js — Live API */
import { api } from '../api.js';
import { fmt, num, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, showEntityDetail } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Shares</h1><div class="page-subtitle">Share accounts</div></div>
      <button class="btn-primary" data-modal="newShareModal"><i class="fa-solid fa-plus"></i> New Share Account</button>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Client</th><th>Product</th><th>Requested Shares</th><th>Approved Shares</th><th>Status</th><th></th></tr></thead>
        <tbody id="sh-rows"><tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  try {
    const res = await api.shares.list({ limit: 100 });
    const list = Array.isArray(res) ? res : (res?.pageItems || []);
    c.querySelector('#sh-rows').innerHTML = list.length
      ? list.map(s => `<tr>
          <td class="mono">${escapeHtml(s.accountNo || `#${s.id}`)}</td>
          <td>${escapeHtml(s.clientName || '—')}</td>
          <td>${escapeHtml(s.productName || '—')}</td>
          <td class="mono">${num(s.requestedShares || 0)}</td>
          <td class="mono">${num(s.approvedShares || 0)}</td>
          <td>${sb(s.status?.value || '—')}</td>
          <td>
            <button class="btn-ghost btn-sm" data-sh-approve="${s.id}" title="Approve" style="${s.status?.value==='Submitted and pending approval'?'':'display:none'}"><i class="fa-solid fa-check"></i></button>
            <button class="btn-ghost btn-sm" data-sh-view="${s.id}" title="View"><i class="fa-solid fa-eye"></i></button>
          </td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-chart-pie"></i><div>No share accounts found</div></div></td></tr>';

    c.querySelectorAll('[data-sh-approve]').forEach(b => b.addEventListener('click', async () => {
      const today = new Date().toISOString().split('T')[0];
      try {
        await api.shares.approve(b.dataset.shApprove, { approvedDate: today, dateFormat: 'yyyy-MM-dd', locale: 'en' });
        toast('success', 'Share account approved', `#${b.dataset.shApprove}`);
        render(c);
      } catch (e) { toast('error', 'Approval failed', e.message); }
    }));
    c.querySelectorAll('[data-sh-view]').forEach(b => b.addEventListener('click', () => viewShare(b.dataset.shView)));
  } catch (e) {
    c.querySelector('#sh-rows').innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div></td></tr>`;
  }
}

// Fineract: GET /accounts/share/{id}?associations=all returns purchasedShares, charges, summary
function viewShare(id) {
  showEntityDetail({
    title: `Share Account #${id}`,
    fetchFn: () => api.shares.get(id, { associations: 'all' }),
    renderBody: (s) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Client</span><span class="info-value">${escapeHtml(s.clientName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Product</span><span class="info-value">${escapeHtml(s.productName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(s.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(s.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">Requested Shares</span><span class="info-value">${num(s.totalPendingForApprovalShares ?? s.requestedShares ?? 0)}</span></div>
        <div class="info-item"><span class="info-label">Approved Shares</span><span class="info-value">${num(s.totalApprovedShares ?? s.approvedShares ?? 0)}</span></div>
      </div>
      <h4 class="mt-4 mb-2">Purchase Requests</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Shares</th><th>Price</th><th>Status</th></tr></thead>
        <tbody>${(s.purchasedShares||[]).map(p => `<tr><td>${fmtDate(p.purchasedDate)||'—'}</td><td class="mono">${num(p.numberOfShares||0)}</td><td class="mono">${fmt(p.purchasePrice||0)}</td><td>${sb(p.status?.value||'—')}</td></tr>`).join('')
          || '<tr><td colspan="4" class="text-center text-muted" style="padding:14px">No purchase requests</td></tr>'}</tbody>
      </table></div>`
  });
}
