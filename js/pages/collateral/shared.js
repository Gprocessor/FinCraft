/* FinCraft · pages/collateral/shared.js — 
   Auto-split from the original monolithic pages/collateral.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
