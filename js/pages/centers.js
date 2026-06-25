import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · centers.js — Live API */
import { api } from '../api.js';
import { sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, showEntityDetail } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Centers</h1><div class="page-subtitle">Center hierarchy</div></div>
      <button class="btn-primary" data-modal="newCenterModal"><i class="fa-solid fa-plus"></i> New Center</button>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Name</th><th>Office</th><th>Staff</th><th>Status</th><th></th></tr></thead>
        <tbody id="ctr-rows"><tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  async function load() {
    c.querySelector('#ctr-rows').innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const res = await api.centers.list({ limit: 100 });
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      c.querySelector('#ctr-rows').innerHTML = list.length
        ? list.map(s => `<tr>
            <td class="mono">${escapeHtml(s.accountNo || `C${s.id}`)}</td>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.officeName || '—')}</td>
            <td>${escapeHtml(s.staffName || '—')}</td>
            <td>${sb(s.status?.value || '—')}</td>
            <td><button class="btn-ghost btn-sm" data-ctr-view="${s.id}" title="View"><i class="fa-solid fa-eye"></i></button></td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-building-columns"></i><div>No centers found</div></div></td></tr>';

      c.querySelectorAll('[data-ctr-view]').forEach(b => b.addEventListener('click', () => viewCenter(b.dataset.ctrView, load)));
    } catch (e) {
      c.querySelector('#ctr-rows').innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div></td></tr>`;
    }
  }
  await load();
}

// Fineract: GET /centers/{id}?associations=groupMembers,collection returns the center's
// associated groups + collection-sheet meeting config alongside the base fields.
function viewCenter(id, onChange) {
  showEntityDetail({
    title: `Center #${id}`,
    fetchFn: () => api.centers.get(id, { associations: 'groupMembers,collection' }),
    renderBody: (ctr) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Name</span><span class="info-value">${escapeHtml(ctr.name || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(ctr.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Office</span><span class="info-value">${escapeHtml(ctr.officeName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Staff</span><span class="info-value">${escapeHtml(ctr.staffName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(ctr.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">Activation Date</span><span class="info-value">${fmtDate(ctr.activationDate) || '—'}</span></div>
      </div>
      <h4 class="mt-4 mb-2">Associated Groups (${(ctr.groupMembers||[]).length})</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Office</th><th>Status</th></tr></thead>
        <tbody>${(ctr.groupMembers||[]).map(g => `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.officeName||'—')}</td><td>${sb(g.status?.value||'—')}</td></tr>`).join('')
          || '<tr><td colspan="3" class="text-center text-muted" style="padding:14px">No groups associated</td></tr>'}</tbody>
      </table></div>
      <div class="mt-4" id="edm-ctr-actions"></div>`,
    onMount: (bodyEl, ctr, refresh) => {
      const actions = bodyEl.querySelector('#edm-ctr-actions');
      if (ctr.status?.value === 'Pending') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary btn-sm';
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Activate Center';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            // today() from config.js
            await api.centers.activate(ctr.id, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
            toast('success', 'Center activated', `#${ctr.id}`);
            refresh(); onChange?.();
          } catch (e) { toast('error', 'Activation failed', e.message); btn.disabled = false; }
        });
        actions.appendChild(btn);
      }
    }
  });
}
