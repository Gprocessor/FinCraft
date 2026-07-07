/* FinCraft · api/organization.js — Offices, staff, tellers, holidays, working days, funds, codes, currencies, and payment types.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeOfficesAPI(self) {
  return {
    list:   (params) => self._g('/offices', params),
    get:    (id)     => self._g(`/offices/${id}`),
    template:()      => self._g('/offices/template'),
    create: (body)   => self._p('/offices', body),
    update: (id, b)  => self._u(`/offices/${id}`, b)
  };
}

export function makeStaffAPI(self) {
  return {
    list:   (params) => self._g('/staff', params),
    get:    (id)     => self._g(`/staff/${id}`),
    create: (body)   => self._p('/staff', body),
    update: (id, b)  => self._u(`/staff/${id}`, b)
  };
}

export function makeTellersAPI(self) {
  return {
    list:    (params) => self._g('/tellers', params),
    get:     (id)     => self._g(`/tellers/${id}`),
    create:  (body)   => self._p('/tellers', body),
    update:  (id, b)  => self._u(`/tellers/${id}`, b),
    delete:  (id)     => self._d(`/tellers/${id}`),
    cashiers:(id)     => self._g(`/tellers/${id}/cashiers`),
    getCashier:     (id, cid)       => self._g(`/tellers/${id}/cashiers/${cid}`),
    cashierTemplate:(id)            => self._g(`/tellers/${id}/cashiers/template`),
    allocateCashier:(id, body) => self._p(`/tellers/${id}/cashiers`, body),
    updateCashier:  (id, cid, body) => self._u(`/tellers/${id}/cashiers/${cid}`, body),
    deleteCashier:  (id, cid)       => self._d(`/tellers/${id}/cashiers/${cid}`),
    settleCashier:  (id, cid, body) => self._p(`/tellers/${id}/cashiers/${cid}/settle`, body),
    allocateCashTo: (id, cid, body) => self._p(`/tellers/${id}/cashiers/${cid}/allocate`, body),
    cashierTransactions:   (id, cid, params) => self._g(`/tellers/${id}/cashiers/${cid}/transactions`, params),
    cashierSummary:        (id, cid, params) => self._g(`/tellers/${id}/cashiers/${cid}/summaryandtransactions`, params),
    cashierTxTemplate:     (id, cid)         => self._g(`/tellers/${id}/cashiers/${cid}/transactions/template`),
    transactions:   (id, params)      => self._g(`/tellers/${id}/transactions`, params),
    getTransaction: (id, txId)        => self._g(`/tellers/${id}/transactions/${txId}`),
    journals:       (id, params)      => self._g(`/tellers/${id}/journals`, params)
  };
}

// TellerJournalApiResource — distinct top-level resource, base path /v1/cashiersjournal
// (NOT nested under /tellers/{id}; per Fineract_Backend_API_Reference.md section 3.2).
export function makeTellerJournalAPI(self) {
  return {
    list: (params) => self._g('/cashiersjournal', params)
  };
}

export function makeHolidaysAPI(self) {
  return {
    list:    (params) => self._g('/holidays', params),
    get:     (id)     => self._g(`/holidays/${id}`),
    template:()       => self._g('/holidays/template'),
    create:  (body)   => self._p('/holidays', body),
    update:  (id, b)  => self._u(`/holidays/${id}`, b),
    delete:  (id)     => self._d(`/holidays/${id}`),
    activate:(id)     => self._p(`/holidays/${id}?command=activate`, {})
  };
}

export function makeWorkingDaysAPI(self) {
  return { get: () => self._g('/workingdays'), update: (b) => self._u('/workingdays', b), template: () => self._g('/workingdays/template') };
}

export function makeFundsAPI(self) {
  return {
    list:    ()       => self._g('/funds'),
    get:     (id)     => self._g(`/funds/${id}`),
    create:  (body)   => self._p('/funds', body),
    update:  (id, b)  => self._u(`/funds/${id}`, b)
  };
}

export function makeCodesAPI(self) {
  return {
    list:    ()           => self._g('/codes'),
    get:     (id)         => self._g(`/codes/${id}`),
    getByName: (name)     => self._g(`/codes/name/${name}`),
    create:  (body)       => self._p('/codes', body),
    update:  (id, body)   => self._u(`/codes/${id}`, body),
    delete:  (id)         => self._d(`/codes/${id}`),
    values:  (id)         => self._g(`/codes/${id}/codevalues`),
    getValue:    (id, vid) => self._g(`/codes/${id}/codevalues/${vid}`),
    createValue: (id,body)=> self._p(`/codes/${id}/codevalues`, body),
    updateValue: (id,vid,body) => self._u(`/codes/${id}/codevalues/${vid}`, body),
    deleteValue: (id,vid) => self._d(`/codes/${id}/codevalues/${vid}`),
    // By-name variants of the same code-value CRUD (Fineract offers both
    // numeric-id and code-name addressing for this sub-resource).
    valuesByName:      (name)       => self._g(`/codes/name/${name}/codevalues`),
    getValueByName:    (name, vid)  => self._g(`/codes/name/${name}/codevalues/${vid}`),
    createValueByName: (name, body) => self._p(`/codes/name/${name}/codevalues`, body),
    updateValueByName: (name, vid, body) => self._u(`/codes/name/${name}/codevalues/${vid}`, body),
    deleteValueByName: (name, vid)  => self._d(`/codes/name/${name}/codevalues/${vid}`)
  };
}

export function makeCurrenciesAPI(self) {
  return {
    list:     () => self._g('/currencies'),
    all:      () => self._g('/currencies?fields=selectedCurrencyOptions,currencyOptions'),
    template: () => self._g('/currencies?fields=currencyOptions'),
    update:   (body) => self._u('/currencies', body)
  };
}

export function makePaymentTypesAPI(self) {
  return {
    list: () => self._g('/paymenttypes'),
    get: (id) => self._g(`/paymenttypes/${id}`),
    create: (b) => self._p('/paymenttypes', b),
    update: (id, b) => self._u(`/paymenttypes/${id}`, b),
    delete: (id) => self._d(`/paymenttypes/${id}`)
  };
}
