/* FinCraft · store.js */
const LS_KEY = 'fincraft.state';
const SS_KEY = 'fincraft.session';

class Store {
  constructor() {
    this.state = {
      auth: null, theme: 'dark', sidebar: 'expanded',
      currentPage: 'dashboard', currentParams: {}, cache: {}, offline: false
    };
    this.subs = {};
  }
  get(k) { return this.state[k]; }
  set(k, v) { this.state[k] = v; this._notify(k, v); this.persist(); }
  patch(k, v) { this.state[k] = { ...(this.state[k] || {}), ...v }; this._notify(k, this.state[k]); this.persist(); }
  subscribe(k, cb) {
    (this.subs[k] ||= new Set()).add(cb);
    return () => this.subs[k].delete(cb);
  }
  _notify(k, v) { this.subs[k]?.forEach(cb => { try { cb(v); } catch (e) { console.error(e); } }); }
  persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ theme: this.state.theme, sidebar: this.state.sidebar }));
      if (this.state.auth) {
        sessionStorage.setItem(SS_KEY, JSON.stringify({
          serverUrl: this.state.auth.serverUrl, tenantId: this.state.auth.tenantId,
          username: this.state.auth.username, authToken: this.state.auth.authToken,
          userId: this.state.auth.userId || null,
          server: this.state.auth.server || null
        }));
      } else sessionStorage.removeItem(SS_KEY);
    } catch {}
  }
  restore() {
    try {
      const ls = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (ls.theme) this.state.theme = ls.theme;
      if (ls.sidebar) this.state.sidebar = ls.sidebar;
      const ss = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
      if (ss && ss.authToken) this.state.auth = ss;
    } catch {}
    document.documentElement.setAttribute('data-theme', this.state.theme);
  }
}
export const store = new Store();
store.restore();
