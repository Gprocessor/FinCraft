/* FinCraft · pages/misc/index.js — render() entry point — dispatches to the view below by params.view.
   Auto-split from the original monolithic pages/misc.js for maintainability. */

import { navigation } from './navigation.js';
import { profile } from './profile.js';
import { remittances } from './remittances.js';
import { settings } from './settings.js';

export async function render(c, params = {}) {
  const view = params.view || 'profile';
  const VIEWS = { profile, settings, navigation, remittances };
  const fn = VIEWS[view] || profile;
  await fn(c);
}
