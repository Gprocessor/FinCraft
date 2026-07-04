/* FinCraft · pages/tasks/shared.js — 
   Auto-split from the original monolithic pages/tasks.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const TABS = ['Checker Inbox', 'Loan Approvals', 'Client Approvals', 'Reschedule Requests'];
