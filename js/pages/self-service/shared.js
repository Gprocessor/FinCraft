/* FinCraft · pages/self-service/shared.js — 
   Auto-split from the original monolithic pages/self-service.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);

export const TABS = ['Portal Users', 'Beneficiaries (TPT)'];
