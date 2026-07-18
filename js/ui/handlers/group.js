/* FinCraft · ui/handlers/group.js — GROUP form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const GroupHandlers = {
    'submit-group': async (btn) => {
      const f = formData('newGroupForm');
      if (!f.name || !f.officeId || !f.submittedOnDate || !f.centerId) {
        toast('warn', 'Required', 'Name, center, office and submitted date are required'); return;
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
        const r = await api.groups.create(payload);
        const id = r.groupId || r.resourceId;
        let statusMsg = 'Group created';

        // Group creation is required to be attached to a center — the Groups
        // endpoint itself has no centerId create field (confirmed against the
        // API docs), so attaching happens via the Center's associateGroups
        // command right after create.
        if (id) {
          try {
            await api.centers.associateGroups(f.centerId, { groupMembers: [String(id)] });
            statusMsg = 'Group created & attached to center';
          } catch (assocErr) {
            toast('warn', 'Created, but attaching to center failed', assocErr.detail?.defaultUserMessage || assocErr.message);
            statusMsg = null;
          }
        }

        if (autoActivate && id) {
          try {
            await api.groups.activate(id, { activationDate: f.submittedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            statusMsg = statusMsg ? statusMsg + ' & activated' : 'Group activated';
          } catch (actErr) {
            toast('warn', 'Group created, but activation failed', actErr.detail?.defaultUserMessage || actErr.message);
            if (!statusMsg) statusMsg = null;
          }
        }

        if (statusMsg) toast('success', statusMsg, f.name);
        closeModal('newGroupModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
