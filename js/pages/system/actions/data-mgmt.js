/* FinCraft · pages/system/actions/data-mgmt.js — account number prefs, entity mapping, and survey modals.
   Auto-split from the original monolithic pages/system/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml, fmtDate, num } from '../../../utils.js';
import { can } from '../shared.js';
import { questionRow } from './config.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openAccountNumberPrefModal(prefId, onSuccess) {
  const isEdit = !!prefId;
  let existing = {};
  let tpl = {};

  try {
    if (isEdit) existing = await api.accountNumberPreferences.get(prefId);
    tpl = await api.accountNumberPreferences.template();
  } catch (e) {
    toast('error', 'Could not load form data', extractFineractError(e));
    return;
  }

  const entityOptions = tpl.accountNumberTypeOptions || tpl.accountTypeOptions || [
    { id: 1, value: 'Clients' },
    { id: 2, value: 'Loans' },
    { id: 3, value: 'Savings' },
    { id: 4, value: 'Centers' },
    { id: 5, value: 'Groups' }
  ];

  const prefixTypeOptions = tpl.prefixTypeOptions || [
    { id: 'PREFIX_SHORT_NAME',      value: 'Office short name' },
    { id: 'PREFIX_OFFICE_NAME',     value: 'Office name' },
    { id: 'PREFIX_PRODUCT_SHORTNAME', value: 'Product short name' },
    { id: 'NONE',                   value: 'No prefix (sequential only)' }
  ];

  const currentEntityId = existing.accountNumberType?.id || existing.accountTypeId;
  const currentPrefixType = existing.prefixType?.id || existing.prefixType;

  const mid = 'anp-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-md">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Account Number Preference</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Entity *
              <select id="anp-entity" class="form-control" required ${isEdit ? 'disabled' : ''}>
                <option value="">Select entity…</option>
                ${entityOptions.map(o => {
                  const selected = currentEntityId === o.id ? 'selected' : '';
                  return `<option value="${o.id}" ${selected}>${escapeHtml(o.value || o.name)}</option>`;
                }).join('')}
              </select>
            </label>
            <label>Prefix Type
              <select id="anp-prefix-type" class="form-control">
                <option value="">— None —</option>
                ${prefixTypeOptions.map(o => {
                  const selected = currentPrefixType === o.id ? 'selected' : '';
                  return `<option value="${o.id}" ${selected}>${escapeHtml(o.value || o.name)}</option>`;
                }).join('')}
              </select>
            </label>
          </div>

          <div class="msg-banner b-info mt-2">
            <i class="fa-solid fa-circle-info"></i>
            New accounts of the selected entity will have account numbers auto-generated using:
            <code>[prefix]&lt;sequential ID&gt;</code>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="anp-save">${isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  m.querySelector('#anp-save').addEventListener('click', async () => {
    const entityId = parseInt(m.querySelector('#anp-entity').value);
    const prefixType = m.querySelector('#anp-prefix-type').value;

    if (!entityId) { toast('warn', 'Select an entity', ''); return; }

    const payload = {};
    if (!isEdit) payload.accountNumberType = entityId;
    if (prefixType) payload.prefixType = prefixType;

    try {
      if (isEdit) await api.accountNumberPreferences.update(prefId, payload);
      else        await api.accountNumberPreferences.create(payload);
      m.remove();
      toast('success', isEdit ? 'Preference updated' : 'Preference created', '');
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e));
    }
  });
}

export async function openEntityMappingDetail(mapId, mapName) {
  const mid = 'map-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-lg">
        <div class="modal-header"><h3>${escapeHtml(mapName)} — Mapping Details</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body" id="map-body">
          <div class="empty-state-row">Loading mapping details…</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Close</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  try {
    const detail = await api.entityToEntityMappings.get(mapId);
    const mappings = detail?.mappings || detail?.entityMappings || (Array.isArray(detail) ? detail : []);
    const body = m.querySelector('#map-body');

    body.innerHTML = `
      <div class="msg-banner b-info mb-3">
        <i class="fa-solid fa-circle-info"></i>
        ${escapeHtml(detail.description || 'This mapping restricts which entities can interact with each other.')}
      </div>

      <h4>Current Mappings (${num(mappings.length)})</h4>
      ${mappings.length ? `
        <table class="table">
          <thead><tr>
            <th>From</th><th>To</th><th>Valid From</th><th>Valid Until</th>
          </tr></thead>
          <tbody>${mappings.map(mp => `
            <tr>
              <td>${escapeHtml(mp.fromEntityName || String(mp.fromId || '—'))}</td>
              <td>${escapeHtml(mp.toEntityName || String(mp.toId || '—'))}</td>
              <td>${fmtDate(mp.startDate) || '—'}</td>
              <td>${fmtDate(mp.endDate) || 'Indefinite'}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state-row">No mappings defined yet</div>'}

      <div class="msg-banner b-warning mt-3">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Adding or editing individual mappings is performed via the underlying admin tools.
        This view is read-only.
      </div>`;
  } catch (e) {
    m.querySelector('#map-body').innerHTML =
      `<div class="text-error">${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function openSurveyFormModal(surveyId, onSuccess) {
  const isEdit = !!surveyId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.surveysAdmin.get(surveyId); }
    catch (e) { toast('error', 'Could not load survey', extractFineractError(e)); return; }
  }

  // Question builder rows — flexible structure matching Fineract survey schema
  const existingQuestions = existing.questionDatas || existing.questions || [];
  const initialQuestionRows = existingQuestions.length
    ? existingQuestions.map((q, i) => questionRow(i, q)).join('')
    : questionRow(0);

  const mid = 'survey-form-' + Date.now();
  document.getElementById('modalRoot').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" role="dialog" aria-modal="true" id="${mid}">
      <div class="modal modal-xl">
        <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Survey</h3><button data-close-modal>&times;</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <label>Survey Key / Name * <input id="sv-key" class="form-control" value="${escapeHtml(existing.key || existing.name || '')}" required ${isEdit ? 'disabled' : ''}/></label>
            <label>Country Code <input id="sv-country" class="form-control" maxlength="2" value="${escapeHtml(existing.countryCode || '')}" placeholder="e.g. US, IN"/></label>
            <label class="full">Description
              <textarea id="sv-desc" class="form-control" rows="2">${escapeHtml(existing.description || '')}</textarea>
            </label>
            <label>Valid From <input type="date" id="sv-valid-from" class="form-control" value="${existing.validFrom || ''}"/></label>
            <label>Valid To <input type="date" id="sv-valid-to" class="form-control" value="${existing.validTo || ''}"/></label>
          </div>

          <h4 class="mt-3">Questions</h4>
          <div class="text-muted small mb-2">
            <i class="fa-solid fa-circle-info"></i>
            Each question has a text and a sequence number. Survey responses are stored against client/loan records.
          </div>
          <table class="table">
            <thead><tr>
              <th>Sequence</th>
              <th>Question Text</th>
              <th>Description</th>
              <th></th>
            </tr></thead>
            <tbody id="sv-questions">${initialQuestionRows}</tbody>
          </table>
          <button type="button" class="btn-secondary btn-sm" id="sv-add-q"><i class="fa-solid fa-plus"></i> Add Question</button>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancel</button>
          <button class="btn-primary" id="sv-save">${isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`);

  const m = document.getElementById(mid);
  m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => m.remove()));

  let qIdx = existingQuestions.length || 1;
  const wireRowRemove = () => {
    m.querySelectorAll('.sv-q-remove').forEach(btn => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          const rows = m.querySelectorAll('.sv-q-row');
          if (rows.length > 1) btn.closest('.sv-q-row').remove();
          else toast('warn', 'At least one question required', '');
        });
      }
    });
  };
  wireRowRemove();

  m.querySelector('#sv-add-q').addEventListener('click', () => {
    m.querySelector('#sv-questions').insertAdjacentHTML('beforeend', questionRow(qIdx++));
    wireRowRemove();
  });

  m.querySelector('#sv-save').addEventListener('click', async () => {
    const key = m.querySelector('#sv-key').value.trim();
    const countryCode = m.querySelector('#sv-country').value.trim().toUpperCase();
    const description = m.querySelector('#sv-desc').value.trim();
    const validFrom = m.querySelector('#sv-valid-from').value;
    const validTo = m.querySelector('#sv-valid-to').value;

    if (!key) { toast('warn', 'Enter a survey name', ''); return; }

    const questions = [];
    m.querySelectorAll('.sv-q-row').forEach(row => {
      const seq = parseInt(row.querySelector('.sv-q-seq').value) || 0;
      const text = row.querySelector('.sv-q-text').value.trim();
      const qDesc = row.querySelector('.sv-q-desc').value.trim();
      if (text) {
        const q = {};
        q.text = text;
        q.sequenceNo = seq;
        if (qDesc) q.description = qDesc;
        questions.push(q);
      }
    });

    if (!questions.length) { toast('warn', 'Add at least one question', ''); return; }

    const payload = {};
    if (!isEdit) payload.key = key;
    if (countryCode) payload.countryCode = countryCode;
    if (description) payload.description = description;
    if (validFrom) {
      payload.validFrom = validFrom;
      payload.dateFormat = DATE_FORMAT;
      payload.locale = LOCALE;
    }
    if (validTo) payload.validTo = validTo;
    payload.questionDatas = questions;

    try {
      if (isEdit) await api.surveysAdmin.update(surveyId, payload);
      else        await api.surveysAdmin.create(payload);
      m.remove();
      toast('success', isEdit ? 'Survey updated' : 'Survey created', key);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e));
    }
  });
}
