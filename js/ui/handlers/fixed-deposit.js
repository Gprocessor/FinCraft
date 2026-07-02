/* FinCraft · ui/handlers/fixed-deposit.js — FIXED DEPOSIT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const FixedDepositHandlers = {
    'submit-fd': async (btn) => {
      const f = formData('newFDForm');
      if (!f.clientId || !f.productId || !f.depositAmount || !f.depositPeriod) {
        toast('warn', 'Required', 'Client, product, amount and period are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        clientId: parseInt(f.clientId),
        productId: parseInt(f.productId),
        depositAmount: parseFloat(f.depositAmount),
        depositPeriod: parseInt(f.depositPeriod),
        depositPeriodFrequencyId: parseInt(f.depositPeriodFrequencyId || 2),
        submittedOnDate: f.submittedOnDate
      };
      if (f.fieldOfficerId) payload.fieldOfficerId = parseInt(f.fieldOfficerId);
      if (f.expectedFirstDepositOnDate) payload.expectedFirstDepositOnDate = f.expectedFirstDepositOnDate;
      if (f.maturityInstructionId) payload.maturityInstructionId = parseInt(f.maturityInstructionId);
      if (f.externalId) payload.externalId = f.externalId;

      setSubmitting(btn, true);
      try {
        const r = await api.fixedDeposits.create(payload);
        toast('success', 'FD application submitted', `#${r.savingsId || r.resourceId}`);
        closeModal('newFDModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
