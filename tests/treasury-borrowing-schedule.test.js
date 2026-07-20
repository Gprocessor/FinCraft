/* FinCraft · tests/treasury-borrowing-schedule.test.js
   Pure numeric tests for js/treasury/borrowing-schedule.js — no api.js stubbing needed, since
   this module makes zero Fineract/datatable calls by design (see its file header comment). */
import assert from 'assert';
import { generateBorrowingSchedule } from '../js/treasury/borrowing-schedule.js';

export async function runTests({ assert: a = assert } = {}) {
  /* 1. FLAT: Σ(principalDue) === principal exactly, Σ(interestDue) === principal×rate×(months/12)
        exactly, with no rounding drift regardless of how many installments there are. */
  {
    const rows = generateBorrowingSchedule({ principalAmount: 100000, interestRate: 12, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12 });
    a.strictEqual(rows.length, 12);
    const sumP = rows.reduce((s, r) => s + r.principalDue, 0);
    const sumI = rows.reduce((s, r) => s + r.interestDue, 0);
    a.ok(Math.abs(sumP - 100000) < 0.005, `FLAT principal must sum exactly to 100000, got ${sumP}`);
    a.ok(Math.abs(sumI - 12000) < 0.005, `FLAT interest must sum exactly to 12000 (100000*12%*1yr), got ${sumI}`);
    a.strictEqual(rows[0].dueDate, '2026-02-01', 'first installment is one month after startDate');
    a.strictEqual(rows[11].dueDate, '2027-01-01');
    // FLAT interest is level across installments (only the last one absorbs rounding).
    for (let i = 0; i < 10; i++) a.strictEqual(rows[i].interestDue, rows[0].interestDue, 'FLAT interest must be level except possibly the final installment');
  }

  /* 2. FLAT with a tenor that doesn't divide principal evenly — still sums exactly, and the
        rounding remainder lands only on the final installment. */
  {
    const rows = generateBorrowingSchedule({ principalAmount: 100000, interestRate: 10, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 7 });
    const sumP = rows.reduce((s, r) => s + r.principalDue, 0);
    a.ok(Math.abs(sumP - 100000) < 0.005);
    for (let i = 0; i < 5; i++) a.strictEqual(rows[i].principalDue, rows[0].principalDue);
  }

  /* 3. REDUCING_BALANCE: Σ(principalDue) === principal exactly; interest declines each period as
        the outstanding balance falls (classic amortization shape), and the outstanding balance
        implied by the schedule reaches exactly zero on the final installment. */
  {
    const rows = generateBorrowingSchedule({ principalAmount: 100000, interestRate: 12, interestMethod: 'REDUCING_BALANCE', startDate: '2026-01-01', tenorMonths: 12 });
    const sumP = rows.reduce((s, r) => s + r.principalDue, 0);
    a.ok(Math.abs(sumP - 100000) < 0.005, `REDUCING_BALANCE principal must sum exactly to 100000, got ${sumP}`);
    for (let i = 1; i < rows.length; i++) {
      a.ok(rows[i].interestDue <= rows[i - 1].interestDue, 'interest must be non-increasing period over period under reducing balance');
    }
    let outstanding = 100000;
    for (const r of rows) outstanding -= r.principalDue;
    a.ok(Math.abs(outstanding) < 0.01, `outstanding balance must reach ~0 after the final installment, got ${outstanding}`);
  }

  /* 4. REDUCING_BALANCE with 0% interest: degenerates to equal-principal, zero interest (the
        annuity formula's division-by-zero edge case, handled explicitly rather than crashing). */
  {
    const rows = generateBorrowingSchedule({ principalAmount: 1200, interestRate: 0, interestMethod: 'REDUCING_BALANCE', startDate: '2026-01-01', tenorMonths: 12 });
    a.ok(rows.every(r => r.interestDue === 0));
    a.strictEqual(rows.reduce((s, r) => s + r.principalDue, 0), 1200);
    a.strictEqual(rows[0].principalDue, 100);
  }

  /* 5. Input validation — must reject bad input rather than silently producing garbage. */
  {
    await a.rejects(async () => generateBorrowingSchedule({ principalAmount: 0, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12 }), /principalAmount must be positive/);
    await a.rejects(async () => generateBorrowingSchedule({ principalAmount: 1000, interestRate: 5, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 0 }), /tenorMonths must be a positive integer/);
    await a.rejects(async () => generateBorrowingSchedule({ principalAmount: 1000, interestRate: -1, interestMethod: 'FLAT', startDate: '2026-01-01', tenorMonths: 12 }), /interestRate cannot be negative/);
    await a.rejects(async () => generateBorrowingSchedule({ principalAmount: 1000, interestRate: 5, interestMethod: 'BOGUS', startDate: '2026-01-01', tenorMonths: 12 }), /interestMethod must be FLAT or REDUCING_BALANCE/);
  }
}
