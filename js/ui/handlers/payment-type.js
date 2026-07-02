/* FinCraft · ui/handlers/payment-type.js — PAYMENT TYPE form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';

export const PaymentTypeHandlers = {
    'submit-paymenttype': async (btn) => {
      const f = formData('newPaymentTypeForm');
      if (!f.name) { toast('warn', 'Name required', ''); return; }
      const payload = {
        name: f.name,
        description: f.description || undefined,
        isCashPayment: f.isCashPayment === 'true',
        position: parseInt(f.position) || 0
      };

      setSubmitting(btn, true);
      try {
        await api.paymentTypes.create(payload);
        toast('success', 'Payment type created', f.name);
        closeModal('newPaymentTypeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
