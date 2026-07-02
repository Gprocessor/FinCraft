/* FinCraft · ui/handlers/repayment.js — REPAYMENT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const RepaymentHandlers = {
    'submit-repayment': async (btn) => {
      const modal = document.getElementById('repaymentModal');
      const loanId = modal?.dataset?.loanId || modal?.querySelector('#rp-loanid')?.value;
      if (!loanId) { toast('warn', 'Loan required', 'Loan ID missing'); return; }
      const f = formData('repaymentForm');
      if (!f.transactionDate || !f.transactionAmount) {
        toast('warn', 'Required', 'Date and amount are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate,
        transactionAmount: parseFloat(f.transactionAmount)
      };
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);
      if (f.receiptNumber) payload.receiptNumber = f.receiptNumber;
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        await api.loans.repay(loanId, payload);
        toast('success', 'Repayment recorded', `Loan #${loanId}`);
        closeModal('repaymentModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Repayment failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
