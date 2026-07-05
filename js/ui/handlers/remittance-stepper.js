/* FinCraft · ui/handlers/remittance-stepper.js — REMITTANCE STEPPER form-submit handlers.
   Auto-split from ui.js's monolithic handleAction() switch for maintainability. */


export const RemittanceStepperHandlers = {
    'remit-next': async (btn) => {
      import('../../remit.js').then(m => m.Remit.next());
      return;
    },
    'remit-back': async (btn) => {
      import('../../remit.js').then(m => m.Remit.back());
      return;
    },
};
