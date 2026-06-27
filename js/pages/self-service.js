import { LOCALE, DATE_FORMAT, today } from '../config.js';

/* FinCraft · self-service.js — Portal users & beneficiaries (permission-gated) */
import { api } from '../api.js';
import { store } from '../store.js';
import { fmt, num, ini, sb, escapeHtml, fmtDate } from '../utils.js';
import { toast, confirm as modalConfirm } from '../ui.js';

const can = (code) => store.hasPermission(code);

const TABS = ['Portal Users', 'Beneficiaries (TPT)'];

export async function render(c) {
  c.innerHTML = `
    <div class="page-header mb-3">
      <div>
        <h1>Self Service</h1>
        <div class="text-muted">Manage portal users and third-party transfer beneficiaries</div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" id="ss-tabs">
        ${TABS.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="ss-${i}">${t}</button>`).join('')}
      </div>
      ${TABS.map((_, i) => `
        <div class="tab-panel ${i === 0 ? 'active' : ''}" id="ss-${i}">
          <div class="empty-state-row">Loading…</div>
        </div>`).join('')}
    </div>`;

  const loaders = {
    0: loadPortalUsers,
    1: loadBeneficiaries
  };
  const loaded = {};

  c.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    c.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    c.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    c.querySelector('#' + tab.dataset.tab)?.classList.add('active');
    const idx = parseInt(tab.dataset.tab.split('-')[1]);
    if (loaders[idx] && !loaded[idx]) {
      loaded[idx] = true;
      loadersc;
    }
  }));

  loadPortalUsers(c);
  loaded[0] = true;
}

// ════════════════════════════════════════════════════════════
// TAB 0 — PORTAL USERS
// ════════════════════════════════════════════════════════════
async function loadPortalUsers(c) {
  const el = c.querySelector('#ss-0');
  el.innerHTML = '<div class="empty-state-row">Loading portal users…</div>';

  try {
    const res = await api.selfService.users();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    // KPIs
    const activeCount   = list.filter(u => u.passwordExpired !== true && u.accountNonLocked !== false).length;
    const lockedCount   = list.filter(u => u.accountNonLocked === false).length;
    const expiredCount  = list.filter(u => u.passwordExpired).length;

    el.innerHTML = `
      <div class="kpi-grid mb-3">
        <div class="kpi-card"><div class="kpi-label">Total Portal Users</div><div class="kpi-value">${num(list.length)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Active</div><div class="kpi-value">${num(activeCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Locked</div><div class="kpi-value">${num(lockedCount)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Password Expired</div><div class="kpi-value">${num(expiredCount)}</div></div>
      </div>

      <div class="section-header mb-2">
        <div class="filter-bar" style="flex:1">
          <input id="ss-user-search" class="form-control" placeholder="Search username, email, client…" autocomplete="off"/>
          <select id="ss-user-status" class="form-control">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="expired">Password Expired</option>
          </select>
        </div>
        ${can('CREATE_USER') ? '<button class="btn-secondary" id="btn-ss-info"><i class="fa-solid fa-circle-info"></i> About Self-Service</button>' : ''}
      </div>

      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Portal users are self-registered via the self-service mobile/web app. Admin can activate, reset password, and view linked clients.
      </div>

      <div id="ss-user-table"></div>`;

    function draw(rows) {
      const tableWrap = el.querySelector('#ss-user-table');
      if (!rows.length) {
        tableWrap.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-mobile-screen"></i>
            <h3>No portal users found</h3>
            <div class="text-muted mt-2">Users self-register via the self-service mobile/web app.</div>
          </div>`;
        return;
      }

      tableWrap.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>Username</th><th>Linked Client</th><th>Email</th>
            <th>Last Login</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows.map(u => `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="avatar">${ini(u.username || '?')}</div>
                  <div><b>${escapeHtml(u.username)}</b>
                  ${u.firstname || u.lastname ? `<div class="text-muted small">${escapeHtml((u.firstname || '') + ' ' + (u.lastname || ''))}</div>` : ''}
                  </div>
                </div>
              </td>
              <td>${u.clientId ? `${u.clientId}">${escapeHtml(u.clientName || ('#' + u.clientId))}</a>` : '—'}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>${fmtDate(u.lastLogin) || fmtDate(u.lastTimePasswordUpdated) || '—'}</td>
              <td>
                ${u.accountNonLocked === false ? '<span class="badge b-danger">Locked</span>' : ''}
                ${u.passwordExpired ? '<span class="badge b-warning">Expired</span>' : ''}
                ${u.accountNonLocked !== false && !u.passwordExpired ? sb('Active') : ''}
              </td>
              <td class="text-right">
                ${can('UPDATE_USER') ? `<button class="btn-mini" data-ss-reset="${u.id}" data-ss-username="${escapeHtml(u.username)}">Reset Password</button>` : ''}
                ${can('UPDATE_USER') && u.accountNonLocked === false ? `<button class="btn-mini btn-success" data-ss-unlock="${u.id}">Unlock</button>` : ''}
                ${u.clientId ? `<button class="btn-mini" data-ss-view-client="${u.clientId}">View Client</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>`;

      tableWrap.querySelectorAll('[data-ss-reset]').forEach(b => b.addEventListener('click', () =>
        openResetPortalPasswordModal(b.dataset.ssReset, b.dataset.ssUsername)
      ));

      tableWrap.querySelectorAll('[data-ss-unlock]').forEach(b => b.addEventListener('click', async () => {
        if (!await modalConfirm({ title: 'Unlock portal user?', confirmText: 'Unlock' })) return;
        try {
          await api.users.update(b.dataset.ssUnlock, { accountNonLocked: true });
          toast('success', 'Account unlocked', '');
          loadPortalUsers(c);
        } catch (e) { toast('error', 'Unlock failed', e.detail?.defaultUserMessage || e.message); }
      }));

      tableWrap.querySelectorAll('[data-ss-view-client]').forEach(b => b.addEventListener('click', () =>
        import('../router.js').then(r => r.navigate('client-detail', { id: b.dataset.ssViewClient }))
      ));
    }

    function applyFilters() {
      const q = el.querySelector('#ss-user-search').value.toLowerCase().trim();
      const status = el.querySelector('#ss-user-status').value;

      let filtered = list;
      if (q) filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.clientName || '').toLowerCase().includes(q));
      if (status === 'locked')  filtered = filtered.filter(u => u.accountNonLocked === false);
      if (status === 'expired') filtered = filtered.filter(u => u.passwordExpired);
      if (status === 'active')  filtered = filtered.filter(u => u.accountNonLocked !== false && !u.passwordExpired);

      draw(filtered);
    }

    let t;
    el.querySelector('#ss-user-search').addEventListener('input', () => {
      clearTimeout(t); t = setTimeout(applyFilters, 250);
    });
    el.querySelector('#ss-user-status').addEventListener('change', applyFilters);

    el.querySelector('#btn-ss-info')?.addEventListener('click', () => openSelfServiceInfoModal());

    draw(list);
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Self-service not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// RESET PORTAL USER PASSWORD MODAL
// ════════════════════════════════════════════════════════════
function openResetPortalPasswordModal(userId, username) {
  const mid = 'ss-reset-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>Reset Password — @' + escapeHtml(username) + '</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<div class="msg-banner b-warning mb-2">' +
        '<i class="fa-solid fa-triangle-exclamation"></i> ' +
        'The user will need to use this new password on their next login to the portal.' +
      '</div>' +
      '<div class="form-grid">' +
        '<label>New password * <input type="password" id="rpp-new" class="form-control" autocomplete="new-password" required/></label>' +
        '<label>Repeat password * <input type="password" id="rpp-repeat" class="form-control" autocomplete="new-password" required/></label>' +
        '<label class="checkbox-row"><input type="checkbox" id="rpp-must-change" checked/> Require user to change on next login</label>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Cancel</button>' +
      '<button class="btn-primary" id="rpp-save">Reset Password</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#rpp-save').addEventListener('click', async () => {
    const pw = modalEl.querySelector('#rpp-new').value;
    const pw2 = modalEl.querySelector('#rpp-repeat').value;
    if (!pw || pw !== pw2) { toast('warn', 'Passwords must match', ''); return; }

    const payload = {};
    payload.password = pw;
    payload.repeatPassword = pw2;
    if (modalEl.querySelector('#rpp-must-change').checked) payload.shouldRenewPassword = true;

    try {
      await api.users.update(userId, payload);
      modalEl.remove();
      toast('success', 'Password reset', 'User must log in with new password');
    } catch (e) { toast('error', 'Reset failed', e.detail?.defaultUserMessage || e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// SELF-SERVICE INFO MODAL
// ════════════════════════════════════════════════════════════
function openSelfServiceInfoModal() {
  const mid = 'ss-info-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>About Self-Service</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<h4>What is Self-Service?</h4>' +
      '<div class="text-muted mb-3">' +
        'Self-Service is a parallel API surface that lets end customers manage their own accounts via mobile/web apps without staff intervention.' +
      '</div>' +
      '<h4>Registration Flow</h4>' +
      '<ol style="line-height:1.8">' +
        '<li>Customer registers via the self-service mobile/web app</li>' +
        '<li>Fineract creates a portal user linked to a real client account</li>' +
        '<li>Admin reviews and activates the user (if required by tenant config)</li>' +
        '<li>Customer can then view accounts, see balances, and create third-party transfer (TPT) beneficiaries</li>' +
      '</ol>' +
      '<h4 class="mt-3">Admin Tasks Here</h4>' +
      '<ul style="line-height:1.8">' +
        '<li>View list of registered portal users</li>' +
        '<li>Reset password for users locked out</li>' +
        '<li>Unlock accounts</li>' +
        '<li>Manage third-party transfer (TPT) beneficiaries</li>' +
      '</ul>' +
      '<div class="msg-banner b-info mt-3">' +
        '<i class="fa-solid fa-circle-info"></i> ' +
        'New portal user registrations come from the customer-facing app, not from this admin interface.' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Close</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
}

// ════════════════════════════════════════════════════════════
// TAB 1 — BENEFICIARIES (TPT)
// ════════════════════════════════════════════════════════════
async function loadBeneficiaries(c) {
  const el = c.querySelector('#ss-1');
  el.innerHTML = '<div class="empty-state-row">Loading beneficiaries…</div>';

  try {
    const res = await api.selfService.beneficiaries();
    const list = Array.isArray(res) ? res : (res?.pageItems || []);

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Third-Party Transfer (TPT) Beneficiaries</h3>
          <span class="text-muted">${num(list.length)} beneficiar${list.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        ${can('CREATE_USER') ? '<button class="btn-primary" id="btn-add-ben"><i class="fa-solid fa-plus"></i> Add Beneficiary</button>' : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        TPT beneficiaries allow portal users to make transfers to pre-approved external accounts.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Office</th><th>Client</th>
            <th>Account</th><th>Type</th><th></th>
          </tr></thead>
          <tbody>${list.map(b => `
            <tr>
              <td><b>${escapeHtml(b.name || '—')}</b></td>
              <td>${escapeHtml(b.officeName || '—')}</td>
              <td>${escapeHtml(b.clientName || '—')}</td>
              <td>${escapeHtml(b.accountNumber || b.accountNo || '—')}</td>
              <td>${escapeHtml(b.accountType?.value || b.accountType || '—')}</td>
              <td class="text-right">
                ${can('UPDATE_USER') ? `<button class="btn-mini" data-edit-ben="${b.id}">Edit</button>` : ''}
                ${can('DELETE_USER') ? `<button class="btn-mini btn-danger" data-del-ben="${b.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-user-tag"></i>
          <h3>No beneficiaries defined</h3>
          ${can('CREATE_USER') ? '<div class="text-muted mt-2">Add the first beneficiary using the button above.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-add-ben')?.addEventListener('click', () =>
      openBeneficiaryFormModal(null, () => loadBeneficiaries(c))
    );

    el.querySelectorAll('[data-edit-ben]').forEach(b => b.addEventListener('click', () => {
      const existing = list.find(x => String(x.id) === b.dataset.editBen);
      if (existing) openBeneficiaryFormModal(existing, () => loadBeneficiaries(c));
    }));

    el.querySelectorAll('[data-del-ben]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete beneficiary?',
        message: 'This will fail if any pending transfer references this beneficiary.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.selfService.deleteBeneficiary(b.dataset.delBen);
        toast('success', 'Beneficiary deleted', '');
        loadBeneficiaries(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">TPT beneficiaries not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// BENEFICIARY FORM MODAL
// ════════════════════════════════════════════════════════════
function openBeneficiaryFormModal(existing, onSuccess) {
  const isEdit = !!existing;

  // Account types per Fineract TPT spec
  const accountTypes = [
    { id: 1, name: 'Loan' },
    { id: 2, name: 'Savings' }
  ];

  const mid = 'ben-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';

  modalEl.innerHTML = '<div class="modal modal-md">' +
    '<div class="modal-header"><h3>' + (isEdit ? 'Edit' : 'Add') + ' TPT Beneficiary</h3><button data-close-modal>&times;</button></div>' +
    '<div class="modal-body">' +
      '<div class="form-grid">' +
        '<label>Beneficiary nickname * <input id="bf-name" class="form-control" value="' + escapeHtml(existing?.name || '') + '" required/></label>' +
        '<label>Office name * <input id="bf-office" class="form-control" value="' + escapeHtml(existing?.officeName || '') + '" required ' + (isEdit ? 'disabled' : '') + '/></label>' +
        '<label>Client account number * <input id="bf-client-acc" class="form-control" value="' + escapeHtml(existing?.accountNumber || existing?.accountNo || '') + '" required ' + (isEdit ? 'disabled' : '') + '/></label>' +
        '<label>Account type *' +
          '<select id="bf-acc-type" class="form-control" required ' + (isEdit ? 'disabled' : '') + '>' +
            '<option value="">Select…</option>' +
            accountTypes.map(t => '<option value="' + t.id + '"' + ((existing?.accountType?.id || existing?.accountTypeId) === t.id ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('') +
          '</select>' +
        '</label>' +
        '<label>Transfer limit ' +
          '<input type="number" step="0.01" id="bf-limit" class="form-control" value="' + (existing?.transferLimit ?? '') + '"/>' +
        '</label>' +
      '</div>' +
      '<div class="msg-banner b-info mt-2">' +
        '<i class="fa-solid fa-circle-info"></i> ' +
        (isEdit ? 'Only nickname and transfer limit can be edited after creation.' : 'The system validates that the office name + account number combination exists.') +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn-secondary" data-close-modal>Cancel</button>' +
      '<button class="btn-primary" id="bf-save">' + (isEdit ? 'Save Changes' : 'Add Beneficiary') + '</button>' +
    '</div>' +
  '</div>';

  document.getElementById('modalRoot').appendChild(modalEl);
  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));

  modalEl.querySelector('#bf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#bf-name').value.trim();
    const officeName = modalEl.querySelector('#bf-office').value.trim();
    const accountNumber = modalEl.querySelector('#bf-client-acc').value.trim();
    const accountType = parseInt(modalEl.querySelector('#bf-acc-type').value);
    const limit = parseFloat(modalEl.querySelector('#bf-limit').value);

    if (!name) { toast('warn', 'Enter a name', ''); return; }
    if (!isEdit && (!officeName || !accountNumber || !accountType)) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {};
    payload.name = name;
    if (isFinite(limit)) payload.transferLimit = limit;

    if (!isEdit) {
      payload.officeName = officeName;
      payload.accountNumber = accountNumber;
      payload.accountType = accountType;
    }

    try {
      if (isEdit) await api.selfService.updateBeneficiary(existing.id, payload);
      else        await api.selfService.addBeneficiary(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Beneficiary updated' : 'Beneficiary added', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}