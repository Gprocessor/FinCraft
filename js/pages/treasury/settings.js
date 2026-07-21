/* FinCraft · pages/treasury/settings.js — the Treasury Settings view.
   Reads/writes one office's dt_treasury_thresholds row via js/treasury/thresholds.js. Every other
   treasury screen (Dashboard, Teller Console, Vault Control, Loan Disbursement, Expenses,
   Borrowings, Reconciliation) depends on this being configured first — see
   FINCRAFT_Fineract_Treasury_Integration_Log.md §17, which is why this was built before any of
   them despite being listed last in the brief's own Phase 11 checklist.

   Follows the exact structure of js/pages/misc/settings.js (plain innerHTML template,
   querySelector + addEventListener, `toast()` for feedback, `escapeHtml()` for any user-supplied
   text) — no new UI pattern introduced. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { getThresholds, upsertThresholds } from '../../treasury/thresholds.js';

const GL_FIELDS = [
  { key: 'vaultGlAccountId',                label: 'Vault GL Account',                required: true },
  { key: 'cashAtTellersGlAccountId',        label: 'Cash At Tellers GL Account',      required: true },
  { key: 'bankGlAccountId',                 label: 'Bank GL Account',                 required: true },
  { key: 'borrowingsLiabilityGlAccountId',  label: 'Borrowings Liability GL Account', required: false },
  { key: 'interestPayableGlAccountId',      label: 'Interest Payable GL Account',     required: false },
  { key: 'interestExpenseGlAccountId',      label: 'Interest Expense GL Account',     required: false },
  { key: 'shortageGlAccountId',             label: 'Cash Shortage GL Account',        required: false },
  { key: 'overageGlAccountId',              label: 'Cash Overage GL Account',         required: false }
];

function glOptionsHtml(glAccounts, selectedId) {
  const opts = ['<option value="">— none —</option>'];
  for (const g of glAccounts) {
    const sel = Number(selectedId) === g.id ? 'selected' : '';
    opts.push(`<option value="${g.id}" ${sel}>${escapeHtml(g.glCode || '')} — ${escapeHtml(g.name || '')}</option>`);
  }
  return opts.join('');
}

function officeOptionsHtml(offices, selectedId) {
  return offices.map(o => `<option value="${o.id}" ${Number(selectedId) === o.id ? 'selected' : ''}>${escapeHtml(o.name || '')}</option>`).join('');
}

async function loadFormForOffice(c, officeId, glAccounts) {
  const t = await getThresholds(officeId).catch(err => { toast('error', 'Load failed', err?.message || String(err)); return null; });
  const body = c.querySelector('#trs-body');
  const configured = !!t;

  body.innerHTML = `
    ${configured ? '' : `
      <div class="msg-banner b-warn mb-3">
        <i class="fa-solid fa-triangle-exclamation"></i>
        This office has no treasury configuration yet. Fill in the fields below and save to create it —
        every other treasury screen (Dashboard, Vault Control, Teller Console, etc.) is unusable for this
        office until this is done.
      </div>`}
    <div class="form-grid">
      ${GL_FIELDS.map(f => `
        <label><span class="form-label">${f.label}${f.required ? ' *' : ''}</span>
          <select class="form-control" id="trs-${f.key}">${glOptionsHtml(glAccounts, t?.[f.key])}</select>
        </label>`).join('')}
      <label><span class="form-label">Reserve Buffer Amount *</span>
        <input class="form-control" id="trs-reserveBufferAmount" type="number" min="0" step="0.01" value="${t?.reserveBufferAmount ?? 0}"/>
      </label>
      <label><span class="form-label">Currency Code *</span>
        <input class="form-control" id="trs-currencyCode" maxlength="3" style="text-transform:uppercase" value="${escapeHtml(t?.currencyCode || 'USD')}"/>
      </label>
      <button class="btn-primary mt-2" id="trs-save">
        <i class="fa-solid fa-floppy-disk"></i> ${configured ? 'Save Changes' : 'Create Configuration'}
      </button>
    </div>`;

  c.querySelector('#trs-save').addEventListener('click', async () => {
    const btn = c.querySelector('#trs-save');
    const payload = { currencyCode: c.querySelector('#trs-currencyCode').value.trim().toUpperCase() };
    for (const f of GL_FIELDS) {
      const raw = c.querySelector(`#trs-${f.key}`).value;
      payload[f.key] = raw ? Number(raw) : null;
    }
    payload.reserveBufferAmount = Number(c.querySelector('#trs-reserveBufferAmount').value);

    const missing = GL_FIELDS.filter(f => f.required && !payload[f.key]).map(f => f.label);
    if (missing.length) { toast('warn', 'Required fields missing', missing.join(', ')); return; }
    if (!payload.currencyCode || payload.currencyCode.length !== 3) { toast('warn', 'Invalid currency', 'Currency code must be 3 letters (e.g. USD)'); return; }
    if (!(payload.reserveBufferAmount >= 0)) { toast('warn', 'Invalid buffer', 'Reserve buffer must be zero or a positive number'); return; }

    btn.disabled = true;
    try {
      await upsertThresholds(officeId, payload);
      toast('success', 'Saved', 'Treasury configuration updated for this office');
      await loadFormForOffice(c, officeId, glAccounts); // re-render to reflect the now-configured state
    } catch (err) {
      toast('error', 'Save failed', err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
}

export async function settings(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Treasury Settings</h1>
        <div class="page-subtitle">Per-office GL account mappings and reserve buffer for the treasury control layer</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Office</h3>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <label><span class="form-label">Office</span>
            <select class="form-control" id="trs-office"><option>Loading…</option></select>
          </label>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title">Configuration</h3></div>
      <div class="card-body" id="trs-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading…</div></div>
      </div>
    </div>`;

  let offices = [], glAccounts = [];
  try {
    [offices, glAccounts] = await Promise.all([
      api.offices.list().catch(() => []),
      api.glAccounts.list().catch(() => [])
    ]);
  } catch (err) {
    toast('error', 'Failed to load offices/GL accounts', err?.message || String(err));
  }
  offices = Array.isArray(offices) ? offices : [];
  glAccounts = Array.isArray(glAccounts) ? glAccounts : [];

  const officeSelect = c.querySelector('#trs-office');
  if (!offices.length) {
    officeSelect.innerHTML = '<option>No offices found</option>';
    c.querySelector('#trs-body').innerHTML = '<div class="empty-state">No offices available.</div>';
    return;
  }
  const defaultOfficeId = offices[0].id;
  officeSelect.innerHTML = officeOptionsHtml(offices, defaultOfficeId);
  await loadFormForOffice(c, defaultOfficeId, glAccounts);

  officeSelect.addEventListener('change', async () => {
    await loadFormForOffice(c, Number(officeSelect.value), glAccounts);
  });
}
