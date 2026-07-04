/* FinCraft · pages/system/loaders/data-mgmt.js — account number prefs, entity mappings, surveys, and migration link loaders.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { can } from '../shared.js';
import { escapeHtml, num, sb } from '../../../utils.js';
import { confirm as modalConfirm, toast } from '../../../ui.js';
import { openAccountNumberPrefModal, openEntityMappingDetail, openSurveyFormModal } from '../actions.js';

export async function loadAccountNumberPrefs(c) {
  const el = c.querySelector('#sy-8');
  el.innerHTML = '<div class="empty-state-row">Loading account number preferences…</div>';
  try {
    const res = await api.accountNumberPreferences.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} preference${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-primary" id="btn-new-anp"><i class="fa-solid fa-plus"></i> New Preference</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Configure how new account numbers are auto-generated per entity type (Clients, Loans, Savings, etc.).
        For example, prefix with office name, suffix with timestamp, or use sequential ID.
      </div>
      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Entity</th><th>Format Type</th><th>Prefix</th><th></th>
          </tr></thead>
          <tbody>${list.map(p => `
            <tr>
              <td><b>${escapeHtml(p.accountNumberType?.value || p.accountType?.value || '—')}</b></td>
              <td>${escapeHtml(p.prefixType?.value || 'Default Sequential')}</td>
              <td><code>${escapeHtml(p.prefix || '—')}</code></td>
              <td class="text-right">
                ${can('UPDATE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-mini" data-edit-anp="${p.id}">Edit</button>` : ''}
                ${can('DELETE_ACCOUNTNUMBERFORMAT') ? `<button class="btn-mini btn-danger" data-del-anp="${p.id}">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-hashtag"></i>
          <h3>No account number preferences configured</h3>
          ${can('CREATE_ACCOUNTNUMBERFORMAT') ? '<div class="text-muted mt-2">Default sequential numbering is used until configured here.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-new-anp')?.addEventListener('click', () =>
      openAccountNumberPrefModal(null, () => loadAccountNumberPrefs(c))
    );

    el.querySelectorAll('[data-edit-anp]').forEach(b => b.addEventListener('click', () =>
      openAccountNumberPrefModal(b.dataset.editAnp, () => loadAccountNumberPrefs(c))
    ));

    el.querySelectorAll('[data-del-anp]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete account number preference?',
        message: 'New accounts of this type will revert to default sequential numbering.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.accountNumberPreferences.delete(b.dataset.delAnp);
        toast('success', 'Preference deleted', '');
        loadAccountNumberPrefs(c);
      } catch (e) {
        toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message);
      }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Account number preferences not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadEntityMappings(c) {
  const el = c.querySelector('#sy-9');
  el.innerHTML = '<div class="empty-state-row">Loading entity mappings…</div>';
  try {
    const res = await api.entityToEntityMappings.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Entity-to-Entity Mappings</h3>
        <span class="text-muted">${num(list.length)} mapping type${list.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Restrict which entities of one type can be linked to entities of another type — e.g. which offices can use which loan products,
        which roles can perform which actions.
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Mapping Type</th>
            <th>From Entity</th>
            <th>To Entity</th>
            <th class="text-right">Mapped Count</th>
            <th></th>
          </tr></thead>
          <tbody>${list.map(m => {
            const mappedCount = (m.mappings || m.entityMappings || []).length;
            return `
              <tr>
                <td><b>${escapeHtml(m.mappingName || m.entityToEntityMapping || '—')}</b>
                  ${m.description ? `<div class="text-muted small">${escapeHtml(m.description)}</div>` : ''}
                </td>
                <td>${escapeHtml(m.fromType || m.firstEntity || '—')}</td>
                <td>${escapeHtml(m.toType || m.secondEntity || '—')}</td>
                <td class="text-right">${num(mappedCount)}</td>
                <td class="text-right">
                  ${can('UPDATE_ENTITYTOENTITYMAPPING') ? `<button class="btn-mini" data-edit-map="${m.mapId || m.id}" data-map-name="${escapeHtml(m.mappingName || '—')}">View / Edit</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-diagram-project"></i>
          <h3>No entity mappings defined</h3>
          <div class="text-muted mt-2">Entity-to-entity mappings are tenant-configuration features. Contact your administrator if you need restrictions enabled.</div>
        </div>`}`;

    el.querySelectorAll('[data-edit-map]').forEach(b => b.addEventListener('click', () =>
      openEntityMappingDetail(b.dataset.editMap, b.dataset.mapName)
    ));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Entity mappings not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadSurveys(c) {
  const el = c.querySelector('#sy-12');
  el.innerHTML = '<div class="empty-state-row">Loading surveys…</div>';
  try {
    const res = await api.surveysAdmin.list();
    const list = Array.isArray(res) ? res : [];

    el.innerHTML = `
      <div class="section-header mb-2">
        <span class="text-muted">${num(list.length)} survey${list.length !== 1 ? 's' : ''}</span>
        ${can('CREATE_SURVEY') ? `<button class="btn-primary" id="btn-new-survey"><i class="fa-solid fa-plus"></i> New Survey</button>` : ''}
      </div>
      <div class="text-muted small mb-2">
        <i class="fa-solid fa-circle-info"></i>
        Surveys capture customer feedback (NPS, satisfaction, etc.) at touchpoints like loan disbursement or onboarding.
        Responses are stored against client/loan records and exportable via Reports.
      </div>

      ${list.length ? `
        <table class="table">
          <thead><tr>
            <th>Name</th><th>Country</th><th>Description</th><th>Questions</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${list.map(s => {
            const isActive = s.status?.value === 'Active' || s.active !== false;
            return `
              <tr>
                <td><b>${escapeHtml(s.name || s.key || '—')}</b></td>
                <td>${escapeHtml(s.countryCode || '—')}</td>
                <td class="text-muted small">${escapeHtml(s.description || '—')}</td>
                <td>${num((s.questionDatas || s.questions || []).length)}</td>
                <td>${isActive ? sb('Active') : sb('Inactive')}</td>
                <td class="text-right">
                  ${can('UPDATE_SURVEY') ? `<button class="btn-mini" data-edit-survey="${s.id}">Edit</button>` : ''}
                  ${isActive && can('DEACTIVATE_SURVEY')
                    ? `<button class="btn-mini btn-warning" data-deactivate-survey="${s.id}">Deactivate</button>`
                    : ''}
                  ${!isActive && can('ACTIVATE_SURVEY')
                    ? `<button class="btn-mini btn-success" data-activate-survey="${s.id}">Activate</button>`
                    : ''}
                  ${can('DELETE_SURVEY') ? `<button class="btn-mini btn-danger" data-del-survey="${s.id}">Delete</button>` : ''}
                </td>
              </tr>`;
          }).join('')}</tbody>
        </table>` : `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-list"></i>
          <h3>No surveys defined</h3>
          ${can('CREATE_SURVEY') ? '<div class="text-muted mt-2">Create a survey to start collecting customer feedback.</div>' : ''}
        </div>`}`;

    el.querySelector('#btn-new-survey')?.addEventListener('click', () =>
      openSurveyFormModal(null, () => loadSurveys(c))
    );

    el.querySelectorAll('[data-edit-survey]').forEach(b => b.addEventListener('click', () =>
      openSurveyFormModal(b.dataset.editSurvey, () => loadSurveys(c))
    ));

    el.querySelectorAll('[data-activate-survey]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api.surveysAdmin.activate(b.dataset.activateSurvey);
        toast('success', 'Survey activated', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Activation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-deactivate-survey]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({ title: 'Deactivate survey?', confirmText: 'Deactivate' })) return;
      try {
        await api.surveysAdmin.deactivate(b.dataset.deactivateSurvey);
        toast('success', 'Survey deactivated', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Deactivation failed', e.detail?.defaultUserMessage || e.message); }
    }));

    el.querySelectorAll('[data-del-survey]').forEach(b => b.addEventListener('click', async () => {
      if (!await modalConfirm({
        title: 'Delete survey?',
        message: 'This permanently removes the survey and its question definitions. Responses are preserved.',
        danger: true,
        confirmText: 'Delete'
      })) return;
      try {
        await api.surveysAdmin.delete(b.dataset.delSurvey);
        toast('success', 'Survey deleted', '');
        loadSurveys(c);
      } catch (e) { toast('error', 'Delete failed', e.detail?.defaultUserMessage || e.message); }
    }));
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Surveys not enabled on this tenant: ${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>`;
  }
}

export async function loadMigrationLinks(c) {
  const el = c.querySelector('#sy-13');

  const migrations = [
    { icon: 'fa-comment-sms',   title: 'SMS Campaigns', subtitle: 'Moved to Organization → SMS Campaigns tab', target: 'organization' },
    { icon: 'fa-table',         title: 'Data Tables',   subtitle: 'Now a standalone module at /datatables',     target: 'datatables' },
    { icon: 'fa-user-shield',   title: 'Users & Roles', subtitle: 'Now a standalone module at /users',          target: 'users' },
    { icon: 'fa-file-lines',    title: 'Templates',     subtitle: 'Now a standalone module at /templates',      target: 'templates' },
    { icon: 'fa-shield-halved', title: 'Collateral',    subtitle: 'Moved to a standalone module at /collaterals', target: 'collaterals' },
    { icon: 'fa-mobile-screen', title: 'Self-Service',  subtitle: 'Moved to a standalone module at /self-service', target: 'self-service' }
  ];

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>Migrated Modules</h3>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      The following modules have moved out of System into their own dedicated pages for clarity and feature parity with Mifos.
    </div>

    <div class="kpi-grid">
      ${migrations.map(m => `
        <div class="kpi-card" style="text-align:left; padding:16px">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px">
            <i class="fa-solid ${m.icon}" style="font-size:24px; color:var(--accent)"></i>
            <div>
              <div class="kpi-label">${escapeHtml(m.title)}</div>
              <div class="text-muted small">${escapeHtml(m.subtitle)}</div>
            </div>
          </div>
          <button class="btn-primary btn-sm" data-go-mod="${m.target}">
            <i class="fa-solid fa-arrow-right"></i> Go to ${escapeHtml(m.title)}
          </button>
        </div>`).join('')}
    </div>

    <div class="msg-banner b-info mt-3">
      <i class="fa-solid fa-circle-info"></i>
      <b>Architectural Note:</b> Modules are now organized by primary user-task rather than by API surface.
      This matches Mifos Web App conventions and makes permission gating more granular.
    </div>`;

  el.querySelectorAll('[data-go-mod]').forEach(b => b.addEventListener('click', () =>
    import('../../../router.js').then(r => r.navigate(b.dataset.goMod))
  ));
}
