/* FinCraft · modal-init.js
   Runs after fc:modals-loaded.
   - Populates GL account selects in Journal Entry modal
   - Wires inline client search for loan/savings/fd/share modals
   - Wires add-row buttons for journal entry
   - Shows file name on bulk import select
*/
import { api } from './api.js';
import { escapeHtml } from './utils.js';

document.addEventListener('fc:modals-loaded', async () => {
  // ---- GL accounts for Journal Entry ----
  try {
    const gl = await api.glAccounts.list({ manualEntriesAllowed: true, usage: 'DETAIL' });
    const accounts = Array.isArray(gl) ? gl : [];
    const optHtml = '<option value="">Select GL account…</option>' +
      accounts.map(a => `<option value="${a.id}">${escapeHtml(a.glCode)} — ${escapeHtml(a.name)}</option>`).join('');

    document.querySelectorAll('[data-je-account]').forEach(sel => { sel.innerHTML = optHtml; });

    // Add-row buttons
    document.getElementById('add-debit-row')?.addEventListener('click', () => addJERow('je-debits-body', optHtml));
    document.getElementById('add-credit-row')?.addEventListener('click', () => addJERow('je-credits-body', optHtml));

    // When more rows are added dynamically, also populate them
    document.getElementById('journalEntryModal')?.addEventListener('je-row-added', () => {
      document.querySelectorAll('[data-je-account]').forEach(sel => {
        if (!sel.value && sel.options.length <= 1) sel.innerHTML = optHtml;
      });
    });
  } catch {}

  // Populate run-report modal name from trigger
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-report]');
    if (!b) return;
    const modal = document.getElementById('runReportModal');
    if (modal) {
      modal.dataset.report = b.dataset.report || '';
      const nameEl = document.getElementById('run-report-name');
      if (nameEl) nameEl.textContent = b.dataset.report || '—';
    }
  });

  // Share products — not covered by data-populate, load separately
  try {
    const sp = await api.shareProducts.list();
    const list = Array.isArray(sp) ? sp : [];
    const sel = document.getElementById('shareProductSel');
    if (sel && list.length) {
      sel.innerHTML = '<option value="">Select product…</option>' +
        list.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    }
  } catch {}

  // Bulk import — file name display
  document.getElementById('bulkImportFile')?.addEventListener('change', e => {
    const fn = document.getElementById('import-file-name');
    if (fn) fn.textContent = e.target.files[0]?.name || '';
  });

  // Inline client search for modals
  wireClientSearch('loanClientSearch', 'loanClientId', 'loanClientResults');
  wireClientSearch('savClientSearch',  'savClientId',  'savClientResults');
  wireClientSearch('fdClientSearch',   'fdClientId',   'fdClientResults');
  wireClientSearch('rdClientSearch',   'rdClientId',   'rdClientResults');
  wireClientSearch('shClientSearch',   'shClientId',   'shClientResults');

  // Loan product selection → pull the product's real config from /loans/template
  // so we submit the terms Fineract actually expects for that product
  // (amortization type, interest type, calc period, repayment strategy, frequency types)
  // instead of guessing fixed constants.
  const loanProductSel = document.querySelector('#newLoanModal [name="productId"]');
  const loanForm = document.getElementById('newLoanForm');
  if (loanProductSel && loanForm) {
    loanProductSel.addEventListener('change', async () => {
      delete loanForm.dataset.tpl;
      const productId = loanProductSel.value;
      if (!productId) return;
      try {
        const tpl = await api.loans.template({ productId, templateType: 'individual' });
        const cfg = {
          amortizationType:               tpl.amortizationType?.id,
          interestType:                   tpl.interestType?.id,
          interestCalculationPeriodType:  tpl.interestCalculationPeriodType?.id,
          interestRateFrequencyType:      tpl.interestRateFrequencyType?.id,
          repaymentFrequencyType:         tpl.repaymentFrequencyType?.id,
          transactionProcessingStrategyCode: tpl.transactionProcessingStrategyOptions?.[0]?.code,
          numberOfRepayments:             tpl.numberOfRepayments,
          principal:                      tpl.principal,
          interestRatePerPeriod:          tpl.interestRatePerPeriod
        };
        loanForm.dataset.tpl = JSON.stringify(cfg);
        // Pre-fill empty fields with the product's real defaults
        const principalInput = loanForm.querySelector('[name="principal"]');
        const termInput      = loanForm.querySelector('[name="term"]');
        const rateInput      = loanForm.querySelector('[name="interestRate"]');
        if (principalInput && !principalInput.value && cfg.principal) principalInput.value = cfg.principal;
        if (termInput && cfg.numberOfRepayments) termInput.value = cfg.numberOfRepayments;
        if (rateInput && cfg.interestRatePerPeriod != null) rateInput.value = cfg.interestRatePerPeriod;
      } catch { /* fall back to defaults at submit time */ }
    });
  }

  // New Charge modal — populate from the real /charges/template options
  const chargeAppliesTo = document.getElementById('charge-appliesto');
  if (chargeAppliesTo) {
    try {
      const tpl = await api.charges.template();
      const opt = (list, key='value') => (list || []).map(o => `<option value="${o.id}">${escapeHtml(o[key] || o.name)}</option>`).join('');
      chargeAppliesTo.innerHTML = opt(tpl.chargeAppliesToOptions);
      document.getElementById('charge-timetype').innerHTML = opt(tpl.chargeTimeTypeOptions);
      document.getElementById('charge-calctype').innerHTML = opt(tpl.chargeCalculationTypeOptions);
      document.getElementById('charge-currency').innerHTML = (tpl.currencyOptions || []).map(c => `<option value="${c.code}">${escapeHtml(c.name)} (${c.code})</option>`).join('');
    } catch (e) { console.warn('[charges/template]', e); }
  }

  // Savings deposit/withdrawal modal + Repayment modal — real payment types
  const svPayType = document.getElementById('sv-dep-paymenttype');
  const rpPayType = document.getElementById('rp-paymenttype');
  if (svPayType || rpPayType) {
    try {
      const types = await api.paymentTypes.list();
      const optHtml = '<option value="">— Default —</option>' +
        (Array.isArray(types) ? types : []).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
      if (svPayType) svPayType.innerHTML = optHtml;
      if (rpPayType) rpPayType.innerHTML = optHtml;
    } catch (e) { console.warn('[paymenttypes]', e); }
  }

  // New User modal — roles multi-select + password field toggle
  const rolesSel = document.getElementById('newuser-roles');
  if (rolesSel) {
    try {
      const roles = await api.roles.list();
      rolesSel.innerHTML = (Array.isArray(roles) ? roles : []).map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    } catch (e) { console.warn('[roles]', e); }
  }
  document.getElementById('nu-sendemail')?.addEventListener('change', (e) => {
    document.getElementById('nu-pw').disabled = e.target.checked;
    document.getElementById('nu-pw2').disabled = e.target.checked;
  });

  // Journal Entry currency — populate from the deployment's actually configured/selected
  // currencies, not a hardcoded guess (a real instance may not even have USD enabled)
  const jeCurrency = document.getElementById('je-currency-sel');
  if (jeCurrency) {
    try {
      const res = await api.currencies.list();
      const list = res?.selectedCurrencyOptions || (Array.isArray(res) ? res : []);
      jeCurrency.innerHTML = list.length
        ? list.map(cur => `<option value="${cur.code}">${cur.code} — ${escapeHtml(cur.name)}</option>`).join('')
        : '<option value="">No currencies configured</option>';
    } catch (e) { console.warn('[currencies]', e); jeCurrency.innerHTML = '<option value="">Failed to load</option>'; }
  }

  // Configuration Wizard — full currency list (pre-select the currently enabled ones) +
  // pre-check the deployment's actual current working days
  const cwCurrencies = document.getElementById('cw-currencies');
  if (cwCurrencies) {
    try {
      const res = await api.currencies.all();
      const all = res?.currencyOptions || [];
      const selectedCodes = new Set((res?.selectedCurrencyOptions || []).map(c => c.code));
      cwCurrencies.innerHTML = all.map(cur => `<option value="${cur.code}" ${selectedCodes.has(cur.code) ? 'selected' : ''}>${cur.code} — ${escapeHtml(cur.name)}</option>`).join('')
        || '<option value="">No currencies available</option>';
    } catch (e) { console.warn('[currencies/all]', e); cwCurrencies.innerHTML = '<option value="">Failed to load</option>'; }
    try {
      const wd = await api.workingDays.get();
      const recurrence = wd?.recurrence || '';
      document.querySelectorAll('#cw-days [data-cw-day]').forEach(cb => {
        const code = { Sun:'SU', Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA' }[cb.dataset.cwDay];
        if (recurrence.includes('BYDAY')) cb.checked = recurrence.includes(code);
      });
    } catch (e) { console.warn('[workingdays]', e); }
  }
});

function addJERow(tbodyId, optHtml) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="form-control" data-je-account>${optHtml}</select></td>
    <td><input type="number" min="0" step="0.01" class="form-control" data-je-amount/></td>
    <td><button type="button" class="btn-ghost btn-sm" onclick="this.closest('tr').remove()"><i class="fa-solid fa-trash"></i></button></td>`;
  tbody.appendChild(tr);
}

function wireClientSearch(inputId, hiddenId, resultsId) {
  const input   = document.getElementById(inputId);
  const hidden  = document.getElementById(hiddenId);
  const results = document.getElementById(resultsId);
  if (!input || !hidden || !results) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      try {
        const res = await api.clients.list({ displayName: q, limit: 8 });
        const list = Array.isArray(res) ? res : (res?.pageItems || []);
        if (!list.length) { results.style.display = 'none'; return; }
        results.innerHTML = list.map(cl => `
          <div class="search-result-item" data-id="${cl.id}" data-name="${escapeHtml(cl.displayName)}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-1)">
            <b>${escapeHtml(cl.displayName)}</b>
            <span class="text-muted" style="font-size:12px"> · ${escapeHtml(cl.accountNo || '')}</span>
          </div>`).join('');
        results.style.display = '';
        results.querySelectorAll('[data-id]').forEach(item => {
          item.addEventListener('click', () => {
            hidden.value = item.dataset.id;
            input.value  = item.dataset.name;
            results.style.display = 'none';
          });
        });
      } catch { results.style.display = 'none'; }
    }, 350);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
  });
}
