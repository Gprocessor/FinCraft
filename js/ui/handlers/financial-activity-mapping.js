/* FinCraft · ui/handlers/financial-activity-mapping.js — FINANCIAL ACTIVITY MAPPING form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';

export const FinancialActivityMappingHandlers = {
    'submit-fa-account': async (btn) => {
      const f = formData('newFAAccountForm');
      if (!f.financialActivityId || !f.glAccountId) {
        toast('warn', 'Required', 'Activity and GL account required'); return;
      }
      const payload = {
        financialActivityId: parseInt(f.financialActivityId),
        glAccountId: parseInt(f.glAccountId)
      };

      setSubmitting(btn, true);
      try {
        await api.financialActivityAccounts.create(payload);
        toast('success', 'Mapping saved', '');
        closeModal('newFAAccountModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
