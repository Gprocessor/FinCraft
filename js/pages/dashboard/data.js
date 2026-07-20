/* FinCraft · pages/dashboard/data.js — daily snapshot mechanism, report parsing/aggregation
   helpers, and sampled-balance/report loaders used by dashboard/index.js. Split out of the
   former single dashboard.js (see js/pages/dashboard.js barrel + FRONTEND.md). */
import { api } from '../../api.js';
import { SNAPSHOT_TABLE, toJsDate, isoDay } from './shared.js';

export async function getHeadOfficeId() {
  try {
    const offices = await api.offices.list();
    const list = Array.isArray(offices) ? offices : (offices?.pageItems || []);
    const root = list.find(o => !o.parentId) || list[0];
    return root?.id ?? 1;
  } catch { return 1; }
}

/** Registers the snapshot datatable if it doesn't already exist. Returns false (never
 *  throws) if the user lacks permission or the call fails for any other reason — callers
 *  treat that as "deltas unavailable this session", not an error. */
export async function ensureSnapshotTable() {
  try {
    const tables = await api.dataTables.list();
    const exists = Array.isArray(tables) && tables.some(t => t.registeredTableName === SNAPSHOT_TABLE);
    if (exists) return true;
    await api.dataTables.create({
      datatableName: SNAPSHOT_TABLE,
      apptableName: 'm_office',
      multiRow: true,
      columns: [
        { name: 'snapshot_date', type: 'Date', mandatory: true },
        { name: 'metrics_json', type: 'Text', length: 4000, mandatory: true }
      ]
    });
    return true;
  } catch { return false; }
}

export async function loadSnapshotHistory(officeId) {
  try {
    const rows = await api.dataTables.query(SNAPSHOT_TABLE, officeId);
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map(r => { try { return { id: r.id, date: r.snapshot_date, metrics: JSON.parse(r.metrics_json) }; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(toJsDate(a.date)) - new Date(toJsDate(b.date)));
  } catch { return []; }
}

/** Upserts today's row — updates it in place if the dashboard's already been loaded once
 *  today (so a 5pm refresh reflects the day's latest figures, not the 9am snapshot). */
export async function saveSnapshot(officeId, history, metrics) {
  const todayStr = isoDay(new Date());
  const body = { snapshot_date: todayStr, metrics_json: JSON.stringify(metrics), dateFormat: 'yyyy-MM-dd', locale: 'en' };
  try {
    const todayRow = history.find(h => isoDay(toJsDate(h.date) || new Date(0)) === todayStr);
    if (todayRow) await api.dataTables.updateEntryOneToMany(SNAPSHOT_TABLE, officeId, todayRow.id, body);
    else await api.dataTables.createEntry(SNAPSHOT_TABLE, officeId, body);
  } catch { /* non-fatal — deltas just won't have today's baseline for next time */ }
}

/** Most recent snapshot strictly before today. */
export function pickBaseline(history) {
  const todayStr = isoDay(new Date());
  const prior = history.filter(h => isoDay(toJsDate(h.date) || new Date(0)) < todayStr);
  return prior.length ? prior[prior.length - 1] : null;
}

/* ------------------------------------------------------------------- */
/* Report parsing — column-name matching, not fixed indices, because   */
/* Fineract's genericResultSet layout varies slightly by deployment.   */
/* ------------------------------------------------------------------- */

/** Parses a PortfolioAtRisk genericResultSet into:
 *    { totalOutstanding, atRiskOutstanding, parRatio, buckets: [{label, value}] }
 *  or null if the report didn't return a recognisable shape. */
export function analyzePAR(parData) {
  if (!parData?.data?.length || !parData?.columnHeaders?.length) return null;
  const cols = parData.columnHeaders.map(h => h.columnName || '');
  const totalIdx = cols.findIndex(c => /total.*(outstanding|portfolio)|outstanding.*total/i.test(c));
  if (totalIdx < 0) return null;

  const firstRow = parData.data[0]?.row || [];
  const labelIdx = firstRow.findIndex((v, i) => i !== totalIdx && isNaN(parseFloat(v)));

  const bucketIdxs = cols.map((_, i) => i).filter(i => i !== totalIdx && i !== labelIdx);
  if (!bucketIdxs.length) return null;

  let totalOutstanding = 0;
  const bucketSums = bucketIdxs.map(() => 0);
  for (const row of parData.data) {
    const cells = row.row || [];
    const t = parseFloat(cells[totalIdx]);
    if (!isNaN(t)) totalOutstanding += t;
    bucketIdxs.forEach((idx, bi) => {
      const v = parseFloat(cells[idx]);
      if (!isNaN(v)) bucketSums[bi] += v;
    });
  }
  const buckets = bucketIdxs.map((idx, bi) => ({ label: cols[idx], value: bucketSums[bi] }));
  const atRisk = buckets.filter(b => !/current|not\s*overdue/i.test(b.label));
  const atRiskOutstanding = atRisk.reduce((s, b) => s + b.value, 0);
  const parRatio = totalOutstanding > 0 ? (atRiskOutstanding / totalOutstanding) * 100 : null;

  return { totalOutstanding, atRiskOutstanding, parRatio, buckets };
}

/** If a genericResultSet has a per-office label column (many stock Fineract reports do
 *  when run without a specific R_officeId), groups a value column by that label. Returns
 *  null if there's no more than one distinct label — i.e. the report only gave one
 *  aggregate row, not a real office breakdown. `valueColRegex` picks which numeric column
 *  to sum; defaults to the same "total outstanding" pattern analyzePAR uses. */
export function parseOfficeBreakdown(reportData, valueColRegex = /total.*(outstanding|portfolio)|outstanding.*total/i) {
  if (!reportData?.data?.length || !reportData?.columnHeaders?.length) return null;
  const cols = reportData.columnHeaders.map(h => h.columnName || '');
  const valueIdx = cols.findIndex(c => valueColRegex.test(c));
  if (valueIdx < 0) return null;
  const firstRow = reportData.data[0]?.row || [];
  const labelIdx = firstRow.findIndex((v, i) => i !== valueIdx && isNaN(parseFloat(v)));
  if (labelIdx < 0) return null;

  const sums = new Map();
  for (const row of reportData.data) {
    const cells = row.row || [];
    const label = cells[labelIdx];
    const v = parseFloat(cells[valueIdx]);
    if (!label || isNaN(v)) continue;
    sums.set(label, (sums.get(label) || 0) + v);
  }
  if (sums.size <= 1) return null; // only one aggregate row — no real office dimension
  return [...sums.entries()].map(([label, value]) => ({ label, value }));
}

/** Buckets a TranDatewiseSummary genericResultSet into `months` trailing calendar months
 *  (oldest first), zero-filling months with no matching rows. Returns null only if the
 *  report shape wasn't recognisable at all. */
export function bucketMonthly(tranData, months = 6) {
  if (!tranData?.data?.length || !tranData?.columnHeaders?.length) return null;
  const cols = tranData.columnHeaders.map(h => h.columnName || '');
  const dateIdx = cols.findIndex(c => /date/i.test(c));
  const amountIdx = cols.findIndex(c => /amount|disburse|total/i.test(c));
  if (amountIdx < 0) return null;

  const sums = new Map();
  for (const row of tranData.data) {
    const cells = row.row || [];
    const amt = parseFloat(cells[amountIdx]);
    if (isNaN(amt)) continue;
    const d = new Date(cells[dateIdx >= 0 ? dateIdx : 0]);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    sums.set(key, (sums.get(key) || 0) + amt);
  }

  const now = new Date();
  const labels = [], values = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
    values.push(sums.get(key) || 0);
  }
  return { labels, values };
}

/** Groups an array by a key function into [{label, value}] sorted descending. */
export function groupBy(arr, keyFn) {
  const sums = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    sums.set(k, (sums.get(k) || 0) + 1);
  }
  return [...sums.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function summarizeStatusMix(loans) {
  const overdue = loans.filter(l => (l.summary?.totalOverdue || 0) > 0).length;
  const closed = loans.filter(l => l.status?.closed || /closed/i.test(l.status?.value || '')).length;
  const performing = Math.max(0, loans.length - overdue - closed);
  return { performing, overdue, closed };
}

/** Bounded-sample fallback for KPIs that ideally want a portfolio-wide sum but have no
 *  cheap aggregate endpoint to fall back on. `listFn` is called with the sample size so
 *  callers can reuse it for different limits if ever needed. */
export async function sampleBalance(listFn, balancePath, cap = 100) {
  try {
    const r = await listFn(cap);
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    const sum = list.reduce((s, x) => s + (balancePath(x) || 0), 0);
    const total = r?.totalFilteredRecords ?? list.length;
    return { sum, sampleSize: list.length, total, capped: total > list.length };
  } catch { return null; }
}

/** Fetches a bounded sample's raw record list without summing any particular field yet — lets
 *  a caller derive more than one KPI (e.g. principalDisbursed AND totalOutstanding) from a
 *  single network round trip via `sumFromSample()` below, instead of re-fetching per field. */
export async function sampleList(listFn, cap = 100) {
  try {
    const r = await listFn(cap);
    const list = Array.isArray(r) ? r : (r?.pageItems || []);
    const total = r?.totalFilteredRecords ?? list.length;
    return { list, total, capped: total > list.length };
  } catch { return null; }
}

/** Sums one field out of an already-fetched `sampleList()` result — the multi-KPI counterpart
 *  to `sampleBalance()`'s single-field fetch+sum. */
export function sumFromSample(sample, balancePath) {
  if (!sample) return null;
  const sum = sample.list.reduce((s, x) => s + (balancePath(x) || 0), 0);
  return { sum, sampleSize: sample.list.length, total: sample.total, capped: sample.capped };
}

/** Loads all Financial-Activity accounts tagged as cash (name containing "Cash", covering
 *  Fineract's standard "Cash at Main Vault" / "Cash at Tellers" activity labels), then
 *  sums journal-entry movements on those GL accounts for the given date range. For an
 *  ASSET account, a DEBIT increases the balance (cash in), a CREDIT decreases it (cash
 *  out) — standard double-entry convention. Returns null if no cash accounts are
 *  configured. `daily`=true also returns a day-bucketed breakdown for the cash-flow chart. */
export async function loadCashActivity(start, end, officeId, daily = false) {
  try {
    const activities = await api.financialActivityAccounts.list();
    const cashAccounts = (Array.isArray(activities) ? activities : []).filter(a => /cash/i.test(a.financialActivityName || ''));
    if (!cashAccounts.length) return null;
    const cashGlIds = new Set(cashAccounts.map(a => a.glAccountId));

    const fmt8 = d => d.toISOString().split('T')[0];
    const entries = await api.journalEntries.list({
      fromDate: fmt8(start), toDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en',
      limit: 1000, ...(officeId ? { officeId } : {})
    }).catch(() => null);
    const list = Array.isArray(entries) ? entries : (entries?.pageItems || []);
    const relevant = list.filter(e => cashGlIds.has(e.glAccountId));

    let totalIn = 0, totalOut = 0;
    const byDay = new Map();
    for (const e of relevant) {
      const amt = parseFloat(e.amount) || 0;
      const isDebit = /debit/i.test(e.entryType?.value || e.entryType?.code || '');
      if (isDebit) totalIn += amt; else totalOut += amt;
      if (daily) {
        const d = toJsDate(e.transactionDate);
        if (d) {
          const key = isoDay(d);
          const rec = byDay.get(key) || { in: 0, out: 0 };
          if (isDebit) rec.in += amt; else rec.out += amt;
          byDay.set(key, rec);
        }
      }
    }
    const capped = (entries?.totalFilteredRecords ?? list.length) > list.length;
    return { totalIn, totalOut, byDay, capped };
  } catch { return null; }
}

/** Sums INCOME vs EXPENSE GL account movements per trailing calendar month. Income
 *  accounts recognise revenue on CREDIT, expense accounts recognise cost on DEBIT —
 *  standard double-entry convention. */
export async function loadIncomeExpense(start, end, months, officeId) {
  try {
    const accounts = await api.glAccounts.list();
    const list = Array.isArray(accounts) ? accounts : [];
    const incomeIds = new Set(list.filter(a => /income/i.test(a.type?.value || a.type?.code || '')).map(a => a.id));
    const expenseIds = new Set(list.filter(a => /expense/i.test(a.type?.value || a.type?.code || '')).map(a => a.id));
    if (!incomeIds.size && !expenseIds.size) return null;

    const fmt8 = d => d.toISOString().split('T')[0];
    const entries = await api.journalEntries.list({
      fromDate: fmt8(start), toDate: fmt8(end), dateFormat: 'yyyy-MM-dd', locale: 'en',
      limit: 1000, ...(officeId ? { officeId } : {})
    }).catch(() => null);
    const rows = Array.isArray(entries) ? entries : (entries?.pageItems || []);

    const now = new Date();
    const income = new Array(months).fill(0), expense = new Array(months).fill(0);
    const labels = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
    }
    for (const e of rows) {
      const d = toJsDate(e.transactionDate);
      if (!d) continue;
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      const i = months - 1 - monthsAgo;
      if (i < 0 || i >= months) continue;
      const amt = parseFloat(e.amount) || 0;
      const isCredit = /credit/i.test(e.entryType?.value || e.entryType?.code || '');
      if (incomeIds.has(e.glAccountId) && isCredit) income[i] += amt;
      if (expenseIds.has(e.glAccountId) && !isCredit) expense[i] += amt;
    }
    return { labels, income, expense, capped: (entries?.totalFilteredRecords ?? rows.length) > rows.length };
  } catch { return null; }
}

/** Active loan COUNT per loan officer (not a currency figure — see file header for why). */
export async function loadLoansByOfficer(officeId) {
  try {
    const staff = await api.staff.list({ isLoanOfficer: true, ...(officeId ? { officeId } : {}) });
    const list = (Array.isArray(staff) ? staff : []).slice(0, 8); // cap chart to 8 bars
    const counts = await Promise.all(list.map(s =>
      api.loans.list({ limit: 1, status: 'active', loanOfficerId: s.id }).then(r => r?.totalFilteredRecords ?? 0).catch(() => null)
    ));
    return list.map((s, i) => ({ label: s.displayName || `Staff #${s.id}`, value: counts[i] })).filter(x => x.value != null);
  } catch { return null; }
}

/* Chart.js loading itself now lives in ./charts.js (loadChartJs()), which */
/* has its own module-scope chartJsPromise — this file no longer needs one. */
