/* FinCraft · ui/handlers/teller.js — TELLER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const TellerHandlers = {
    'submit-teller': async (btn) => {
      const f = formData('newTellerForm');
      if (!f.name || !f.officeId || !f.startDate) {
        toast('warn', 'Required', 'Name, office and start date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        officeId: parseInt(f.officeId),
        startDate: f.startDate,
        status: f.status || 'ACTIVE'
      };
      if (f.endDate) payload.endDate = f.endDate;
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.tellers.create(payload);
        toast('success', 'Teller created', f.name);
        closeModal('newTellerModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
