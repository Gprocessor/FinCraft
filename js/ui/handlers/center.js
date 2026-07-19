/* FinCraft · ui/handlers/center.js — CENTER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const CenterHandlers = {
    'submit-center': async (btn) => {
      const f = formData('newCenterForm');
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
      const autoActivate = f.autoActivate === 'on' || f.autoActivate === 'true';

      setSubmitting(btn, true);
      try {
        const r = await api.centers.create(payload);
        const id = r.centerId || r.resourceId;
        let statusMsg = 'Center created';
        if (autoActivate && id) {
          try {
            await api.centers.activate(id, { activationDate: f.submittedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            statusMsg = 'Center created & activated';
          } catch (actErr) {
            toast('warn', 'Center created, but activation failed', extractFineractError(actErr));
            statusMsg = null;
          }
        }
        if (statusMsg) toast('success', statusMsg, f.name);
        closeModal('newCenterModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
