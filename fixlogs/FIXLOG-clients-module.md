# Fix Log — Clients Module Audit (Checkpoint 09)

**Scope:** `js/api/clients.js`, `js/pages/clients/**`, `js/ui/handlers/clients.js`.
Every `self._g/_p/_u/_d()` call in `api/clients.js` diffed against
`ClientsApiResource` / `ClientChargesApiResource` / `ClientIdentifiersApiResource` /
`ClientAddressApiResource` / `ClientFamilyMembersApiResource` /
`ClientTransactionsApiResource` / `ClientCollateralManagementApiResource` in
`fineract_api_raw.json`, including each resource's real `commands[]` array (not just
the URL shape). Every `can('...')` gate in the module cross-checked against
`fineract_permissions_raw.json`'s `entity`/`action` fields, and against how the same
permission code is used elsewhere in the app (e.g. the separate Organization >
Collateral Types module) to catch codes that are valid permissions but the *wrong*
one for the call site.

## Bugs found & fixed

### 1. "Withdraw application" sent an unsupported command
**Files:** `js/api/clients.js`, `js/pages/clients/detail/index.js`

`ClientsApiResource`'s real command for this transition is `withdraw`
(`WITHDRAW_CLIENT` permission, `withdrawClient` builder call) — confirmed against
its `commands[]` list, which contains `withdraw` and does **not** contain
`withdrawnByApplicant`. `withdrawnByApplicant` is the command name used by the
*loan* and *savings* application-withdrawal endpoints; it doesn't exist on
`ClientsApiResource`. The button is wired live in the client detail kebab menu and
was correctly permission-gated on `WITHDRAW_CLIENT`, but every click would have
sent `?command=withdrawnByApplicant` and Fineract would reject it as an
unsupported command.

**Fix:** renamed `api.clients.withdrawnByApplicant()` → `api.clients.withdraw()`,
sending `?command=withdraw`. Updated the one call site.

### 2. "Undo transfer" sent a command that doesn't exist on `ClientsApiResource`
**Files:** `js/api/clients.js`

There is no `undoTransfer` command and no `UNDOTRANSFER_CLIENT` permission
anywhere in the ground-truth data. Cancelling a client's pending office transfer
is the `withdrawTransfer` command (`WITHDRAWTRANSFER_CLIENT` permission,
`withdrawClientTransferRequest` builder call) — which is exactly the permission
the "Undo transfer" button was already (correctly) gated on in
`detail/index.js`, confirming the intent; only the command string sent to the
API was wrong.

**Fix:** `api.clients.undoTransfer(id)` now sends `?command=withdrawTransfer`.
Kept the function name (`undoTransfer`) since that's the accurate UX label for
what the button does; no caller changes needed.

### 3. "Mark as Fraud" was a fabricated feature — no such client endpoint exists
**Files:** `js/api/clients.js`, `js/pages/clients/detail/index.js`

Fineract has a fraud flag at the **loan** level only (`SETFRAUD_LOAN`
permission, `markAsFraud` builder call under `LoansApiResource`'s
`modifyLoanApplication` PUT). There is no equivalent for `CLIENT` anywhere in
`fineract_permissions_raw.json` or `ClientsApiResource` — no permission, no
command, no field. The kebab-menu "Mark as fraud" button (gated on the
unrelated `UPDATE_CLIENT` permission, since no real permission for this exists)
called `api.clients.markAsFraud(id, { isFraud: !cl.isFraud })` against
`?command=markAsFraud`, which Fineract would reject outright. This has never
worked.

**Fix:** removed the feature entirely — `markAsFraud()` from the API layer, the
`canMarkFraud` flag, the kebab menu item, and its click handler. This is a
genuine capability gap on Fineract's side (client-level fraud flagging doesn't
exist), not a URL/command typo, so there's nothing correct to redirect it to.

### 4. Client-collateral actions gated on the wrong (org-level) permission codes
**Files:** `js/pages/clients/detail/index.js`, `js/pages/clients/detail/identity.js`

`CREATE_COLLATERAL_PRODUCT` / `UPDATE_COLLATERAL_PRODUCT` /
`DELETE_COLLATERAL_PRODUCT` (entity `COLLATERAL_PRODUCT`) govern the
organisation-wide collateral *type catalogue* — already correctly used for that
purpose by `js/pages/collateral/list.js` and `detail.js` (Organization >
Collateral Types). Attaching/editing/removing a collateral record on an
individual client goes through `ClientCollateralManagementApiResource`, gated
by the distinct `CREATE_CLIENT_COLLATERAL_PRODUCT` /
`UPDATE_CLIENT_COLLATERAL_PRODUCT` / `DELETE_CLIENT_COLLATERAL_PRODUCT`
permissions (entity `CLIENT_COLLATERAL_PRODUCT`) — the client detail page was
reusing the org-level codes instead. Net effect: a user with rights to manage
the collateral catalogue but not client-collateral rights would incorrectly
see Add/Edit/Remove collateral on a client profile (and 403 on click); a user
with real client-collateral rights but not catalogue-admin rights would have
the buttons wrongly hidden.

**Fix:** swapped all three call sites (`btn-add-collateral` in
`detail/index.js`; `data-edit-coll`/`data-del-coll` gating in
`detail/identity.js`) to the `CLIENT_COLLATERAL_PRODUCT` permission family.

### 5. "Add Address" / "Add Family Member" gated on the generic `CREATE_CLIENT` permission
**Files:** `js/pages/clients/detail/index.js`

Both sub-resources have their own dedicated permissions —
`CREATE_ADDRESS` (entity `ADDRESS`) and `CREATE_FAMILYMEMBERS` (entity
`FAMILYMEMBERS`) — consistent with how every other add-on-a-client button in
the same tab bar (`CREATE_CLIENTCHARGE` for charges, `CREATE_CLIENTIDENTIFIER`
for identifiers) is already scoped to its own entity rather than the blanket
client-update permission. Using `CREATE_CLIENT` (which every client-creating
user has, and which has nothing to do with granting a role read-only client
access plus address/family-editing rights) both over- and under-grants
visibility relative to what the backend will actually accept.

**Fix:** `btn-add-address` → `CREATE_ADDRESS`; `btn-add-family` →
`CREATE_FAMILYMEMBERS`.

### 6. "Remove" family member gated on `DELETE_CLIENT`
**Files:** `js/pages/clients/detail/identity.js`

Same pattern as #5 — a dedicated `DELETE_FAMILYMEMBERS` permission
(entity `FAMILYMEMBERS`) exists and is what `ClientFamilyMembersApiResource`'s
delete route actually needs; gating the row-level "Remove" button on
`DELETE_CLIENT` (which permits deleting the *entire client record*, a far more
dangerous grant) would show the button to a strict subset of the wrong users
and could give a user with client-delete rights but not family-member rights a
button that 403s.

**Fix:** `data-del-fam` gating → `DELETE_FAMILYMEMBERS`.

### 7. "Assign staff" gated on an unrelated permission
**Files:** `js/pages/clients/detail/index.js`

`canAssign` was `can('UPDATESAVINGSACCOUNT_CLIENT') || can('ASSIGNSTAFF_CLIENT')
|| can('UPDATE_CLIENT')`. `UPDATESAVINGSACCOUNT_CLIENT` (entity `CLIENT`,
action `UPDATESAVINGSACCOUNT`) governs changing which savings account is a
client's linked default account — completely unrelated to staff assignment. A
user holding only that permission would see "Assign staff" in the kebab menu
and have the call rejected. The modal itself calls either `assignStaff()` or
`unassignStaff()` depending on selection, which need `ASSIGNSTAFF_CLIENT` and
`UNASSIGNSTAFF_CLIENT` respectively.

**Fix:** `canAssign` now reads `can('ASSIGNSTAFF_CLIENT') ||
can('UNASSIGNSTAFF_CLIENT')` — precisely the two permissions the modal's two
possible outcomes require.

## Flagged, not fixed (backlog — net-new feature gaps, not bugs)

- **`READ_ACCOUNTTRANSFER` gating the "Standing Instructions" tab** looks
  mismatched at first read (`READ_STANDINGINSTRUCTION` exists and looks like
  the "correct" code), but this is an app-wide convention — `groups/detail`
  and `savings/detail` gate their own Standing Instructions tabs on the exact
  same code. Left as-is; if it's wrong, it's wrong everywhere and belongs in
  its own cross-module pass, not a clients-specific fix.

## Verified correct (no action needed)

- All `/clients/{id}/charges`, `/identifiers`, `/familymembers`,
  `/collaterals`, `/transactions` CRUD calls in `api/clients.js` match their
  respective API resources exactly, including the deliberately-singular
  `/client/{id}/addresses` path (Fineract's own inconsistency, not a typo).
  `activate`/`close`/`reject`/`reactivate`/`proposeTransfer`/`acceptTransfer`/
  `rejectTransfer`/`assignStaff`/`unassignStaff` command strings all match
  `ClientsApiResource`'s real `commands[]` list.
  `PAY_CLIENTCHARGE`/`WAIVE_CLIENTCHARGE`/`DELETE_CLIENTCHARGE`/
  `CREATE_CLIENTCHARGE`/`DELETE_CLIENTIDENTIFIER`/`CREATE_CLIENTIDENTIFIER`
  gating all correctly scoped to their own entities.
- Standing Instructions tab correctly omits a delete action with an inline
  comment explaining `StandingInstructionApiResource` has no DELETE route —
  this was already right, not touched.
- `READ_AUDIT` gating on the client History panel — already right, not
  touched.

---

# Checkpoint 10 — closing the remaining backlog

## 8. Built out the missing "Edit address" feature
**Files:** `js/api/clients.js`, `js/pages/clients/actions/identity.js`,
`js/pages/clients/detail/identity.js`

`ClientAddressApiResource` supports `PUT /client/{clientid}/addresses`
(`updateClientAddress`, gated by `UPDATE_ADDRESS`), but the frontend only ever
implemented create/read — the addresses table was fully read-only with no way
to correct a typo or update a moved address short of deleting and re-adding
(and there's no delete route either, so that wasn't even an option). This is
the last standard CRUD action clients was missing relative to every sibling
sub-resource tab (identifiers, family members, collateral, charges all have
working edit/delete rows already).

**Added:**
- `api.clients.updateAddress(id, body)` → `PUT /client/{id}/addresses`. The
  route has no `{addressId}` path segment (same URL as create), so the address
  being targeted is identified by `addressTypeId` in the body — Fineract only
  stores one address per type per client, matching how `createAddress` already
  works. Documented inline since it's not obvious from the route shape alone.
- `openEditAddressModal(clientId, address, onSuccess)` in
  `actions/identity.js`, mirroring `openAddAddressModal` but pre-filled from
  the existing record and with the address type shown read-only (changing it
  would target a different address record entirely, not rename this one).
- An "Edit" column in the addresses table in `detail/identity.js`, gated on
  `UPDATE_ADDRESS` (the permission the real PUT route actually requires),
  wired via the same lazy-import-on-click pattern already used for the
  collateral edit button in the same file.

Addresses now have full create + read + update coverage, matching what
Fineract's API actually supports (there genuinely is no delete route for
client addresses, so that gap is correctly permanent, not a bug).

## 9. Removed dead, silently-broken `images()`/`documents()` from `api/clients.js`
**Files:** `js/api/clients.js`

`clients.images(id)` and `clients.documents(id)` called
`GET /clients/{id}/images` / `GET /clients/{id}/documents` through `self._g()`,
which expects and parses a JSON response. `ImagesApiResource`'s GET route
returns the raw image bytes (that's the whole point of the endpoint — it's how
`loadClientPhoto` actually fetches a photo, via the *generic*
`api.images.get('clients', id)` which is written to handle a binary response).
Had anything ever called `api.clients.images()`, JSON-parsing an image
response would have thrown. Confirmed zero callers anywhere in the codebase —
the working generic `api.images`/`api.documents` (entity-agnostic, used
throughout `detail/index.js` and `notes-docs.js`) fully cover this already.

**Fix:** removed both. No caller changes needed since nothing called them.

Left `obligeeDetails()`, `transferProposalDate()`, `familyMemberTemplate()`,
`chargeTemplate()`, and `identifierTemplate()` in place — unlike
`images()`/`documents()` these are correctly-implemented, functional routes
that are simply unused because the UI deliberately reuses the one big
`/clients/template` payload instead of hitting each resource-specific template
endpoint separately. That's a design choice, not a bug, so there's nothing to
fix; removing working code that costs nothing to keep isn't in scope here.

## Backlog status after this pass

Both previously-flagged gaps are now closed: Edit Address is built and wired
end-to-end, and the shadow-duplicate dead code is gone. The only remaining
open item is the `READ_ACCOUNTTRANSFER`/Standing-Instructions-tab permission
question above, which is intentionally out of scope for a clients-only pass
since it's an app-wide pattern, not specific to this module.
