/* FinCraft · api/savings-deposits.js — Savings, fixed deposit, and recurring deposit accounts.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeSavingsAPI(self) {
  return {
    list:        (params)      => self._g('/savingsaccounts', params),
    get:         (id, params)  => self._g(`/savingsaccounts/${id}`, params),
    template:    (params)      => self._g('/savingsaccounts/template', params),
    create:      (body)        => self._p('/savingsaccounts', body),
    approve:     (id, body)    => self._p(`/savingsaccounts/${id}?command=approve`, body),
    undoApproval:(id)          => self._p(`/savingsaccounts/${id}?command=undoApproval`, {}),
    reject:      (id, body)    => self._p(`/savingsaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => self._p(`/savingsaccounts/${id}?command=withdrawnByApplicant`, body),
    withdrawal:  (id, body)    => self._p(`/savingsaccounts/${id}/transactions?command=withdrawal`, body),
    activate:    (id, body)    => self._p(`/savingsaccounts/${id}?command=activate`, body),
    deposit:     (id, body)    => self._p(`/savingsaccounts/${id}/transactions?command=deposit`, body),
    withdrawTx:  (id, body)    => self._p(`/savingsaccounts/${id}/transactions?command=withdrawal`, body),
    holdAmount:  (id, body)    => self._p(`/savingsaccounts/${id}/transactions?command=holdAmount`, body),
    releaseAmount:(id, txId)   => self._p(`/savingsaccounts/${id}/transactions/${txId}?command=releaseAmount`, {}),
    close:       (id, body)    => self._p(`/savingsaccounts/${id}?command=close`, body),
    postInterest:(id, body)    => self._p(`/savingsaccounts/${id}?command=postInterest`, body || {}),
    calculateInterest: (id)    => self._p(`/savingsaccounts/${id}?command=calculateInterest`, {}),
    block:       (id)          => self._p(`/savingsaccounts/${id}?command=block`, {}),
    unblock:     (id)          => self._p(`/savingsaccounts/${id}?command=unblock`, {}),
    blockDebit:  (id)          => self._p(`/savingsaccounts/${id}?command=blockDebit`, {}),
    unblockDebit:(id)          => self._p(`/savingsaccounts/${id}?command=unblockDebit`, {}),
    blockCredit: (id)          => self._p(`/savingsaccounts/${id}?command=blockCredit`, {}),
    unblockCredit:(id)         => self._p(`/savingsaccounts/${id}?command=unblockCredit`, {}),
    update:      (id, body)    => self._u(`/savingsaccounts/${id}`, body),
    delete:      (id)          => self._d(`/savingsaccounts/${id}`),
    applyAnnualFees:    (id, body) => self._p(`/savingsaccounts/${id}?command=applyAnnualFees`, body),
    postInterestAsOn:   (id, date) => self._p(`/savingsaccounts/${id}?command=postInterestAsOn`, { transactionDate: date, dateFormat: 'yyyy-MM-dd', locale: 'en' }),
    onHoldTransactions: (id)       => self._g(`/savingsaccounts/${id}/onholdtransactions`),
    assignStaff:        (id, body) => self._p(`/savingsaccounts/${id}?command=assignSavingsOfficer`, body),
    unassignStaff:      (id, body) => self._p(`/savingsaccounts/${id}?command=unassignSavingsOfficer`, body || {}),
    command:            (id, cmd, body) => self._p(`/savingsaccounts/${id}?command=${cmd}`, body || {}),
    waiveCharge:        (id, cid)  => self._p(`/savingsaccounts/${id}/charges/${cid}?command=waive`, {}),
    payCharge:          (id, cid, body) => self._p(`/savingsaccounts/${id}/charges/${cid}?command=paycharge`, body),
    inactivateCharge:   (id, cid)  => self._p(`/savingsaccounts/${id}/charges/${cid}?command=inactivate`, {}),
    updateCharge:       (id, cid, body) => self._u(`/savingsaccounts/${id}/charges/${cid}`, body),
    deleteCharge:       (id, cid)  => self._d(`/savingsaccounts/${id}/charges/${cid}`),
    adjustTransaction:  (id, txId, body) => self._p(`/savingsaccounts/${id}/transactions/${txId}?command=modify`, body),
    undoTransaction:    (id, txId) => self._p(`/savingsaccounts/${id}/transactions/${txId}?command=undo`, {}),
    addCharge:   (id, body)    => self._p(`/savingsaccounts/${id}/charges`, body),
    transactions:(id)          => self._g(`/savingsaccounts/${id}/transactions`)
  };
}

export function makeFixedDepositsAPI(self) {
  return {
    list:     (params)   => self._g('/fixeddepositaccounts', params),
    get:      (id, params) => self._g(`/fixeddepositaccounts/${id}`, params),
    template: (params)   => self._g('/fixeddepositaccounts/template', params),
    create:   (body)     => self._p('/fixeddepositaccounts', body),
    update:   (id, body) => self._u(`/fixeddepositaccounts/${id}`, body),
    delete:   (id)       => self._d(`/fixeddepositaccounts/${id}`),

    // ---- Lifecycle ----
    approve:     (id, body) => self._p(`/fixeddepositaccounts/${id}?command=approve`, body),
    undoApproval:(id)       => self._p(`/fixeddepositaccounts/${id}?command=undoapproval`, {}),
    reject:      (id, body) => self._p(`/fixeddepositaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => self._p(`/fixeddepositaccounts/${id}?command=withdrawnByApplicant`, body),
    activate:    (id, body) => self._p(`/fixeddepositaccounts/${id}?command=activate`, body),
    premature:   (id, body) => self._p(`/fixeddepositaccounts/${id}?command=prematureClose`, body),
    close:       (id, body) => self._p(`/fixeddepositaccounts/${id}?command=close`, body),

    // ---- Premature-close calculator + closure templates ----
    prematureTemplate: (id) => self._g(`/fixeddepositaccounts/${id}/template`, { command: 'prematureClose' }),
    closeTemplate:     (id) => self._g(`/fixeddepositaccounts/${id}/template`, { command: 'close' }),
    withdrawalTemplate:(id) => self._g(`/fixeddepositaccounts/${id}/template`, { command: 'withdrawal' }),

    // ---- Interest ----
    calculateInterest: (id) => self._p(`/fixeddepositaccounts/${id}?command=calculateInterest`, {}),
    postInterest:      (id) => self._p(`/fixeddepositaccounts/${id}?command=postInterest`, {}),

    // ---- Transactions ----
    transactions: (id, params) => self._g(`/fixeddepositaccounts/${id}/transactions`, params),
    transaction:  (id, txId)   => self._g(`/fixeddepositaccounts/${id}/transactions/${txId}`),
    deposit:      (id, body)   => self._p(`/fixeddepositaccounts/${id}/transactions?command=deposit`, body),
    withdrawal:   (id, body)   => self._p(`/fixeddepositaccounts/${id}/transactions?command=withdrawal`, body),
    interestTx:   (id, body)   => self._p(`/fixeddepositaccounts/${id}/transactions?command=interest`, body || {}),
    prematureTx:  (id, body)   => self._p(`/fixeddepositaccounts/${id}/transactions?command=prematureClose`, body),
    adjustTransaction: (id, txId, body) => self._p(`/fixeddepositaccounts/${id}/transactions/${txId}?command=adjust`, body),
    undoTransaction:   (id, txId)       => self._p(`/fixeddepositaccounts/${id}/transactions/${txId}?command=undo`, {}),

    // ---- Charges (mirrors savings charges API) ----
    charges:      (id)          => self._g(`/fixeddepositaccounts/${id}/charges`),
    addCharge:    (id, body)    => self._p(`/fixeddepositaccounts/${id}/charges`, body),
    updateCharge: (id, cid, body) => self._u(`/fixeddepositaccounts/${id}/charges/${cid}`, body),
    payCharge:    (id, cid, body) => self._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:  (id, cid)     => self._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid) => self._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge: (id, cid)     => self._d(`/fixeddepositaccounts/${id}/charges/${cid}`),

    // ---- Generic command escape hatch ----
    command:      (id, cmd, body) => self._p(`/fixeddepositaccounts/${id}?command=${cmd}`, body || {})
  };
}

export function makeRecurringDepositsAPI(self) {
  return {
    list:     (params)   => self._g('/recurringdepositaccounts', params),
    get:      (id, params) => self._g(`/recurringdepositaccounts/${id}`, params),
    template: (params)   => self._g('/recurringdepositaccounts/template', params),
    create:   (body)     => self._p('/recurringdepositaccounts', body),
    update:   (id, body) => self._u(`/recurringdepositaccounts/${id}`, body),
    delete:   (id)       => self._d(`/recurringdepositaccounts/${id}`),

    // ---- Lifecycle ----
    approve:     (id, body) => self._p(`/recurringdepositaccounts/${id}?command=approve`, body),
    undoApproval:(id)       => self._p(`/recurringdepositaccounts/${id}?command=undoapproval`, {}),
    reject:      (id, body) => self._p(`/recurringdepositaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => self._p(`/recurringdepositaccounts/${id}?command=withdrawnByApplicant`, body),
    activate:    (id, body) => self._p(`/recurringdepositaccounts/${id}?command=activate`, body),
    premature:   (id, body) => self._p(`/recurringdepositaccounts/${id}?command=prematureClose`, body),
    close:       (id, body) => self._p(`/recurringdepositaccounts/${id}?command=close`, body),

    // ---- Premature-close calculator + closure templates ----
    prematureTemplate: (id) => self._g(`/recurringdepositaccounts/${id}/template`, { command: 'prematureClose' }),
    closeTemplate:     (id) => self._g(`/recurringdepositaccounts/${id}/template`, { command: 'close' }),
    withdrawalTemplate:(id) => self._g(`/recurringdepositaccounts/${id}/template`, { command: 'withdrawal' }),

    // ---- Interest ----
    calculateInterest: (id) => self._p(`/recurringdepositaccounts/${id}?command=calculateInterest`, {}),
    postInterest:      (id) => self._p(`/recurringdepositaccounts/${id}?command=postInterest`, {}),

    // ---- Transactions ----
    transactions: (id, params) => self._g(`/recurringdepositaccounts/${id}/transactions`, params),
    transaction:  (id, txId)   => self._g(`/recurringdepositaccounts/${id}/transactions/${txId}`),
    deposit:      (id, body)   => self._p(`/recurringdepositaccounts/${id}/transactions?command=deposit`, body),
    withdrawal:   (id, body)   => self._p(`/recurringdepositaccounts/${id}/transactions?command=withdrawal`, body),
    interestTx:   (id, body)   => self._p(`/recurringdepositaccounts/${id}/transactions?command=interest`, body || {}),
    prematureTx:  (id, body)   => self._p(`/recurringdepositaccounts/${id}/transactions?command=prematureClose`, body),
    adjustTransaction: (id, txId, body) => self._p(`/recurringdepositaccounts/${id}/transactions/${txId}?command=adjust`, body),
    undoTransaction:   (id, txId)       => self._p(`/recurringdepositaccounts/${id}/transactions/${txId}?command=undo`, {}),

    // ---- Charges ----
    charges:      (id)          => self._g(`/recurringdepositaccounts/${id}/charges`),
    addCharge:    (id, body)    => self._p(`/recurringdepositaccounts/${id}/charges`, body),
    updateCharge: (id, cid, body) => self._u(`/recurringdepositaccounts/${id}/charges/${cid}`, body),
    payCharge:    (id, cid, body) => self._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:  (id, cid)     => self._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid) => self._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge: (id, cid)     => self._d(`/recurringdepositaccounts/${id}/charges/${cid}`),

    // ---- Generic command escape hatch ----
    command:      (id, cmd, body) => self._p(`/recurringdepositaccounts/${id}?command=${cmd}`, body || {})
  };
}
