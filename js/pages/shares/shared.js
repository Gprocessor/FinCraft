/* FinCraft · pages/shares/shared.js — 
   Auto-split from the original monolithic pages/shares.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
