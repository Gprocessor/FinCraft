/* FinCraft · ui/handlers/self-service-user.js — SELF-SERVICE USER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';

export const SelfServiceUserHandlers = {
    'submit-ss-user': async (btn) => {
      const f = formData('selfServiceUserForm');
      if (!f.clientId || !f.username || !f.email || !f.password) {
        toast('warn', 'Required', 'All fields required'); return;
      }
      if (f.password !== f.passwordRepeat) {
        toast('warn', 'Passwords mismatch', ''); return;
      }
      const payload = {
        clientId: parseInt(f.clientId),
        username: f.username,
        email: f.email,
        password: f.password,
        authenticationMode: 'email'
      };

      setSubmitting(btn, true);
      try {
        await api.selfService.register(payload);
        toast('success', 'Portal user created', f.username);
        closeModal('selfServiceUserModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Registration failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
