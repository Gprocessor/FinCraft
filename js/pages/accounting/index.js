/* FinCraft · pages/accounting/index.js — render() entry point.
   Converted from a 9-tab bar (which previously eagerly loaded all 9 sections on
   every visit) to a card-grid hub — see js/ui/section-hub.js for the rationale.
   panelId values (acc-0..acc-8) match the IDs each loader function already expects
   via c.querySelector('#acc-N') — kept as-is so none of the loaders needed changes. */

import { loadAccountingRules, loadChartOfAccounts, loadFinancialActivities, loadFrequentPostings, loadGLClosure, loadJournalEntries, loadOpeningBalances, loadProvisioning, loadRunAccruals } from './loaders.js';
import { resetGlCache } from './shared.js';
import { renderSectionHub } from '../../ui/section-hub.js';

const SECTIONS = [
  { key: 'coa',         panelId: 'acc-0', label: 'Chart of Accounts',    icon: 'fa-list-tree',       desc: 'GL account hierarchy',                 load: loadChartOfAccounts },
  { key: 'journal',     panelId: 'acc-1', label: 'Journal Entries',      icon: 'fa-book',             desc: 'Manual & system-posted entries',       load: loadJournalEntries },
  { key: 'frequent',    panelId: 'acc-2', label: 'Frequent Postings',    icon: 'fa-repeat',           desc: 'Saved journal entry templates',        load: loadFrequentPostings },
  { key: 'rules',       panelId: 'acc-3', label: 'Accounting Rules',     icon: 'fa-scale-balanced',   desc: 'Debit/credit account rule sets',       load: loadAccountingRules },
  { key: 'opening',     panelId: 'acc-4', label: 'Opening Balances',     icon: 'fa-door-open',        desc: 'Initial GL account balances',          load: loadOpeningBalances },
  { key: 'accruals',    panelId: 'acc-5', label: 'Run Accruals',         icon: 'fa-calculator',       desc: 'Manual accrual run',                   load: loadRunAccruals },
  { key: 'glclosure',   panelId: 'acc-6', label: 'GL Closure',           icon: 'fa-lock',             desc: 'Close accounting periods',             load: loadGLClosure },
  { key: 'provisioning', panelId: 'acc-7', label: 'Provisioning',         icon: 'fa-shield-halved',    desc: 'Loan loss provisioning entries',       load: loadProvisioning },
  { key: 'finactivity', panelId: 'acc-8', label: 'Financial Activities', icon: 'fa-building-columns', desc: 'GL-to-financial-activity mapping',     load: loadFinancialActivities }
];

export async function render(c, params = {}) {
  resetGlCache();
  renderSectionHub(c, {
    pageKey: 'accounting',
    title: 'Accounting',
    subtitle: 'GL, journals, rules, closures, provisioning, accruals',
    sections: SECTIONS,
    params
  });
}
