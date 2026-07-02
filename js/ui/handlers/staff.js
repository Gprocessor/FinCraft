/* FinCraft · ui/handlers/staff.js — STAFF form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const StaffHandlers = {
    'submit-staff': async (btn) => {
      const f = formData('newStaffForm');
      if (!f.firstname || !f.lastname || !f.officeId) {
        toast('warn', 'Required', 'First name, last name and office are required'); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        firstname: f.firstname,
        lastname: f.lastname,
        officeId: parseInt(f.officeId),
        isLoanOfficer: f.isLoanOfficer === 'true',
        isActive: f.isActive !== 'false'
      };
      if (f.mobileNo) payload.mobileNo = f.mobileNo;
      if (f.joiningDate) payload.joiningDate = f.joiningDate;

      setSubmitting(btn, true);
      try {
        await api.staff.create(payload);
        toast('success', 'Staff created', `${f.firstname} ${f.lastname}`);
        closeModal('newStaffModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Create failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
