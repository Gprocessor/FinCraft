/* FinCraft · ui/handlers/savings-deposit-withdrawal.js — SAVINGS DEPOSIT / WITHDRAWAL form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const SavingsDepositWithdrawalHandlers = {
    'submit-savings-deposit': async (btn) => {
      const modal = document.getElementById('savingsDepositModal');
      const accountId = modal?.dataset?.accountId;
      if (!accountId) { toast('warn', 'Account required', ''); return; }
      const f = formData('savingsDepositForm');
      if (!f.transactionType || !f.transactionAmount || !f.transactionDate) {
        toast('warn', 'Required', 'Type, amount and date are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        transactionDate: f.transactionDate,
        transactionAmount: parseFloat(f.transactionAmount)
      };
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);
      if (f.accountNumber) payload.accountNumber = f.accountNumber;
      if (f.checkNumber)   payload.checkNumber   = f.checkNumber;
      if (f.receiptNumber) payload.receiptNumber = f.receiptNumber;
      if (f.note) payload.note = f.note;

      setSubmitting(btn, true);
      try {
        if (f.transactionType === 'withdrawal') await api.savings.withdrawal(accountId, payload);
        else await api.savings.deposit(accountId, payload);
        toast('success', `${f.transactionType === 'withdrawal' ? 'Withdrawal' : 'Deposit'} posted`, '');
        closeModal('savingsDepositModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Transaction failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
