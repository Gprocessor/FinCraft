import { LOCALE, DATE_FORMAT, today } from '../config.js';
/* FinCraft · groups.js — Live API */
import { api } from '../api.js';
import { num, sb, escapeHtml } from '../utils.js';
import { toast, showEntityDetail } from '../ui.js';

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Groups</h1><div class="page-subtitle">JLG / Solidarity / Savings groups</div></div>
      <button class="btn-primary" data-modal="newGroupModal"><i class="fa-solid fa-plus"></i> New Group</button>
    </div>
    <div class="card">
      <div class="filter-bar">
        <input class="form-control" id="grp-search" placeholder="Search by name…" />
        <select class="form-control" id="grp-office"><option value="">All Offices</option></select>
        <span style="flex:1"></span>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Account</th><th>Group Name</th><th>Office</th><th>Staff</th><th>Status</th><th></th></tr></thead>
        <tbody id="grp-rows"><tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  api.offices.list().then(offices => {
    const sel = c.querySelector('#grp-office');
    (Array.isArray(offices) ? offices : []).forEach(o => {
      const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.name; sel.appendChild(opt);
    });
  }).catch(() => {});

  async function load() {
    c.querySelector('#grp-rows').innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div></td></tr>';
    try {
      const params = { limit: 100 };
      const officeId = c.querySelector('#grp-office')?.value;
      const q = c.querySelector('#grp-search')?.value?.toLowerCase() || '';
      if (officeId) params.officeId = officeId;
      const res = await api.groups.list(params);
      let list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (q) list = list.filter(g => g.name.toLowerCase().includes(q));
      c.querySelector('#grp-rows').innerHTML = list.map(g => `
        <tr data-id="${g.id}">
          <td class="mono">${escapeHtml(g.accountNo || `G${g.id}`)}</td>
          <td>${escapeHtml(g.name)}</td>
          <td>${escapeHtml(g.officeName || '—')}</td>
          <td>${escapeHtml(g.staffName || '—')}</td>
          <td>${sb(g.status?.value || '—')}</td>
          <td>
            <button class="btn-ghost btn-sm" data-grp-activate="${g.id}" title="Activate" style="${g.status?.value==='Pending'?'':'display:none'}"><i class="fa-solid fa-check"></i></button>
            <button class="btn-ghost btn-sm" data-grp-view="${g.id}" title="View"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>`).join('')
        || '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-people-group"></i><div>No groups found</div></div></td></tr>';

      c.querySelectorAll('[data-grp-view]').forEach(b => b.addEventListener('click', () => viewGroup(b.dataset.grpView, load)));
      c.querySelectorAll('[data-grp-activate]').forEach(b => b.addEventListener('click', async () => {
        // today() from config.js
        try {
          await api.groups.activate(b.dataset.grpActivate, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
          toast('success', 'Group activated', `#${b.dataset.grpActivate}`);
          load();
        } catch (e) { toast('error', 'Failed', e.message); }
      }));
    } catch (e) {
      c.querySelector('#grp-rows').innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div></div></td></tr>`;
    }
  }
  await load();
  let t;
  c.querySelector('#grp-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 400); });
  c.querySelector('#grp-office').addEventListener('change', load);
}

// Fineract: GET /groups/{id}?associations=all returns clientMembers, groupRoles, office, staff
function viewGroup(id, onChange) {
  showEntityDetail({
    title: `Group #${id}`,
    fetchFn: () => api.groups.get(id, { associations: 'all' }),
    renderBody: (g) => `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Name</span><span class="info-value">${escapeHtml(g.name || '—')}</span></div>
        <div class="info-item"><span class="info-label">Account No</span><span class="info-value mono">${escapeHtml(g.accountNo || '—')}</span></div>
        <div class="info-item"><span class="info-label">Office</span><span class="info-value">${escapeHtml(g.officeName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Staff</span><span class="info-value">${escapeHtml(g.staffName || '—')}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${sb(g.status?.value || '—')}</span></div>
        <div class="info-item"><span class="info-label">External ID</span><span class="info-value">${escapeHtml(g.externalId || '—')}</span></div>
      </div>
      <h4 class="mt-4 mb-2">Members (${(g.clientMembers||[]).length})</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Account</th><th>Status</th></tr></thead>
        <tbody>${(g.clientMembers||[]).map(m => `<tr><td>${escapeHtml(m.displayName)}</td><td class="mono">${escapeHtml(m.accountNo||'')}</td><td>${sb(m.status?.value||'—')}</td></tr>`).join('')
          || '<tr><td colspan="3" class="text-center text-muted" style="padding:14px">No members</td></tr>'}</tbody>
      </table></div>
      <div class="mt-4" id="edm-grp-actions"></div>`,
    onMount: (bodyEl, g, refresh) => {
      const actions = bodyEl.querySelector('#edm-grp-actions');
      if (g.status?.value === 'Pending') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary btn-sm';
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Activate Group';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            // today() from config.js
            await api.groups.activate(g.id, { activationDate: today(), dateFormat: DATE_FORMAT, locale: LOCALE });
            toast('success', 'Group activated', `#${g.id}`);
            refresh(); onChange?.();
          } catch (e) { toast('error', 'Activation failed', e.message); btn.disabled = false; }
        });
        actions.appendChild(btn);
      }
    }
  });
}
