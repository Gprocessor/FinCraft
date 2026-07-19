/* FinCraft · remit.js — Remittance stepper (4 steps)
   Wires up to Fineract /accounttransfers endpoint with full client search,
   destination resolution, and remittance-specific metadata.
   The remittanceModal stepper UI lives in views/modals/integrations.html. */

import { toast, closeModal, openModal } from './ui.js';
import { api } from './api.js';
import { LOCALE, DATE_FORMAT, today } from './config.js';
import { escapeHtml, fmt } from './utils.js';
import { extractFineractError } from './ui/dom-helpers.js';

export const Remit = {
  step: 1,
  data: {
    sender:      { clientId: null, clientName: '', accountId: null, accountType: 2, officeId: null, officeName: '' },
    beneficiary: { clientId: null, clientName: '', accountId: null, accountType: 2, officeId: null, officeName: '', country: '', address: '' },
    transfer:    { amount: 0, sourceCurrency: 'USD', destCurrency: 'USD', purpose: '', date: '', description: '' }
  },

  // ──────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────
  reset() {
    this.step = 1;
    this.data = {
      sender:      { clientId: null, clientName: '', accountId: null, accountType: 2, officeId: null, officeName: '' },
      beneficiary: { clientId: null, clientName: '', accountId: null, accountType: 2, officeId: null, officeName: '', country: '', address: '' },
      transfer:    { amount: 0, sourceCurrency: 'USD', destCurrency: 'USD', purpose: '', date: today(), description: '' }
    };
    this._render();
  },

  next() {
    if (!this._validateCurrentStep()) return;
    if (this.step < 4) {
      this._capturePane(this.step);
      this.step++;
      this._render();
    } else {
      this.submit();
    }
  },

  back() {
    if (this.step > 1) {
      this._capturePane(this.step);
      this.step--;
      this._render();
    }
  },

  // ──────────────────────────────────────────────────────
  // Submit — POST to Fineract /accounttransfers
  // ──────────────────────────────────────────────────────
  async submit() {
    const root = document.getElementById('remittanceModal');
    const btn = root?.querySelector('[data-action="remit-next"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      const { sender, beneficiary, transfer } = this.data;
      const payload = {
        fromOfficeId:        sender.officeId,
        fromClientId:        sender.clientId,
        fromAccountId:       sender.accountId,
        fromAccountType:     sender.accountType || 2,
        toOfficeId:          beneficiary.officeId,
        toClientId:          beneficiary.clientId,
        toAccountId:         beneficiary.accountId,
        toAccountType:       beneficiary.accountType || 2,
        transferAmount:      parseFloat(transfer.amount) || 0,
        transferDate:        transfer.date || today(),
        transferDescription: transfer.description || `Remittance${transfer.purpose ? ' — ' + transfer.purpose : ''}`,
        dateFormat:          DATE_FORMAT,
        locale:              LOCALE
      };

      // Defensive: ensure all required fields are present
      const missing = ['fromClientId', 'fromAccountId', 'toClientId', 'toAccountId', 'transferAmount']
        .filter(k => !payload[k]);
      if (missing.length) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
      }

      const res = await api.transfers.create(payload);
      const ref = res?.resourceId ? `TXN-${res.resourceId}` : `REM-${Date.now()}`;

      toast('success', 'Remittance submitted', `Reference: ${ref}`);
      closeModal('remittanceModal');
      this.reset();
      document.dispatchEvent(new CustomEvent('fc:reload'));
    } catch (e) {
      const msg = extractFineractError(e);
      toast('error', 'Remittance failed', msg);
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  },

  // ──────────────────────────────────────────────────────
  // Open modal (called by command palette or button)
  // ──────────────────────────────────────────────────────
  open() {
    this.reset();
    openModal('remittanceModal');
    setTimeout(() => this._wirePanes(), 100);
  },

  // ──────────────────────────────────────────────────────
  // Per-step validation
  // ──────────────────────────────────────────────────────
  _validateCurrentStep() {
    const { sender, beneficiary, transfer } = this.data;
    if (this.step === 1) {
      if (!sender.clientId || !sender.accountId) {
        toast('warn', 'Sender required', 'Pick a sender client and savings account');
        return false;
      }
    }
    if (this.step === 2) {
      if (!beneficiary.clientId || !beneficiary.accountId) {
        toast('warn', 'Beneficiary required', 'Pick a beneficiary client and savings account');
        return false;
      }
    }
    if (this.step === 3) {
      if (!transfer.amount || transfer.amount <= 0) {
        toast('warn', 'Amount required', 'Enter an amount greater than 0');
        return false;
      }
      if (!transfer.date) {
        toast('warn', 'Date required', 'Select a transfer date');
        return false;
      }
    }
    return true;
  },

  // ──────────────────────────────────────────────────────
  // Capture form values from the active pane
  // ──────────────────────────────────────────────────────
  _capturePane(stepNo) {
    const root = document.getElementById('remittanceModal');
    if (!root) return;
    const pane = root.querySelector(`[data-remit-pane="${stepNo}"]`);
    if (!pane) return;

    if (stepNo === 1) {
      // Sender values are captured as user picks a client (live in this.data already)
    }
    if (stepNo === 2) {
      this.data.beneficiary.country = pane.querySelector('select.beneficiary-country')?.value || '';
      this.data.beneficiary.address = pane.querySelector('input.beneficiary-address')?.value?.trim() || '';
    }
    if (stepNo === 3) {
      this.data.transfer.amount         = parseFloat(pane.querySelector('input.transfer-amount')?.value) || 0;
      this.data.transfer.sourceCurrency = pane.querySelector('select.transfer-source-currency')?.value || 'USD';
      this.data.transfer.destCurrency   = pane.querySelector('select.transfer-dest-currency')?.value || 'USD';
      this.data.transfer.purpose        = pane.querySelector('select.transfer-purpose')?.value || '';
      this.data.transfer.date           = pane.querySelector('input.transfer-date')?.value || today();
      this.data.transfer.description    = pane.querySelector('input.transfer-description')?.value?.trim() || '';
    }
  },

  // ──────────────────────────────────────────────────────
  // Wire client-search inputs and account dropdowns
  // ──────────────────────────────────────────────────────
  _wirePanes() {
    const root = document.getElementById('remittanceModal');
    if (!root) return;

    // Sender + Beneficiary share the same wiring pattern
    [
      { role: 'sender',      pane: 1 },
      { role: 'beneficiary', pane: 2 }
    ].forEach(({ role, pane }) => {
      const paneEl = root.querySelector(`[data-remit-pane="${pane}"]`);
      if (!paneEl) return;
      const searchInput = paneEl.querySelector('input.client-search');
      const results     = paneEl.querySelector('div.client-results');
      const accountSel  = paneEl.querySelector('select.account-select');
      if (!searchInput || !results || !accountSel) return;

      let timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        const q = searchInput.value.trim();
        if (q.length < 2) { results.style.display = 'none'; return; }
        timer = setTimeout(async () => {
          try {
            const list = await api.clients.list({ displayName: q, limit: 8 });
            const items = Array.isArray(list) ? list : (list?.pageItems || []);
            if (!items.length) { results.style.display = 'none'; return; }
            results.innerHTML = items.map(cl => `
              <div class="search-result-item" data-pick='${JSON.stringify({ id: cl.id, name: cl.displayName, officeId: cl.officeId, officeName: cl.officeName })}'>
                <b>${escapeHtml(cl.displayName)}</b>
                <span class="text-muted" style="font-size:12px"> · ${escapeHtml(cl.accountNo || '')}</span>
              </div>`).join('');
            results.style.display = '';
            results.querySelectorAll('[data-pick]').forEach(item => {
              item.addEventListener('click', async () => {
                const picked = JSON.parse(item.dataset.pick);
                this.data[role].clientId   = picked.id;
                this.data[role].clientName = picked.name;
                this.data[role].officeId   = picked.officeId;
                this.data[role].officeName = picked.officeName;
                searchInput.value = picked.name;
                results.style.display = 'none';

                // Load the client's savings accounts (transfers are typically savings → savings)
                try {
                  const acc = await api.clients.accounts(picked.id);
                  const savings = (acc?.savingsAccounts || []).filter(s => s.status?.value === 'Active');
                  if (!savings.length) {
                    accountSel.innerHTML = '<option value="">No active savings accounts</option>';
                    toast('warn', 'No savings', `${picked.name} has no active savings account`);
                  } else {
                    accountSel.innerHTML = '<option value="">Select savings account…</option>' +
                      savings.map(s => `<option value="${s.id}" data-type="2">${escapeHtml(s.accountNo)} · ${escapeHtml(s.productName || '')}</option>`).join('');
                  }
                } catch (e) {
                  accountSel.innerHTML = '<option value="">Failed to load accounts</option>';
                  toast('error', 'Account fetch failed', extractFineractError(e));
                }
              });
            });
          } catch (e) {
            results.style.display = 'none';
            toast('error', 'Search failed', extractFineractError(e));
          }
        }, 300);
      });

      accountSel.addEventListener('change', () => {
        const opt = accountSel.selectedOptions[0];
        this.data[role].accountId   = opt ? parseInt(opt.value) : null;
        this.data[role].accountType = opt?.dataset?.type ? parseInt(opt.dataset.type) : 2;
      });

      // Click-away closes search results
      document.addEventListener('click', e => {
        if (!searchInput.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
      });
    });

    // Step 3 — set today's date as default
    const dateInput = root.querySelector('[data-remit-pane="3"] input.transfer-date');
    if (dateInput && !dateInput.value) dateInput.value = today();
  },

  // ──────────────────────────────────────────────────────
  // Render — switch panes and update step indicators
  // ──────────────────────────────────────────────────────
  _render() {
    const root = document.getElementById('remittanceModal');
    if (!root) return;

    // Step circles + lines
    root.querySelectorAll('.step-item').forEach((s, i) => {
      const stepNo = i + 1;
      const circle = s.querySelector('.step-circle');
      const label  = s.querySelector('.step-label');
      if (circle) {
        circle.classList.toggle('active', stepNo === this.step);
        circle.classList.toggle('done',   stepNo <  this.step);
      }
      if (label) {
        label.classList.toggle('active', stepNo === this.step);
        label.classList.toggle('done',   stepNo <  this.step);
      }
    });
    root.querySelectorAll('.step-line').forEach((l, i) => {
      l.classList.toggle('done', (i + 1) < this.step);
    });

    // Panes
    root.querySelectorAll('[data-remit-pane]').forEach(p => {
      p.style.display = (+p.dataset.remitPane === this.step ? 'block' : 'none');
    });

    // Buttons
    const nextBtn = root.querySelector('[data-action="remit-next"]');
    const backBtn = root.querySelector('[data-action="remit-back"]');
    if (nextBtn) {
      nextBtn.innerHTML = this.step === 4
        ? '<i class="fa-solid fa-paper-plane"></i> Confirm & Send'
        : '<i class="fa-solid fa-arrow-right"></i> Continue';
    }
    if (backBtn) backBtn.style.display = this.step > 1 ? '' : 'none';

    // Step 4 — render review summary
    if (this.step === 4) this._renderReview();
  },

  // ──────────────────────────────────────────────────────
  // Final review pane
  // ──────────────────────────────────────────────────────
  _renderReview() {
    const root = document.getElementById('remittanceModal');
    if (!root) return;
    const pane = root.querySelector('[data-remit-pane="4"]');
    if (!pane) return;
    const { sender, beneficiary, transfer } = this.data;

    pane.innerHTML = `
      <div class="card" style="background:var(--bg-card-alt)">
        <div class="card-body">
          <h4 class="mb-3"><i class="fa-solid fa-paper-plane text-teal" style="margin-right:6px"></i>Review Remittance</h4>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">Sender</div><div class="info-value">${escapeHtml(sender.clientName || '—')}</div></div>
            <div class="info-item"><div class="info-label">From Account</div><div class="info-value mono">${escapeHtml(String(sender.accountId || '—'))}</div></div>
            <div class="info-item"><div class="info-label">Sender Office</div><div class="info-value">${escapeHtml(sender.officeName || '—')}</div></div>
            <div class="info-item"><div class="info-label">Beneficiary</div><div class="info-value">${escapeHtml(beneficiary.clientName || '—')}</div></div>
            <div class="info-item"><div class="info-label">To Account</div><div class="info-value mono">${escapeHtml(String(beneficiary.accountId || '—'))}</div></div>
            <div class="info-item"><div class="info-label">Country</div><div class="info-value">${escapeHtml(beneficiary.country || '—')}</div></div>
            <div class="info-item"><div class="info-label">Amount</div><div class="info-value mono text-teal">${fmt(transfer.amount, transfer.sourceCurrency)}</div></div>
            <div class="info-item"><div class="info-label">Currency</div><div class="info-value">${escapeHtml(transfer.sourceCurrency)} → ${escapeHtml(transfer.destCurrency)}</div></div>
            <div class="info-item"><div class="info-label">Purpose</div><div class="info-value">${escapeHtml(transfer.purpose || '—')}</div></div>
            <div class="info-item"><div class="info-label">Date</div><div class="info-value">${escapeHtml(transfer.date)}</div></div>
            ${transfer.description ? `<div class="info-item" style="grid-column:1/-1"><div class="info-label">Description</div><div class="info-value">${escapeHtml(transfer.description)}</div></div>` : ''}
          </div>
          <div class="msg-banner b-info mt-3">
            <i class="fa-solid fa-circle-info"></i>
            This will create an account-to-account transfer in Fineract. Both accounts must be active savings accounts.
          </div>
        </div>
      </div>`;
  }
};

// Auto-wire when modals are loaded
document.addEventListener('fc:modals-loaded', () => {
  // The modal HTML in views/modals/integrations.html uses [data-remit-pane] and the buttons fire
  // remit-next / remit-back via data-action — already handled in ui.js handleAction.
});