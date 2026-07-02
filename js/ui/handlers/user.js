/* FinCraft · ui/handlers/user.js — USER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';

export const UserHandlers = {
    'submit-user': async (btn) => {
      const f = formData('newUserForm');
      if (!f.username || !f.email || !f.firstname || !f.lastname || !f.officeId) {
        toast('warn', 'Required', 'Username, email, name and office required'); return;
      }
      const rolesSel = document.getElementById('newuser-roles');
      const roles = rolesSel ? Array.from(rolesSel.selectedOptions).map(o => parseInt(o.value)) : [];
      if (!roles.length) { toast('warn', 'Roles required', 'Select at least one role'); return; }
      const payload = {
        username: f.username,
        email: f.email,
        firstname: f.firstname,
        lastname: f.lastname,
        officeId: parseInt(f.officeId),
        roles
      };
      if (f.sendPasswordToEmail === 'on' || f.sendPasswordToEmail === 'true') {
        payload.sendPasswordToEmail = true;
      } else {
        if (!f.password || f.password !== f.repeatPassword) {
          toast('warn', 'Passwords mismatch', 'Passwords must match'); return;
        }
        payload.password = f.password;
        payload.repeatPassword = f.repeatPassword;
        payload.sendPasswordToEmail = false;
      }

      setSubmitting(btn, true);
      try {
        await api.users.create(payload);
        toast('success', 'User created', f.username);
        closeModal('newUserModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
