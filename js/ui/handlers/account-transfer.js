/* FinCraft · ui/handlers/account-transfer.js — ACCOUNT TRANSFER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const AccountTransferHandlers = {
    'submit-transfer': async (btn) => {
      const f = formData('newTransferForm');
      if (!f.fromOfficeId || !f.fromClientId || !f.fromAccountId ||
          !f.toOfficeId   || !f.toClientId   || !f.toAccountId   ||
          !f.transferAmount || !f.transferDate) {
        toast('warn', 'Required', 'All transfer fields are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        fromOfficeId: parseInt(f.fromOfficeId),
        fromClientId: parseInt(f.fromClientId),
        fromAccountId: parseInt(f.fromAccountId),
        fromAccountType: parseInt(f.fromAccountType || 2),
        toOfficeId: parseInt(f.toOfficeId),
        toClientId: parseInt(f.toClientId),
        toAccountId: parseInt(f.toAccountId),
        toAccountType: parseInt(f.toAccountType || 2),
        transferAmount: parseFloat(f.transferAmount),
        transferDate: f.transferDate,
        transferDescription: f.transferDescription || 'Account transfer'
      };

      setSubmitting(btn, true);
      try {
        await api.transfers.create(payload);
        toast('success', 'Transfer completed', '');
        closeModal('newTransferModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Transfer failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
