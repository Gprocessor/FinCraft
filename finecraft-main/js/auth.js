/* FinCraft · auth.js — Login / logout with Fineract demo server */
import { api, configureAPI } from './api.js';
import { store } from './store.js';
import { FINERACT_DEMO } from './config.js';
import { toast } from './ui.js';

const LOGIN_ID  = 'loginScreen';
const SHELL_ID  = 'appShell';

export async function initAuth() {
  const saved = store.get('auth');
  if (saved?.authToken && saved?.serverUrl) {
    configureAPI(saved);
    try {
      // Quick health check — validate token still works
      await api._g('/users');
      showApp();
      return;
    } catch { store.remove('auth'); }
  }
  showLogin();
}

export async function login({ serverUrl, tenantId, username, password }) {
  configureAPI({ serverUrl, tenantId });
  const token = await api.auth(username, password);
  if (!token) throw new Error('Authentication failed — check credentials');
  configureAPI({ authToken: token });
  // Fetch current user details to get userId
  let userId;
  try {
    const users = await api.users.list();
    const me = (Array.isArray(users) ? users : []).find(u => u.username === username);
    userId = me?.id;
  } catch {}
  store.set('auth', { serverUrl, tenantId, username, authToken: token, userId });
  store.set('offline', false);
  showApp();
}

export function logout() {
  store.remove('auth');
  store.set('offline', false);
  api.reset();
  showLogin();
}

function showLogin() {
  const s = document.getElementById(SHELL_ID);
  const l = document.getElementById(LOGIN_ID);
  if (s) s.setAttribute('hidden', '');
  if (l) { l.removeAttribute('hidden'); renderLogin(l); }
}

function showApp() {
  const l = document.getElementById(LOGIN_ID);
  const s = document.getElementById(SHELL_ID);
  if (l) l.setAttribute('hidden', '');
  import('./ui.js').then(m => {
    m.mountAppShell();
    import('./router.js').then(r => r.navigate(store.get('lastPage') || 'dashboard'));
  });
}

function renderLogin(container) {
  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand" style="justify-content:center;margin-bottom:32px">
          <div class="brand-mark" style="width:52px;height:52px;font-size:28px">F</div>
          <div><div class="brand-title" style="font-size:22px">FinCraft</div>
          <div class="brand-sub">Apache Fineract Platform</div></div>
        </div>

        <div id="login-error" class="msg-banner b-danger mb-4" style="display:none"></div>

        <div class="form-grid">
          <label class="full"><span class="form-label">Server URL</span>
            <input id="l-server" class="form-control" value="${FINERACT_DEMO.serverUrl}"/></label>
          <label><span class="form-label">Tenant ID</span>
            <input id="l-tenant" class="form-control" value="${FINERACT_DEMO.tenantId}"/></label>
          <label><span class="form-label">Username</span>
            <input id="l-user" class="form-control" value="mifos" autocomplete="username"/></label>
          <label class="full"><span class="form-label">Password</span>
            <input id="l-pass" class="form-control" type="password" value="password" autocomplete="current-password"/></label>
        </div>

        <button class="btn-primary w-full mt-4" id="l-btn" style="width:100%">
          <i class="fa-solid fa-right-to-bracket"></i> Sign In
        </button>

        <div class="text-center mt-4 text-muted" style="font-size:13px">
          Demo server: <b>demo.mifos.io</b> · tenant: <b>default</b><br/>
          Default credentials: <b>mifos / password</b>
        </div>
      </div>
    </div>`;

  const btn  = container.querySelector('#l-btn');
  const err  = container.querySelector('#login-error');
  const pass = container.querySelector('#l-pass');

  const doLogin = async () => {
    const serverUrl = container.querySelector('#l-server').value.trim().replace(/\/$/, '');
    const tenantId  = container.querySelector('#l-tenant').value.trim() || 'default';
    const username  = container.querySelector('#l-user').value.trim();
    const password  = pass.value;

    if (!serverUrl || !username || !password) {
      err.style.display = '';
      err.textContent = 'Please fill in all fields';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in…';
    err.style.display = 'none';

    try {
      await login({ serverUrl, tenantId, username, password });
    } catch (e) {
      err.style.display = '';
      err.textContent = e.message || 'Sign in failed — check server and credentials';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
    }
  };

  btn.addEventListener('click', doLogin);
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
