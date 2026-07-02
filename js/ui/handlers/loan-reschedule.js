/* FinCraft · ui/handlers/loan-reschedule.js — LOAN RESCHEDULE form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE, today } from '../../config.js';

export const LoanRescheduleHandlers = {
    'submit-reschedule': async (btn) => {
      const f = formData('rescheduleForm');
      if (!f.loanId || !f.rescheduleFromDate || !f.rescheduleReasonId) {
        toast('warn', 'Required', 'Loan, from-date and reason are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        loanId: parseInt(f.loanId),
        rescheduleFromDate: f.rescheduleFromDate,
        rescheduleReasonId: parseInt(f.rescheduleReasonId),
        submittedOnDate: today()
      };
      if (f.adjustedDueDate) payload.adjustedDueDate = f.adjustedDueDate;
      if (f.numberOfRepayments) payload.extraTerms = parseInt(f.numberOfRepayments);
      if (f.interestRatePerPeriod) payload.newInterestRate = parseFloat(f.interestRatePerPeriod);
      if (f.comments) payload.rescheduleReasonComment = f.comments;

      setSubmitting(btn, true);
      try {
        await api.loans.reschedule(payload);
        toast('success', 'Reschedule request submitted', '');
        closeModal('rescheduleModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Reschedule failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
