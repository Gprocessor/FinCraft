/* FinCraft · pages/datatables/shared.js — 
   Auto-split from the original monolithic pages/datatables.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const APP_TABLES = [
  { id: 'm_client',           name: 'Client' },
  { id: 'm_group',            name: 'Group' },
  { id: 'm_center',           name: 'Center' },
  { id: 'm_loan',             name: 'Loan' },
  { id: 'm_savings_account',  name: 'Savings Account' },
  { id: 'm_office',           name: 'Office' }
];

export const COLUMN_TYPES = [
  { value: 'String',   label: 'String (text)' },
  { value: 'Number',   label: 'Number (integer)' },
  { value: 'Decimal',  label: 'Decimal' },
  { value: 'Boolean',  label: 'Boolean' },
  { value: 'Date',     label: 'Date' },
  { value: 'DateTime', label: 'Date + Time' },
  { value: 'Text',     label: 'Long Text' },
  { value: 'Dropdown', label: 'Dropdown (Code-value)' }
];
