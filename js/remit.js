/* FinCraft · remit.js — Remittance stepper */
import { toast, closeModal } from './ui.js';
import { api } from './api.js';
import { LOCALE, DATE_FORMAT } from './config.js';
export const Remit = {
  step: 1, data: { sender: {}, beneficiary: {}, transfer: {} },
  reset() { this.step = 1; this.data = { sender: {}, beneficiary: {}, transfer: {} }; this._render(); },
  next() { if (this.step < 4) { this.step++; this._render(); } else this.submit(); },
  back() { if (this.step > 1) { this.step--; this._render(); } },
  async submit() {
    const root = document.getElementById('remittanceModal');
    const btn = root?.querySelector('[data-remit-next]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const { sender, beneficiary, transfer } = this.data;
      // Map stepper fields to Fineract /accounttransfers payload
      const payload = {
        fromAccountId:   sender.accountId   || undefined,
        fromAccountType: sender.accountType  || 2,   // 2 = savings
        toAccountId:     beneficiary.accountId   || undefined,
        toAccountType:   beneficiary.accountType  || 2,
        transferAmount:  parseFloat(transfer.amount) || 0,
        transferDate:    transfer.date || new Date().toISOString().slice(0, 10),
        transferDescription: transfer.description || 'Remittance transfer',
        fromClientId:    sender.clientId     || undefined,
        toClientId:      beneficiary.clientId || undefined,
        fromOfficeId:    sender.officeId     || undefined,
        toOfficeId:      beneficiary.officeId || undefined,
        locale:          LOCALE,
        dateFormat:      DATE_FORMAT
      };
      const res = await api.transfers.create(payload);
      const ref = res?.resourceId ? `TXN-${res.resourceId}` : `REM-${Date.now()}`;
      toast('success', 'Remittance submitted', `Reference: ${ref}`);
      closeModal('remittanceModal');
      this.reset();
    } catch (e) {
      toast('error', 'Remittance failed', e.message || String(e));
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  },
  _render() {
    const root = document.getElementById('remittanceModal');
    if (!root) return;
    root.querySelectorAll('.step').forEach((s, i) => {
      s.classList.toggle('active', i + 1 === this.step);
      s.classList.toggle('done', i + 1 < this.step);
    });
    root.querySelectorAll('[data-remit-pane]').forEach(p =>
      p.style.display = (+p.dataset.remitPane === this.step ? 'block' : 'none'));
    const nextBtn = root.querySelector('[data-remit-next]');
    if (nextBtn) nextBtn.textContent = this.step === 4 ? 'Confirm & Send' : 'Continue';
  }
};
