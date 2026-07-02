/* FinCraft · api/shares.js — Share accounts.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeSharesAPI(self) {
  return {
    list:           (params)   => self._g('/accounts/share', params),
    get:            (id, params) => self._g(`/accounts/share/${id}`, params),
    template:       ()         => self._g('/accounts/share/template'),
    create:         (body)     => self._p('/accounts/share', body),
    update:         (id, body) => self._u(`/accounts/share/${id}`, body),
    delete:         (id)       => self._d(`/accounts/share/${id}`),

    // ---- Lifecycle ----
    approve:        (id, body) => self._p(`/accounts/share/${id}?command=approve`, body),
    undoApproval:   (id)       => self._p(`/accounts/share/${id}?command=undoapproval`, {}),
    reject:         (id, body) => self._p(`/accounts/share/${id}?command=reject`, body),
    withdrawApplication: (id, body) => self._p(`/accounts/share/${id}?command=withdrawnByApplicant`, body),
    activate:       (id, body) => self._p(`/accounts/share/${id}?command=activate`, body),
    close:          (id, body) => self._p(`/accounts/share/${id}?command=close`, body),

    // ---- Share operations ----
    applyAdditional:(id, body) => self._p(`/accounts/share/${id}?command=applyadditionalshares`, body),
    redeem:         (id, body) => self._p(`/accounts/share/${id}?command=redeemshares`, body),

    // ---- Share-purchase requests (separate from account-level approve) ----
    approveShareReq:(id, body) => self._p(`/accounts/share/${id}?command=approveshare`, body),
    rejectShareReq: (id, body) => self._p(`/accounts/share/${id}?command=rejectshare`, body),

    // ---- Charges ----
    charges:        (id)          => self._g(`/accounts/share/${id}/charges`),
    addCharge:      (id, body)    => self._p(`/accounts/share/${id}/charges`, body),
    updateCharge:   (id, cid, body) => self._u(`/accounts/share/${id}/charges/${cid}`, body),
    payCharge:      (id, cid, body) => self._p(`/accounts/share/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:    (id, cid)     => self._p(`/accounts/share/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid)   => self._p(`/accounts/share/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge:   (id, cid)     => self._d(`/accounts/share/${id}/charges/${cid}`),

    // ---- Dividends (product-level) ----
    dividends:      (productId)        => self._g(`/shareproduct/${productId}/dividend`),
    postDividend:   (productId, body)  => self._p(`/shareproduct/${productId}/dividend`, body),
    approveDividend:(productId, divId) => self._p(`/shareproduct/${productId}/dividend/${divId}?command=approve`, {}),
    deleteDividend: (productId, divId) => self._d(`/shareproduct/${productId}/dividend/${divId}`),

    // ---- Generic command escape hatch ----
    command:        (id, cmd, body) => self._p(`/accounts/share/${id}?command=${cmd}`, body || {})
  };
}
