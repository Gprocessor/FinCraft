/* FinCraft · ui/handlers/loan-product.js — LOAN PRODUCT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { LOCALE } from '../../config.js';

export const LoanProductHandlers = {
    'submit-loan-product': async (btn) => {
      const f = formData('newLoanProductForm');
      if (!f.name || !f.shortName || !f.currencyCode || !f.principal ||
          !f.numberOfRepayments || !f.interestRatePerPeriod) {
        toast('warn', 'Required', 'Fill in all required loan product fields'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        shortName: f.shortName,
        currencyCode: f.currencyCode,
        digitsAfterDecimal: parseInt(f.digitsAfterDecimal) || 2,
        principal: parseFloat(f.principal),
        numberOfRepayments: parseInt(f.numberOfRepayments),
        repaymentEvery: parseInt(f.repaymentEvery) || 1,
        repaymentFrequencyType: parseInt(f.repaymentFrequencyType || 2),
        interestRatePerPeriod: parseFloat(f.interestRatePerPeriod),
        interestRateFrequencyType: parseInt(f.interestRateFrequencyType || 2),
        amortizationType: parseInt(f.amortizationType || 1),
        interestType: parseInt(f.interestType || 0),
        interestCalculationPeriodType: parseInt(f.interestCalculationPeriodType || 1),
        transactionProcessingStrategyCode: f.transactionProcessingStrategyCode || 'mifos-standard-strategy',
        accountingRule: parseInt(f.accountingRule || 1)
      };
      if (f.minPrincipal) payload.minPrincipal = parseFloat(f.minPrincipal);
      if (f.maxPrincipal) payload.maxPrincipal = parseFloat(f.maxPrincipal);
      if (f.graceOnPrincipalPayment) payload.graceOnPrincipalPayment = parseInt(f.graceOnPrincipalPayment);
      if (f.graceOnInterestPayment)  payload.graceOnInterestPayment  = parseInt(f.graceOnInterestPayment);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.loanProducts.create(payload);
        toast('success', 'Loan product created', f.name);
        closeModal('newLoanProductModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
