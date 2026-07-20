/* FinCraft · ui/handlers/gl-account.js — GL ACCOUNT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';

export const GlAccountHandlers = {
    'submit-gl': async (btn) => {
      const f = formData('glAccountForm');
      if (!f.name || !f.glCode || !f.type || !f.usage) {
        toast('warn', 'Required', 'Name, code, type and usage are required'); return;
      }
      const payload = {
        name: f.name,
        glCode: f.glCode,
        type: parseInt(f.type),
        usage: parseInt(f.usage),
        manualEntriesAllowed: f.manualEntries === 'on' || f.manualEntries === 'true'
      };
      if (f.parentId) payload.parentId = parseInt(f.parentId);
      if (f.description) payload.description = f.description;

      setSubmitting(btn, true);
      try {
        await api.glAccounts.create(payload);
        toast('success', 'GL account created', f.name);
        closeModal('glAccountModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
