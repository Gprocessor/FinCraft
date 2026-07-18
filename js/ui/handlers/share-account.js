/* FinCraft · ui/handlers/share-account.js — SHARE ACCOUNT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const ShareAccountHandlers = {
    'submit-share': async (btn) => {
      const f = formData('newShareForm');
      if (!f.clientId || !f.productId || !f.requestedShares) {
        toast('warn', 'Required', 'Client, product and shares are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        requestedShares: parseInt(f.requestedShares),
        unitPrice: parseFloat(f.unitPrice) || 1,
        submittedDate: f.submittedDate
      };
      if (f.externalId) payload.externalId = f.externalId;

      const autoApproveActivate = f.autoApproveActivate === 'on' || f.autoApproveActivate === 'true';

      setSubmitting(btn, true);
      try {
        const r = await api.shares.create(payload);
        const id = r.resourceId || r.savingsId;
        let statusMsg = 'Share application submitted';
        if (autoApproveActivate && id) {
          try {
            await api.shares.approve(id, { approvedDate: f.submittedDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            try {
              await api.shares.activate(id, { activatedDate: f.submittedDate, dateFormat: DATE_FORMAT, locale: LOCALE });
              statusMsg = 'Share account created, approved & activated';
            } catch (actErr) {
              statusMsg = 'Created & approved, but activation failed';
              toast('warn', statusMsg, actErr.detail?.defaultUserMessage || actErr.message);
              statusMsg = null;
            }
          } catch (appErr) {
            toast('warn', 'Created, but approval failed', appErr.detail?.defaultUserMessage || appErr.message);
            statusMsg = null;
          }
        }
        if (statusMsg) toast('success', statusMsg, `#${id}`);
        closeModal('newShareModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
