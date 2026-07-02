/* FinCraft · ui/handlers/provisioning-criteria.js — PROVISIONING CRITERIA form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, setSubmitting } from '../dom-helpers.js';

export const ProvisioningCriteriaHandlers = {
    'submit-prov-criteria': async (btn) => {
      const form = document.getElementById('newProvCriteriaForm');
      if (!form) return;
      const criteriaName = form.querySelector('[name="criteriaName"]')?.value?.trim();
      if (!criteriaName) { toast('warn', 'Required', 'Criteria name required'); return; }
      const names  = Array.from(form.querySelectorAll('[name="pc_name[]"]')).map(i => i.value.trim());
      const mins   = Array.from(form.querySelectorAll('[name="pc_min[]"]')).map(i => parseInt(i.value));
      const maxs   = Array.from(form.querySelectorAll('[name="pc_max[]"]')).map(i => parseInt(i.value));
      const amts   = Array.from(form.querySelectorAll('[name="pc_minamount[]"]')).map(i => parseFloat(i.value) || 0);
      const pcts   = Array.from(form.querySelectorAll('[name="pc_pct[]"]')).map(i => parseFloat(i.value));
      const definitions = names.map((n, i) => ({
        categoryId: i + 1,
        categoryName: n,
        minAge: mins[i],
        maxAge: maxs[i],
        minimumAmount: amts[i],
        provisioningPercentage: pcts[i]
      })).filter(d => d.categoryName);

      setSubmitting(btn, true);
      try {
        await api.provisioning.createCriteria({
          criteriaName,
          provisioningcriteria: definitions
        });
        toast('success', 'Criteria created', criteriaName);
        closeModal('newProvCriteriaModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
