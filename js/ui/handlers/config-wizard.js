/* FinCraft · ui/handlers/config-wizard.js — CONFIG WIZARD form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, setSubmitting } from '../dom-helpers.js';
import { LOCALE } from '../../config.js';

export const ConfigWizardHandlers = {
    'submit-wizard': async (btn) => {
      const days = Array.from(document.querySelectorAll('#cw-days [data-cw-day]:checked'))
        .map(cb => ({ Sun:'SU', Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA' }[cb.dataset.cwDay]));
      const currencies = Array.from(document.querySelectorAll('#cw-currencies option:checked')).map(o => o.value);

      const requests = [];
      if (days.length) {
        requests.push({
          requestId: 1,
          relativeUrl: 'workingdays',
          method: 'PUT',
          body: {
            recurrence: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days.join(',')}`,
            repaymentRescheduleType: 1,
            locale: LOCALE
          }
        });
      }
      if (currencies.length) {
        requests.push({
          requestId: 2,
          relativeUrl: 'currencies',
          method: 'PUT',
          body: { currencies }
        });
      }
      if (!requests.length) { toast('warn', 'Nothing to save', ''); return; }

      setSubmitting(btn, true);
      try {
        await api.batch.submit(requests, true);
        toast('success', 'Configuration saved', '');
        closeModal('configWizardModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Save failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
