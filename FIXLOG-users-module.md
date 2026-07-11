# Fix Log — Users Module

Scope: `js/pages/users/**` (Users tab, Roles & Permissions tab, Password Policy tab,
Two-Factor Auth tab) and the API layers backing it, `js/api/admin.js`
(`makeUsersAPI`, `makeRolesAPI`, `makePermissionsAPI`) and `js/api/auth-account.js`
(`makePasswordAPI`, `makeTwoFactorAPI`, `makeTenantOidcAPI`, `makeUserDetailsAPI`).

Method: every endpoint call was cross-checked against `fineract_api_raw.json`
(`UsersApiResource`, `RolesApiResource`, `PermissionsApiResource`,
`PasswordPreferencesApiResource`, `ForgotPasswordApiResource`,
`TwoFactorApiResource`, `TwoFactorConfigurationApiResource`,
`TenantOidcConfigApiResource`, `UserDetailsApiResource`), and every `can('...')`
permission code was cross-checked against `fineract_permissions_raw.json`.

## Bugs found & fixed

### 1. Admin "Reset Password" hit the wrong endpoint
**File:** `js/pages/users/account/detail.js` → `openResetPasswordModal()`

Was calling `api.users.update(userId, payload)` → `PUT /v1/users/{userId}`.
Fineract has a dedicated `POST /v1/users/{userId}/pwd` endpoint for password
changes (`UsersApiResource#changePassword`), already correctly wired up as
`api.password.change()` and already used correctly elsewhere in the codebase
(`js/auth.js` self-service change-password flow). The admin reset-password
modal was the one place still using the generic update endpoint — which the
API layer's own code comment warns isn't guaranteed to validate a password
change the same way.

**Fix:** call `api.password.change(userId, payload)` instead.

Also re-gated the "Reset Password" button from `can('UPDATE_USER')` to
`can('CHANGEPWD_USER')` — the permission code Fineract actually enforces on
`POST /users/{id}/pwd` (added in `0173_user_change_pwd.xml`). Previously a
user with `CHANGEPWD_USER` but not `UPDATE_USER` would never see the button;
a user with `UPDATE_USER` but not `CHANGEPWD_USER` would see it and get a
403 on click.

### 2. Role "Save Permissions" screen gated on the wrong permission
**File:** `js/pages/users/roles.js` → `renderRoleDetail()`

The permission-matrix editor (Save Permissions button, Select All / Clear
All / Read-only Only, per-group Toggle All, and every individual checkbox)
was gated on `can('UPDATE_ROLE')`. That's the permission for renaming/
describing a role (`PUT /roles/{roleId}`, plain `RoleCommand`). The screen
actually calls `PUT /roles/{roleId}/permissions`
(`RolesApiResource#updateRolePermissions`), which Fineract enforces under
`PERMISSIONS_ROLE` — a distinct permission code present in
`fineract_permissions_raw.json` (`grouping: authorisation, entity: ROLE,
action: PERMISSIONS`) that exists specifically so permission management can
be delegated separately from basic role editing.

**Fix:** changed all four `can('UPDATE_ROLE')` checks inside the permission
matrix to `can('PERMISSIONS_ROLE')`. The one `can('UPDATE_ROLE')` check that
gates the actual "Edit" (name/description) button on the roles list was left
untouched — that one is correct as-is.

## Verified clean (no changes needed)

- `js/pages/users/account/list.js` — CREATE_USER / READ_USER / UPDATE_USER /
  DELETE_USER gating all correct; `api.users.list/create/update/delete` all
  map to the correct verbs/paths.
- `js/pages/users/roles.js` list view — CREATE_ROLE / READ_ROLE / UPDATE_ROLE
  / DISABLE_ROLE / ENABLE_ROLE / DELETE_ROLE all correct.
- `js/pages/users/security.js` — password-preferences and 2FA-config
  endpoints and `UPDATE_PASSWORD_PREFERENCES` / `UPDATE_TWOFACTOR_CONFIGURATION`
  gating all correct.
- Every permission code referenced anywhere in the module now exists in
  `fineract_permissions_raw.json` (14/14 checked programmatically).
- Every Fineract call made by `makeUsersAPI`, `makeRolesAPI`,
  `makePermissionsAPI`, `makePasswordAPI`, `makeTwoFactorAPI`,
  `makeTenantOidcAPI`, `makeUserDetailsAPI` matches a real route in
  `fineract_api_raw.json`.

## Noted, not fixed in this pass (different modules — will hit these when we get there)

- `js/pages/self-service/portal-users.js` — the portal-user "Reset Password"
  modal has the exact same bug as fix #1 (`api.users.update` instead of
  `api.password.change`). Belongs to the Self-Service module.
- `js/pages/misc/profile.js` — the logged-in user's own "change my password"
  form also calls `api.users.update(auth.userId, {password, repeatPassword})`
  instead of `api.password.change()`. Belongs to the Misc/Profile module.
- `TwoFactorApiResource#updateConfiguration` (`POST /twofactor/invalidate`,
  permission `INVALIDATE_TWOFACTOR_ACCESSTOKEN`) has no API binding or UI
  anywhere — a genuine gap, not a bug, deferred as a possible future
  enhancement to the 2FA tab.
- `js/ui/handlers/user.js` (`UserHandlers['submit-user']`) is a second,
  legacy code path for creating a user (used by the old `modals.html` /
  `modal-init.js` quick-action system, parallel to
  `pages/users/account/detail.js:openUserFormModal`). Its `api.users.create`
  call is correct as written, but it's a duplicate implementation worth
  flagging for consolidation later.
