/* FinCraft · pages/deposits/detail/closure.js — premature closure calculator tab loader.
   Auto-split from the original monolithic pages/deposits/detail.js for maintainability. */

import { api } from '../../../api.js';
import { today } from '../../../config.js';
import { escapeHtml, fmt, num } from '../../../utils.js';
import { openPrematureCloseModal } from '../actions.js';
import { can } from '../shared.js';

export async function loadClosureCalculator(c, apiGroup, id, d) {
  const wrap = c.querySelector('#dep-calc-wrap');
  wrap.innerHTML = `
    <h3>Premature Closure Calculator</h3>
    <div class="text-muted small mb-2">
      Calculate the interest payable + maturity amount as if the account were closed on the selected date,
      applying the product's pre-closure penalty interest rate.
    </div>
    <div class="filter-bar mb-3">
      <label>Closure date
        <input type="date" id="calc-date" class="form-control" value="${today()}"/>
      </label>
      <button class="btn-primary" id="calc-run"><i class="fa-solid fa-calculator"></i> Calculate</button>
    </div>
    <div id="calc-result"></div>`;

  const apiObj = api[apiGroup];

  wrap.querySelector('#calc-run').addEventListener('click', async () => {
    const calcDate = wrap.querySelector('#calc-date').value;
    const result = wrap.querySelector('#calc-result');
    result.innerHTML = '<div class="empty-state-row">Calculating…</div>';
    try {
      const tpl = await apiObj.prematureTemplate(id);
      // Fineract returns a "preMatureClosureTemplate" embedded in the response with computed amounts
      const closure = tpl.preMatureClosureTemplate || tpl;
      const maturityAmount = closure.maturityAmount ?? closure.totalPayable ?? 0;
      const interestRate   = closure.preClosurePenalApplicable
        ? (closure.adjustedInterestRate || closure.preClosurePenalInterest)
        : (d.nominalAnnualInterestRate || 0);
      const interestEarned = closure.interestPayable ?? closure.interestEarned ?? 0;

      result.innerHTML = `
        <div class="card-inset">
          <h4>Calculation Result — as of ${escapeHtml(calcDate)}</h4>
          <dl class="dl-grid">
            <dt>Effective interest rate</dt><dd>${num(interestRate)}%</dd>
            <dt>Interest payable</dt><dd class="text-right">${fmt(interestEarned)}</dd>
            <dt>Penalty applicable</dt><dd>${closure.preClosurePenalApplicable ? '<span class="badge b-warning">Yes</span>' : '<span class="badge b-success">No</span>'}</dd>
            <dt>Maturity amount on closure</dt><dd class="text-right"><b>${fmt(maturityAmount)}</b></dd>
            <dt>Original maturity amount</dt><dd class="text-right">${fmt(d.maturityAmount || 0)}</dd>
            <dt>Difference</dt><dd class="text-right"><b>${fmt((d.maturityAmount || 0) - maturityAmount)}</b></dd>
          </dl>
          ${can('PREMATURECLOSE_' + (apiGroup === 'fixedDeposits' ? 'FIXEDDEPOSITACCOUNT' : 'RECURRINGDEPOSITACCOUNT')) ? `
            <button class="btn-danger mt-3" id="calc-do-close">
              <i class="fa-solid fa-clock"></i> Close Account on ${escapeHtml(calcDate)}
            </button>
          ` : ''}
        </div>`;

      result.querySelector('#calc-do-close')?.addEventListener('click', () =>
        openPrematureCloseModal(apiObj, id, apiGroup === 'fixedDeposits' ? 'Fixed Deposit' : 'Recurring Deposit', calcDate));

    } catch (e) {
      result.innerHTML = `<div class="text-error">${escapeHtml(e.detail?.defaultUserMessage || e.message)}</div>
        <div class="text-muted small mt-2">If the calculator endpoint isn't enabled on your tenant, you can still close the account via the toolbar.</div>`;
    }
  });
}
