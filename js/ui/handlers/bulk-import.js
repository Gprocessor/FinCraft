/* FinCraft · ui/handlers/bulk-import.js — BULK IMPORT form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */

import { api } from '../../api.js';
import { closeModal, toast } from '../core.js';
import { extractFineractError, setSubmitting } from '../dom-helpers.js';
import { DATE_FORMAT, LOCALE } from '../../config.js';

export const BulkImportHandlers = {
    'submit-import': async (btn) => {
      const modal = document.getElementById('bulkImportModal');
      const entitySel = modal?.querySelector('[name="entity"]');
      const fileEl = document.getElementById('bulkImportFile');
      const file = fileEl?.files?.[0];
      if (!entitySel?.value) { toast('warn', 'Required', 'Select an entity type'); return; }
      if (!file) { toast('warn', 'Required', 'Choose a file to upload'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('locale', LOCALE);
      fd.append('dateFormat', DATE_FORMAT);

      setSubmitting(btn, true);
      try {
        await api.bulkImports.upload(entitySel.value, fd);
        toast('success', 'Import queued', file.name);
        closeModal('bulkImportModal');
        document.dispatchEvent(new CustomEvent('fc:reload'));
      } catch (e) {
        toast('error', 'Upload failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
      return;
    },
};
