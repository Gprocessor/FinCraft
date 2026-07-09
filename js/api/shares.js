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

    // NOTE: charges/, addCharge/, updateCharge/, payCharge/, waiveCharge/,
    // inactivateCharge/, deleteCharge/ were removed — Fineract has no
    // /accounts/share/{id}/charges sub-resource; AccountsApiResource only
    // exposes list/template/get/create/update/downloadtemplate/uploadtemplate
    // plus the generic command dispatcher above. Share charges are only ever
    // set via the account create/update JSON payload.

    // ---- Dividends (product-level) ----
    dividends:      (productId)        => self._g(`/shareproduct/${productId}/dividend`),
    getDividend:    (productId, divId) => self._g(`/shareproduct/${productId}/dividend/${divId}`),
    postDividend:   (productId, body)  => self._p(`/shareproduct/${productId}/dividend`, body),
    updateDividend: (productId, divId, body) => self._u(`/shareproduct/${productId}/dividend/${divId}`, body),
    // FLAGGED, PARTIALLY VERIFIED: ShareDividendApiResource's {dividendId} sub-path only has GET/PUT/DELETE per the
    // source-derived map (no POST at all) — the original POST call here was guaranteed wrong. Switched to PUT,
    // which is confirmed to exist on this path. The "?command=approve" query param itself is unverified (the parsed
    // source shows only plain CRUD methods, no command dispatch) — confirm against a live server.
    approveDividend:(productId, divId) => self._u(`/shareproduct/${productId}/dividend/${divId}?command=approve`, {}),
    deleteDividend: (productId, divId) => self._d(`/shareproduct/${productId}/dividend/${divId}`),

    // ---- Generic command escape hatch ----
    command:        (id, cmd, body) => self._p(`/accounts/share/${id}?command=${cmd}`, body || {})
  };
}
