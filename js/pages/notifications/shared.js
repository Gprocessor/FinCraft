/* FinCraft · pages/notifications/shared.js — time-ago formatting and the notification-polling loop.
   Auto-split from the original monolithic pages/notifications.js for maintainability. */

import { api } from '../../api.js';
import { store } from '../../store.js';
import { toast } from '../../ui.js';
import { fmtDate } from '../../utils.js';
import { loadNotifications } from './feed.js';

export const can = (code) => store.hasPermission(code);

export const TABS = ['Notifications', 'Audit Trails', 'My Activity'];

export let _lastSeenNotifId = null;

let _pollTimer = null;

export let _autoRefresh = false;

export const ENTITY_ROUTES = {
  CLIENT:          'client-detail',
  LOAN:            'loans',
  SAVINGSACCOUNT:  'savings',
  SAVING:          'savings',
  FIXEDDEPOSITACCOUNT:    'deposits',
  RECURRINGDEPOSITACCOUNT:'deposits',
  SHAREACCOUNT:    'shares',
  GROUP:           'groups',
  CENTER:          'centers',
  CHARGE:          'charges',
  USER:            'users',
  ROLE:            'users',
  OFFICE:          'organization',
  STAFF:           'organization',
  LOANPRODUCT:     'products',
  SAVINGSPRODUCT:  'products',
  JOURNALENTRY:    'accounting',
  GLACCOUNT:       'accounting'
};

export function timeAgo(date) {
  if (!date) return '';
  let d;
  if (Array.isArray(date)) d = new Date(date[0], date[1] - 1, date[2], date[3] || 0, date[4] || 0);
  else d = new Date(date);
  if (isNaN(d)) return String(date);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)     return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000)   return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(d);
}

export function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

export function startPolling(c) {
  stopPolling();
  _pollTimer = setInterval(async () => {
    try {
      const res = await api.notifications.list({ limit: 5, isRead: false, orderBy: 'createdAt', sortOrder: 'DESC' });
      const list = Array.isArray(res) ? res : (res?.pageItems || []);
      if (!list.length) return;

      const newestId = list[0].id;
      if (_lastSeenNotifId !== null && newestId > _lastSeenNotifId) {
        // New notification(s) arrived
        const newOnes = list.filter(n => n.id > _lastSeenNotifId);
        newOnes.slice(0, 3).forEach(n => {
          toast('info', 'New notification', n.content || n.message || n.objectType || '');
        });
        // Refresh current tab content if user is on Notifications
        const activeTab = c.querySelector('.tab-btn.active');
        if (activeTab?.dataset.tab === 'nt-0') loadNotifications(c);
        // Update bell badge
        const dot = document.getElementById('notifBadgeDot');
        if (dot) dot.hidden = false;
      }
      _lastSeenNotifId = newestId;
    } catch (e) {
      console.warn('[notif-poll]', e);
    }
  }, 30000);
}

export function setAutoRefresh(v) { _autoRefresh = v; }
export function setLastSeenNotifId(v) { _lastSeenNotifId = v; }
