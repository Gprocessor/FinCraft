/* FinCraft · ui/handlers/savings-product.js — SAVINGS PRODUCT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { LOCALE } from '../../config.js';

export const SavingsProductHandlers = {
    'submit-savings-product': async (btn) => {
      const f = formData('newSavingsProductForm');
      if (!f.name || !f.shortName || !f.currencyCode || !f.nominalAnnualInterestRate) {
        toast('warn', 'Required', 'Fill in all required savings product fields'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        shortName: f.shortName,
        currencyCode: f.currencyCode,
        digitsAfterDecimal: parseInt(f.digitsAfterDecimal) || 2,
        nominalAnnualInterestRate: parseFloat(f.nominalAnnualInterestRate),
        interestCompoundingPeriodType: parseInt(f.interestCompoundingPeriodType || 1),
        interestPostingPeriodType: parseInt(f.interestPostingPeriodType || 4),
        interestCalculationType: parseInt(f.interestCalculationType || 1),
        interestCalculationDaysInYearType: parseInt(f.interestCalculationDaysInYearType || 365),
        accountingRule: parseInt(f.accountingRule || 1)
      };
      if (f.minRequiredOpeningBalance) payload.minRequiredOpeningBalance = parseFloat(f.minRequiredOpeningBalance);
      if (f.withdrawalFeeForTransfers) payload.withdrawalFeeForTransfers = parseFloat(f.withdrawalFeeForTransfers);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.savingsProducts.create(payload);
        toast('success', 'Savings product created', f.name);
        closeModal('newSavingsProductModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
