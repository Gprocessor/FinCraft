/* FinCraft · pages/savings/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/savings.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
