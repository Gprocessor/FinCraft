/* FinCraft · pages/deposits/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/deposits.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
