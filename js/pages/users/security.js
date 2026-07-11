/* FinCraft · pages/users/security.js — password policy and two-factor auth config tab loaders.
   Auto-split from the original monolithic pages/users.js for maintainability. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';
import { can } from './shared.js';
import { extractFineractError } from '../../ui/dom-helpers.js';

export async function loadPasswordPolicy(c) {
  const el = c.querySelector('#usr-2');
  try {
    const prefs = await api.password.preferences();
    const list = Array.isArray(prefs?.activePasswordValidationPolicy)
      ? prefs.activePasswordValidationPolicy
      : (Array.isArray(prefs) ? prefs : (prefs?.policies || []));

    // Fineract returns activePasswordValidationPolicy as single object, with a list of available policies
    const allPolicies = prefs.activePasswordValidationPolicy
      ? [prefs.activePasswordValidationPolicy, ...(prefs.policies || [])]
      : list;
    const activeId = prefs.activePasswordValidationPolicy?.id || prefs.activePolicyId;

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Password Policy</h3>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Choose the active password validation policy. All new and updated passwords must satisfy the selected policy.
      </div>

      ${allPolicies.length ? `
        <div class="form-grid">
          ${allPolicies.map(p => `
            <label class="checkbox-row" style="display:block; padding:12px; border:1px solid var(--border); border-radius:4px; margin-bottom:8px">
              <input type="radio" name="pwd-policy" value="${p.id}" ${p.id === activeId ? 'checked' : ''} ${can('UPDATE_PASSWORD_PREFERENCES') ? '' : 'disabled'}/>
              <b>${escapeHtml(p.key || p.name || '—')}</b>
              <div class="text-muted small mt-1">${escapeHtml(p.description || 'No description')}</div>
            </label>`).join('')}
        </div>

        <div class="mt-3">
          ${can('UPDATE_PASSWORD_PREFERENCES') ? `<button class="btn-primary" id="btn-save-policy">Apply Selected Policy</button>` : ''}
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-shield-halved"></i>
          <h3>No password policies available</h3>
          <div class="text-muted">Password policies are configured server-side by Fineract administrators.</div>
        </div>`}`;

    el.querySelector('#btn-save-policy')?.addEventListener('click', async () => {
      const selected = el.querySelector('input[name="pwd-policy"]:checked');
      if (!selected) { toast('warn', 'Select a policy', ''); return; }
      try {
        await api.password.updatePreferences({ validationPolicyId: parseInt(selected.value) });
        toast('success', 'Password policy updated', '');
        loadPasswordPolicy(c);
      } catch (e) { toast('error', 'Update failed', extractFineractError(e)); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">Password preferences not available: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}

export async function loadTwoFactorConfig(c) {
  const el = c.querySelector('#usr-3');
  try {
    const config = await api.twoFactor.config.get();
    // Fineract returns an array of config entries [{name, value}] or an object
    const entries = Array.isArray(config) ? config : Object.entries(config || {}).map(([name, value]) => ({ name, value }));

    el.innerHTML = `
      <div class="section-header mb-2">
        <h3>Two-Factor Authentication (Tenant Configuration)</h3>
      </div>
      <div class="text-muted small mb-3">
        <i class="fa-solid fa-circle-info"></i>
        Tenant-wide 2FA configuration. Individual users opt in via their profile.
      </div>

      ${entries.length ? `
        <table class="table">
          <thead><tr>
            <th>Setting</th><th>Current Value</th>
            <th>${can('UPDATE_TWOFACTOR_CONFIGURATION') ? 'New Value' : ''}</th>
          </tr></thead>
          <tbody>${entries.map((e, i) => {
            const isBool = typeof e.value === 'boolean' || ['true', 'false'].includes(String(e.value).toLowerCase());
            const isNum = !isBool && (!isNaN(parseFloat(e.value)) && isFinite(e.value));
            const inputId = `tfa-${i}`;
            let input = '';
            if (can('UPDATE_TWOFACTOR_CONFIGURATION')) {
              if (isBool) {
                input = `<select id="${inputId}" class="form-control" data-name="${escapeHtml(e.name)}">
                  <option value="true" ${e.value === true || e.value === 'true' ? 'selected' : ''}>true</option>
                  <option value="false" ${e.value === false || e.value === 'false' ? 'selected' : ''}>false</option>
                </select>`;
              } else if (isNum) {
                input = `<input id="${inputId}" type="number" class="form-control" data-name="${escapeHtml(e.name)}" value="${escapeHtml(String(e.value))}"/>`;
              } else {
                input = `<input id="${inputId}" class="form-control" data-name="${escapeHtml(e.name)}" value="${escapeHtml(String(e.value || ''))}"/>`;
              }
            }
            return `
              <tr>
                <td><code>${escapeHtml(e.name)}</code></td>
                <td>${escapeHtml(String(e.value ?? '—'))}</td>
                <td>${input}</td>
              </tr>`;
          }).join('')}</tbody>
        </table>

        <div class="mt-3">
          ${can('UPDATE_TWOFACTOR_CONFIGURATION') ? `<button class="btn-primary" id="btn-save-tfa">Save Changes</button>` : ''}
        </div>` : `
        <div class="empty-state">
          <i class="fa-solid fa-shield"></i>
          <h3>2FA Configuration unavailable</h3>
          <div class="text-muted">This Fineract tenant may not have two-factor authentication enabled at the platform level.</div>
        </div>`}`;

    el.querySelector('#btn-save-tfa')?.addEventListener('click', async () => {
      const payload = {};
      el.querySelectorAll('[data-name]').forEach(input => {
        let val = input.value.trim();
        // Coerce booleans and numbers back
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(parseFloat(val)) && isFinite(val) && val !== '') val = parseFloat(val);
        payload[input.dataset.name] = val;
      });
      try {
        await api.twoFactor.config.update(payload);
        toast('success', '2FA config saved', '');
        loadTwoFactorConfig(c);
      } catch (e) { toast('error', 'Save failed', extractFineractError(e)); }
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state-row text-muted">2FA configuration not available on this tenant: ${escapeHtml(extractFineractError(e))}</div>`;
  }
}
