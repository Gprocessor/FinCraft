/* FinCraft · pages/centers/shared.js — 
   Auto-split from the original monolithic pages/centers.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
