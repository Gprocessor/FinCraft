/* FinCraft · pages/groups/actions/charges.js
   Removed: openApplyChargeModal / openPayChargeModal called Fineract's
   GroupsApiResource /charges sub-path, which doesn't exist (confirmed by
   reading the full @Path list in GroupsApiResource.java — there is no
   GroupChargesApiResource, unlike ClientChargesApiResource for clients).
   Apply charges to the group's individual member clients instead. */
