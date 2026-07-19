/* FinCraft · pages/organization/actions/integrations.js — loan originator, EAO, and SMS campaign modals.
   Auto-split from the original monolithic pages/organization/actions.js for maintainability. */

import { api } from '../../../api.js';
import { DATE_FORMAT, LOCALE } from '../../../config.js';
import { toast } from '../../../ui.js';
import { escapeHtml } from '../../../utils.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openLoanOriginatorModal(existing, onSuccess) {
  const isEdit = !!existing?.id;

  let tpl = {};
  try { tpl = await api.loanOriginators.template(); } catch {}

  const typeOptions = tpl.typeOptions || tpl.originatorTypeOptions || [
    { id: 1, name: 'Broker' },
    { id: 2, name: 'Partner' },
    { id: 3, name: 'External Lender' },
    { id: 4, name: 'Other' }
  ];

  const mid = 'orig-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Loan Originator</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Name *
            <input id="orig-name" class="form-control" value="${escapeHtml(existing?.name || existing?.displayName || '')}" required/>
          </label>
          <label>Originator Type *
            <select id="orig-type" class="form-control" required>
              <option value="">Select type…</option>
              ${typeOptions.map(t => {
                const selected = (existing?.type?.id === t.id || existing?.originatorTypeId === t.id) ? 'selected' : '';
                return `<option value="${t.id}" ${selected}>${escapeHtml(t.name || t.value)}</option>`;
              }).join('')}
            </select>
          </label>
          <label>External ID
            <input id="orig-extid" class="form-control" value="${escapeHtml(existing?.externalId || '')}"/>
          </label>
          <label>Email
            <input id="orig-email" type="email" class="form-control" value="${escapeHtml(existing?.email || '')}"/>
          </label>
          <label>Phone
            <input id="orig-phone" class="form-control" value="${escapeHtml(existing?.phone || existing?.mobileNumber || '')}"/>
          </label>
          <label>Commission rate (%)
            <input type="number" step="0.01" id="orig-commission" class="form-control" value="${existing?.commissionRate ?? ''}"/>
          </label>
          <label class="full">Description
            <textarea id="orig-desc" class="form-control" rows="2">${escapeHtml(existing?.description || '')}</textarea>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="orig-active" ${existing?.active !== false ? 'checked' : ''}/>
            Active
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="orig-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#orig-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#orig-name').value.trim();
    const typeId = parseInt(modalEl.querySelector('#orig-type').value);
    if (!name || !typeId) { toast('warn', 'Fill required fields', ''); return; }

    const payload = {};
    payload.name = name;
    payload.originatorTypeId = typeId;
    payload.active = modalEl.querySelector('#orig-active').checked;
    payload.locale = LOCALE;

    const ext = modalEl.querySelector('#orig-extid').value.trim();
    if (ext) payload.externalId = ext;
    const email = modalEl.querySelector('#orig-email').value.trim();
    if (email) payload.email = email;
    const phone = modalEl.querySelector('#orig-phone').value.trim();
    if (phone) payload.phone = phone;
    const commission = parseFloat(modalEl.querySelector('#orig-commission').value);
    if (isFinite(commission)) payload.commissionRate = commission;
    const desc = modalEl.querySelector('#orig-desc').value.trim();
    if (desc) payload.description = desc;

    try {
      if (isEdit) await api.loanOriginators.update(existing.id, payload);
      else        await api.loanOriginators.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Originator updated' : 'Originator created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Save failed', extractFineractError(e));
    }
  });
}

export async function openExternalAssetOwnerModal(existing, onSuccess) {
  // ExternalAssetOwnersApiResource has no GET-by-id, PUT, or DELETE in Fineract (confirmed via the source-derived
  // API map: only bare list/create/search and the transfer sub-paths exist) — this modal is create-only. The
  // `existing` param is accepted for API-shape stability but is never populated by any caller.
  const typeOptions = [
    { id: 'INVESTOR',             name: 'Investor' },
    { id: 'BANK',                 name: 'Bank' },
    { id: 'SECURITIZATION_TRUST', name: 'Securitization Trust' },
    { id: 'OTHER',                name: 'Other' }
  ];

  const mid = 'eao-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header"><h3>New External Asset Owner</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label>Owner Name *
            <input id="eao-name" class="form-control" value="${escapeHtml(existing?.name || existing?.displayName || '')}" required/>
          </label>
          <label>External ID *
            <input id="eao-extid" class="form-control" value="${escapeHtml(existing?.externalId || '')}" required/>
          </label>
          <label>Owner Type
            <select id="eao-type" class="form-control">
              ${typeOptions.map(t => {
                const selected = (existing?.type?.value === t.id || existing?.ownerType === t.id) ? 'selected' : '';
                return `<option value="${t.id}" ${selected}>${escapeHtml(t.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label>Contact email
            <input id="eao-email" type="email" class="form-control" value="${escapeHtml(existing?.email || '')}"/>
          </label>
          <label>Contact phone
            <input id="eao-phone" class="form-control" value="${escapeHtml(existing?.phone || '')}"/>
          </label>
          <label class="full">Description
            <textarea id="eao-desc" class="form-control" rows="2">${escapeHtml(existing?.description || '')}</textarea>
          </label>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          External ID is the immutable identifier used for all transfer/buy-back operations.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="eao-save">Create</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => modalEl.remove())
  );

  modalEl.querySelector('#eao-save').addEventListener('click', async () => {
    const name = modalEl.querySelector('#eao-name').value.trim();
    const externalId = modalEl.querySelector('#eao-extid').value.trim();
    if (!name) { toast('warn', 'Enter owner name', ''); return; }
    if (!externalId) { toast('warn', 'Enter external ID', ''); return; }

    const payload = { name, externalId, ownerType: modalEl.querySelector('#eao-type').value, locale: LOCALE };
    const email = modalEl.querySelector('#eao-email').value.trim();
    if (email) payload.email = email;
    const phone = modalEl.querySelector('#eao-phone').value.trim();
    if (phone) payload.phone = phone;
    const desc = modalEl.querySelector('#eao-desc').value.trim();
    if (desc) payload.description = desc;

    try {
      await api.externalAssetOwners.create(payload);
      modalEl.remove();
      toast('success', 'Owner created', name);
      onSuccess();
    } catch (e) {
      toast('error', 'Save failed', extractFineractError(e));
    }
  });
}

export async function openSmsCampaignModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  let tpl = {};
  try { tpl = await api.smsCampaigns.template(); } catch {}

  const campaignTypes = tpl.campaignTypeOptions || [
    { id: 1, value: 'Direct' },
    { id: 2, value: 'Schedule' },
    { id: 3, value: 'Triggered' }
  ];
  const triggerTypes = tpl.triggerTypeOptions || [
    { id: 1, value: 'Direct' },
    { id: 2, value: 'Schedule' },
    { id: 3, value: 'Triggered' }
  ];
  const recipientTypes = tpl.businessRuleOptions || tpl.recipientOptions || [];
  const providers = tpl.providerOptions || [{ id: 1, value: 'Default SMS' }];

  const mid = 'sms-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} SMS Campaign</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">Campaign name * <input id="sms-name" class="form-control" value="${escapeHtml(existing?.campaignName || existing?.name || '')}" required/></label>
          <label>Campaign type *
            <select id="sms-camp-type" class="form-control" required>
              <option value="">Select type…</option>
              ${campaignTypes.map(t => `<option value="${t.id}" ${existing?.campaignType?.id === t.id ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </label>
          <label>Trigger type *
            <select id="sms-trig-type" class="form-control" required>
              <option value="">Select trigger…</option>
              ${triggerTypes.map(t => `<option value="${t.id}" ${existing?.triggerType?.id === t.id ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </label>
          <label>Recipient business rule
            <select id="sms-recip" class="form-control">
              <option value="">— Select —</option>
              ${recipientTypes.map(r => `<option value="${r.reportId || r.id}" ${existing?.businessRuleId === (r.reportId || r.id) ? 'selected' : ''}>${escapeHtml(r.reportName || r.value || r.name)}</option>`).join('')}
            </select>
          </label>
          <label>SMS provider
            <select id="sms-provider" class="form-control">
              ${providers.map(p => `<option value="${p.id}" ${existing?.providerId === p.id ? 'selected' : ''}>${escapeHtml(p.value || p.name)}</option>`).join('')}
            </select>
          </label>
          <label>Recurrence (cron-style)
            <input id="sms-recurrence" class="form-control" placeholder="e.g. 0 9 * * 1" value="${escapeHtml(existing?.recurrence || '')}"/>
          </label>
          <label class="full">Message template *
            <textarea id="sms-message" class="form-control" rows="4" required placeholder="Hi {{client.displayName}}, your loan #{{loan.accountNo}} payment of {{loan.dueAmount}} is due on {{loan.dueDate}}.">${escapeHtml(existing?.message || existing?.smsMessage || '')}</textarea>
          </label>
          <div class="full">
            <button class="btn-secondary btn-sm" id="sms-preview-btn" type="button"><i class="fa-solid fa-eye"></i> Preview</button>
            <div id="sms-preview-out" class="mt-2"></div>
          </div>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Use <code>{{entity.field}}</code> placeholders for dynamic content (e.g. <code>{{client.displayName}}</code>, <code>{{loan.accountNo}}</code>).
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="sms-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#sms-preview-btn').addEventListener('click', async () => {
    const message = modalEl.querySelector('#sms-message').value.trim();
    const out = modalEl.querySelector('#sms-preview-out');
    if (!message) { toast('warn', 'Enter a message template first', ''); return; }
    out.innerHTML = '<div class="empty-state-row">Loading preview…</div>';
    try {
      const res = await api.smsCampaigns.preview({ smsMessage: message, message });
      const previewText = res?.message || res?.smsMessage || (typeof res === 'string' ? res : JSON.stringify(res));
      out.innerHTML = `<div class="msg-banner b-info small">${escapeHtml(previewText)}</div>`;
    } catch (e) {
      out.innerHTML = `<div class="text-error small">${escapeHtml(extractFineractError(e))}</div>`;
    }
  });
  modalEl.querySelector('#sms-save').addEventListener('click', async () => {
    const campaignName = modalEl.querySelector('#sms-name').value.trim();
    const campaignType = parseInt(modalEl.querySelector('#sms-camp-type').value);
    const triggerType = parseInt(modalEl.querySelector('#sms-trig-type').value);
    const message = modalEl.querySelector('#sms-message').value.trim();

    if (!campaignName || !campaignType || !triggerType || !message) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {
      campaignName, campaignType, triggerType,
      message,
      locale: LOCALE, dateFormat: DATE_FORMAT
    };
    const recipId = parseInt(modalEl.querySelector('#sms-recip').value);
    if (recipId) payload.businessRuleId = recipId;
    const providerId = parseInt(modalEl.querySelector('#sms-provider').value);
    if (providerId) payload.providerId = providerId;
    const recurrence = modalEl.querySelector('#sms-recurrence').value.trim();
    if (recurrence) payload.recurrence = recurrence;

    try {
      if (isEdit) await api.smsCampaigns.update(existing.id, payload);
      else        await api.smsCampaigns.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Campaign updated' : 'Campaign created', campaignName);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}

export async function openEmailCampaignModal(existing, onSuccess) {
  const isEdit = !!existing?.id;
  let tpl = {};
  try { tpl = await api.emailCampaigns.template(); } catch {}

  const campaignTypes = tpl.campaignTypeOptions || [
    { id: 1, value: 'Direct' },
    { id: 2, value: 'Schedule' },
    { id: 3, value: 'Triggered' }
  ];
  const recipientTypes = tpl.businessRuleOptions || tpl.recipientOptions || [];

  const mid = 'email-camp-' + Date.now();
  const modalEl = document.createElement('div');
  modalEl.id = mid;
  modalEl.className = 'modal-overlay open';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header"><h3>${isEdit ? 'Edit' : 'New'} Email Campaign</h3><button data-close-modal>&times;</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <label class="full">Campaign name * <input id="ec-name" class="form-control" value="${escapeHtml(existing?.campaignName || existing?.name || '')}" required/></label>
          <label>Campaign type *
            <select id="ec-camp-type" class="form-control" required>
              <option value="">Select type…</option>
              ${campaignTypes.map(t => `<option value="${t.id}" ${existing?.campaignType?.id === t.id ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </label>
          <label>Recipient business rule
            <select id="ec-recip" class="form-control">
              <option value="">— Select —</option>
              ${recipientTypes.map(r => `<option value="${r.reportId || r.id}" ${existing?.businessRuleId === (r.reportId || r.id) ? 'selected' : ''}>${escapeHtml(r.reportName || r.value || r.name)}</option>`).join('')}
            </select>
          </label>
          <label>Recurrence (cron-style)
            <input id="ec-recurrence" class="form-control" placeholder="e.g. 0 9 * * 1" value="${escapeHtml(existing?.recurrence || '')}"/>
          </label>
          <label class="full">Email subject * <input id="ec-subject" class="form-control" value="${escapeHtml(existing?.emailSubject || '')}" required/></label>
          <label class="full">Message body *
            <textarea id="ec-message" class="form-control" rows="6" required placeholder="Dear {{client.displayName}}, your loan #{{loan.accountNo}} payment of {{loan.dueAmount}} is due on {{loan.dueDate}}.">${escapeHtml(existing?.message || existing?.emailMessage || '')}</textarea>
          </label>
          <div class="full">
            <button class="btn-secondary btn-sm" id="ec-preview-btn" type="button"><i class="fa-solid fa-eye"></i> Preview</button>
            <div id="ec-preview-out" class="mt-2"></div>
          </div>
        </div>
        <div class="msg-banner b-info mt-2">
          <i class="fa-solid fa-circle-info"></i>
          Use <code>{{entity.field}}</code> placeholders for dynamic content (e.g. <code>{{client.displayName}}</code>, <code>{{loan.accountNo}}</code>).
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close-modal>Cancel</button>
        <button class="btn-primary" id="ec-save">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </div>`;
  document.getElementById('modalRoot').appendChild(modalEl);

  modalEl.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => modalEl.remove()));
  modalEl.querySelector('#ec-preview-btn').addEventListener('click', async () => {
    const message = modalEl.querySelector('#ec-message').value.trim();
    const out = modalEl.querySelector('#ec-preview-out');
    if (!message) { toast('warn', 'Enter a message body first', ''); return; }
    out.innerHTML = '<div class="empty-state-row">Loading preview…</div>';
    try {
      const res = await api.emailCampaigns.preview({ message, emailMessage: message });
      const previewText = res?.message || res?.emailMessage || (typeof res === 'string' ? res : JSON.stringify(res));
      out.innerHTML = `<div class="msg-banner b-info small">${escapeHtml(previewText)}</div>`;
    } catch (e) {
      out.innerHTML = `<div class="text-error small">${escapeHtml(extractFineractError(e))}</div>`;
    }
  });
  modalEl.querySelector('#ec-save').addEventListener('click', async () => {
    const campaignName = modalEl.querySelector('#ec-name').value.trim();
    const campaignType = parseInt(modalEl.querySelector('#ec-camp-type').value);
    const emailSubject = modalEl.querySelector('#ec-subject').value.trim();
    const message = modalEl.querySelector('#ec-message').value.trim();

    if (!campaignName || !campaignType || !emailSubject || !message) {
      toast('warn', 'Fill required fields', '');
      return;
    }

    const payload = {
      campaignName, campaignType,
      emailSubject, message,
      locale: LOCALE, dateFormat: DATE_FORMAT
    };
    const recipId = parseInt(modalEl.querySelector('#ec-recip').value);
    if (recipId) payload.businessRuleId = recipId;
    const recurrence = modalEl.querySelector('#ec-recurrence').value.trim();
    if (recurrence) payload.recurrence = recurrence;

    try {
      if (isEdit) await api.emailCampaigns.update(existing.id, payload);
      else        await api.emailCampaigns.create(payload);
      modalEl.remove();
      toast('success', isEdit ? 'Campaign updated' : 'Campaign created', campaignName);
      onSuccess();
    } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
  });
}
