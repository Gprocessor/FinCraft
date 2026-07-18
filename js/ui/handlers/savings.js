/* FinCraft · ui/handlers/savings.js — SAVINGS form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const SavingsHandlers = {
    'submit-savings': async (btn) => {
      const f = formData('newSavingsForm');
      if (!f.clientId || !f.productId) { toast('warn', 'Required', 'Client and product required'); return; }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        submittedOnDate: f.submittedOnDate
      };
      if (f.staffId) payload.fieldOfficerId = parseInt(f.staffId);
      if (f.nominalAnnualInterestRate) payload.nominalAnnualInterestRate = parseFloat(f.nominalAnnualInterestRate);
      if (f.externalId) payload.externalId = f.externalId;

      const autoApproveActivate = f.autoApproveActivate === 'on' || f.autoApproveActivate === 'true';

      setSubmitting(btn, true);
      try {
        const r = await api.savings.create(payload);
        const id = r.savingsId || r.resourceId;
        let statusMsg = 'Savings application submitted';
        if (autoApproveActivate && id) {
          try {
            await api.savings.approve(id, { approvedOnDate: f.submittedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
            try {
              await api.savings.activate(id, { activatedOnDate: f.submittedOnDate, dateFormat: DATE_FORMAT, locale: LOCALE });
              statusMsg = 'Savings account created, approved & activated';
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
        closeModal('newSavingsModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
