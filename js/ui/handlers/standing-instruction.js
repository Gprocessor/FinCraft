/* FinCraft · ui/handlers/standing-instruction.js — STANDING INSTRUCTION form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const StandingInstructionHandlers = {
    'submit-si': async (btn) => {
      const f = formData('newSIForm');
      if (!f.name || !f.fromClientId || !f.fromAccountId || !f.toClientId || !f.toAccountId ||
          !f.amount || !f.validFrom) {
        toast('warn', 'Required', 'All instruction fields required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        name: f.name,
        fromClientId: parseInt(f.fromClientId),
        fromAccountId: parseInt(f.fromAccountId),
        fromAccountType: parseInt(f.fromAccountType || 2),
        toClientId: parseInt(f.toClientId),
        toAccountId: parseInt(f.toAccountId),
        toAccountType: parseInt(f.toAccountType || 2),
        amount: parseFloat(f.amount),
        transferType: parseInt(f.transferType || 1),
        validFrom: f.validFrom,
        recurrenceType: parseInt(f.recurrenceType || 1),
        recurrenceFrequency: parseInt(f.recurrenceFrequency || 3),
        recurrenceInterval: parseInt(f.recurrenceInterval || 1),
        instructionType: parseInt(f.instructionType || 1),
        priority: parseInt(f.priority || 3),
        status: parseInt(f.status || 1)
      };
      if (f.validTill) payload.validTill = f.validTill;
      if (f.recurrenceOnMonthDay) payload.recurrenceOnMonthDay = parseInt(f.recurrenceOnMonthDay);

      setSubmitting(btn, true);
      try {
        await api.standingInstructions.create(payload);
        toast('success', 'Standing instruction created', f.name);
        closeModal('newSIModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
