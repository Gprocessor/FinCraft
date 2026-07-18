/* FinCraft · bulk-import-entities.js
   Single source of truth for the entity types Fineract's per-resource
   downloadtemplate/uploadtemplate endpoints actually support.

   Why this exists: there used to be TWO separate hardcoded copies of this list —
   one in js/pages/organization/loaders/integrations/imports-sms.js (14 entries) and a
   stale, out-of-sync 5-entry copy inline in views/modals/system.html's #bulkImportModal — which
   had already drifted apart once before (see fixlogs/FIXLOG-bulk-import.md). Centralizing
   it here means both surfaces always offer the same entities and any future correction
   only has to be made in one place.

   IMPORTANT: api.bulkImports.template()/.upload() build the request URL as
   `/${entity}/downloadtemplate` / `/${entity}/uploadtemplate` (see js/api/misc.js), so any
   entity whose template lives under a *nested* resource path (e.g. loan repayments, savings
   transactions) must include that nested segment in its `entity` value here — a bare
   'loanrepayments' or 'savingstransactions' is not a real top-level resource and 404s.

   'shareaccounts' is intentionally omitted: there is no ShareAccounts template/upload
   endpoint in Fineract (only ShareDividendApiResource exists, under
   /v1/shareproduct/{productId}/dividend), so this option previously 404'd on every attempt. */

export const BULK_IMPORT_ENTITIES = [
  { entity: 'clients',                                label: 'Clients' },
  { entity: 'centers',                                label: 'Centers' },
  { entity: 'groups',                                 label: 'Groups' },
  { entity: 'staff',                                  label: 'Staff' },
  { entity: 'offices',                                label: 'Offices' },
  { entity: 'users',                                  label: 'Users' },
  { entity: 'loans',                                  label: 'Loans' },
  { entity: 'loans/repayments',                       label: 'Loan Repayments' },
  { entity: 'savingsaccounts',                        label: 'Savings Accounts' },
  { entity: 'savingsaccounts/transactions',           label: 'Savings Transactions' },
  { entity: 'fixeddepositaccounts',                   label: 'Fixed Deposit Accounts' },
  { entity: 'fixeddepositaccounts/transaction',       label: 'Fixed Deposit Transactions' },
  { entity: 'recurringdepositaccounts',               label: 'Recurring Deposit Accounts' },
  { entity: 'recurringdepositaccounts/transactions',  label: 'Recurring Deposit Transactions' },
  // GLAccountsApiResource's class_path is /v1/glaccounts — "chartofaccounts" is not a real
  // resource and 404s; keep the human label but use the real path segment as the value.
  { entity: 'glaccounts',                             label: 'Chart of Accounts' },
  { entity: 'journalentries',                         label: 'Journal Entries' }
];
