/* FinCraft · api/accounting.js — Chart of accounts, journal entries, accounting rules, provisioning, and tax configuration.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeJournalEntriesAPI(self) {
  return {
    list:    (params)  => self._g('/journalentries', params),
    get:     (id)       => self._g(`/journalentries/${id}`),
    provisioning: (params) => self._g('/journalentries/provisioning', params),
    openingBalances: (params) => self._g('/journalentries/openingbalance', params),
    create:  (body)    => self._p('/journalentries', body),
    reverse: (txId, b) => self._p(`/journalentries/${txId}?command=reverse`, b || {})
  };
}

export function makeGlAccountsAPI(self) {
  return {
    list:   (params) => self._g('/glaccounts', params),
    get:    (id)     => self._g(`/glaccounts/${id}`),
    template:()      => self._g('/glaccounts/template'),
    create: (body)   => self._p('/glaccounts', body),
    update: (id, b)  => self._u(`/glaccounts/${id}`, b),
    delete: (id)     => self._d(`/glaccounts/${id}`)
  };
}

export function makeGlClosuresAPI(self) {
  return {
    list: () => self._g('/glclosures'),
    get:  (id) => self._g(`/glclosures/${id}`),
    create: (b) => self._p('/glclosures', b),
    update: (id, b) => self._u(`/glclosures/${id}`, b),
    delete: (id) => self._d(`/glclosures/${id}`)
  };
}

export function makeAccountingRulesAPI(self) {
  return {
    list: () => self._g('/accountingrules'),
    get: (id) => self._g(`/accountingrules/${id}`),
    template: () => self._g('/accountingrules/template'),
    create: (b) => self._p('/accountingrules', b),
    update: (id, b) => self._u(`/accountingrules/${id}`, b),
    delete: (id) => self._d(`/accountingrules/${id}`)
  };
}

export function makeProvisioningAPI(self) {
  return {
    entries:        ()     => self._g('/provisioningentries'),
    // FLAGGED, NOT VERIFIED: retrieveProviioningEntries (GET /provisioningentries/entries) is a
    // distinct read endpoint from retrieveAllProvisioningEntries (GET /provisioningentries, used by
    // `entries` above) per fineract_api_raw.json — its exact query params/shape weren't captured by
    // the extraction tool, so this is a best-effort mapping pending source cross-check.
    entriesFiltered:(params) => self._g('/provisioningentries/entries', params),
    getEntry:       (id)   => self._g(`/provisioningentries/${id}`),
    criteria:       ()     => self._g('/provisioningcriteria'),
    criteriaTemplate: ()   => self._g('/provisioningcriteria/template'),
    getCriteria:    (id)   => self._g(`/provisioningcriteria/${id}`),
    createCriteria: (b)    => self._p('/provisioningcriteria', b),
    updateCriteria: (id,b) => self._u(`/provisioningcriteria/${id}`, b),
    deleteCriteria: (id)   => self._d(`/provisioningcriteria/${id}`),
    createEntry:    (b)    => self._p('/provisioningentries', b),
    // FLAGGED, NOT VERIFIED: modifyProvisioningEntry is POST /provisioningentries/{entryId} with no
    // captured query-param command name. createjournalentry/recreateprovisioningentries follow
    // Fineract's common ?command= dispatch convention (matching CREATE_PROVISIONJOURNALENTRIES and
    // RECREATE_PROVISIONENTRIES permissions) but this hasn't been confirmed against source.
    createJournal:  (id)   => self._p(`/provisioningentries/${id}?command=createjournalentry`, {}),
    recreateEntry:  (id)   => self._p(`/provisioningentries/${id}?command=recreateprovisioningentries`, {})
  };
}

export function makeProvisioningCategoryAPI(self) {
  // Was entirely unimplemented despite CREATE_PROVISIONCATEGORY / UPDATE_PROVISIONCATEGORY /
  // DELETE_PROVISIONCATEGORY existing as real permissions and ProvisioningCategoryApiResource
  // (/v1/provisioningcategory) existing server-side. See FIXLOG for detail.
  return {
    list:   ()     => self._g('/provisioningcategory'),
    // FLAGGED, NOT VERIFIED: create/update payload field name assumed to be `categoryName` by
    // analogy with provisioning criteria's `criteriaName`; not cross-checked against source.
    create: (b)    => self._p('/provisioningcategory', b),
    update: (id,b) => self._u(`/provisioningcategory/${id}`, b),
    delete: (id)   => self._d(`/provisioningcategory/${id}`)
  };
}

export function makeRunAccrualsAPI(self) {
  return {
    run: (tillDate, b={}) => self._p(`/runaccruals?tillDate=${tillDate}`, b)
  };
}

export function makeOpeningBalancesAPI(self) {
  return {
    define: (officeId, body) => self._p(`/journalentries?command=defineOpeningBalance`, { ...body, officeId })
  };
}

export function makeFinancialActivityAccountsAPI(self) {
  return {
    list:   ()     => self._g('/financialactivityaccounts'),
    get:    (id)   => self._g(`/financialactivityaccounts/${id}`),
    template: ()   => self._g('/financialactivityaccounts/template'),
    create: (body) => self._p('/financialactivityaccounts', body),
    update: (id, b) => self._u(`/financialactivityaccounts/${id}`, b),
    delete: (id)   => self._d(`/financialactivityaccounts/${id}`)
  };
}

export function makeTaxComponentsAPI(self) {
  return {
      list:     () => self._g('/taxes/component'),
      get:      (id) => self._g(`/taxes/component/${id}`),
      template: () => self._g('/taxes/component/template'),
      create:   (b) => self._p('/taxes/component', b),
      update:   (id, b) => self._u(`/taxes/component/${id}`, b)
    };
}

export function makeTaxGroupsAPI(self) {
  return {
    list:     () => self._g('/taxes/group'),
    get:      (id) => self._g(`/taxes/group/${id}`),
    template: () => self._g('/taxes/group/template'),
    create:   (b) => self._p('/taxes/group', b),
    update:   (id, b) => self._u(`/taxes/group/${id}`, b)
  };
}
