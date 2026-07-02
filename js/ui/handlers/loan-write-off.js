/* FinCraft · ui/handlers/loan-write-off.js — LOAN WRITE-OFF form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const LoanWriteOffHandlers = {
    'submit-writeoff': async (btn) => {
      const modal = document.getElementById('writeOffModal');
      const loanId = modal?.dataset?.loanId;
      if (!loanId) { toast('warn', 'Loan required', ''); return; }
      const f = formData('writeOffForm');
      if (!f.transactionDate) { toast('warn', 'Date required', ''); return; }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate
      };
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        await api.loans.writeOff(loanId, payload);
        toast('success', 'Loan written off', `Loan #${loanId}`);
        closeModal('writeOffModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Write-off failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
