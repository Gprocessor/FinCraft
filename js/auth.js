/* FinCraft · auth.js — Login / Logout / Change password / Forgot / 2FA / Session bootstrap */
import { api, configureAPI } from './api.js';
import { store } from './store.js';
import { FINERACT_DEMO } from './config.js';

const LOGIN_ID = 'loginScreen';
const SHELL_ID = 'appShell';

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
export async function initAuth() {
  // Wire global 401 handler once.
  api.onUnauthorized(() => {
    _clearSession();
    showLogin('Your session expired. Please sign in again.');
  });

  const saved = store.get('auth');
  if (saved?.authToken && saved?.serverUrl) {
    configureAPI(saved);
    try {
      // Canonical session-validate call — also refreshes roles + perms.
      const me = await api.userDetails.self();
      _persistUserContext(me);
      showApp();
      return;
    } catch {
      _clearSession();
    }
  }
  showLogin();
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
export async function login({ serverUrl, tenantId, username, password }) {
  configureAPI({ serverUrl, tenantId });
  const token = await api.auth(username, password);   // POST /authentication
  if (!token) throw new Error('Authentication failed — check credentials');

  configureAPI({ authToken: token });
  store.set('auth', { serverUrl, tenantId, username, authToken: token });

  // Refresh canonical profile (officeId, roles, permissions[]).
  try {
    const me = await api.userDetails.self();
    _persistUserContext(me);
  } catch (e) {
    if (e.status === 401) {
      _clearSession();
      throw new Error('Server rejected the session token.');
    }
    // Non-fatal — proceed with empty perms (UI will hide guarded actions).
    store.set('perms', []);
  }

  showApp();
}

/** Persist /userdetails payload into store. */
function _persistUserContext(me) {
  const auth = store.get('auth') || {};
  store.set('auth', {
    ...auth,
    userId:     me.userId ?? me.id,
    officeId:   me.officeId,
    officeName: me.officeName,
    roles:      Array.isArray(me.roles) ? me.roles : []
  });
  // Fineract /userdetails returns permissions either as flat strings or {code} objects — normalise.
  const raw   = Array.isArray(me.permissions) ? me.permissions : [];
  const perms = raw.map(p => (typeof p === 'string' ? p : p?.code)).filter(Boolean);
  store.set('perms', perms);
}

/* ------------------------------------------------------------------ */
/* Permission helper                                                   */
/* ------------------------------------------------------------------ */
/** Strict permission check — deny by default when perms are empty. */
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
/* 2FA helpers (used when 2FA is enabled tenant-side)                  */
/* ------------------------------------------------------------------ */
export async function isTwoFactorRequired() {
  try {
    const cfg = await api.twoFactor.config.get();
    // Fineract returns array of named config entries; "enabled" flag is one of them.
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