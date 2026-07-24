/* FinCraft · api/clients.js — Client (customer) records.
   Auto-split from the original monolithic api.js for maintainability. */

import { DATE_FORMAT, LOCALE } from '../config.js';

export function makeClientsAPI(self) {
  return {
    list:     (params)        => self._g('/clients', params),
    get:      (id, params)    => self._g(`/clients/${id}`, params),
    template: ()              => self._g('/clients/template'),
    create:   (body)          => self._p('/clients', body),
    update:   (id, body)      => self._u(`/clients/${id}`, body),
    activate: (id, date)      => self._p(`/clients/${id}?command=activate`, { activationDate: date, dateFormat: DATE_FORMAT, locale: LOCALE }),
    close:    (id, body)      => self._p(`/clients/${id}?command=close`, body),
    reject:   (id, body)      => self._p(`/clients/${id}?command=reject`, body),
    // NOTE: Fineract's real command for this transition is "withdraw" (WITHDRAW_CLIENT
    // permission / withdrawClient builder call) — ClientsApiResource has no
    // "withdrawnByApplicant" command at all (that name belongs to loan/savings
    // application withdrawal). Was previously sending an unsupported command and
    // would have 400'd every time the button was used.
    withdraw:         (id, body)      => self._p(`/clients/${id}?command=withdraw`, body),
    // NOTE: "undoTransfer" is not a real ClientsApiResource command either. Cancelling
    // a pending office transfer is done via the "withdrawTransfer" command
    // (WITHDRAWTRANSFER_CLIENT permission / withdrawClientTransferRequest builder call),
    // which is also what the UI already gates this button on — only the command string
    // being sent was wrong.
    undoTransfer:     (id)            => self._p(`/clients/${id}?command=withdrawTransfer`, {}),
    assignStaff:      (id, body)      => self._p(`/clients/${id}?command=assignStaff`, body),
    unassignStaff:    (id, body)      => self._p(`/clients/${id}?command=unassignStaff`, body || {}),
    collateral:       (id)            => self._g(`/clients/${id}/collaterals`),
    getCollateral:    (id, ccId)      => self._g(`/clients/${id}/collaterals/${ccId}`),
    collateralTemplate: (id)          => self._g(`/clients/${id}/collaterals/template`),
    addCollateral:    (id, body)      => self._p(`/clients/${id}/collaterals`, body),
    updateCollateral: (id, ccId, body)=> self._u(`/clients/${id}/collaterals/${ccId}`, body),
    deleteCollateral: (id, ccId)      => self._d(`/clients/${id}/collaterals/${ccId}`),
    transactions:     (id, params)    => self._g(`/clients/${id}/transactions`, params),
    getTransaction:   (id, txId)      => self._g(`/clients/${id}/transactions/${txId}`),
    // AUDIT FIX (Clients F1): the undo endpoint requires ?command=undo. Without it Fineract
    // cannot route the action ("unknown command") and the transaction is never undone. This
    // aligns clients with every sibling (savings/FD/RD/loans all append ?command=undo).
    undoTransaction:  (id, txId, body)=> self._p(`/clients/${id}/transactions/${txId}?command=undo`, body || {}),
    waiveCharge:      (id, chargeId)  => self._p(`/clients/${id}/charges/${chargeId}?command=waive`, {}),
    payCharge:        (id, chargeId, body) => self._p(`/clients/${id}/charges/${chargeId}?command=paycharge`, body),
    deleteCharge:     (id, chargeId)  => self._d(`/clients/${id}/charges/${chargeId}`),
    chargeTemplate:   (id)            => self._g(`/clients/${id}/charges/template`),
    getCharge:        (id, chargeId)  => self._g(`/clients/${id}/charges/${chargeId}`),
    reactivate:(id, body)     => self._p(`/clients/${id}?command=reactivate`, body),
    transfer: (id, body)      => self._p(`/clients/${id}?command=proposeTransfer`, body),
    acceptTransfer: (id, body)=> self._p(`/clients/${id}?command=acceptTransfer`, body),
    rejectTransfer: (id, body)=> self._p(`/clients/${id}?command=rejectTransfer`, body),
    delete:   (id)            => self._d(`/clients/${id}`),
    accounts: (id)            => self._g(`/clients/${id}/accounts`),
    charges:  (id)            => self._g(`/clients/${id}/charges`),
    addCharge:(id, body)      => self._p(`/clients/${id}/charges`, body),
    identifiers:        (id)       => self._g(`/clients/${id}/identifiers`),
    identifierTemplate: (id)       => self._g(`/clients/${id}/identifiers/template`),
    getIdentifier:      (id, iid)  => self._g(`/clients/${id}/identifiers/${iid}`),
    createIdentifier:   (id, body) => self._p(`/clients/${id}/identifiers`, body),
    updateIdentifier:   (id, iid, body) => self._u(`/clients/${id}/identifiers/${iid}`, body),
    deleteIdentifier:   (id, iid)  => self._d(`/clients/${id}/identifiers/${iid}`),
    addresses:          (id)       => self._g(`/client/${id}/addresses`),
    createAddress:      (id, body) => self._p(`/client/${id}/addresses`, body),
    // ClientAddressApiResource's PUT shares the same path as POST — no {addressId} in the
    // URL — so the address being updated is identified by addressTypeId in the body, same
    // as create. Fineract only stores one address per type per client.
    updateAddress:      (id, body) => self._u(`/client/${id}/addresses`, body),
    addressTemplate:    ()         => self._g('/client/addresses/template'),
    familyMembers:      (id)       => self._g(`/clients/${id}/familymembers`),
    familyMemberTemplate:(id)      => self._g(`/clients/${id}/familymembers/template`),
    getFamilyMember:    (id, mid)  => self._g(`/clients/${id}/familymembers/${mid}`),
    createFamilyMember: (id, body) => self._p(`/clients/${id}/familymembers`, body),
    updateFamilyMember: (id, mid, body) => self._u(`/clients/${id}/familymembers/${mid}`, body),
    deleteFamilyMember: (id, mid)  => self._d(`/clients/${id}/familymembers/${mid}`),
    obligeeDetails:     (id)       => self._g(`/clients/${id}/obligeedetails`),
    transferProposalDate: (id)     => self._g(`/clients/${id}/transferproposaldate`)
  };
}
