/* FinCraft · api/accounting.js — Chart of accounts, journal entries, accounting rules, provisioning, and tax configuration.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeJournalEntriesAPI(self) {
  return {
    list:    (params)  => self._g('/journalentries', params),
    get:     (id)       => self._g(`/journalentries/${id}`),
    provisioning: (params) => self._g('/journalentries/provisioning', params),
    openingBalances: (params) => self._g('/journalentries/openingbalance', params),
    create:  (body)    => self._p('/journalentries', body),
    // AUDIT VERIFIED (Accounting A-06): POST /journalentries/{transactionId} is
    // operationId createReversalJournalEntry — 'command=reverse' is the correct token
    // (the same endpoint also serves command=updateRunningBalance, not implemented here).
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
    delete: (id)     => self._d(`/glaccounts/${id}`),

    // ---- Treasury GL-balance strategy (see FINCRAFT_Fineract_Treasury_Integration_Log.md §3) ----
    // Tier 1: org-wide running balance, computed server-side by Fineract itself via the
    // documented `fetchRunningBalance=true` query param — cheapest/most reliable source for
    // headline dashboard figures (Vault/Bank/Cash At Tellers/etc. totals). No report dependency.
    getBalance:       (id)     => self._g(`/glaccounts/${id}`, { fetchRunningBalance: true }),
    listWithBalances: (params) => self._g('/glaccounts', { ...params, fetchRunningBalance: true }),

    // Tier 2: office-scoped precise balance. Fineract has no per-office GL balance endpoint, so
    // this sums /journalentries for one glAccountId + officeId up to (optional) toDate, applying
    // the standard normal-balance sign convention per account type. O(n) in journal entry count —
    // use for point-in-time control checks (e.g. Vault Control's pre-allocation validation), not
    // for high-frequency dashboard refreshes (use listWithBalances for that instead).
    // accountType: pass the account's `type.id` (1=ASSET,2=LIABILITY,3=EQUITY,4=INCOME,5=EXPENSE)
    // as returned by get()/list() — ASSET/EXPENSE accounts increase on DEBIT, everything else
    // increases on CREDIT.
    async computeOfficeBalance(glAccountId, officeId, { toDate, accountType, manualEntriesOnly } = {}) {
      const debitIncreases = accountType === 1 || accountType === 5; // ASSET or EXPENSE
      let net = 0, offset = 0;
      const limit = 200;
      // Fineract's /journalentries list is paginated; loop until a short page signals the end.
      // (limit=-1/"return all" is supported by several other Fineract list endpoints but is NOT
      // documented for /journalentries, so this walks pages defensively instead of relying on it.)
      for (;;) {
        const page = await self._g('/journalentries', {
          glAccountId, officeId, toDate, manualEntriesOnly, offset, limit
        });
        const rows = page?.pageItems ?? (Array.isArray(page) ? page : []);
        for (const row of rows) {
          const isDebit = row?.entryType?.code === 'journalEntryType.debit' || row?.entryType?.id === 2;
          const amt = Number(row?.amount) || 0;
          net += (isDebit === debitIncreases) ? amt : -amt;
        }
        if (rows.length < limit) break;
        offset += limit;
      }
      return net;
    }
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
    // AUDIT VERIFIED (Accounting A-04): GET /provisioningentries/entries
    // (retrieveProvisioningEntriesLoanProducts) is confirmed in the spec with query params
    // entryId, offset, limit, officeId, productId, categoryId. Mapping is correct.
    entriesFiltered:(params) => self._g('/provisioningentries/entries', params),
    getEntry:       (id)   => self._g(`/provisioningentries/${id}`),
    criteria:       ()     => self._g('/provisioningcriteria'),
    criteriaTemplate: ()   => self._g('/provisioningcriteria/template'),
    getCriteria:    (id)   => self._g(`/provisioningcriteria/${id}`),
    createCriteria: (b)    => self._p('/provisioningcriteria', b),
    updateCriteria: (id,b) => self._u(`/provisioningcriteria/${id}`, b),
    deleteCriteria: (id)   => self._d(`/provisioningcriteria/${id}`),
    createEntry:    (b)    => self._p('/provisioningentries', b),
    // AUDIT VERIFIED (Accounting A-03): the spec's `command` param description on
    // POST /provisioningentries/{entryId} literally lists the two valid commands as
    // "command=createjournalentry" and "command=recreateprovisioningentry".
    createJournal:  (id)   => self._p(`/provisioningentries/${id}?command=createjournalentry`, {}),
    // AUDIT FIX (Accounting A-02): token was plural 'recreateprovisioningentries' — the spec
    // documents the SINGULAR 'recreateprovisioningentry'. Corrected.
    recreateEntry:  (id)   => self._p(`/provisioningentries/${id}?command=recreateprovisioningentry`, {})
  };
}

export function makeProvisioningCategoryAPI(self) {
  // Was entirely unimplemented despite CREATE_PROVISIONCATEGORY / UPDATE_PROVISIONCATEGORY /
  // DELETE_PROVISIONCATEGORY existing as real permissions and ProvisioningCategoryApiResource
  // (/v1/provisioningcategory) existing server-side. See FIXLOG for detail.
  return {
    list:   ()     => self._g('/provisioningcategory'),
    // AUDIT VERIFIED (Accounting A-05): the spec's ProvisioningCategoryData schema confirms the
    // payload field names are `categoryName` and `categoryDescription`. Callers must send those.
    create: (b)    => self._p('/provisioningcategory', b),
    update: (id,b) => self._u(`/provisioningcategory/${id}`, b),
    delete: (id)   => self._d(`/provisioningcategory/${id}`)
  };
}

export function makeRunAccrualsAPI(self) {
  return {
    // AUDIT FIX (Accounting A-01): tillDate is a BODY field on PostRunaccrualsRequest
    // (alongside dateFormat + locale), NOT a query param — the spec declares zero query
    // params for /runaccruals. The old query-string form sent an empty body, so Fineract's
    // mandatory-tillDate validation failed every time. Callers pass tillDate as yyyy-MM-dd
    // (HTML date input); dateFormat/locale are supplied so the date parses. `b` can override.
    run: (tillDate, b={}) => self._p('/runaccruals', { dateFormat: 'yyyy-MM-dd', locale: 'en', tillDate, ...b })
  };
}

export function makeOpeningBalancesAPI(self) {
  return {
    // AUDIT NOTE (Accounting A-07): 'defineOpeningBalance' is a genuine Fineract journal-entry
    // command (DEFINEOPENINGBALANCE_JOURNALENTRY permission) but is not enumerated in this
    // partial OpenAPI spec. Verified correct by Fineract convention; kept as-is.
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
