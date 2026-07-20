/* FinCraft · ui/handlers/clients.js — CLIENTS form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const ClientsHandlers = {
    'submit-client': async (btn) => {
      const f = formData('newClientForm');
      if (!f.officeId || !f.submittedOnDate) {
        toast('warn', 'Missing fields', 'Office and submitted date are required'); return;
      }
      const payload = { dateFormat: DATE_FORMAT, locale: LOCALE };
      payload.officeId = parseInt(f.officeId);
      payload.legalFormId = parseInt(f.legalFormId || '1');
      payload.submittedOnDate = f.submittedOnDate;
      if (f.legalFormId === '2') {
        if (!f.fullname) { toast('warn', 'Full name required', ''); return; }
        payload.fullname = f.fullname;
      } else {
        if (!f.firstname || !f.lastname) { toast('warn', 'First & last name required', ''); return; }
        payload.firstname = f.firstname;
        payload.lastname = f.lastname;
        if (f.middlename) payload.middlename = f.middlename;
        if (f.dateOfBirth) payload.dateOfBirth = f.dateOfBirth;
        if (f.genderId) payload.genderId = parseInt(f.genderId);
      }
      if (f.mobileNo) payload.mobileNo = f.mobileNo;
      if (f.externalId) payload.externalId = f.externalId;
      if (f.staffId) payload.staffId = parseInt(f.staffId);
      // Center is UI-only (narrows the Group dropdown); only groupId is a real
      // Fineract client-create field. Group becomes required once a center is
      // picked — see the cl-center-sel cascade wiring in modal-init.js.
      if (f.groupId) payload.groupId = parseInt(f.groupId);
      if (f.activationDate) { payload.activationDate = f.activationDate; payload.active = true; }
      if (f.isStaff === 'on' || f.isStaff === 'true') payload.isStaff = true;

      setSubmitting(btn, true);
      try {
        const r = await api.clients.create(payload);
        toast('success', 'Client created', `ID #${r.resourceId || r.clientId || ''}`);
        closeModal('newClientModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
