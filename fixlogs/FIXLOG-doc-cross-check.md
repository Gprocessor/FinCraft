# Fix Log — Cross-Check Against `Apache_Fineract_API_Documentation.html`

**Status: findings pass complete; the one confirmed bug is now fixed (Checkpoint 13 below).**
`fineract_api_raw.json` is routes-only (no request/response bodies), which is why several past
fixlogs left assumptions flagged as "unconfirmed." `Apache_Fineract_API_Documentation.html` (now
in the project files) has real worked examples for a lot of those, so this pass re-checked every
open "unconfirmed" note against it. Originally logging-only; the confirmed bug below was fixed in
a follow-up pass once the fix was verified against the doc's worked example.

## Fixed (Checkpoint 13)

### `js/pages/users/security.js` `loadPasswordPolicy` — was fetching the wrong endpoint, list was always empty

This was the "one item remains open, still unconfirmed" note at the bottom of
`fixlogs/FIXLOG-users-module.md`. The doc's `password_preferences_list` / `password_preferences_update`
sections give real examples:

- `GET /passwordpreferences/` → a **single flat object**: `{ id, description, active, key }` — the
  currently-active policy only.
- `GET /passwordpreferences/template` → an **array** of every policy in that same flat shape,
  e.g. `[{id:1, description:"...", active:true, key:"simple"}, {id:2, ..., active:false, key:"secure"}]`.
- `PUT /passwordpreferences/` body: `{ "validationPolicyId": 1 }`.

Current code calls `api.password.preferences()` (→ `GET /passwordpreferences`, the single-object
form) and then tries to read `prefs.activePasswordValidationPolicy` and `prefs.policies` off it —
neither field exists on that response per the doc. Since `prefs` is a flat object, not an array,
`allPolicies` resolves to `[]` every time, so the Security tab's policy list renders as "No
password policies available" unconditionally, regardless of what's actually configured server-side.

The update call is already correct — `{ validationPolicyId: parseInt(selected.value) }` matches
the doc exactly and doesn't need to change.

**Fix applied:** `loadPasswordPolicy` now calls `api.password.preferencesTemplate()`
(`GET /passwordpreferences/template`) instead of `api.password.preferences()`, and reads the
active policy directly off the returned array's own `active` flag (`allPolicies.find(p =>
p.active)?.id`) instead of the nonexistent `activePasswordValidationPolicy`/`policies` wrapper
fields. `api.password.preferencesTemplate()` already existed in `js/api/auth-account.js` —
only the one call site in `js/pages/users/security.js` needed the swap, plus deleting the
now-unnecessary defensive multi-shape unwrapping logic. This also closes item `#4` from
`fixlogs/FIXLOG-users-module.md`'s "Verification pass" section, which flagged this same loader
as the prime suspect for the "missing policy" report but left it unconfirmed pending doc/live
verification — now confirmed and fixed.

## Worth re-verifying (medium confidence — doc contradicts a routing assumption, but context differs)

### `js/api/misc.js` `self.users()` — `GET /self/userdetails`, doc only shows this as POST

`fixlogs/FIXLOG-api-audit.md`'s backlog said self-service paths like `/self/userdetails` weren't
present anywhere in the raw extraction and couldn't be verified either way. The HTML doc does
cover it, under "Authentication Oauth2" → "Fetch Authenticated User Details": the only example
given is `POST /self/userdetails?access_token={access_token}` with no request body. Current code
calls it with `self._g(...)` (GET).

Flagging rather than fixing: the doc's example is specifically under an OAuth2 access-token flow,
which may be a distinct calling convention from the basic-auth self-service session this app
otherwise uses — it's plausible the same resource also answers GET under basic auth, or that the
doc's POST-only framing is what's actually correct and current code has been silently broken (or
silently working against a permissive server). Needs a live-server check before touching it.

**Still open (checked again, not fixed):** web-searched for corroborating evidence beyond the
doc; found nothing that settles GET vs. POST for a basic-auth self-service session. Also
confirmed via grep that `api.self.users()`/`misc.js`'s `self.users()` has **zero callers**
anywhere in the codebase — it's dead code, not a live bug, which lowers the urgency but doesn't
resolve the underlying question. Left untouched rather than guessed, consistent with this
project's policy on unconfirmed schema/verb questions.

## Still unconfirmed — doc has no coverage at all (searched, zero hits)

- **`Rate` request-body schema** (`js/pages/products/actions/rates.js`, flagged in
  `fixlogs/FIXLOG-rate-entity.md`) — no "rates" section anywhere in the HTML doc. `name` /
  `percentage` / `active` remains a best-guess based on the entity's shape elsewhere, not
  something this doc can confirm.
- **External Asset Owner sale/buy-back request body and `eaoList` query params**
  (`js/api/loans.js`, bug #6 in `fixlogs/FIXLOG-api-audit.md`) — no "external-asset-owner" or
  "buy-back" section anywhere in the doc either. Still open.
- **`groupRoles` association response shape** (used by the new `loadRoles()` in
  `js/pages/groups/detail/members.js`, per `fixlogs/FIXLOG-groups-centers-reports.md`) — the doc
  confirms the write-side (`assignRole`/`updateRole`/`unassignRole`) exactly, but has no example
  of `GET groups/{id}?associations=groupRoles`'s actual response, so the defensive field-name
  guessing (`r.id ?? r.roleId ?? r.resourceId`, etc.) in that loader is still unverified.

## New information for existing backlog items (not acted on)

- **`ReportMailingJobApiResource`** (listed as net-new/unimplemented in
  `fixlogs/FIXLOG-groups-centers-reports.md`'s backlog) is actually documented in this HTML file
  (~28 references) — unlike the routes-only `fineract_api_raw.json`, real schemas are available
  here if this feature is picked up later. `MixReportApiResource` still has zero coverage in
  either source.

## Consolidated list of everything still open across all fixlogs (not done in any prior pass)

- Bulk CSV import/export (`downloadtemplate`/`uploadtemplate`) missing across ~15 resources —
  `fixlogs/FIXLOG-bulk-import.md`.
- Entire Working Capital Loan product line, Interoperation, Credit Bureau integration, Interest
  Rate Charts (+ slabs), legacy PPI Survey/Likelihood/PovertyLine — `fixlogs/FIXLOG-api-audit.md`.
- `MixReportApiResource` and `ReportMailingJobApiResource`/`ReportMailingJobRunHistoryApiResource`
  — `fixlogs/FIXLOG-groups-centers-reports.md`.
- Group role management's unverified response-field names (see above) —
  `fixlogs/FIXLOG-groups-centers-reports.md`.
- Two duplicate/redundant API call bugs, not yet fixed: `js/modal-init.js` (payment-type and
  reschedule-reason dropdowns fetched twice, race condition on final content) and
  `js/pages/dashboard.js` (Gross Portfolio / Outstanding KPIs each re-sample the same active-loan
  list) — `fixlogs/FIXLOG-duplicate-api-calls.md`.
- Password policy loader fetching the wrong endpoint — **fixed**, see Checkpoint 13 above.
- `self.users()` verb mismatch — still open, re-checked, still unconfirmed; confirmed dead code
  (zero callers) so no live impact in the meantime (see above).
