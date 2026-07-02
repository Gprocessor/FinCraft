/* FinCraft · ui/handlers/charge.js — CHARGE form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { LOCALE } from '../../config.js';

export const ChargeHandlers = {
    'submit-charge': async (btn) => {
      const f = formData('newChargeForm');
      if (!f.name || !f.amount || !f.currencyCode) {
        toast('warn', 'Required', 'Name, amount and currency are required'); return;
      }
      const payload = {
        locale: LOCALE,
        name: f.name,
        amount: parseFloat(f.amount),
        currencyCode: f.currencyCode,
        chargeAppliesTo: parseInt(f.chargeAppliesTo),
        chargeTimeType: parseInt(f.chargeTimeType),
        chargeCalculationType: parseInt(f.chargeCalculationType),
        penalty: f.penalty === 'true',
        active: f.active !== 'false'
      };

      setSubmitting(btn, true);
      try {
        await api.charges.create(payload);
        toast('success', 'Charge created', f.name);
        closeModal('newChargeModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
