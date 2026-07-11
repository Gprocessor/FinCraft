/* FinCraft · api/auth-account.js — User session details, password management, two-factor auth, and tenant SSO/OIDC config.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeUserDetailsAPI(self) {
  return {
    self: () => self._g('/userdetails')
  };
}

export function makePasswordAPI(self) {
  return {
    /** Trigger a password-reset email; payload depends on tenant config. */
    forgot:      (body)         => self._p('/password/forgot', body),
    /** Change a user's password — also used for self change-password.
     *  Fineract exposes a dedicated POST /users/{userId}/pwd for this; the
     *  generic PUT /users/{userId} update endpoint is a different resource
     *  and is not guaranteed to accept/validate a password change the same way. */
    change:      (userId, body) => self._p(`/users/${userId}/pwd`, body),
    /** Active password policy. */
    preferences: ()             => self._g('/passwordpreferences'),
    preferencesTemplate: ()     => self._g('/passwordpreferences/template'),
    updatePreferences: (body)   => self._u('/passwordpreferences', body)
  };
}

export function makeTwoFactorAPI(self) {
  return {
    methods:  ()       => self._g('/twofactor'),
    request:  (params) => self._req('POST', '/twofactor',          { params }),
    validate: (token)  => self._req('POST', '/twofactor/validate', { params: { token } }),
    /** Invalidate a 2FA access token — Fineract's docs specify this should
     *  be called on logout: POST /twofactor/invalidate { "token": "..." }. */
    invalidate: (token) => self._p('/twofactor/invalidate', { token }),
    config:   {
      get:    ()  => self._g('/twofactor/configure'),
      update: (b) => self._u('/twofactor/configure', b)
    }
  };
}

export function makeTenantOidcAPI(self) {
  return {
    get:    (tenantId)    => self._g(`/tenants/${tenantId}/oidc-config`),
    create: (tenantId, b) => self._p(`/tenants/${tenantId}/oidc-config`, b),
    update: (tenantId, b) => self._u(`/tenants/${tenantId}/oidc-config`, b),
    delete: (tenantId)    => self._d(`/tenants/${tenantId}/oidc-config`)
  };
}
