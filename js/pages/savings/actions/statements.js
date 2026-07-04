/* FinCraft · pages/savings/actions/statements.js — statement export.
   Auto-split from the original monolithic pages/savings/actions.js for maintainability. */

import { api } from '../../../api.js';
import { toast } from '../../../ui.js';

export async function exportStatement(s, id) {
  let txs = s.transactions || [];
  if (!txs.length) {
    try {
      const res = await api.savings.transactions(id);
      txs = Array.isArray(res) ? res : (res?.pageItems || []);
    } catch {}
  }
  if (!txs.length) { toast('warn', 'No transactions', 'Nothing to export'); return; }
  const rows = [['Date', 'Type', 'Amount', 'Running Balance', 'Receipt No']];
  txs.forEach(t => {
    const d = Array.isArray(t.date) ? t.date.join('-') : (t.date || '');
    rows.push([d, t.transactionType?.value || '', t.amount || 0, t.runningBalance || 0, t.paymentDetail?.receiptNumber || '']);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `savings_${s.accountNo || id}_statement.csv`;
  a.click();
  toast('success', 'Statement exported', `${txs.length} transactions`);
}
