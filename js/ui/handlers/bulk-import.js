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
      const officeSel = modal?.querySelector('[name="officeId"]');
      const fileEl = document.getElementById('bulkImportFile');
      const file = fileEl?.files?.[0];
      if (!entitySel?.value) { toast('warn', 'Required', 'Select an entity type'); return; }
      if (!file) { toast('warn', 'Required', 'Choose a file to upload'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('locale', LOCALE);
      fd.append('dateFormat', DATE_FORMAT);
      // FIX: this select is populated via data-populate="offices" and was already sitting in
      // the modal, but previously had no `name` attribute so this handler had no way to read
      // it — the office filter appeared functional in the UI but was silently never sent.
      if (officeSel?.value) fd.append('officeId', officeSel.value);

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

    'download-import-template': async (btn) => {
      const modal = document.getElementById('bulkImportModal');
      const entitySel = modal?.querySelector('[name="entity"]');
      const officeSel = modal?.querySelector('[name="officeId"]');
      if (!entitySel?.value) { toast('warn', 'Required', 'Select an entity type first'); return; }

      setSubmitting(btn, true);
      try {
        const res = await api.bulkImports.template(entitySel.value, officeSel?.value ? { officeId: officeSel.value } : undefined);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        // entity values with a nested path (e.g. 'loans/repayments') need slashes stripped
        // out of the filename — they're a URL path segment, not part of the file name.
        a.download = entitySel.value.replace(/\//g, '-') + '-template.xlsx';
        a.click();
        toast('success', 'Template downloaded', entitySel.options[entitySel.selectedIndex]?.text || entitySel.value);
      } catch (e) {
        toast('error', 'Download failed', extractFineractError(e));
      } finally { setSubmitting(btn, false); }
    },
};
