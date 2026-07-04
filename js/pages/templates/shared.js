/* FinCraft · pages/templates/shared.js — 
   Auto-split from the original monolithic pages/templates.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const ENTITY_OPTIONS = [
  { id: 0, name: 'Client' },
  { id: 1, name: 'Loan' },
  { id: 2, name: 'Savings' },
  { id: 3, name: 'Group' }
];

export const TYPE_OPTIONS = [
  { id: 0, name: 'Document', icon: 'fa-file-pdf' },
  { id: 1, name: 'Email',    icon: 'fa-envelope' },
  { id: 2, name: 'SMS',      icon: 'fa-comment-sms' }
];
