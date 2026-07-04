/* FinCraft · pages/charges/shared.js — 
   Auto-split from the original monolithic pages/charges.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const APPLIES_TO_OPTIONS = [
  { id: 1, name: 'Loan' },
  { id: 2, name: 'Savings' },
  { id: 3, name: 'Client' },
  { id: 4, name: 'Group' },
  { id: 5, name: 'Share' },
  { id: 7, name: 'Share Account' }
];
