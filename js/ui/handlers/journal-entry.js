/* FinCraft · ui/handlers/journal-entry.js — JOURNAL ENTRY form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { collectJournalRows, extractFineractError, formData, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const JournalEntryHandlers = {
    'submit-journal': async (btn) => {
      const f = formData('journalEntryForm');
      if (!f.officeId || !f.currencyCode || !f.transactionDate) {
        toast('warn', 'Required', 'Office, currency and date are required'); return;
      }
      const debits  = collectJournalRows('#je-debits-body');
      const credits = collectJournalRows('#je-credits-body');
      if (!debits.length || !credits.length) {
        toast('warn', 'Required', 'At least one debit and one credit row are required'); return;
      }
      const sumD = debits.reduce((s, r) => s + r.amount, 0);
      const sumC = credits.reduce((s, r) => s + r.amount, 0);
      if (Math.abs(sumD - sumC) > 0.001) {
        toast('warn', 'Unbalanced', `Debits (${sumD}) ≠ Credits (${sumC})`); return;
      }
      const payload = {
        dateFormat: DATE_FORMAT, locale: LOCALE,
        officeId: parseInt(f.officeId),
        currencyCode: f.currencyCode,
        transactionDate: f.transactionDate,
        credits, debits
      };
      if (f.reference) payload.referenceNumber = f.reference;
      if (f.comments) payload.comments = f.comments;
      if (f.paymentTypeId) payload.paymentTypeId = parseInt(f.paymentTypeId);

      setSubmitting(btn, true);
      try {
        await api.journalEntries.create(payload);
        toast('success', 'Journal entry posted', '');
        closeModal('journalEntryModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Post failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
