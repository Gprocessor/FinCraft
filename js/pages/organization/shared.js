/* FinCraft · pages/organization/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/organization.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const TABS = [
  'Offices',
  'Staff',
  'Tellers & Cashiers',
  'Holidays',
  'Working Days',
  'Currencies',
  'Payment Types',
  'Standing Instructions',
  'Funds',
  'Adhoc Queries',
  'Loan Originators',
  'External Asset Owners',
  'Entity Datatable Checks',
  'Bulk Imports',
  'SMS Campaigns'
];
