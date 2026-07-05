/* FinCraft · pages/organization/loaders/group-hierarchy.js
   Wires the previously-unused api.groupLevels namespace (audit item 7) into a small
   read-only reference panel showing this tenant's configured group/center hierarchy
   (e.g. "0. Center" -> "1. Group" -> "2. Client"). Fineract's /grouplevels endpoint is
   metadata-only (no create/update in the platform API), so a reference table — rather
   than a settings form — is the correct fit; the app doesn't need to write this data,
   just help admins confirm how their groups/centers nest before creating new groups. */

import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';

export async function loadGroupHierarchy(c) {
  const el = c.querySelector('#og-15');
  try {
    const res = await api.groupLevels.list();
    const list = Array.isArray(res) ? res : [];
    // Fineract levels typically ordered deepest-first (highest level number = closest to client);
    // sort ascending by level so the panel reads top-down (Center -> Group -> Client).
    list.sort((a, b) => (a.parentLevel ?? a.level ?? 0) - (b.parentLevel ?? b.level ?? 0));

    el.innerHTML = `
      <div class="section-header mb-2">
        <div>
          <h3>Group Hierarchy Levels</h3>
          <span class="text-muted">${list.length} level${list.length !== 1 ? 's' : ''} configured</span>
        </div>
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Read-only reference: this is how Groups and Centers nest for this tenant. Configured in Fineract, not here.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr><th>Level</th><th>Super parent?</th><th>Parent level</th></tr></thead>
          <tbody>${list.map(lvl => `
            <tr>
              <td>${escapeHtml(lvl.levelName ?? lvl.description ?? '—')}</td>
              <td>${lvl.superParent ? '<i class="fa-solid fa-check text-success"></i>' : '—'}</td>
              <td>${lvl.parentLevel != null ? escapeHtml(String(lvl.parentLevel)) : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No group hierarchy levels returned by the server</div>'}`;
  } catch (e) {
    el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`;
  }
}
