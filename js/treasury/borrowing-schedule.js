/* FinCraft · treasury/borrowing-schedule.js — Phase 8: schedule generation math.
   Deliberately has ZERO imports of api.js / any Fineract or datatable call — this is pure
   arithmetic, kept isolated so it's trivially unit-testable (plain numbers in, plain numbers
   out) and so ./borrowings.js (the orchestration layer that actually persists/posts) stays thin.

   Known simplification: only MONTHLY repaymentFrequency is implemented (the brief's
   `repaymentFrequency` field is stored either way for future extension, but schedule generation
   assumes monthly installments over `tenorMonths`). Month-add uses JS Date's native day-overflow
   behavior (e.g. 31 Jan + 1 month lands in early March, not 28/29 Feb) — a known, documented
   limitation, not a silent bug; a real deployment with month-end-sensitive schedules would need a
   proper business-day/EOM-aware date library, which is out of scope for this phase. */

function addMonthsIso(dateIso, n) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/**
 * @param {object} params
 * @param {number} params.principalAmount
 * @param {number} params.interestRate        annual percentage, e.g. 12 for 12%
 * @param {'FLAT'|'REDUCING_BALANCE'} params.interestMethod
 * @param {string} params.startDate            'YYYY-MM-DD' — first installment is one month after this
 * @param {number} params.tenorMonths          integer >= 1
 * @returns {{installmentNo:number, dueDate:string, principalDue:number, interestDue:number}[]}
 */
export function generateBorrowingSchedule({ principalAmount, interestRate, interestMethod, startDate, tenorMonths }) {
  if (!(principalAmount > 0)) throw new Error('generateBorrowingSchedule: principalAmount must be positive');
  if (!(tenorMonths >= 1) || !Number.isInteger(tenorMonths)) throw new Error('generateBorrowingSchedule: tenorMonths must be a positive integer');
  if (interestRate < 0) throw new Error('generateBorrowingSchedule: interestRate cannot be negative');
  if (interestMethod !== 'FLAT' && interestMethod !== 'REDUCING_BALANCE') {
    throw new Error(`generateBorrowingSchedule: interestMethod must be FLAT or REDUCING_BALANCE, got "${interestMethod}"`);
  }

  return interestMethod === 'FLAT'
    ? generateFlatSchedule({ principalAmount, interestRate, startDate, tenorMonths })
    : generateReducingBalanceSchedule({ principalAmount, interestRate, startDate, tenorMonths });
}

/** Flat: total interest = principal × annualRate × (tenorMonths/12), spread evenly; principal
 *  also spread evenly. The final installment absorbs whatever rounding remainder is left over, so
 *  Σ(principalDue) === principalAmount exactly (to the cent) and Σ(interestDue) === totalInterest
 *  exactly, rather than drifting by a few cents over a long schedule. */
function generateFlatSchedule({ principalAmount, interestRate, startDate, tenorMonths }) {
  const totalInterest = round2(principalAmount * (interestRate / 100) * (tenorMonths / 12));
  const basePrincipal = round2(principalAmount / tenorMonths);
  const baseInterest = round2(totalInterest / tenorMonths);

  const rows = [];
  let principalRunning = 0, interestRunning = 0;
  for (let i = 1; i <= tenorMonths; i++) {
    const isLast = i === tenorMonths;
    const principalDue = isLast ? round2(principalAmount - principalRunning) : basePrincipal;
    const interestDue = isLast ? round2(totalInterest - interestRunning) : baseInterest;
    principalRunning = round2(principalRunning + principalDue);
    interestRunning = round2(interestRunning + interestDue);
    rows.push({ installmentNo: i, dueDate: addMonthsIso(startDate, i), principalDue, interestDue });
  }
  return rows;
}

/** Reducing balance: standard level-payment (annuity) amortization. Monthly installment amount is
 *  computed once via the annuity formula, then split into interest (on the current outstanding
 *  balance) and principal (the remainder) each period — the classic shape where interest starts
 *  high and falls as principal is paid down. The final installment is forced to exactly clear the
 *  remaining outstanding balance, absorbing rounding, so Σ(principalDue) === principalAmount. */
function generateReducingBalanceSchedule({ principalAmount, interestRate, startDate, tenorMonths }) {
  const monthlyRate = interestRate / 100 / 12;
  const rows = [];
  let outstanding = principalAmount;

  if (monthlyRate === 0) {
    // Zero-interest edge case: annuity formula divides by zero, so fall back to equal principal,
    // zero interest per installment.
    const basePrincipal = round2(principalAmount / tenorMonths);
    let principalRunning = 0;
    for (let i = 1; i <= tenorMonths; i++) {
      const isLast = i === tenorMonths;
      const principalDue = isLast ? round2(principalAmount - principalRunning) : basePrincipal;
      principalRunning = round2(principalRunning + principalDue);
      rows.push({ installmentNo: i, dueDate: addMonthsIso(startDate, i), principalDue, interestDue: 0 });
    }
    return rows;
  }

  const levelPayment = (principalAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -tenorMonths));
  for (let i = 1; i <= tenorMonths; i++) {
    const isLast = i === tenorMonths;
    const interestDue = round2(outstanding * monthlyRate);
    const principalDue = isLast ? round2(outstanding) : round2(levelPayment - interestDue);
    outstanding = round2(outstanding - principalDue);
    rows.push({ installmentNo: i, dueDate: addMonthsIso(startDate, i), principalDue, interestDue });
  }
  return rows;
}
