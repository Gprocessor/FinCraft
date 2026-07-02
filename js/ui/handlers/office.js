/* FinCraft · ui/handlers/office.js — OFFICE form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const OfficeHandlers = {
    'submit-office': async (btn) => {
      const f = formData('newOfficeForm');
      if (!f.name || !f.parentId || !f.openingDate) {
        toast('warn', 'Required', 'Name, parent and opening date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        parentId: parseInt(f.parentId),
        openingDate: f.openingDate
      };
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        await api.offices.create(payload);
        toast('success', 'Office created', f.name);
        closeModal('newOfficeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
