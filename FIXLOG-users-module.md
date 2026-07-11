# Fix Log — Users Module

Scope: `js/pages/users/**` (Users tab, Roles & Permissions tab, Password Policy tab,
Two-Factor Auth tab) and the API layers backing it, `js/api/admin.js`
(`makeUsersAPI`, `makeRolesAPI`, `makePermissionsAPI`) and `js/api/auth-account.js`
(`makePasswordAPI`, `makeTwoFactorAPI`, `makeTenantOidcAPI`, `makeUserDetailsAPI`).
Widened on request to also cover the same password-reset and 2FA flows
wherever they appear elsewhere in the app: `js/pages/self-service/portal-users.js`,
`js/pages/misc/profile.js`, and `js/auth.js` (logout).

Method: every endpoint call was cross-checked against `fineract_api_raw.json`
(`UsersApiResource`, `RolesApiResource`, `PermissionsApiResource`,
`PasswordPreferencesApiResource`, `ForgotPasswordApiResource`,
`TwoFactorApiResource`, `TwoFactorConfigurationApiResource`,
`TenantOidcConfigApiResource`, `UserDetailsApiResource`), and every `can('...')`
permission code was cross-checked against `fineract_permissions_raw.json`.
The 2FA-invalidate request/response shape was confirmed against Fineract's
published API docs (https://fineract.apache.org/docs/legacy/) since neither
raw JSON captures request bodies.

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

### 3. Self-service portal-user "Reset Password" hit the wrong endpoint
**File:** `js/pages/self-service/portal-users.js` → `openResetPortalPasswordModal()`

Same bug as fix #1: called `api.users.update(userId, payload)` instead of the
dedicated `POST /users/{userId}/pwd` endpoint.

**Fix:** call `api.password.change(userId, payload)` instead. Also re-gated
the "Reset Password" button from `can('UPDATE_USER')` to `can('CHANGEPWD_USER')`,
same reasoning as fix #1. The adjacent "Unlock" button correctly stays on
`api.users.update` / `UPDATE_USER` — unlocking (`accountNonLocked`) is a
genuine field on the generic user-update resource, not a password change.

### 4. Profile page "change my password" hit the wrong endpoint
**File:** `js/pages/misc/profile.js` → change-password handler

Same bug again: called `api.users.update(auth.userId, {password, repeatPassword})`
instead of `api.password.change()`. Self-service flow, no permission gating
needed — matches the pattern already used correctly in `js/auth.js`.

**Fix:** call `api.password.change(auth.userId, payload)` instead.

### 5. 2FA access token was never invalidated on logout
**Files:** `js/api/auth-account.js` (`makeTwoFactorAPI`), `js/auth.js` (`logout()`)

`TwoFactorApiResource` exposes `POST /twofactor/invalidate` with body
`{ "token": "<tfaToken>" }`. Fineract's own API docs state plainly:
"Two factor access tokens should be invalidated on logout." There was no
binding for this endpoint anywhere in the codebase, and `logout()` only
ever cleared local session state — the token stayed valid server-side after
sign-out.

**Fix:** added `api.twoFactor.invalidate(token)` and call it best-effort
(fire-and-forget, errors swallowed) from `logout()` before clearing the
session, when a `tfaToken` is present. Verified the header-building in
`api/core.js` happens synchronously before the `fetch()` call, so the
request goes out with the correct auth headers before `api.reset()` runs on
the next line — ordering is safe.

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

## Noted, not fixed in this pass

- `js/ui/handlers/user.js` (`UserHandlers['submit-user']`) is a second,
  legacy code path for creating a user (used by the old `modals.html` /
  `modal-init.js` quick-action system via the Cmd+K "New User" command,
  parallel to `pages/users/account/detail.js:openUserFormModal`). Its
  `api.users.create` call is correct as written (`POST /v1/users`, verified
  against `UsersApiResource` in `fineract_api_raw.json`) — not a bug, just a
  duplicate implementation worth consolidating later.
- The Cmd+K "New User" command (`js/cmd.js`, `id:'create:user'`) opens that
  same legacy modal with **no `CREATE_USER` permission check** — a user
  without `CREATE_USER` can reach the form via the command palette and get a
  403 on submit, instead of never seeing the option (the equivalent button
  on the Users tab list *is* correctly gated). Not fixed here: all 15
  `create:*` entries in `cmd.js` have this same gap (client, loan, savings,
  staff, office, …) — `cmd.js` doesn't import `can` at all. This is a
  cross-cutting command-palette issue, not specific to the user module, and
  fixing just `create:user` in isolation would leave 14 inconsistent
  siblings. Flagging for a dedicated command-palette/global-search pass.
