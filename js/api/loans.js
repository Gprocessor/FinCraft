/* FinCraft · api/loans.js — Loan accounts, delinquency tracking, loan originators, external asset owners, and collateral.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeLoansAPI(self) {
  return {
    list:           (params)             => self._g('/loans', params),
    get:            (id, assoc = 'all')  => self._g(`/loans/${id}`, { associations: assoc }),
    getWithParams:  (id, params)         => self._g(`/loans/${id}`, params),
    template:       (params)             => self._g('/loans/template', params),
    approvalTemplate: (id)               => self._g(`/loans/${id}/template`, { templateType: 'approval' }),
    create:         (body)               => self._p('/loans', body),
    update:         (id, body)           => self._u(`/loans/${id}`, body),
    delete:         (id)                 => self._d(`/loans/${id}`),

    // ---- Lifecycle commands ----
    approve:        (id, body)           => self._p(`/loans/${id}?command=approve`, body),
    undoApproval:   (id)                 => self._p(`/loans/${id}?command=undoApproval`, {}),
    reject:         (id, body)           => self._p(`/loans/${id}?command=reject`, body),
    withdrawApplication: (id, body)      => self._p(`/loans/${id}?command=withdrawnByApplicant`, body),
    disburse:       (id, body)           => self._p(`/loans/${id}?command=disburse`, body),
    disburseToSavings: (id, body)        => self._p(`/loans/${id}?command=disburseToSavings`, body),
    undoDisbursal:  (id)                 => self._p(`/loans/${id}?command=undoDisbursal`, {}),
    writeOff:       (id, body)           => self._p(`/loans/${id}?command=writeoff`, body),
    chargeOff:      (id, body)           => self._p(`/loans/${id}?command=chargeOff`, body),
    undoChargeOff:  (id, body)           => self._p(`/loans/${id}?command=undoChargeOff`, body),
    close:          (id, body)           => self._p(`/loans/${id}?command=close`, body),
    closeAsRescheduled: (id, body)       => self._p(`/loans/${id}?command=close-rescheduled`, body),
    foreclose:      (id, body)           => self._p(`/loans/${id}?command=foreclosure`, body),
    reage:          (id, body)           => self._p(`/loans/${id}?command=reAge`, body),
    undoReAge:      (id)                 => self._p(`/loans/${id}?command=undoReAge`, {}),
    reamortize:     (id, body)           => self._p(`/loans/${id}?command=reAmortize`, body),
    undoReAmortize: (id)                 => self._p(`/loans/${id}?command=undoReAmortize`, {}),
    markAsFraud:    (id, body)           => self._p(`/loans/${id}?command=markAsFraud`, body || { fraud: true }),
    recoverGuarantees: (id, body)        => self._p(`/loans/${id}?command=recoverGuarantees`, body || {}),
    assignOfficer:  (id, body)           => self._p(`/loans/${id}?command=assignLoanOfficer`, body),
    removeOfficer:  (id, body)           => self._p(`/loans/${id}?command=removeLoanOfficer`, body),

    // ---- Transactions ----
    transactions:   (id, params)         => self._g(`/loans/${id}/transactions`, params),
    transaction:    (id, txId)           => self._g(`/loans/${id}/transactions/${txId}`),
    repay:          (id, body)           => self._p(`/loans/${id}/transactions?command=repayment`, body),
    prepayLoan:     (id, body)           => self._p(`/loans/${id}/transactions?command=prepayLoan`, body),
    downPayment:    (id, body)           => self._p(`/loans/${id}/transactions?command=downPayment`, body),
    recoverPayment: (id, body)           => self._p(`/loans/${id}/transactions?command=recoverypayment`, body),
    goodwillCredit: (id, body)           => self._p(`/loans/${id}/transactions?command=goodwillCredit`, body),
    creditBalanceRefund: (id, body)      => self._p(`/loans/${id}/transactions?command=creditBalanceRefund`, body),
    chargeRefund:   (id, body)           => self._p(`/loans/${id}/transactions?command=chargeRefund`, body),
    interestPaymentWaiver: (id, body)    => self._p(`/loans/${id}/transactions?command=interestPaymentWaiver`, body),
    merchantIssued: (id, body)           => self._p(`/loans/${id}/transactions?command=merchantIssuedRefund`, body),
    payoutRefund:   (id, body)           => self._p(`/loans/${id}/transactions?command=payoutRefund`, body),
    refundByCash:   (id, body)           => self._p(`/loans/${id}/transactions?command=refundByCash`, body),
    refundByTransfer: (id, body)         => self._p(`/loans/${id}/transactions?command=refundByTransfer`, body),
    waiveInterest:  (id, body)           => self._p(`/loans/${id}/transactions?command=waiveinterest`, body),
    chargebackTx:   (id, txId, body)     => self._p(`/loans/${id}/transactions/${txId}?command=chargeback`, body),
    reverseTransaction: (id, txId, body) => self._p(`/loans/${id}/transactions/${txId}?command=reverse`, body || {}),
    undoTransaction: (id, txId, body)    => self._p(`/loans/${id}/transactions/${txId}?command=undo`, body || {}),
    adjustTransaction: (id, txId, body)  => self._p(`/loans/${id}/transactions/${txId}?command=adjust`, body),
    modifyTransaction: (id, txId, body)  => self._u(`/loans/${id}/transactions/${txId}`, body),

    // ---- Schedule ----
    schedule:       (id)                 => self._g(`/loans/${id}`, { associations: 'repaymentSchedule' }),
    originalSchedule: (id)               => self._g(`/loans/${id}`, { associations: 'originalSchedule' }),
    calculateSchedule: (id, body)        => self._p(`/loans/${id}/schedule?command=calculateLoanSchedule`, body),
    submitVariableSchedule: (id, body)   => self._p(`/loans/${id}/schedule?command=updateSchedule`, body),

    // ---- Charges ----
    addCharge:      (id, body)           => self._p(`/loans/${id}/charges`, body),
    waiveCharge:    (id, cid)            => self._p(`/loans/${id}/charges/${cid}?command=waive`, {}),
    payCharge:      (id, cid, body)      => self._p(`/loans/${id}/charges/${cid}?command=paycharge`, body),
    chargeAdjustment: (id, cid, body)    => self._p(`/loans/${id}/charges/${cid}?command=adjustment`, body),
    listCharges:    (id)                 => self._g(`/loans/${id}/charges`),
    deleteCharge:   (id, cid)            => self._d(`/loans/${id}/charges/${cid}`),

    // ---- Collateral ----
    listCollaterals:(id)                 => self._g(`/loans/${id}/collaterals`),
    addCollateral:  (id, body)           => self._p(`/loans/${id}/collaterals`, body),
    deleteCollateral:(id, cid)           => self._d(`/loans/${id}/collaterals/${cid}`),

    // ---- Guarantors ----
    guarantors:     (id)                 => self._g(`/loans/${id}/guarantors`),
    guarantorTemplate: (id)              => self._g(`/loans/${id}/guarantors/template`),
    addGuarantor:   (id, body)           => self._p(`/loans/${id}/guarantors`, body),
    deleteGuarantor:(id, gid)            => self._d(`/loans/${id}/guarantors/${gid}`),

    // ---- Disbursements / Tranches ----
    disbursements:  (id)                 => self._g(`/loans/${id}/disbursements`),
    disbursement:   (id, disbId)         => self._g(`/loans/${id}/disbursements/${disbId}`),
    addDisbursement:(id, body)           => self._u(`/loans/${id}/disbursements`, body),
    updateDisbursement: (id, disbId, body) => self._u(`/loans/${id}/disbursements/${disbId}`, body),

    // ---- Delinquency ----
    delinquency:    (id)                 => self._g(`/loans/${id}/delinquency-actions`),
    addDelinquencyAction: (id, body)     => self._p(`/loans/${id}/delinquency-actions`, body),
    delinquencyTags:(id)                 => self._g(`/loans/${id}/delinquency-tags`),

    // ---- Standing Instructions (via association) ----
    standingInstructions: (id)           => self._g(`/loans/${id}`, { associations: 'standingInstructions' }),

    // ---- Interest pauses (progressive loan) ----
    interestPauses: (id)                 => self._g(`/loans/${id}/interest-pauses`),
    interestPause:  (id, body)           => self._p(`/loans/${id}/interest-pauses`, body),
    updateInterestPause: (id, vid, body) => self._u(`/loans/${id}/interest-pauses/${vid}`, body),
    deleteInterestPause: (id, vid)       => self._d(`/loans/${id}/interest-pauses/${vid}`),

    // ---- Buy-down fees & Capitalized income (progressive loan) ----
    buyDownFees:    (id)                 => self._g(`/loans/${id}/buydown-fees`),
    buyDownFeeAllocation: (id, txId)     => self._g(`/loans/${id}/buydown-fees/${txId}/allocation`),
    capitalizedIncomes: (id)             => self._g(`/loans/${id}/capitalized-incomes`),
    deferredIncome: (id)                 => self._g(`/loans/${id}/deferredincome`),

    // ---- Rescheduling ----
    rescheduleTemplate: (params)         => self._g('/rescheduleloans/template', params),
    reschedule:     (body)               => self._p('/rescheduleloans', body),
    rescheduleRequests: (loanId)         => self._g('/rescheduleloans', { loanId, command: 'pending' }),
    rescheduleRequest:  (schedId)        => self._g(`/rescheduleloans/${schedId}`),
    approveReschedule: (id, body)        => self._p(`/rescheduleloans/${id}?command=approve`, body),
    rejectReschedule:  (id, body)        => self._p(`/rescheduleloans/${id}?command=reject`, body),

    // ---- Post-dated checks ----
    postDatedChecks:(id)                 => self._g(`/loans/${id}/postdatedchecks`),
    postDatedCheck: (id, instId)         => self._g(`/loans/${id}/postdatedchecks/${instId}`),
    updatePostDatedCheck: (id, pdcId, body, editType) =>
      self._u(`/loans/${id}/postdatedchecks/${pdcId}`, body, { params: editType ? { editType } : undefined }),
    deletePostDatedCheck: (id, pdcId)    => self._d(`/loans/${id}/postdatedchecks/${pdcId}`),

    // ---- External Asset Owners (per loan) ----
    eaoList:        (id)                 => self._g(`/loans/${id}/external-asset-owners`),
    eaoTransfer:    (id, body)           => self._p(`/loans/${id}/external-asset-owners/transfer`, body),
    eaoBuyBack:     (id, body)           => self._p(`/loans/${id}/external-asset-owners/buy-back`, body),

    // ---- Originators (per loan) ----
    originators:    (id)                 => self._g(`/loans/${id}/originators`),
    attachOriginator:(id, originatorId, body) =>
      self._p(`/loans/${id}/originators/${originatorId}`, body || {}),
    detachOriginator:(id, originatorId)  => self._d(`/loans/${id}/originators/${originatorId}`),

    // ---- Bulk loan reassignment ----
    bulkReassign:   (body)               => self._p('/loans/loanreassignment', body),
    loanReassignTemplate: ()             => self._g('/loans/loanreassignment/template'),

    // ---- Loan at date (point-in-time) ----
    loanAtDate:     (id, params)         => self._g(`/loans/at-date/${id}`, params),

    // ---- GLIM ----
    glimAccounts:   (id)                 => self._g(`/loans/glimAccount/${id}`),

    // ---- Generic command escape hatch ----
    command:        (id, cmd, body)      => self._p(`/loans/${id}?command=${cmd}`, body || {})
  };
}

export function makeDelinquencyBucketsAPI(self) {
  return {
    list:        ()       => self._g('/delinquency/buckets'),
    get:         (id)     => self._g(`/delinquency/buckets/${id}`),
    create:      (b)      => self._p('/delinquency/buckets', b),
    update:      (id, b)  => self._u(`/delinquency/buckets/${id}`, b),
    delete:      (id)     => self._d(`/delinquency/buckets/${id}`),
    ranges:      ()       => self._g('/delinquency/ranges'),
    range:       (id)     => self._g(`/delinquency/ranges/${id}`),
    createRange: (b)      => self._p('/delinquency/ranges', b),
    updateRange: (id, b)  => self._u(`/delinquency/ranges/${id}`, b),
    deleteRange: (id)     => self._d(`/delinquency/ranges/${id}`),
    loanTagHistory: (loanId) => self._g(`/loans/${loanId}/delinquency-tags`)
  };
}

export function makeLoanOriginatorsAPI(self) {
  return {
    list:    (params)      => self._g('/loan-originators', params),
    get:     (id)          => self._g(`/loan-originators/${id}`),
    template:()            => self._g('/loan-originators/template'),
    create:  (body)        => self._p('/loan-originators', body),
    update:  (id, body)    => self._u(`/loan-originators/${id}`, body),
    delete:  (id)          => self._d(`/loan-originators/${id}`)
  };
}

export function makeExternalAssetOwnersAPI(self) {
  return {
    list:           (params)     => self._g('/external-asset-owners', params),
    get:            (ownerId)    => self._g(`/external-asset-owners/${ownerId}`),
    create:         (body)       => self._p('/external-asset-owners', body),
    update:         (ownerId, b) => self._u(`/external-asset-owners/${ownerId}`, b),
    delete:         (ownerId)    => self._d(`/external-asset-owners/${ownerId}`),
    journalEntries: (transferId, params) => self._g(`/external-asset-owners/transfers/${transferId}/journal-entries`, params),
    transferLoans:  (transferId) => self._g(`/external-asset-owners/transfers/${transferId}/loans`),
    transfers:      (params)     => self._g('/external-asset-owners/transfers', params),
    transfer:       (transferId) => self._g(`/external-asset-owners/transfers/${transferId}`)
  };
}

export function makeCollateralManagementAPI(self) {
  return {
      list:     (params)   => self._g('/collateral-management', params),
      get:      (id)       => self._g(`/collateral-management/${id}`),
      template: ()         => self._g('/collateral-management/template'),
      create:   (body)     => self._p('/collateral-management', body),
      update:   (id, body) => self._u(`/collateral-management/${id}`, body),
      delete:   (id)       => self._d(`/collateral-management/${id}`)
    };
}
