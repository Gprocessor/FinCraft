/* FinCraft · pages/clients/shared.js — small shared constants/helpers used across this page module.
   Auto-split from the original monolithic pages/clients.js for maintainability. */

import { store } from '../../store.js';

export const can = (code) => store.hasPermission(code);
