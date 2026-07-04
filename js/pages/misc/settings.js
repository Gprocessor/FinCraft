/* FinCraft · pages/misc/settings.js — the Settings view.
   Auto-split from the original monolithic pages/misc.js for maintainability. */

import { configureAPI } from '../../api.js';
import { FINERACT_DEMO } from '../../config.js';
import { store } from '../../store.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';

export function settings(c) {
  const auth = store.get('auth') || {};

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <div class="page-subtitle">App preferences and connection</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Server Connection</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <label><span class="form-label">Server URL</span>
              <input class="form-control" id="s-url" value="${escapeHtml(auth.serverUrl || FINERACT_DEMO.serverUrl)}"/>
            </label>
            <label><span class="form-label">Tenant ID</span>
              <input class="form-control" id="s-tenant" value="${escapeHtml(auth.tenantId || FINERACT_DEMO.tenantId)}"/>
            </label>
            <button class="btn-primary mt-2" id="s-save">
              <i class="fa-solid fa-floppy-disk"></i> Save Connection
            </button>
            <div class="msg-banner b-info mt-2" style="font-size:12px">
              <i class="fa-solid fa-circle-info"></i>
              Changing the server invalidates your current session. Sign out and back in for the change to take full effect.
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Appearance</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <label class="form-check">
              <input type="checkbox" id="s-theme" ${store.get('theme') === 'dark' ? 'checked' : ''}/>
              <span><b>Dark theme</b> — easier on the eyes</span>
            </label>
            <label class="form-check">
              <input type="checkbox" id="s-sidebar" ${store.get('sidebar') === 'collapsed' ? 'checked' : ''}/>
              <span><b>Collapsed sidebar</b> — more room for content</span>
            </label>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column:span 2">
        <div class="card-header"><h3 class="card-title">Keyboard Shortcuts</h3></div>
        <div class="card-body">
          <div class="tbl-wrap">
            <table class="tbl">
              <tbody>
                <tr><td style="width:200px"><kbd>Ctrl + K</kbd></td><td>Command palette</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close modals / panels / palette</td></tr>
                <tr><td><kbd>Ctrl + Shift + N</kbd></td><td>New Client</td></tr>
                <tr><td><kbd>Ctrl + Shift + L</kbd></td><td>New Loan</td></tr>
                <tr><td><kbd>?</kbd></td><td>Show shortcut help</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  c.querySelector('#s-save').addEventListener('click', () => {
    const url = c.querySelector('#s-url').value.trim().replace(/\/$/, '');
    const tnt = c.querySelector('#s-tenant').value.trim();
    if (!url || !tnt) { toast('warn', 'Required', 'Server URL and tenant required'); return; }
    store.patch('auth', { serverUrl: url, tenantId: tnt });
    configureAPI({ serverUrl: url, tenantId: tnt });
    toast('success', 'Saved', 'Sign out + back in to fully apply');
  });

  c.querySelector('#s-theme').addEventListener('change', e => {
    store.set('theme', e.target.checked ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', store.get('theme'));
    const icon = document.querySelector('#themeBtn i');
    if (icon) icon.className = `fa-solid fa-${e.target.checked ? 'moon' : 'sun'}`;
  });

  c.querySelector('#s-sidebar').addEventListener('change', e => {
    store.set('sidebar', e.target.checked ? 'collapsed' : 'expanded');
    document.getElementById('sidebar')?.classList.toggle('collapsed', e.target.checked);
  });
}
