# Fix Log — Create⇒Approve/Activate Chaining, Group↔Center Linkage, Client Center/Group Cascade

**Scope:** extends the "approval also activates" pattern from
`FIXLOG-buttons-theme-activation-audit.md` to the *creation* step itself, makes
Group creation mandatorily attach to a Center, and adds an optional Center →
Group cascade to Client creation.

## 1. "Create" now also chains Approve → Activate (opt-out checkbox)

Same four modules that have a genuine separate Approve/Activate lifecycle
(Savings, Fixed Deposits, Recurring Deposits, Share accounts — see the prior
fixlog for why only these four qualify). Each "New …" modal now has an
**"Also approve & activate immediately"** checkbox, checked by default:

- `views/modals/savings-deposits.html` — `newSavingsForm`, `newFDForm`, `newRDForm`
- `views/modals/shares.html` — `newShareForm`
- Handlers: `js/ui/handlers/savings.js`, `fixed-deposit.js`, `recurring-deposit.js`,
  `share-account.js`

Chain order: **create → approve → activate**, each step gated on the previous
one succeeding. The approval/activation date reuses the form's own submitted
date (`submittedOnDate` for savings/FD/RD, `submittedDate` for shares) since
Fineract requires `approvedOnDate ≥ submittedOnDate` and
`activatedOnDate ≥ approvedOnDate` — same-day for all three is always valid.
If approve or activate fails partway, a distinct warning toast explains
exactly which step failed and the account is left in whatever state the last
successful step produced (never silently lost); unchecking the box restores
the previous single-step "submit for approval" behavior exactly.

Field-name note: shares use `approvedDate`/`activatedDate` (not
`approvedOnDate`/`activatedOnDate` like the other three) — carried over
correctly from the existing `openShareSimpleCmd` implementation.

## 2. Groups and Centers — "create" now also chains Activate

Same opt-out-checkbox pattern, but only one step (Groups/Centers have no
separate Approve step in Fineract — confirmed in the prior fixlog). Added
**"Also activate immediately"** to `newGroupForm` and `newCenterForm`
(`views/modals/groups-centers.html`), wired in `js/ui/handlers/group.js` /
`center.js`. Activation date reuses `submittedOnDate`.

## 3. Group creation is now required to be attached to a Center

`newGroupForm` gets a mandatory **Center** dropdown (`views/modals/groups-centers.html`,
populated via the new `data-populate="centers"` hook in `js/ui/modal-dropdowns.js`).

**Important schema finding:** `GroupsApiResource`'s `POST /groups` has no
documented `centerId` create-time field — the "Mandatory/Optional Fields"
table for Create a Group lists only `name, officeId, active, activationDate`
/ `externalId, staffId, clientMembers` (checked against
`Apache_Fineract_API_Documentation.html`). The only *confirmed* way to attach
a group to a center is the Center's own `associateGroups` command
(`POST /centers/{centerId}?command=associateGroups`, body
`{ groupMembers: [...] }`) — already used and working elsewhere in this app
for the Center detail page's "Associate Groups" button. So `submit-group` now
does: **create group → associate it to the selected center → (optionally)
activate**. If the association call fails, the group still exists (not
silently lost) and a distinct warning toast says so; the existing manual
"Associate Groups" flow on the Center detail page remains as a fallback.

Selecting a Center also auto-fills (doesn't lock) the Office dropdown to that
center's `officeId`, since a group's office needs to sit within its center's
office hierarchy — still editable if a sub-office is needed.

## 4. Client creation — optional Center/Group cascade

`newClientModal` gets a **Center** dropdown (UI-only, not sent to the API —
just a filter) and a **Group** dropdown that's hidden until a Center is
picked. Wiring lives in `js/modal-init.js`:

- Center empty → Group field hidden, not required, `groupId` omitted from payload.
- Center selected → fetches that center's groups via
  `api.centers.get(centerId, { associations: 'groupMembers' })` (same call the
  Center detail page already uses), reveals the Group field, and makes it
  required.
- `js/ui/handlers/clients.js` sends `groupId` in the create payload when set —
  confirmed as a real optional field on `ClientsApiResource` (`groupId,
  externalId, accountNo, staffId, mobileNo, savingsProductId, genderId,
  clientTypeId, clientClassificationId`).

Neither Center nor Group is mandatory for client creation, per the request —
only Group becomes required *after* a Center has been chosen.

## Verification
- `node --check` passed on every edited file (`savings.js`, `fixed-deposit.js`,
  `recurring-deposit.js`, `share-account.js`, `group.js`, `center.js`,
  `clients.js`, `modal-dropdowns.js`, `modal-init.js`).
- Test suite: 3/3 passing (`utils.test.js` fails in this sandbox only because
  `jsdom` isn't installed — pre-existing environment gap, unrelated to this
  change; confirmed the failure is inside `js/store.js` at import time, a file
  untouched by this checkpoint).

## Standing unconfirmed assumption (flag for next checkpoint if the server rejects it)
- Group's lack of a `centerId` create field is inferred from the API doc's
  Mandatory/Optional Fields table, not from a live server round-trip (routes
  in `fineract_api_raw.json` carry no body schemas — same caveat as the Rate
  entity in `FIXLOG-rate-entity.md`). If a live Fineract instance *does*
  accept `centerId` directly on `POST /groups`, the extra `associateGroups`
  call in step 3 is harmless (idempotent — same end state) but redundant.

## 5. Bug found & fixed: every dashboard chart was broken (`chartJsPromise is not defined`)

**Files:** `js/pages/dashboard/charts.js`, `js/pages/dashboard/data.js`

Reported by the user via a screenshot showing every dashboard chart widget
stuck on "Chart library failed to load — check your connection." Root cause:
`js/pages/dashboard/charts.js`'s `loadChartJs()` reads/assigns a
`chartJsPromise` variable that was never declared in that file — ES modules
are strict mode, so this threw `ReferenceError: chartJsPromise is not
defined` the instant any dashboard chart tried to render.

This was a leftover from a prior refactor: `js/pages/dashboard/data.js` still
had an orphaned `let chartJsPromise = null;` sitting dead at the very end of
the file (unused there), while the actual `loadChartJs()` function that
needed that declaration had moved to `charts.js` without it.
`js/pages/analytics.js` has its own correct, independent
`let chartJsPromise = null;`, which is why the Analytics page's charts were
never affected — only the dashboard was broken.

**Fix:** added `let chartJsPromise = null;` at module scope in `charts.js`
(above `loadChartJs()`), and removed the dead declaration from `data.js`.
