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

      setSubmitting(btn, true);
      try {
        const r = await api.shares.create(payload);
        toast('success', 'Share application submitted', `#${r.resourceId || r.savingsId}`);
        closeModal('newShareModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
