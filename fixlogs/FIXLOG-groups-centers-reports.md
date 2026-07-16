# Fix Log — Groups, Centers, Reports: API/Namespace/Permissions Audit

**Status: closed.** Requested pass: "fix all group and centers, report apis and namespace and
also the permissions." Scope was an audit of `js/api/groups-centers.js`, `js/api/reports.js`,
namespace registration in `js/api/index.js`, and every permission code (`can('...')`) used
across `js/pages/groups/`, `js/pages/centers/`, `js/pages/reports/` — cross-checked against
`fineract_api_raw.json` and `fineract_permissions_raw.json`.

## Bug found and fixed

**`js/pages/centers/detail.js` — tab lazy-loading was completely broken.**

```js
// before (bug): referenced the object, never called it
if (lazyLoaders[name] && !lazyLoaded[name]) {
  lazyLoaders;
  lazyLoaded[name] = true;
}

// after (fixed):
if (lazyLoaders[name] && !lazyLoaded[name]) {
  lazyLoaders[name]();
  lazyLoaded[name] = true;
}
```

Effect of the bug: switching to the Groups / Meetings / Collection Sheet / Notes / Documents
tab on a Center's detail page marked the tab active but never fetched its data — every
non-default tab rendered permanently empty after the first paint. `js/pages/groups/detail/index.js`
has the equivalent logic written correctly (`lazyLoaders[name]()`), which is what made the
centers version's typo stand out on a side-by-side diff.

## Gap found and fixed (UI parity)

**Group detail page had no Delete action.** `api.groups.delete` (maps to Fineract's
`DELETE /groups/{id}`) and the `DELETE_GROUP` permission both already existed and were correctly
wired at the API/permission layer, but no button ever called them — Centers had a working
Delete button (`DELETE_CENTER`) and Groups didn't. Added a `Delete` button to the group detail
toolbar, gated on `can('DELETE_GROUP')`, with the same confirm-dialog-then-toast-then-navigate
pattern already used on the Centers page.

## Verified clean (no changes needed)

- **`js/api/groups-centers.js`**: every `GroupsApiResource` / `CentersApiResource` /
  `GroupsLevelApiResource` route used by the frontend maps correctly. Bulk template
  download/upload routes are intentionally excluded — already tracked in
  `fixlogs/FIXLOG-bulk-import.md`, not duplicated here.
- **`js/api/reports.js`**: `ReportsApiResource` list/get/create/update/delete all correct.
- **Namespace registration** (`js/api/index.js`): `api.groups`, `api.centers`, `api.groupLevels`,
  `api.reports`, `api.runReports` all present and correctly constructed — no dead or missing
  entries.
- **Router-level permission gates** (`js/router.js`): `groups` → `READ_GROUP`,
  `centers` → `READ_CENTER`, `reports` → `READ_REPORT` — all three codes confirmed present in
  `fineract_permissions_raw.json`.
- **Every in-page permission code** used across `js/pages/groups/**`, `js/pages/centers/**`,
  `js/pages/reports/**` (33 distinct codes, e.g. `ACTIVATE_CENTER`, `ASSOCIATEGROUPS_CENTER`,
  `SAVECOLLECTIONSHEET_CENTER`, `CREATE_ADHOC`, `UPDATE_REPORT`, etc.) — all exist in the
  permissions catalog, none misspelled, none missing.
- `js/pages/reports/index.js` tab-switching logic (the *reports* page, as opposed to the centers
  bug above) already calls `loaders[idx](c)` correctly.
- `js/pages/groups/actions/charges.js` intentionally has no group-charges API calls — confirmed
  there is no `GroupChargesApiResource` in the raw route list, documented in-file already.

## Follow-up (implemented in this same pass, after initial audit)

**Group role management** — originally listed below as backlog, but picked back up and
implemented once the HTML API doc (`Apache_Fineract_API_Documentation.html`) turned out to have
real request/response examples for `assignRole`/`updateRole`/`unassignRole`, resolving the
schema-verification gap that made this speculative before:

- `groups_assignRole` doc example confirms body `{ clientId, role }` where `role` is a
  `GROUPROLE` system-code-value id — matches `js/api/groups-centers.js`'s existing
  `assignRole(id, body)` exactly, so no API-layer change was needed.
- `groups_updateRole` confirms `?command=updateRole&roleId=N` with body `{ role: <new code value id> }`.
- `groups_unassignRole` confirms `?command=unassignRole&roleId=N` with an empty body.
- Added `loadRoles()` in `js/pages/groups/detail/members.js` (rendered under a new "Member
  Roles" section on the group detail Members tab, fetching `associations=groupRoles`) and
  `openAssignRoleModal()` in `js/pages/groups/actions/members.js` (handles both assign and
  update, sourcing role options from `api.codes.valuesByName('GROUPROLE')` — the same code-value
  shape `{id, name, ...}` already relied on elsewhere in the app, e.g.
  `js/pages/system/actions/config.js`).
- The exact field names inside each `groupRoles` list entry (e.g. whether the assignment id is
  `.id` or `.roleId`) are still not shown by an example in the doc, so `loadRoles()` reads them
  defensively across a few plausible names — same pattern already used for `glimAccounts`/
  `gsimAccounts` just above it in the same file. Worth a quick check against a live server the
  first time this is exercised.

## Backlog (net-new, not bugs — not touched this pass)
 (`GET /v1/mixreport`) and **`ReportMailingJobApiResource`** /
  **`ReportMailingJobRunHistoryApiResource`** are entirely unimplemented — zero frontend surface,
  zero API wrapper. Net-new features, not regressions.

## Verification

- `node --check` across all 296 `.js` files: 0 failures.
- `npm test`: 4/4 suites passing, including `module-integrity` (916 exported functions across
  296 files — count shifted from 897→916 due to the new group-delete handler and related code,
  not a regression).
