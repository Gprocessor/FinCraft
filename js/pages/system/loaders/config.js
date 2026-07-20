/* FinCraft · pages/system/loaders/config.js — global configurations, codes, and maker-checker config tab loaders.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, num, sb } from '../../../utils.js';
import { extractMCEntityGroup, openCodeValuesModal, openNewCodeModal } from '../actions.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function loadConfigurations(c) {
  const el = c.querySelector('#sy-0');
  el.innerHTML = '<div class="empty-state-row">Loading configurations…</div>';
  try {
    const cf = await api.configurations.list();
    const list = Array.isArray(cf?.globalConfiguration)
      ? cf.globalConfiguration
      : (Array.isArray(cf) ? cf : []);
    const canEdit = can('UPDATE_CONFIGURATION');

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} configuration${list.length !== 1 ? 's' : ''}</span>
        <input id="cfg-search" class="form-control" placeholder="Search…" style="max-width:300px"/>
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Toggle global system settings. Changes apply tenant-wide.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Configuration</th><th>Description</th><th>Value</th><th>Enabled</th>
          </tr></thead>
          <tbody id="cfg-tbody">${list.map(cfg => `
            <tr class="cfg-row">
              <td><code>${escapeHtml(cfg.name)}</code></td>
              <td class="text-muted small">${escapeHtml(cfg.description || '—')}</td>
              <td>${escapeHtml(String(cfg.value ?? '—'))}</td>
              <td>
                ${canEdit
                  ? `<input type="checkbox" data-cfg="${cfg.id || cfg.name}" ${cfg.enabled ? 'checked' : ''}/>`
                  : (cfg.enabled ? sb('Yes') : sb('No'))}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No configurations found</div>'}`;

    el.querySelector('#cfg-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.cfg-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('[data-cfg]').forEach(sw => sw.addEventListener('change', async () => {
      try {
        await api.configurations.update(sw.dataset.cfg, { enabled: sw.checked });
        toast('success', 'Config updated', sw.dataset.cfg + (sw.checked ? ' enabled' : ' disabled'));
      } catch (e) {
        sw.checked = !sw.checked;
        toast('error', 'Update failed', extractFineractError(e));
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadCodes(c) {
  const el = c.querySelector('#sy-2');
  el.innerHTML = '<div class="empty-state-row">Loading codes…</div>';
  try {
    const codes = await api.codes.list();
    const list = Array.isArray(codes) ? codes : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} code${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_CODE') ? `<button class="btn-primary" id="btn-new-code"><i class="fa-solid fa-plus"></i> New Code</button>` : ''}
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Code Name</th><th>Type</th><th></th>
          </tr></thead>
          <tbody>${list.map(cd => `
            <tr>
              <td><b>${escapeHtml(cd.name)}</b></td>
              <td>${cd.systemDefined ? sb('System') : sb('Custom')}</td>
              <td class="text-right">
                <button class="btn-mini" data-code-vals="${cd.id}" data-code-name="${escapeHtml(cd.name)}">Values</button>
                ${can('DELETE_CODE') && !cd.systemDefined ? `<button class="btn-mini btn-danger" data-del-code="${cd.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No codes</div>'}`;

    el.querySelector('#btn-new-code')?.addEventListener('click', () =>
      openNewCodeModal(() => loadCodes(c))
    );
    el.querySelectorAll('[data-code-vals]').forEach(b => b.addEventListener('click', () =>
      openCodeValuesModal(b.dataset.codeVals, b.dataset.codeName)
    ));
    el.querySelectorAll('[data-del-code]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Delete code?', danger: true, confirmText: 'Delete' })) return;
      try {
        await api.codes.delete(b.dataset.delCode);
        toast('success', 'Code deleted', '');
        loadCodes(c);
      } catch (e) { toast('error', 'Delete failed', extractFineractError(e)); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadMakerCheckerConfig(c) {
  const el = c.querySelector('#sy-11');
  el.innerHTML = '<div class="empty-state-row">Loading maker-checker tasks…</div>';
  try {
    const res = await api.permissions.list(true); // GET /permissions?makerCheckerable=true
    const list = Array.isArray(res) ? res : (res?.permissions || []);

    const canEdit = can('UPDATE_USER');

    // Group by entity prefix (CLIENT, LOAN, SAVINGS, etc.)
    const groups = {};
    list.forEach(p => {
      const code = p.code || p.permissionCode || '';
      const group = extractMCEntityGroup(code);
      (groups[group] ||= []).push(p);
    });
    const groupKeys = Object.keys(groups).sort();
    const enabledCount = list.filter(p => p.selected || p.makerChecker).length;

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Maker-Checker Task Configuration</h3>
        <span class="text-muted">${num(enabledCount)} of ${num(list.length)} tasks require approval</span>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Enable maker-checker on individual actions so they require approval before taking effect.
        Approvers see pending tasks in the <b>Checker Inbox</b> module.
      </div>

      ${list.length ? `
        <div class="filter-bar mb-2">
          <input id="mc-search" class="form-control" placeholder="Search permissions…" autocomplete="off"/>
          ${canEdit ? `<button class="btn-success btn-sm" id="mc-enable-all">Require Approval — All</button>` : ''}
          ${canEdit ? `<button class="btn-secondary btn-sm" id="mc-disable-all">Auto-approve All</button>` : ''}
        </div>

        <div id="mc-groups">
          ${groupKeys.map(g => {
            const perms = groups[g].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
            const enabled = perms.filter(p => p.selected || p.makerChecker).length;
            return `
              <div class="mc-group mb-3" data-group="${escapeHtml(g)}">
                <div class="section-header" style="cursor:pointer" data-toggle-mc-group>
                  <h4><i class="fa-solid fa-chevron-down"></i> ${escapeHtml(g)}</h4>
                  <span class="text-muted">${enabled}/${perms.length}</span>
                </div>
                <div class="mc-perm-list" style="padding:4px 12px">
                  ${perms.map(p => {
                    const code = p.code || p.permissionCode || '';
                    const isChecked = p.selected || p.makerChecker;
                    return `
                      <label class="checkbox-row mc-perm-row" style="display:flex; align-items:center; padding:3px 0">
                        ${canEdit
                          ? `<input type="checkbox" class="mc-chk" data-code="${escapeHtml(code)}" ${isChecked ? 'checked' : ''}/>`
                          : `<span style="width:18px"></span>`}
                        <code style="margin-left:8px">${escapeHtml(code)}</code>
                        ${p.actionName && p.entityName ? `<span class="text-muted small" style="margin-left:auto">${escapeHtml(p.actionName)} ${escapeHtml(p.entityName)}</span>` : ''}
                      </label>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>

        ${canEdit ? `<div class="mt-3"><button class="btn-primary" id="mc-save">Save Configuration</button></div>` : ''}
      ` : '<div class="empty-state-row">No maker-checker permissions available</div>'}`;

    // Expand/collapse group panels
    el.querySelectorAll('[data-toggle-mc-group]').forEach(h => h.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const panel = h.parentElement.querySelector('.mc-perm-list');
      const icon = h.querySelector('i');
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? '' : 'none';
      icon.className = hidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
    }));

    // Filter
    el.querySelector('#mc-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      el.querySelectorAll('.mc-group').forEach(g => {
        let groupHasMatch = false;
        g.querySelectorAll('.mc-perm-row').forEach(row => {
          const match = !q || row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          if (match) groupHasMatch = true;
        });
        g.style.display = groupHasMatch ? '' : 'none';
      });
    });

    el.querySelector('#mc-enable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.mc-chk').forEach(cb => cb.checked = true);
    });

    el.querySelector('#mc-disable-all')?.addEventListener('click', () => {
      el.querySelectorAll('.mc-chk').forEach(cb => cb.checked = false);
    });

    el.querySelector('#mc-save')?.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Save maker-checker configuration?',
        message: 'Affected actions will start (or stop) requiring approval immediately.',
        confirmText: 'Save'
      })) return;

      const permissions = {};
      el.querySelectorAll('.mc-chk').forEach(cb => {
        permissions[cb.dataset.code] = cb.checked;
      });

      try {
        await api.permissions.update({ permissions });
        toast('success', 'Maker-checker configuration saved', '');
        loadMakerCheckerConfig(c);
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Maker-checker configuration not available on this tenant: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}
