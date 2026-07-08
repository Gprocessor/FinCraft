/* FinCraft · pages/system/loaders/oidc.js
   Wires the previously-unused api.tenantOidc namespace (audit item 3) into a System
   settings panel. That namespace is CRUD for a tenant's *OIDC configuration record*
   (issuer, client id, etc.) — it is not an authorization-code/redirect flow, so this
   is an admin config form (matching the shape of the real API), not a "Sign in with
   SSO" login button. Fineract itself still authenticates via Basic auth in this app;
   this panel lets an admin record/update the OIDC settings the platform stores for
   the tenant, ahead of any future SSO login work. */

import { api } from '../../../api.js';
import { store } from '../../../store.js';
import { can } from '../shared.js';
import { escapeHtml } from '../../../utils.js';
import { toast } from '../../../ui.js';

export async function loadTenantOidc(c) {
  const el = c.querySelector('#sy-15');
  const auth = store.get('auth') || {};
  const tenantId = auth.tenantId || 'default';
  const canEdit = can('UPDATE_ROLE') || can('ALL_FUNCTIONS'); // TenantOidcConfigApiResource PUT is gated by UPDATE_ROLE per source

  el.innerHTML = '<div class="empty-state-row">Loading OIDC configuration…</div>';

  let cfg = null;
  let exists = true;
  try {
    cfg = await api.tenantOidc.get(tenantId);
  } catch (e) {
    if (e.status === 404) { exists = false; cfg = {}; }
    else { el.innerHTML = `<div class="text-error">${escapeHtml(e.message)}</div>`; return; }
  }

  const v = (k) => escapeHtml(String(cfg?.[k] ?? ''));

  el.innerHTML = `
    <div class="section-header mb-2">
      <div>
        <h3>Tenant SSO / OIDC Configuration</h3>
        <span class="text-muted">Tenant: <code>${escapeHtml(tenantId)}</code> · ${exists ? 'Configured' : 'Not configured'}</span>
      </div>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      Records this tenant's OIDC identity-provider settings for future SSO login support. Sign-in in FinCraft
      currently still uses your Fineract username &amp; password regardless of what's saved here.
    </div>
    <form class="form-grid" id="oidc-form">
      <label class="full"><span class="form-label">Issuer URL</span>
        <input name="issuerUri" class="form-control" placeholder="https://idp.example.com/" value="${v('issuerUri')}" ${canEdit ? '' : 'disabled'}/></label>
      <label><span class="form-label">Client ID</span>
        <input name="clientId" class="form-control" value="${v('clientId')}" ${canEdit ? '' : 'disabled'}/></label>
      <label><span class="form-label">Client Secret</span>
        <input name="clientSecret" type="password" class="form-control" placeholder="${exists ? '••••••••' : ''}" ${canEdit ? '' : 'disabled'}/></label>
      <label class="full"><span class="form-label">Redirect URI</span>
        <input name="redirectUri" class="form-control" value="${v('redirectUri')}" ${canEdit ? '' : 'disabled'}/></label>
      ${canEdit ? `
        <div class="full" style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="btn-primary"><i class="fa-solid fa-check"></i> ${exists ? 'Update' : 'Save'} configuration</button>
          ${exists ? `<button type="button" class="btn-ghost" id="oidc-delete"><i class="fa-solid fa-trash"></i> Remove configuration</button>` : ''}
        </div>` : ''}
    </form>`;

  const form = el.querySelector('#oidc-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      issuerUri: fd.get('issuerUri') || undefined,
      clientId: fd.get('clientId') || undefined,
      redirectUri: fd.get('redirectUri') || undefined,
      ...(fd.get('clientSecret') ? { clientSecret: fd.get('clientSecret') } : {})
    };
    try {
      if (exists) await api.tenantOidc.update(tenantId, body);
      else        await api.tenantOidc.create(tenantId, body);
      toast('success', 'OIDC configuration saved');
      loadTenantOidc(c);
    } catch (ex) {
      toast('error', 'Save failed', ex.detail?.defaultUserMessage || ex.message);
    }
  });

  el.querySelector('#oidc-delete')?.addEventListener('click', async () => {
    try {
      await api.tenantOidc.delete(tenantId);
      toast('success', 'OIDC configuration removed');
      loadTenantOidc(c);
    } catch (ex) {
      toast('error', 'Remove failed', ex.detail?.defaultUserMessage || ex.message);
    }
  });
}
