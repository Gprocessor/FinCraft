/* FinCraft · ui/dom-helpers.js — form-reading and error-formatting helpers shared by handlers.
   Auto-split from the original monolithic ui.js for maintainability. */

// ════════════════════════════════════════════════════════════
export function formData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((v, k) => {
    // Multi-select: collect into array
    if (obj[k] !== undefined) {
      if (Array.isArray(obj[k])) obj[k].push(v);
      else obj[k] = [obj[k], v];
    } else {
      obj[k] = v;
    }
  });
  return obj;
}

export function setSubmitting(btn, loading = true) {
  if (!btn) return;
  btn._origHtml = btn._origHtml || btn.innerHTML;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing…'
    : btn._origHtml;
}

export function extractFineractError(e) {
  if (!e) return 'Unknown error';
  if (e.detail?.errors?.[0]?.defaultUserMessage) return e.detail.errors[0].defaultUserMessage;
  if (e.detail?.defaultUserMessage) return e.detail.defaultUserMessage;
  if (e.detail?.errors?.[0]?.developerMessage) return e.detail.errors[0].developerMessage;
  if (e.detail?.developerMessage) return e.detail.developerMessage;
  if (typeof e.detail === 'string') return e.detail;
  return e.message || 'API error';
}

export function collectJournalRows(selector) {
  const rows = [];
  document.querySelectorAll(`${selector} tr`).forEach(row => {
    const acct = row.querySelector('[data-je-account]')?.value;
    const amt  = parseFloat(row.querySelector('[data-je-amount]')?.value);
    if (acct && !isNaN(amt) && amt > 0) {
      rows.push({ glAccountId: parseInt(acct), amount: amt });
    }
  });
  return rows;
}

