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

// Fineract's top-level `defaultUserMessage` is almost always the generic
// wrapper text ("Validation errors exist."). The actionable, field-specific
// messages live in the `errors[]` array — one entry per failed parameter.
// Previously we only read errors[0], and fell straight back to the generic
// wrapper whenever errors[] was empty/missing (business-rule exceptions,
// e.g. GeneralPlatformDomainRuleException, populate no errors[] at all —
// only a top-level defaultUserMessage, which in that case IS the real
// message and should be shown as-is rather than treated as "generic").
export function extractFineractError(e) {
  if (!e) return 'Unknown error';
  const d = e.detail;

  if (d && typeof d === 'object') {
    const list = Array.isArray(d.errors) ? d.errors.filter(Boolean) : [];
    if (list.length) {
      const lines = list.map(err => {
        const msg = err.defaultUserMessage || err.developerMessage || '';
        const param = err.parameterName;
        // Skip the parameter prefix when it's not meaningful (missing, or
        // already restates itself, e.g. parameterName === "id").
        return (param && msg && !msg.toLowerCase().startsWith(param.toLowerCase()))
          ? `${param}: ${msg}`
          : (msg || param || '');
      }).filter(Boolean);
      // De-dupe identical lines (Fineract sometimes repeats the same
      // message once per locale/dateFormat companion parameter).
      const unique = [...new Set(lines)];
      if (unique.length) return unique.join('\n');
    }
    // No usable errors[] — fall back to whatever top-level message we have.
    // This is the real, specific message for business-rule violations
    // (e.g. "Debit and credit account cannot be the same GL account.").
    if (d.defaultUserMessage) return d.defaultUserMessage;
    if (d.developerMessage) return d.developerMessage;
  }
  if (typeof d === 'string' && d.trim()) return d;
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

