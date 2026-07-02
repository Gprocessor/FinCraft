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
    cashiers:(id)     => self._g(`/tellers/${id}/cashiers`),
    allocateCashier:(id, body) => self._p(`/tellers/${id}/cashiers`, body),
    settleCashier:  (id, cid, body) => self._p(`/tellers/${id}/cashiers/${cid}/settle`, body),
    allocateCashTo: (id, cid, body) => self._p(`/tellers/${id}/cashiers/${cid}/allocate`, body)
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
  return { get: () => self._g('/workingdays'), update: (b) => self._u('/workingdays', b) };
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
    create:  (body)       => self._p('/codes', body),
    update:  (id, body)   => self._u(`/codes/${id}`, body),
    delete:  (id)         => self._d(`/codes/${id}`),
    values:  (id)         => self._g(`/codes/${id}/codevalues`),
    createValue: (id,body)=> self._p(`/codes/${id}/codevalues`, body),
    updateValue: (id,vid,body) => self._u(`/codes/${id}/codevalues/${vid}`, body),
    deleteValue: (id,vid) => self._d(`/codes/${id}/codevalues/${vid}`)
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
