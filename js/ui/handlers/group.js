/* FinCraft · ui/handlers/group.js — GROUP form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const GroupHandlers = {
    'submit-group': async (btn) => {
      const f = formData('newGroupForm');
      if (!f.name || !f.officeId || !f.submittedOnDate) {
        toast('warn', 'Required', 'Name, office and submitted date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        officeId: parseInt(f.officeId),
        submittedOnDate: f.submittedOnDate
      };
      if (f.staffId) payload.staffId = parseInt(f.staffId);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.groups.create(payload);
        toast('success', 'Group created', f.name);
        closeModal('newGroupModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
