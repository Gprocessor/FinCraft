/* FinCraft · remit.js — Remittance stepper */
import { toast, closeModal } from './ui.js';
export const Remit = {
  step: 1, data: { sender: {}, beneficiary: {}, transfer: {} },
  reset() { this.step = 1; this.data = { sender: {}, beneficiary: {}, transfer: {} }; this._render(); },
  next() { if (this.step < 4) { this.step++; this._render(); } else this.submit(); },
  back() { if (this.step > 1) { this.step--; this._render(); } },
  submit() {
    toast('success', 'Remittance sent', 'Reference: REM' + Date.now());
    closeModal('remittanceModal');
    this.reset();
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
