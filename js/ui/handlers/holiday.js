/* FinCraft · ui/handlers/holiday.js — HOLIDAY form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const HolidayHandlers = {
    'submit-holiday': async (btn) => {
      const f = formData('newHolidayForm');
      const officeIds = Array.from(document.querySelectorAll('#holiday-offices-sel option:checked')).map(o => parseInt(o.value));
      if (!f.name || !f.fromDate || !f.toDate || !officeIds.length) {
        toast('warn', 'Required', 'Name, dates and at least one office are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        fromDate: f.fromDate,
        toDate: f.toDate,
        reschedulingType: 2,
        offices: officeIds.map(id => ({ officeId: id }))
      };
      if (f.repaymentsRescheduledTo) payload.repaymentsRescheduledTo = f.repaymentsRescheduledTo;
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.holidays.create(payload);
        toast('success', 'Holiday created', f.name);
        closeModal('newHolidayModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
