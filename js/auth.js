/* FinCraft · auth.js — Login / Logout / Change password / Forgot / 2FA / Session bootstrap
   Tenant-aware: remembers recent tenants per device for quick re-login. */
import { api, configureAPI } from './api.js';
import { store } from './store.js';
import { FINERACT_DEMO } from './config.js';

const LOGIN_ID = 'loginScreen';
const SHELL_ID = 'appShell';

/* ------------------------------------------------------------------ */
/* Permission extraction helper                                        */
/* ------------------------------------------------------------------ */
/** Extract permission codes from a payload — handles all 3 shapes:
 *  - permissions: ["CODE", "CODE", ...]
 *  - permissions: [{ code: "CODE" }, ...]
 *  - roles: [{ permissions: [{ code, selected }, ...] }, ...]
 */
function _extractPerms(payload) {
  const out = new Set();
  const top = Array.isArray(payload?.permissions) ? payload.permissions : [];
  top.forEach(p => {
    const code = typeof p === 'string' ? p : p?.code;
    if (code) out.add(code);
  });
  const roles = Array.isArray(payload?.roles) ? payload.roles : [];
  roles.forEach(r => {
    const rolePerms = Array.isArray(r.permissions) ? r.permissions : [];
    rolePerms.forEach(p => {
      const code = typeof p === 'string' ? p : p?.code;
      const selected = typeof p === 'object' ? p.selected !== false : true;
      if (code && selected) out.add(code);
    });
  });
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Recent tenants — remembered per device                              */
/* ------------------------------------------------------------------ */
const RECENT_TENANTS_KEY = 'fincraft.recentTenants';
const MAX_RECENT_TENANTS = 5;

function _loadRecentTenants() {
  try {
    const raw = localStorage.getItem(RECENT_TENANTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _saveRecentTenant(serverUrl, tenantId, username) {
  try {
    const all = _loadRecentTenants();
    const filtered = all.filter(t => !(t.tenantId === tenantId && t.serverUrl === serverUrl));
    filtered.unshift({ tenantId, serverUrl, username, lastUsed: Date.now() });
    localStorage.setItem(RECENT_TENANTS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_TENANTS)));
  } catch {}
}

function _removeRecentTenant(tenantId, serverUrl) {
  try {
    const all = _loadRecentTenants();
    const filtered = all.filter(t => !(t.tenantId === tenantId && t.serverUrl === serverUrl));
    localStorage.setItem(RECENT_TENANTS_KEY, JSON.stringify(filtered));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
export async function initAuth() {
  api.onUnauthorized(() => {
    _clearSession();
    showLogin('Your session expired. Please sign in again.');
  });

  const saved = store.get('auth');
  if (saved?.authToken && saved?.serverUrl) {
    configureAPI(saved);
    try {
      const me = await api.userDetails.self();
      _persistUserContext(me);
      console.log('[auth] Restored session with', (store.get('perms') || []).length, 'permissions');
      showApp();
      return;
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        _clearSession();
      } else {
        // Network error or transient — keep cached session
        console.warn('[auth] /userdetails failed, using cached perms:', e.message);
        if (Array.isArray(store.get('perms')) && store.get('perms').length) {
          showApp();
          return;
        }
        _clearSession();
      }
    }
  }
  showLogin();
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
export async function login({ serverUrl, tenantId, username, password }) {
  configureAPI({ serverUrl, tenantId });

  // /authentication returns the FULL payload (token + roles + permissions)
  const authResponse = await api.auth(username, password);
  const token = authResponse?.base64EncodedAuthenticationKey;
  if (!token) throw new Error('Authentication failed — check credentials');
  configureAPI({ authToken: token });

  // Extract perms from authentication response (the reliable source)
  const authPerms = _extractPerms(authResponse);

  // Persist initial session
  store.set('auth', {
    serverUrl, tenantId, username, authToken: token,
    userId:     authResponse.userId,
    officeId:   authResponse.officeId,
    officeName: authResponse.officeName,
    roles:      Array.isArray(authResponse.roles) ? authResponse.roles : []
  });
  store.set('perms', authPerms);

  // Best-effort enrichment from /userdetails — merges, never overwrites with empty
  try {
    const me = await api.userDetails.self();
    const auth = store.get('auth') || {};
    store.set('auth', {
      ...auth,
      userId:     me.userId ?? me.id ?? auth.userId,
      officeId:   me.officeId ?? auth.officeId,
      officeName: me.officeName ?? auth.officeName,
      roles:      Array.isArray(me.roles) && me.roles.length ? me.roles : auth.roles
    });
    const mePerms = _extractPerms(me);
    if (mePerms.length) {
      const merged = [...new Set([...authPerms, ...mePerms])];
      store.set('perms', merged);
    }
  } catch (e) {
    if (e.status === 401) {
      _clearSession();
      throw new Error('Server rejected the session token.');
    }
    // Non-fatal — keep auth-response perms
  }

  console.log('[auth] Signed in with', (store.get('perms') || []).length, 'permissions');
  _saveRecentTenant(serverUrl, tenantId, username);   // Remember for next time
  showApp();
}

/** Persist /userdetails enrichment — only overwrite when new payload is richer. */
function _persistUserContext(me) {
  const auth = store.get('auth') || {};
  store.set('auth', {
    ...auth,
    userId:     me.userId ?? me.id ?? auth.userId,
    officeId:   me.officeId ?? auth.officeId,
    officeName: me.officeName ?? auth.officeName,
    roles:      Array.isArray(me.roles) && me.roles.length ? me.roles : auth.roles
  });

  // NEVER wipe perms — only merge if /userdetails actually returned some
  const newPerms = _extractPerms(me);
  if (newPerms.length) {
    const existing = store.get('perms') || [];
    const merged = [...new Set([...existing, ...newPerms])];
    store.set('perms', merged);
  }
}

/* ------------------------------------------------------------------ */
/* Permission helper                                                   */
/* ------------------------------------------------------------------ */
export function canDo(code) { return store.hasPermission(code); }

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */
export function logout() {
  _clearSession();
  showLogin();
}

function _clearSession() {
  store.remove('auth');
  store.set('perms', []);
  store.set('offline', false);
  api.reset();
}

/* ------------------------------------------------------------------ */
/* Change password                                                     */
/* ------------------------------------------------------------------ */
export async function changePassword({ password, repeatPassword }) {
  const auth = store.get('auth');
  if (!auth?.userId) throw new Error('Not signed in');
  if (!password || password !== repeatPassword) throw new Error('Passwords do not match');
  return api.password.change(auth.userId, { password, repeatPassword });
}

/* ------------------------------------------------------------------ */
/* Forgot password                                                     */
/* ------------------------------------------------------------------ */
export async function forgotPassword({ username, email }) {
  if (!username && !email) throw new Error('Provide username or email');
  return api.password.forgot({ username, email });
}

/* ------------------------------------------------------------------ */
/* 2FA helpers                                                          */
/* ------------------------------------------------------------------ */
export async function isTwoFactorRequired() {
  try {
    const cfg = await api.twoFactor.config.get();
    const flag = Array.isArray(cfg) ? cfg.find(c => /enable/i.test(c.name)) : null;
    return !!(flag && (flag.value === true || flag.value === 'true' || flag.value === 1));
  } catch { return false; }
}

export const getOtpMethods = ()                                  => api.twoFactor.methods();
export const requestOtp    = (deliveryMethod, extendedToken = false) =>
  api.twoFactor.request({ deliveryMethod, extendedToken });
export const validateOtp   = (token)                             => api.twoFactor.validate(token);

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */
function showLogin(banner) {
  const s = document.getElementById(SHELL_ID);
  const l = document.getElementById(LOGIN_ID);
  if (s) s.setAttribute('hidden', '');
  if (l) { l.removeAttribute('hidden'); renderLogin(l, banner); }
}

function showApp() {
  const l = document.getElementById(LOGIN_ID);
  if (l) l.setAttribute('hidden', '');
  import('./ui.js').then(m => {
    m.mountAppShell();
    import('./router.js').then(r => {
      r.initRouter();
      if (!location.hash || location.hash === '#') {
        r.navigate(store.get('lastPage') || 'dashboard');
      }
    });
  });
}

function renderLogin(container, banner) {
  // Build the recent-tenants chip row (only if any tenants are remembered)
  const recents = _loadRecentTenants();
  const recentChipsHtml = recents.length ? `
    <div class="mb-2" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text-3,#8fa8c8);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-right:4px">Recent:</span>
      ${recents.map((t, i) => `
        <button type="button" class="tenant-chip" data-recent-idx="${i}"
                style="padding:4px 10px;font-size:11px;background:var(--bg-2,#0e1a2e);border:1px solid var(--border-1,#1a2d4a);border-radius:99px;color:var(--text-2,#e8f0fc);cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono,monospace);transition:all 200ms"
                title="${t.tenantId} on ${t.serverUrl}${t.username ? ' (last user: ' + t.username + ')' : ''}">
          <i class="fa-solid fa-server" style="font-size:9px;color:var(--brand-teal,#00c9b1)"></i>
          ${t.tenantId}
          <span class="tenant-chip-x" data-remove-idx="${i}" style="opacity:0.5;font-size:13px;margin-left:2px" title="Forget this tenant">×</span>
        </button>
      `).join('')}
    </div>` : '';

  container.innerHTML = `
    <div class="login-wrap active" style="width:100%;height:100vh;display:flex">
      <div class="login-left">
        <div class="login-brand">
          <div class="login-logo-row">
            <div class="login-logo">F</div>
            <div>
              <div class="login-app-name">Fin<em>Craft</em></div>
              <div style="font-size:10px;color:var(--brand-teal);letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-top:2px">Fineract Platform</div>
            </div>
          </div>
          <div class="login-tagline">A unified microfinance platform — every feature from the Community App, Web App, and Field Officer App rebuilt with a modern interface.</div>
          <div class="login-features">
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-users"></i></div><div class="login-feature-text"><strong>Full Client Lifecycle</strong>Create, manage and track every client</div></div>
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-money-bill-wave"></i></div><div class="login-feature-text"><strong>Complete Loan Engine</strong>35+ actions, disbursements, repayments</div></div>
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-calculator"></i></div><div class="login-feature-text"><strong>Full Accounting GL</strong>COA, journal entries, closures</div></div>
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-chart-bar"></i></div><div class="login-feature-text"><strong>Reports & Analytics</strong>PAR, trial balance, ad hoc queries</div></div>
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-terminal"></i></div><div class="login-feature-text"><strong>Command Palette</strong>Jump anywhere instantly with Ctrl+K</div></div>
            <div class="login-feature"><div class="login-feature-icon"><i class="fa-solid fa-plug"></i></div><div class="login-feature-text"><strong>Live Fineract API</strong>Connects to any Fineract instance</div></div>
          </div>
        </div>
      </div>
      <div class="login-right">
        <div class="login-form-box">
          <div class="login-form-title">Welcome back</div>
          <div class="login-form-sub">Sign in to your FinCraft account</div>
          ${banner ? `<div class="msg-banner b-warning mb-4">${banner}</div>` : ''}
          <div id="login-error" class="msg-banner b-danger mb-4" style="display:none"></div>
          <div class="form-group mb-3"><label class="form-label">Server URL</label>
            <input id="l-server" class="form-control" value="${FINERACT_DEMO.serverUrl}"/></div>
          ${recentChipsHtml}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" class="mb-3">
            <div class="form-group"><label class="form-label">Tenant ID</label>
              <input id="l-tenant" class="form-control" value="${FINERACT_DEMO.tenantId}"/></div>
            <div class="form-group"><label class="form-label">Username</label>
              <input id="l-user" class="form-control" value="mifos" autocomplete="username"/></div>
          </div>
          <div class="form-group mb-4"><label class="form-label">Password</label>
            <div class="input-group">
              <input id="l-pass" class="form-control" type="password" value="password" autocomplete="current-password"/>
              <button class="btn btn-secondary" style="border-radius:0 6px 6px 0;border-left:none" onclick="const p=document.getElementById('l-pass');p.type=p.type==='password'?'text':'password'"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
          <button class="btn btn-primary btn-full" id="l-btn">
            <i class="fa-solid fa-right-to-bracket"></i> Sign In
          </button>
          <div class="login-footer mt-3">
            <a href="#" id="l-forgot" class="link" style="font-size:12px">Forgot password?</a>
            &nbsp;·&nbsp; Demo: <b>mifos / password</b>
          </div>
        </div>
      </div>
    </div>`;

  const btn        = container.querySelector('#l-btn');
  const err        = container.querySelector('#login-error');
  const pass       = container.querySelector('#l-pass');
  const forgotLink = container.querySelector('#l-forgot');

  const showErr = (msg) => {
    err.classList.remove('b-success'); err.classList.add('b-danger');
    err.style.display = ''; err.textContent = msg;
  };
  const showOk = (msg) => {
    err.classList.remove('b-danger'); err.classList.add('b-success');
    err.style.display = ''; err.textContent = msg;
  };
  const setBusy = (on) => {
    btn.disabled = on;
    btn.innerHTML = on
      ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in…'
      : '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  };

  const doLogin = async () => {
    const serverUrl = container.querySelector('#l-server').value.trim().replace(/\/$/, '');
    const tenantId  = container.querySelector('#l-tenant').value.trim() || 'default';
    const username  = container.querySelector('#l-user').value.trim();
    const password  = pass.value;
    if (!serverUrl || !username || !password) return showErr('Please fill in all fields');
    err.style.display = 'none';
    setBusy(true);
    try {
      await login({ serverUrl, tenantId, username, password });
    } catch (e) {
      if (e.status === 401)        showErr('Invalid username or password.');
      else if (e.code === 'TIMEOUT') showErr('Server did not respond. Check the URL and try again.');
      else                          showErr(e.message || 'Sign in failed.');
      setBusy(false);
    }
  };

  btn.addEventListener('click', doLogin);
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Tenant chip clicks — fill in server URL, tenant, and username
  container.querySelectorAll('[data-recent-idx]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      // Ignore clicks on the × remove button
      if (e.target.classList.contains('tenant-chip-x')) return;
      const idx = parseInt(chip.dataset.recentIdx, 10);
      const list = _loadRecentTenants();
      const t = list[idx];
      if (!t) return;
      container.querySelector('#l-server').value = t.serverUrl;
      container.querySelector('#l-tenant').value = t.tenantId;
      if (t.username) container.querySelector('#l-user').value = t.username;
      container.querySelector('#l-pass').focus();
    });
  });

  // Tenant chip × — remove from recents and re-render
  container.querySelectorAll('[data-remove-idx]').forEach(x => {
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(x.dataset.removeIdx, 10);
      const list = _loadRecentTenants();
      const t = list[idx];
      if (!t) return;
      _removeRecentTenant(t.tenantId, t.serverUrl);
      renderLogin(container, banner);
    });
  });

  // Chip hover effect
  container.querySelectorAll('.tenant-chip').forEach(chip => {
    chip.addEventListener('mouseenter', () => {
      chip.style.borderColor = 'var(--brand-teal, #00c9b1)';
      chip.style.background = 'rgba(0,201,177,0.08)';
    });
    chip.addEventListener('mouseleave', () => {
      chip.style.borderColor = '';
      chip.style.background = '';
    });
  });

  forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const u = container.querySelector('#l-user').value.trim();
    if (!u) return showErr('Enter your username first, then click "Forgot password?".');
    try {
      await forgotPassword({ username: u });
      showOk('If the account exists, a reset has been initiated.');
    } catch (ex) {
      showErr(ex.detail?.defaultUserMessage || ex.message || 'Could not initiate password reset.');
    }
  });
}