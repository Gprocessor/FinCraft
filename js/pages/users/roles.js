/* FinCraft · pages/users/roles.js — role list, role detail, and role create/edit modal.
   Auto-split from the original monolithic pages/users.js for maintainability. */

import { api } from '../../api.js';
import { confirm as modalConfirm, toast } from '../../ui.js';
import { escapeHtml, num, sb } from '../../utils.js';
import { can } from './shared.js';
import { extractFineractError } from '../../ui/dom-helpers.js';

export async function loadRoles(c) {
  const el = c.querySelector('#usr-1');
  try {
    const res = await api.roles.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Roles &amp; Permissions</h3>
          <span class="text-muted">${list.length} role${list.length !== 1 ? 's' : ''}</span>
        </div>
        ${can('CREATE_ROLE') ? `<button class="btn-primary" id="btn-new-role"><i class="fa-solid fa-plus"></i> New Role</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Roles bundle permissions. Assign roles to users on the Users tab to grant access.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Description</th><th>Permissions</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(r => `
            <tr>
              <td><b>${escapeHtml(r.name)}</b></td>
              <td>${escapeHtml(r.description || '—')}</td>
              <td>${num(r.permissionCount || r.permissions?.length || 0)}</td>
              <td>${r.disabled ? sb('Disabled') : sb('Active')}</td>
              <td class="text-right">
                ${can('READ_ROLE') ? `<button class="btn-mini" data-view-role="${r.id}">Permissions</button>` : ''}
                ${can('UPDATE_ROLE') ? `<button class="btn-mini" data-edit-role="${r.id}">Edit</button>` : ''}
                ${can('DISABLE_ROLE') && !r.disabled ? `<button class="btn-mini btn-warning" data-disable-role="${r.id}">Disable</button>` : ''}
                ${can('ENABLE_ROLE')  &&  r.disabled ? `<button class="btn-mini btn-success" data-enable-role="${r.id}">Enable</button>` : ''}
                ${can('DELETE_ROLE') ? `<button class="btn-mini btn-danger" data-del-role="${r.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-user-shield"></i>
          <h3>No roles defined</h3>
          ${can('CREATE_ROLE') ? `<div class="text-muted mt-2">Create your first role to begin granting access.</div>` : ''}
        </div>`}`;

    el.querySelector('#btn-new-role')?.addEventListener('click', () => openRoleFormModal(null, () => loadRoles(c)));

    el.querySelectorAll('[data-view-role]').forEach(b => b.addEventListener('click', () =>
      import('../../router.js').then(r => r.navigate('users', { view: 'role-detail', id: b.dataset.viewRole }))));

    el.querySelectorAll('[data-edit-role]').forEach(b => b.addEventListener('click', () =>
      openRoleFormModal(b.dataset.editRole, () => loadRoles(c))));

    el.querySelectorAll('[data-disable-role]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Disable role?', message: 'Users with this role will lose access immediately.', danger: true, confirmText: 'Disable' })) return;
      try { await api.roles.disable(b.dataset.disableRole); toast('success', 'Role disabled', ''); loadRoles(c); }
      catch (e) { toast('error', 'Disable failed', extractFineractError(e)); }
    }));

    el.querySelectorAll('[data-enable-role]').forEach(b => b.addEventListener('click', async () => {
      try { await api.roles.enable(b.dataset.enableRole); toast('success', 'Role enabled', ''); loadRoles(c); }
      catch (e) { toast('error', 'Enable failed', extractFineractError(e)); }
    }));

    el.querySelectorAll('[data-del-role]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete role?',
        message: 'This will fail if any user is currently assigned this role.',
        danger: true, confirmText: 'Delete'
      })) return;
      try { await api.roles.delete(b.dataset.delRole); toast('success', 'Role deleted', ''); loadRoles(c); }
      catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

async function openRoleFormModal(roleId, onSuccess) {
  const isEdit = !!roleId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.roles.get(roleId); } catch {}
  }

  const mid = 'role-form-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit Role' : 'New Role'}</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Role name * <input id="rf-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
          <label class="full">Description <textarea id="rf-desc" class="form-control" rows="3">${escapeHtml(existing.description || '')}</textarea></label>
        </div>
        ${!isEdit ? `
          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            After creating the role, click <b>Permissions</b> on the role list to grant specific access rights.
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="rf-save">${isEdit ? 'Save Changes' : 'Create Role'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#rf-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#rf-name').value.trim();
    const description = modalEl.querySelector('#rf-desc').value.trim();
    if (!name) { toast('warn', 'Enter a role name', ''); return; }

    const payload = {};
    payload.name = name;
    if (description) payload.description = description;

    try {
      if (isEdit) await api.roles.update(roleId, payload);
      else        await api.roles.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Role updated' : 'Role created', name);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}

export async function renderRoleDetail(c, roleId) {
  c.innerHTML = `<div class="empty-state-row">Loading role…</div>`;
  try {
    const role = await api.roles.get(roleId);
    const permData = role.permissionUsageData || [];

    // Group permissions by code prefix (CREATE_, READ_, UPDATE_, DELETE_, etc.)
    // and by entity (extracted from code suffix). Group by "grouping" field where available.
    const grouped = {};
    permData.forEach(p => {
      const group = p.grouping || extractGroup(p.code);
      (grouped[group] ||= []).push(p);
    });
    const groupKeys = Object.keys(grouped).sort();
    const selectedCount = permData.filter(p => p.selected).length;

    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${escapeHtml(role.name)}</h1>
          <div class="text-muted">
            ${escapeHtml(role.description || '—')} ·
            <b>${selectedCount}</b> of ${permData.length} permissions granted
            ${role.disabled ? ' · <span class="badge b-warning">Disabled</span>' : ''}
          </div>
        </div>
        <div class="page-actions">
          <button class="btn-secondary" data-back-roles><i class="fa-solid fa-arrow-left"></i> Back</button>
          ${can('PERMISSIONS_ROLE') ? `<button class="btn-primary" id="btn-save-perms"><i class="fa-solid fa-save"></i> Save Permissions</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="filter-bar mb-3">
          <input id="perm-search" class="form-control" placeholder="Filter permissions…" autocomplete="off"/>
          ${can('PERMISSIONS_ROLE') ? `
            <button class="btn-secondary" id="perm-select-all">Select All</button>
            <button class="btn-secondary" id="perm-clear-all">Clear All</button>
            <button class="btn-secondary" id="perm-select-readonly">Read-only Only</button>` : ''}
        </div>

        <div id="perm-groups">
          ${groupKeys.map(g => {
            const perms = grouped[g].sort((a, b) => a.code.localeCompare(b.code));
            const groupSelected = perms.filter(p => p.selected).length;
            return `
              <div class="perm-group mb-3" data-group="${escapeHtml(g)}">
                <div class="section-header" style="cursor:pointer" data-toggle-group>
                  <h4><i class="fa-solid fa-chevron-down"></i> ${escapeHtml(g)}</h4>
                  <div>
                    <span class="text-muted">${groupSelected}/${perms.length}</span>
                    ${can('PERMISSIONS_ROLE') ? `<button class="btn-mini" data-group-toggle="${escapeHtml(g)}">Toggle All</button>` : ''}
                  </div>
                </div>
                <div class="perm-list" style="padding:8px 12px">
                  ${perms.map(p => `
                    <label class="checkbox-row" style="display:flex; align-items:center; padding:3px 0">
                      <input type="checkbox" class="perm-chk" data-code="${escapeHtml(p.code)}" data-group="${escapeHtml(g)}" ${p.selected ? 'checked' : ''} ${can('PERMISSIONS_ROLE') ? '' : 'disabled'}/>
                      <code style="margin-left:8px">${escapeHtml(p.code)}</code>
                      ${p.actionName && p.entityName ? `<span class="text-muted small" style="margin-left:auto">${escapeHtml(p.actionName)} ${escapeHtml(p.entityName)}</span>` : ''}
                    </label>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    c.querySelector('[data-back-roles]').addEventListener('click', () =>
      import('../../router.js').then(r => r.navigate('users')));

    // Toggle group panels
    c.querySelectorAll('[data-toggle-group]').forEach(h => h.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // ignore button clicks
      const panel = h.parentElement.querySelector('.perm-list');
      const icon = h.querySelector('i');
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? '' : 'none';
      icon.className = hidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
    }));

    // Per-group toggle
    c.querySelectorAll('[data-group-toggle]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = b.dataset.groupToggle;
      const checkboxes = c.querySelectorAll(`.perm-chk[data-group="${group}"]`);
      const allChecked = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
      updateCounts();
    }));

    function updateCounts() {
      c.querySelectorAll('.perm-group').forEach(g => {
        const total = g.querySelectorAll('.perm-chk').length;
        const checked = g.querySelectorAll('.perm-chk:checked').length;
        const span = g.querySelector('.section-header span.text-muted');
        if (span) span.textContent = `${checked}/${total}`;
      });
    }

    c.querySelectorAll('.perm-chk').forEach(cb => cb.addEventListener('change', updateCounts));

    // Filter
    c.querySelector('#perm-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      c.querySelectorAll('.perm-group').forEach(g => {
        let groupHasMatch = false;
        g.querySelectorAll('.perm-chk').forEach(cb => {
          const code = cb.dataset.code.toLowerCase();
          const match = !q || code.includes(q);
          cb.closest('label').style.display = match ? '' : 'none';
          if (match) groupHasMatch = true;
        });
        g.style.display = groupHasMatch ? '' : 'none';
      });
    });

    // Bulk select buttons
    c.querySelector('#perm-select-all')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => cb.checked = true);
      updateCounts();
    });
    c.querySelector('#perm-clear-all')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => cb.checked = false);
      updateCounts();
    });
    c.querySelector('#perm-select-readonly')?.addEventListener('click', () => {
      c.querySelectorAll('.perm-chk').forEach(cb => {
        cb.checked = cb.dataset.code.startsWith('READ_');
      });
      updateCounts();
    });

    // Save
    c.querySelector('#btn-save-perms')?.addEventListener('click', async () => {
      const permissions = {};
      c.querySelectorAll('.perm-chk').forEach(cb => {
        permissions[cb.dataset.code] = cb.checked;
      });
      try {
        await api.roles.updatePermissions(roleId, { permissions });
        toast('success', 'Permissions saved', `${Object.values(permissions).filter(Boolean).length} granted`);
      } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
    });
  } catch (e) {
    c.innerHTML = `<div class="card"><div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div><b>Failed to load role</b></div>
      <div class="text-muted mt-2">${escapeHtml(extractFineractError(e))}</div>
    </div></div>`;
  }
}

function extractGroup(code) {
  if (!code) return 'Other';
  // Common Fineract action prefixes
  const prefixes = ['CREATE_', 'READ_', 'UPDATE_', 'DELETE_', 'APPROVE_', 'REJECT_', 'ACTIVATE_',
                    'CLOSE_', 'DISBURSE_', 'WITHDRAW_', 'EXECUTE_', 'PAY_', 'WAIVE_',
                    'ENABLE_', 'DISABLE_', 'IMPORT_', 'EXPORT_'];
  let entity = code;
  for (const p of prefixes) {
    if (code.startsWith(p)) { entity = code.substring(p.length); break; }
  }
  // Strip _CHECKER or _MAKER suffix if present
  entity = entity.replace(/_CHECKER$|_MAKER$/, '');
  return entity || 'Other';
}
