/* FinCraft · api.js — Apache Fineract REST API client.
   All endpoints follow the canonical Fineract paths under /fineract-provider/api/v1
   See: https://demo.mifos.io/api-docs/apiLive.htm */
import { getRuntimeConfig, LOCALE, DATE_FORMAT } from './config.js';

const CFG = getRuntimeConfig();

class FineractAPI {
  constructor() { this.serverUrl = ''; this.tenantId = 'default'; this.authToken = ''; this._onUnauthorized = null; }

  configure({ serverUrl, tenantId, authToken }) {
    if (serverUrl != null) this.serverUrl = serverUrl.replace(/\/$/, '');
    if (tenantId  != null) this.tenantId  = tenantId;
    if (authToken != null) this.authToken = authToken;
  }
  reset() { this.serverUrl = ''; this.authToken = ''; }

  /** Registers a callback invoked once whenever any request returns HTTP 401. */
  onUnauthorized(fn) { this._onUnauthorized = fn; }

  _url(path, params) {
    let u = `${this.serverUrl}${CFG.apiBase}${path}`;
    if (params && Object.keys(params).length) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.append(k, v);
      const s = q.toString();
      if (s) u += (u.includes('?') ? '&' : '?') + s;
    }
    return u;
  }

  _headers(extra = {}) {
    const h = { 'Accept': 'application/json', 'Content-Type': 'application/json',
                'Fineract-Platform-TenantId': this.tenantId, ...extra };
    // Sentinel: callers pass headers:{ 'Content-Type': null } (or send a FormData body, handled
    // below) to let the browser set its own multipart Content-Type + boundary automatically.
    if (h['Content-Type'] == null) delete h['Content-Type'];
    if (this.authToken) h['Authorization'] = 'Basic ' + this.authToken;
    return h;
  }

  async _req(method, path, { params, body, headers, raw, timeoutMs } = {}) {
    const url = this._url(path, params);
    const isFormData = (typeof FormData !== 'undefined' && body instanceof FormData);
    const opts = { method, headers: this._headers(isFormData ? { 'Content-Type': null, ...headers } : headers) };
    if (body !== undefined) {
      opts.body = isFormData ? body : (typeof body === 'string' ? body : JSON.stringify(body));
    }
    const ctrl = new AbortController(); opts.signal = ctrl.signal;
    const t = setTimeout(() => ctrl.abort(), timeoutMs ?? CFG.requestTimeoutMs);
    try {
      const r = await fetch(url, opts);
      clearTimeout(t);
      if (!r.ok) {
        let detail; try { detail = await r.json(); } catch { detail = await r.text(); }
        // Global 401 → notify auth layer (skip the /authentication endpoint itself).
        if (r.status === 401 && typeof this._onUnauthorized === 'function' && path !== '/authentication') {
          try { this._onUnauthorized(); } catch {}
        }
        const err = new Error(`API ${r.status} on ${method} ${path}`);
        err.status = r.status; err.detail = detail; throw err;
      }
      if (raw) return r;
      const ct = r.headers.get('content-type') || '';
      if (r.status === 204) return null;
      if (ct.includes('application/json')) return r.json();
      return r.text();
    } catch (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') { const err = new Error('Request timed out'); err.code = 'TIMEOUT'; throw err; }
      throw e;
    }
  }

  _g(p, params, opts) { return this._req('GET',    p, { params, ...opts }); }
  _p(p, body,   opts) { return this._req('POST',   p, { body,   ...opts }); }
  _u(p, body,   opts) { return this._req('PUT',    p, { body,   ...opts }); }
  _d(p, body,   opts) { return this._req('DELETE', p, { body,   ...opts }); }

  /** POST /authentication with JSON body -> { base64EncodedAuthenticationKey } */
  async auth(username, password, opts = {}) {
    const body = JSON.stringify({ username, password });
    const r = await this._req('POST', '/authentication',
      { body, timeoutMs: opts.timeoutMs ?? CFG.autoConnectTimeoutMs });
    return r?.base64EncodedAuthenticationKey || '';
  }

  // ============== USER DETAILS (authenticated user info + perms) ==============
  // GET /userdetails returns the canonical authenticated-user payload:
  // { userId, username, officeId, officeName, roles[], permissions[] }
  userDetails = {
    self: () => this._g('/userdetails')
  };

  // ============== PASSWORD MANAGEMENT ==============
  password = {
    /** Trigger a password-reset email; payload depends on tenant config. */
    forgot:      (body)         => this._p('/password', body),
    /** Change a user's password — also used for self change-password. */
    change:      (userId, body) => this._u(`/users/${userId}`, body),
    /** Active password policy. */
    preferences: ()             => this._g('/passwordpreferences'),
    updatePreferences: (body)   => this._u('/passwordpreferences', body)
  };

  // ============== TWO-FACTOR AUTH ==============
  twoFactor = {
    methods:  ()       => this._g('/twofactor'),
    request:  (params) => this._req('POST', '/twofactor',          { params }),
    validate: (token)  => this._req('POST', '/twofactor/validate', { params: { token } }),
    config:   {
      get:    ()  => this._g('/twofactor/configure'),
      update: (b) => this._u('/twofactor/configure', b)
    }
  };

  // ============== TENANT OIDC (optional SSO discovery) ==============
  tenantOidc = {
    get:    (tenantId)    => this._g(`/tenants/${tenantId}/oidc-config`),
    create: (tenantId, b) => this._p(`/tenants/${tenantId}/oidc-config`, b),
    update: (tenantId, b) => this._u(`/tenants/${tenantId}/oidc-config`, b),
    delete: (tenantId)    => this._d(`/tenants/${tenantId}/oidc-config`)
  };

  // ============== CLIENTS ==============
  clients = {
    list:     (params)        => this._g('/clients', params),
    get:      (id, params)    => this._g(`/clients/${id}`, params),
    template: ()              => this._g('/clients/template'),
    create:   (body)          => this._p('/clients', body),
    update:   (id, body)      => this._u(`/clients/${id}`, body),
    activate: (id, date)      => this._p(`/clients/${id}?command=activate`, { activationDate: date, dateFormat: DATE_FORMAT, locale: LOCALE }),
    close:    (id, body)      => this._p(`/clients/${id}?command=close`, body),
    reject:   (id, body)      => this._p(`/clients/${id}?command=reject`, body),
    withdraw: (id, body)      => this._p(`/clients/${id}?command=withdraw`, body),
    reactivate:(id, body)     => this._p(`/clients/${id}?command=reactivate`, body),
    transfer: (id, body)      => this._p(`/clients/${id}?command=proposeTransfer`, body),
    acceptTransfer: (id, body)=> this._p(`/clients/${id}?command=acceptTransfer`, body),
    rejectTransfer: (id, body)=> this._p(`/clients/${id}?command=rejectTransfer`, body),
    delete:   (id)            => this._d(`/clients/${id}`),
    accounts: (id)            => this._g(`/clients/${id}/accounts`),
    charges:  (id)            => this._g(`/clients/${id}/charges`),
    addCharge:(id, body)      => this._p(`/clients/${id}/charges`, body),
    images:   (id)            => this._g(`/clients/${id}/images`),
    documents:(id)            => this._g(`/clients/${id}/documents`),
    identifiers:        (id)       => this._g(`/clients/${id}/identifiers`),
    createIdentifier:   (id, body) => this._p(`/clients/${id}/identifiers`, body),
    deleteIdentifier:   (id, iid)  => this._d(`/clients/${id}/identifiers/${iid}`),
    addresses:          (id)       => this._g(`/clients/${id}/addresses`),
    createAddress:      (id, body) => this._p(`/clients/${id}/addresses`, body),
    addressTemplate:    ()         => this._g('/clients/addresses/template'),
    familyMembers:      (id)       => this._g(`/clients/${id}/familymembers`),
    createFamilyMember: (id, body) => this._p(`/clients/${id}/familymembers`, body),
    deleteFamilyMember: (id, mid)  => this._d(`/clients/${id}/familymembers/${mid}`),
    obligeeDetails:     (id)       => this._g(`/clients/${id}/obligeedetails`)
  };

// ============== LOANS ==============
  loans = {
    list:           (params)             => this._g('/loans', params),
    get:            (id, assoc = 'all')  => this._g(`/loans/${id}`, { associations: assoc }),
    getWithParams:  (id, params)         => this._g(`/loans/${id}`, params),
    template:       (params)             => this._g('/loans/template', params),
    approvalTemplate: (id)               => this._g(`/loans/${id}/template`, { templateType: 'approval' }),
    create:         (body)               => this._p('/loans', body),
    update:         (id, body)           => this._u(`/loans/${id}`, body),
    delete:         (id)                 => this._d(`/loans/${id}`),

    // ---- Lifecycle commands ----
    approve:        (id, body)           => this._p(`/loans/${id}?command=approve`, body),
    undoApproval:   (id)                 => this._p(`/loans/${id}?command=undoApproval`, {}),
    reject:         (id, body)           => this._p(`/loans/${id}?command=reject`, body),
    withdrawApplication: (id, body)      => this._p(`/loans/${id}?command=withdrawnByApplicant`, body),
    disburse:       (id, body)           => this._p(`/loans/${id}?command=disburse`, body),
    disburseToSavings: (id, body)        => this._p(`/loans/${id}?command=disburseToSavings`, body),
    undoDisbursal:  (id)                 => this._p(`/loans/${id}?command=undoDisbursal`, {}),
    writeOff:       (id, body)           => this._p(`/loans/${id}?command=writeoff`, body),
    chargeOff:      (id, body)           => this._p(`/loans/${id}?command=chargeOff`, body),
    undoChargeOff:  (id, body)           => this._p(`/loans/${id}?command=undoChargeOff`, body),
    close:          (id, body)           => this._p(`/loans/${id}?command=close`, body),
    closeAsRescheduled: (id, body)       => this._p(`/loans/${id}?command=close-rescheduled`, body),
    foreclose:      (id, body)           => this._p(`/loans/${id}?command=foreclosure`, body),
    reage:          (id, body)           => this._p(`/loans/${id}?command=reAge`, body),
    undoReAge:      (id)                 => this._p(`/loans/${id}?command=undoReAge`, {}),
    reamortize:     (id, body)           => this._p(`/loans/${id}?command=reAmortize`, body),
    undoReAmortize: (id)                 => this._p(`/loans/${id}?command=undoReAmortize`, {}),
    markAsFraud:    (id, body)           => this._p(`/loans/${id}?command=markAsFraud`, body || { fraud: true }),
    recoverGuarantees: (id, body)        => this._p(`/loans/${id}?command=recoverGuarantees`, body || {}),
    assignOfficer:  (id, body)           => this._p(`/loans/${id}?command=assignLoanOfficer`, body),
    removeOfficer:  (id, body)           => this._p(`/loans/${id}?command=removeLoanOfficer`, body),

    // ---- Transactions ----
    transactions:   (id, params)         => this._g(`/loans/${id}/transactions`, params),
    transaction:    (id, txId)           => this._g(`/loans/${id}/transactions/${txId}`),
    repay:          (id, body)           => this._p(`/loans/${id}/transactions?command=repayment`, body),
    prepayLoan:     (id, body)           => this._p(`/loans/${id}/transactions?command=prepayLoan`, body),
    downPayment:    (id, body)           => this._p(`/loans/${id}/transactions?command=downPayment`, body),
    recoverPayment: (id, body)           => this._p(`/loans/${id}/transactions?command=recoverypayment`, body),
    goodwillCredit: (id, body)           => this._p(`/loans/${id}/transactions?command=goodwillCredit`, body),
    creditBalanceRefund: (id, body)      => this._p(`/loans/${id}/transactions?command=creditBalanceRefund`, body),
    chargeRefund:   (id, body)           => this._p(`/loans/${id}/transactions?command=chargeRefund`, body),
    interestPaymentWaiver: (id, body)    => this._p(`/loans/${id}/transactions?command=interestPaymentWaiver`, body),
    merchantIssued: (id, body)           => this._p(`/loans/${id}/transactions?command=merchantIssuedRefund`, body),
    payoutRefund:   (id, body)           => this._p(`/loans/${id}/transactions?command=payoutRefund`, body),
    refundByCash:   (id, body)           => this._p(`/loans/${id}/transactions?command=refundByCash`, body),
    refundByTransfer: (id, body)         => this._p(`/loans/${id}/transactions?command=refundByTransfer`, body),
    waiveInterest:  (id, body)           => this._p(`/loans/${id}/transactions?command=waiveinterest`, body),
    chargebackTx:   (id, txId, body)     => this._p(`/loans/${id}/transactions/${txId}?command=chargeback`, body),
    reverseTransaction: (id, txId, body) => this._p(`/loans/${id}/transactions/${txId}?command=reverse`, body || {}),
    undoTransaction: (id, txId, body)    => this._p(`/loans/${id}/transactions/${txId}?command=undo`, body || {}),
    adjustTransaction: (id, txId, body)  => this._p(`/loans/${id}/transactions/${txId}?command=adjust`, body),
    modifyTransaction: (id, txId, body)  => this._u(`/loans/${id}/transactions/${txId}`, body),

    // ---- Schedule ----
    schedule:       (id)                 => this._g(`/loans/${id}`, { associations: 'repaymentSchedule' }),
    originalSchedule: (id)               => this._g(`/loans/${id}`, { associations: 'originalSchedule' }),
    calculateSchedule: (id, body)        => this._p(`/loans/${id}/schedule?command=calculateLoanSchedule`, body),
    submitVariableSchedule: (id, body)   => this._p(`/loans/${id}/schedule?command=updateSchedule`, body),

    // ---- Charges ----
    addCharge:      (id, body)           => this._p(`/loans/${id}/charges`, body),
    waiveCharge:    (id, cid)            => this._p(`/loans/${id}/charges/${cid}?command=waive`, {}),
    payCharge:      (id, cid, body)      => this._p(`/loans/${id}/charges/${cid}?command=pay`, body),
    chargeAdjustment: (id, cid, body)    => this._p(`/loans/${id}/charges/${cid}?command=adjustment`, body),
    listCharges:    (id)                 => this._g(`/loans/${id}/charges`),
    deleteCharge:   (id, cid)            => this._d(`/loans/${id}/charges/${cid}`),

    // ---- Collateral ----
    listCollaterals:(id)                 => this._g(`/loans/${id}/collaterals`),
    addCollateral:  (id, body)           => this._p(`/loans/${id}/collaterals`, body),
    deleteCollateral:(id, cid)           => this._d(`/loans/${id}/collaterals/${cid}`),

    // ---- Guarantors ----
    guarantors:     (id)                 => this._g(`/loans/${id}/guarantors`),
    guarantorTemplate: (id)              => this._g(`/loans/${id}/guarantors/template`),
    addGuarantor:   (id, body)           => this._p(`/loans/${id}/guarantors`, body),
    deleteGuarantor:(id, gid)            => this._d(`/loans/${id}/guarantors/${gid}`),

    // ---- Disbursements / Tranches ----
    disbursements:  (id)                 => this._g(`/loans/${id}/disbursements`),
    disbursement:   (id, disbId)         => this._g(`/loans/${id}/disbursements/${disbId}`),
    addDisbursement:(id, body)           => this._u(`/loans/${id}/disbursements`, body),
    updateDisbursement: (id, disbId, body) => this._u(`/loans/${id}/disbursements/${disbId}`, body),

    // ---- Delinquency ----
    delinquency:    (id)                 => this._g(`/loans/${id}/delinquency-actions`),
    addDelinquencyAction: (id, body)     => this._p(`/loans/${id}/delinquency-actions`, body),
    delinquencyTags:(id)                 => this._g(`/loans/${id}/delinquency-tags`),

    // ---- Standing Instructions (via association) ----
    standingInstructions: (id)           => this._g(`/loans/${id}`, { associations: 'standingInstructions' }),

    // ---- Interest pauses (progressive loan) ----
    interestPauses: (id)                 => this._g(`/loans/${id}/interest-pauses`),
    interestPause:  (id, body)           => this._p(`/loans/${id}/interest-pauses`, body),
    updateInterestPause: (id, vid, body) => this._u(`/loans/${id}/interest-pauses/${vid}`, body),
    deleteInterestPause: (id, vid)       => this._d(`/loans/${id}/interest-pauses/${vid}`),

    // ---- Buy-down fees & Capitalized income (progressive loan) ----
    buyDownFees:    (id)                 => this._g(`/loans/${id}/buydown-fees`),
    buyDownFeeAllocation: (id, txId)     => this._g(`/loans/${id}/buydown-fees/${txId}/allocation`),
    capitalizedIncomes: (id)             => this._g(`/loans/${id}/capitalized-incomes`),
    deferredIncome: (id)                 => this._g(`/loans/${id}/deferredincome`),

    // ---- Rescheduling ----
    rescheduleTemplate: (params)         => this._g('/rescheduleloans/template', params),
    reschedule:     (body)               => this._p('/rescheduleloans', body),
    rescheduleRequests: (loanId)         => this._g('/rescheduleloans', { loanId, command: 'pending' }),
    rescheduleRequest:  (schedId)        => this._g(`/rescheduleloans/${schedId}`),
    approveReschedule: (id, body)        => this._p(`/rescheduleloans/${id}?command=approve`, body),
    rejectReschedule:  (id, body)        => this._p(`/rescheduleloans/${id}?command=reject`, body),

    // ---- Post-dated checks ----
    postDatedChecks:(id)                 => this._g(`/loans/${id}/postdatedchecks`),
    postDatedCheck: (id, instId)         => this._g(`/loans/${id}/postdatedchecks/${instId}`),
    updatePostDatedCheck: (id, pdcId, body, editType) =>
      this._u(`/loans/${id}/postdatedchecks/${pdcId}`, body, { params: editType ? { editType } : undefined }),
    deletePostDatedCheck: (id, pdcId)    => this._d(`/loans/${id}/postdatedchecks/${pdcId}`),

    // ---- External Asset Owners (per loan) ----
    eaoList:        (id)                 => this._g(`/loans/${id}/external-asset-owners`),
    eaoTransfer:    (id, body)           => this._p(`/loans/${id}/external-asset-owners/transfer`, body),
    eaoBuyBack:     (id, body)           => this._p(`/loans/${id}/external-asset-owners/buy-back`, body),

    // ---- Originators (per loan) ----
    originators:    (id)                 => this._g(`/loans/${id}/originators`),
    attachOriginator:(id, originatorId, body) =>
      this._p(`/loans/${id}/originators/${originatorId}`, body || {}),
    detachOriginator:(id, originatorId)  => this._d(`/loans/${id}/originators/${originatorId}`),

    // ---- Bulk loan reassignment ----
    bulkReassign:   (body)               => this._p('/loans/loanreassignment', body),
    loanReassignTemplate: ()             => this._g('/loans/loanreassignment/template'),

    // ---- Loan at date (point-in-time) ----
    loanAtDate:     (id, params)         => this._g(`/loans/at-date/${id}`, params),

    // ---- GLIM ----
    glimAccounts:   (id)                 => this._g(`/loans/glimAccount/${id}`),

    // ---- Generic command escape hatch ----
    command:        (id, cmd, body)      => this._p(`/loans/${id}?command=${cmd}`, body || {})
  };

  delinquencyBuckets = {
    list:    () => this._g('/delinquency/buckets'),
    create:  (b) => this._p('/delinquency/buckets', b),
    ranges:  () => this._g('/delinquency/ranges'),
    createRange: (b) => this._p('/delinquency/ranges', b),
    // NEW: read delinquency tag history for a specific loan (used by Loans → Delinquency tab)
    loanTagHistory: (loanId) => this._g(`/loans/${loanId}/delinquency-tags`)
  };


// ============== LOAN ORIGINATORS (master CRUD) ==============
  loanOriginators = {
    list:    (params)      => this._g('/loan-originators', params),
    get:     (id)          => this._g(`/loan-originators/${id}`),
    template:()            => this._g('/loan-originators/template'),
    create:  (body)        => this._p('/loan-originators', body),
    update:  (id, body)    => this._u(`/loan-originators/${id}`, body),
    delete:  (id)          => this._d(`/loan-originators/${id}`)
  };

  // ============== EXTERNAL ASSET OWNERS (master + transfers) ==============
  externalAssetOwners = {
    list:           (params)     => this._g('/external-asset-owners', params),
    get:            (ownerId)    => this._g(`/external-asset-owners/${ownerId}`),
    create:         (body)       => this._p('/external-asset-owners', body),
    update:         (ownerId, b) => this._u(`/external-asset-owners/${ownerId}`, b),
    delete:         (ownerId)    => this._d(`/external-asset-owners/${ownerId}`),
    journalEntries: (transferId, params) => this._g(`/external-asset-owners/transfers/${transferId}/journal-entries`, params),
    transferLoans:  (transferId) => this._g(`/external-asset-owners/transfers/${transferId}/loans`),
    transfers:      (params)     => this._g('/external-asset-owners/transfers', params),
    transfer:       (transferId) => this._g(`/external-asset-owners/transfers/${transferId}`)
  };


  // ============== SAVINGS ==============
  savings = {
    list:        (params)      => this._g('/savingsaccounts', params),
    get:         (id, params)  => this._g(`/savingsaccounts/${id}`, params),
    template:    (params)      => this._g('/savingsaccounts/template', params),
    create:      (body)        => this._p('/savingsaccounts', body),
    approve:     (id, body)    => this._p(`/savingsaccounts/${id}?command=approve`, body),
    undoApproval:(id)          => this._p(`/savingsaccounts/${id}?command=undoApproval`, {}),
    reject:      (id, body)    => this._p(`/savingsaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => this._p(`/savingsaccounts/${id}?command=withdrawnByApplicant`, body),
    withdrawal:  (id, body)    => this._p(`/savingsaccounts/${id}/transactions?command=withdrawal`, body),
    activate:    (id, body)    => this._p(`/savingsaccounts/${id}?command=activate`, body),
    deposit:     (id, body)    => this._p(`/savingsaccounts/${id}/transactions?command=deposit`, body),
    withdrawTx:  (id, body)    => this._p(`/savingsaccounts/${id}/transactions?command=withdrawal`, body),
    holdAmount:  (id, body)    => this._p(`/savingsaccounts/${id}/transactions?command=holdAmount`, body),
    releaseAmount:(id, txId)   => this._p(`/savingsaccounts/${id}/transactions/${txId}?command=releaseAmount`, {}),
    close:       (id, body)    => this._p(`/savingsaccounts/${id}?command=close`, body),
    postInterest:(id, body)    => this._p(`/savingsaccounts/${id}?command=postInterest`, body || {}),
    calculateInterest: (id)    => this._p(`/savingsaccounts/${id}?command=calculateInterest`, {}),
    block:       (id)          => this._p(`/savingsaccounts/${id}?command=block`, {}),
    unblock:     (id)          => this._p(`/savingsaccounts/${id}?command=unblock`, {}),
    blockDebit:  (id)          => this._p(`/savingsaccounts/${id}?command=blockDebit`, {}),
    unblockDebit:(id)          => this._p(`/savingsaccounts/${id}?command=unblockDebit`, {}),
    blockCredit: (id)          => this._p(`/savingsaccounts/${id}?command=blockCredit`, {}),
    unblockCredit:(id)         => this._p(`/savingsaccounts/${id}?command=unblockCredit`, {}),
    update:      (id, body)    => this._u(`/savingsaccounts/${id}`, body),
    delete:      (id)          => this._d(`/savingsaccounts/${id}`),
    charges:     (id)          => this._g(`/savingsaccounts/${id}/charges`),
    addCharge:   (id, body)    => this._p(`/savingsaccounts/${id}/charges`, body),
    transactions:(id)          => this._g(`/savingsaccounts/${id}/transactions`)
  };

// ============== FIXED DEPOSITS ==============
  fixedDeposits = {
    list:     (params)   => this._g('/fixeddepositaccounts', params),
    get:      (id, params) => this._g(`/fixeddepositaccounts/${id}`, params),
    template: (params)   => this._g('/fixeddepositaccounts/template', params),
    create:   (body)     => this._p('/fixeddepositaccounts', body),
    update:   (id, body) => this._u(`/fixeddepositaccounts/${id}`, body),
    delete:   (id)       => this._d(`/fixeddepositaccounts/${id}`),

    // ---- Lifecycle ----
    approve:     (id, body) => this._p(`/fixeddepositaccounts/${id}?command=approve`, body),
    undoApproval:(id)       => this._p(`/fixeddepositaccounts/${id}?command=undoapproval`, {}),
    reject:      (id, body) => this._p(`/fixeddepositaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => this._p(`/fixeddepositaccounts/${id}?command=withdrawnByApplicant`, body),
    activate:    (id, body) => this._p(`/fixeddepositaccounts/${id}?command=activate`, body),
    premature:   (id, body) => this._p(`/fixeddepositaccounts/${id}?command=prematureClose`, body),
    close:       (id, body) => this._p(`/fixeddepositaccounts/${id}?command=close`, body),

    // ---- Premature-close calculator + closure templates ----
    prematureTemplate: (id) => this._g(`/fixeddepositaccounts/${id}/template`, { command: 'prematureClose' }),
    closeTemplate:     (id) => this._g(`/fixeddepositaccounts/${id}/template`, { command: 'close' }),
    withdrawalTemplate:(id) => this._g(`/fixeddepositaccounts/${id}/template`, { command: 'withdrawal' }),

    // ---- Interest ----
    calculateInterest: (id) => this._p(`/fixeddepositaccounts/${id}?command=calculateInterest`, {}),
    postInterest:      (id) => this._p(`/fixeddepositaccounts/${id}?command=postInterest`, {}),

    // ---- Transactions ----
    transactions: (id, params) => this._g(`/fixeddepositaccounts/${id}/transactions`, params),
    transaction:  (id, txId)   => this._g(`/fixeddepositaccounts/${id}/transactions/${txId}`),
    deposit:      (id, body)   => this._p(`/fixeddepositaccounts/${id}/transactions?command=deposit`, body),
    withdrawal:   (id, body)   => this._p(`/fixeddepositaccounts/${id}/transactions?command=withdrawal`, body),
    interestTx:   (id, body)   => this._p(`/fixeddepositaccounts/${id}/transactions?command=interest`, body || {}),
    prematureTx:  (id, body)   => this._p(`/fixeddepositaccounts/${id}/transactions?command=prematureClose`, body),
    adjustTransaction: (id, txId, body) => this._p(`/fixeddepositaccounts/${id}/transactions/${txId}?command=adjust`, body),
    undoTransaction:   (id, txId)       => this._p(`/fixeddepositaccounts/${id}/transactions/${txId}?command=undo`, {}),

    // ---- Charges (mirrors savings charges API) ----
    charges:      (id)          => this._g(`/fixeddepositaccounts/${id}/charges`),
    addCharge:    (id, body)    => this._p(`/fixeddepositaccounts/${id}/charges`, body),
    updateCharge: (id, cid, body) => this._u(`/fixeddepositaccounts/${id}/charges/${cid}`, body),
    payCharge:    (id, cid, body) => this._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:  (id, cid)     => this._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid) => this._p(`/fixeddepositaccounts/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge: (id, cid)     => this._d(`/fixeddepositaccounts/${id}/charges/${cid}`),

    // ---- Generic command escape hatch ----
    command:      (id, cmd, body) => this._p(`/fixeddepositaccounts/${id}?command=${cmd}`, body || {})
  };

 // ============== RECURRING DEPOSITS ==============
  recurringDeposits = {
    list:     (params)   => this._g('/recurringdepositaccounts', params),
    get:      (id, params) => this._g(`/recurringdepositaccounts/${id}`, params),
    template: (params)   => this._g('/recurringdepositaccounts/template', params),
    create:   (body)     => this._p('/recurringdepositaccounts', body),
    update:   (id, body) => this._u(`/recurringdepositaccounts/${id}`, body),
    delete:   (id)       => this._d(`/recurringdepositaccounts/${id}`),

    // ---- Lifecycle ----
    approve:     (id, body) => this._p(`/recurringdepositaccounts/${id}?command=approve`, body),
    undoApproval:(id)       => this._p(`/recurringdepositaccounts/${id}?command=undoapproval`, {}),
    reject:      (id, body) => this._p(`/recurringdepositaccounts/${id}?command=reject`, body),
    withdrawApplication: (id, body) => this._p(`/recurringdepositaccounts/${id}?command=withdrawnByApplicant`, body),
    activate:    (id, body) => this._p(`/recurringdepositaccounts/${id}?command=activate`, body),
    premature:   (id, body) => this._p(`/recurringdepositaccounts/${id}?command=prematureClose`, body),
    close:       (id, body) => this._p(`/recurringdepositaccounts/${id}?command=close`, body),

    // ---- Premature-close calculator + closure templates ----
    prematureTemplate: (id) => this._g(`/recurringdepositaccounts/${id}/template`, { command: 'prematureClose' }),
    closeTemplate:     (id) => this._g(`/recurringdepositaccounts/${id}/template`, { command: 'close' }),
    withdrawalTemplate:(id) => this._g(`/recurringdepositaccounts/${id}/template`, { command: 'withdrawal' }),

    // ---- Interest ----
    calculateInterest: (id) => this._p(`/recurringdepositaccounts/${id}?command=calculateInterest`, {}),
    postInterest:      (id) => this._p(`/recurringdepositaccounts/${id}?command=postInterest`, {}),

    // ---- Transactions ----
    transactions: (id, params) => this._g(`/recurringdepositaccounts/${id}/transactions`, params),
    transaction:  (id, txId)   => this._g(`/recurringdepositaccounts/${id}/transactions/${txId}`),
    deposit:      (id, body)   => this._p(`/recurringdepositaccounts/${id}/transactions?command=deposit`, body),
    withdrawal:   (id, body)   => this._p(`/recurringdepositaccounts/${id}/transactions?command=withdrawal`, body),
    interestTx:   (id, body)   => this._p(`/recurringdepositaccounts/${id}/transactions?command=interest`, body || {}),
    prematureTx:  (id, body)   => this._p(`/recurringdepositaccounts/${id}/transactions?command=prematureClose`, body),
    adjustTransaction: (id, txId, body) => this._p(`/recurringdepositaccounts/${id}/transactions/${txId}?command=adjust`, body),
    undoTransaction:   (id, txId)       => this._p(`/recurringdepositaccounts/${id}/transactions/${txId}?command=undo`, {}),

    // ---- Charges ----
    charges:      (id)          => this._g(`/recurringdepositaccounts/${id}/charges`),
    addCharge:    (id, body)    => this._p(`/recurringdepositaccounts/${id}/charges`, body),
    updateCharge: (id, cid, body) => this._u(`/recurringdepositaccounts/${id}/charges/${cid}`, body),
    payCharge:    (id, cid, body) => this._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:  (id, cid)     => this._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid) => this._p(`/recurringdepositaccounts/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge: (id, cid)     => this._d(`/recurringdepositaccounts/${id}/charges/${cid}`),

    // ---- Generic command escape hatch ----
    command:      (id, cmd, body) => this._p(`/recurringdepositaccounts/${id}?command=${cmd}`, body || {})
  };


 // ============== SHARES ==============
  shares = {
    list:           (params)   => this._g('/accounts/share', params),
    get:            (id, params) => this._g(`/accounts/share/${id}`, params),
    template:       ()         => this._g('/accounts/share/template'),
    create:         (body)     => this._p('/accounts/share', body),
    update:         (id, body) => this._u(`/accounts/share/${id}`, body),
    delete:         (id)       => this._d(`/accounts/share/${id}`),

    // ---- Lifecycle ----
    approve:        (id, body) => this._p(`/accounts/share/${id}?command=approve`, body),
    undoApproval:   (id)       => this._p(`/accounts/share/${id}?command=undoapproval`, {}),
    reject:         (id, body) => this._p(`/accounts/share/${id}?command=reject`, body),
    withdrawApplication: (id, body) => this._p(`/accounts/share/${id}?command=withdrawnByApplicant`, body),
    activate:       (id, body) => this._p(`/accounts/share/${id}?command=activate`, body),
    close:          (id, body) => this._p(`/accounts/share/${id}?command=close`, body),

    // ---- Share operations ----
    applyAdditional:(id, body) => this._p(`/accounts/share/${id}?command=applyadditionalshares`, body),
    redeem:         (id, body) => this._p(`/accounts/share/${id}?command=redeemshares`, body),

    // ---- Share-purchase requests (separate from account-level approve) ----
    approveShareReq:(id, body) => this._p(`/accounts/share/${id}?command=approveshare`, body),
    rejectShareReq: (id, body) => this._p(`/accounts/share/${id}?command=rejectshare`, body),

    // ---- Charges ----
    charges:        (id)          => this._g(`/accounts/share/${id}/charges`),
    addCharge:      (id, body)    => this._p(`/accounts/share/${id}/charges`, body),
    updateCharge:   (id, cid, body) => this._u(`/accounts/share/${id}/charges/${cid}`, body),
    payCharge:      (id, cid, body) => this._p(`/accounts/share/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:    (id, cid)     => this._p(`/accounts/share/${id}/charges/${cid}?command=waive`, {}),
    inactivateCharge: (id, cid)   => this._p(`/accounts/share/${id}/charges/${cid}?command=inactivate`, {}),
    deleteCharge:   (id, cid)     => this._d(`/accounts/share/${id}/charges/${cid}`),

    // ---- Dividends (product-level) ----
    dividends:      (productId)        => this._g(`/shareproduct/${productId}/dividend`),
    postDividend:   (productId, body)  => this._p(`/shareproduct/${productId}/dividend`, body),
    approveDividend:(productId, divId) => this._p(`/shareproduct/${productId}/dividend/${divId}?command=approve`, {}),
    deleteDividend: (productId, divId) => this._d(`/shareproduct/${productId}/dividend/${divId}`),

    // ---- Generic command escape hatch ----
    command:        (id, cmd, body) => this._p(`/accounts/share/${id}?command=${cmd}`, body || {})
  };

// ============== GROUPS ==============
  groups = {
    list:           (params)   => this._g('/groups', params),
    get:            (id, p)    => this._g(`/groups/${id}`, p),
    template:       (params)   => this._g('/groups/template', params),
    create:         (body)     => this._p('/groups', body),
    update:         (id, body) => this._u(`/groups/${id}`, body),
    activate:       (id, body) => this._p(`/groups/${id}?command=activate`, body),
    close:          (id, body) => this._p(`/groups/${id}?command=close`, body),
    assignStaff:    (id, body) => this._p(`/groups/${id}?command=assignStaff`, body),
    unassignStaff:  (id, body) => this._p(`/groups/${id}?command=unassignStaff`, body || {}),
    assignRole:     (id, body) => this._p(`/groups/${id}?command=assignRole`, body),
    updateRole:     (id, rid, body) => this._p(`/groups/${id}?command=updateRole&roleId=${rid}`, body),
    unassignRole:   (id, rid)  => this._p(`/groups/${id}?command=unassignRole&roleId=${rid}`, {}),
    associateClients:    (id, body) => this._p(`/groups/${id}?command=associateClients`, body),
    disassociateClients: (id, body) => this._p(`/groups/${id}?command=disassociateClients`, body),
    transferClients:     (id, body) => this._p(`/groups/${id}?command=transferClients`, body),
    generateCollectionSheet: (id, body) => this._p(`/groups/${id}?command=generateCollectionSheet`, body),
    saveCollectionSheet:     (id, body) => this._p(`/groups/${id}?command=saveCollectionSheet`, body),
    accounts:       (id)       => this._g(`/groups/${id}/accounts`),
    glimAccounts:   (id, parentLoanAccountNo) => this._g(`/groups/${id}/glimaccounts`, parentLoanAccountNo ? { parentLoanAccountNo } : undefined),
    gsimAccounts:   (id, params) => this._g(`/groups/${id}/gsimaccounts`, params),
    // ---- Group charges ----
    charges:        (id, params) => this._g(`/groups/${id}/charges`, params),
    addCharge:      (id, body)   => this._p(`/groups/${id}/charges`, body),
    payCharge:      (id, cid, body) => this._p(`/groups/${id}/charges/${cid}?command=paycharge`, body),
    waiveCharge:    (id, cid, body) => this._p(`/groups/${id}/charges/${cid}?command=waive`, body || {}),
    deleteCharge:   (id, cid)    => this._d(`/groups/${id}/charges/${cid}`),
    delete:         (id)       => this._d(`/groups/${id}`)
  };

 centers = {
    list:     (params)     => this._g('/centers', params),
    get:      (id, params) => this._g(`/centers/${id}`, params),
    template: (params)     => this._g('/centers/template', params),       // ← now accepts officeId/staffId/command
    create:   (body)       => this._p('/centers', body),
    update:   (id, body)   => this._u(`/centers/${id}`, body),
    delete:   (id)         => this._d(`/centers/${id}`),
    activate: (id, body)   => this._p(`/centers/${id}?command=activate`, body),
    close:    (id, body)   => this._p(`/centers/${id}?command=close`, body),
    associateGroups:    (id, body) => this._p(`/centers/${id}?command=associateGroups`, body),
    disassociateGroups: (id, body) => this._p(`/centers/${id}?command=disassociateGroups`, body),
    generateCollectionSheet: (id, body) => this._p(`/centers/${id}?command=generateCollectionSheet`, body),
    saveCollectionSheet:     (id, body) => this._p(`/centers/${id}?command=saveCollectionSheet`, body),
    accounts: (id) => this._g(`/centers/${id}/accounts`)                  // ← added for symmetry with groups
  };
// ============== CALENDARS (generic — entityType: groups | centers | clients | loans | offices) ==============
  calendars = {
    list:   (entityType, entityId, params) => this._g(`/${entityType}/${entityId}/calendars`, params),
    get:    (entityType, entityId, calendarId) => this._g(`/${entityType}/${entityId}/calendars/${calendarId}`),
    create: (entityType, entityId, body)   => this._p(`/${entityType}/${entityId}/calendars`, body),
    update: (entityType, entityId, calendarId, body) => this._u(`/${entityType}/${entityId}/calendars/${calendarId}`, body),
    delete: (entityType, entityId, calendarId)       => this._d(`/${entityType}/${entityId}/calendars/${calendarId}`)
  };

  // ============== MEETINGS (generic — entityType: groups | centers | clients) ==============
  meetings = {
    list:   (entityType, entityId, params) => this._g(`/${entityType}/${entityId}/meetings`, params),
    get:    (entityType, entityId, meetingId) => this._g(`/${entityType}/${entityId}/meetings/${meetingId}`),
    create: (entityType, entityId, body)   => this._p(`/${entityType}/${entityId}/meetings`, body),
    update: (entityType, entityId, meetingId, body) => this._u(`/${entityType}/${entityId}/meetings/${meetingId}`, body),
    delete: (entityType, entityId, meetingId)       => this._d(`/${entityType}/${entityId}/meetings/${meetingId}`),
    saveAttendance: (entityType, entityId, meetingId, body) =>
      this._p(`/${entityType}/${entityId}/meetings/${meetingId}?command=saveOrUpdateAttendance`, body)
  };

  // ============== GROUP LEVELS (read-only) ==============
  groupLevels = {
    list: () => this._g('/grouplevels')
  };

  // ============== ORGANIZATION ==============
  offices = {
    list:   (params) => this._g('/offices', params),
    get:    (id)     => this._g(`/offices/${id}`),
    template:()      => this._g('/offices/template'),
    create: (body)   => this._p('/offices', body),
    update: (id, b)  => this._u(`/offices/${id}`, b)
  };
  staff = {
    list:   (params) => this._g('/staff', params),
    get:    (id)     => this._g(`/staff/${id}`),
    create: (body)   => this._p('/staff', body),
    update: (id, b)  => this._u(`/staff/${id}`, b)
  };
  tellers = {
    list:    (params) => this._g('/tellers', params),
    get:     (id)     => this._g(`/tellers/${id}`),
    create:  (body)   => this._p('/tellers', body),
    update:  (id, b)  => this._u(`/tellers/${id}`, b),
    cashiers:(id)     => this._g(`/tellers/${id}/cashiers`),
    allocateCashier:(id, body) => this._p(`/tellers/${id}/cashiers`, body),
    settleCashier:  (id, cid, body) => this._p(`/tellers/${id}/cashiers/${cid}/settle`, body),
    allocateCashTo: (id, cid, body) => this._p(`/tellers/${id}/cashiers/${cid}/allocate`, body)
  };
  charges = {
    list:   (params) => this._g('/charges', params),
    get:    (id)     => this._g(`/charges/${id}`),
    template:()      => this._g('/charges/template'),
    create: (body)   => this._p('/charges', body),
    update: (id, b)  => this._u(`/charges/${id}`, b),
    delete: (id)     => this._d(`/charges/${id}`)
  };
taxComponents = {
    list:     () => this._g('/taxes/component'),
    get:      (id) => this._g(`/taxes/component/${id}`),
    template: () => this._g('/taxes/component/template'),
    create:   (b) => this._p('/taxes/component', b),
    update:   (id, b) => this._u(`/taxes/component/${id}`, b)
  };

  taxGroups = {
    list:     () => this._g('/taxes/group'),
    get:      (id) => this._g(`/taxes/group/${id}`),
    template: () => this._g('/taxes/group/template'),
    create:   (b) => this._p('/taxes/group', b),
    update:   (id, b) => this._u(`/taxes/group/${id}`, b)
  };
  codes = {
    list:    ()           => this._g('/codes'),
    get:     (id)         => this._g(`/codes/${id}`),
    create:  (body)       => this._p('/codes', body),
    update:  (id, body)   => this._u(`/codes/${id}`, body),
    delete:  (id)         => this._d(`/codes/${id}`),
    values:  (id)         => this._g(`/codes/${id}/codevalues`),
    createValue: (id,body)=> this._p(`/codes/${id}/codevalues`, body),
    updateValue: (id,vid,body) => this._u(`/codes/${id}/codevalues/${vid}`, body),
    deleteValue: (id,vid) => this._d(`/codes/${id}/codevalues/${vid}`)
  };
  currencies = {
    list: () => this._g('/currencies'),
    all:  () => this._g('/currencies?fields=selectedCurrencyOptions,currencyOptions'),
    update:(body) => this._u('/currencies', body)
  };
  paymentTypes = {
    list: () => this._g('/paymenttypes'),
    get: (id) => this._g(`/paymenttypes/${id}`),
    create: (b) => this._p('/paymenttypes', b),
    update: (id, b) => this._u(`/paymenttypes/${id}`, b),
    delete: (id) => this._d(`/paymenttypes/${id}`)
  };
  holidays = {
    list:    (params) => this._g('/holidays', params),
    get:     (id)     => this._g(`/holidays/${id}`),
    template:()       => this._g('/holidays/template'),
    create:  (body)   => this._p('/holidays', body),
    update:  (id, b)  => this._u(`/holidays/${id}`, b),
    delete:  (id)     => this._d(`/holidays/${id}`),
    activate:(id)     => this._p(`/holidays/${id}?command=activate`, {})
  };
  workingDays = { get: () => this._g('/workingdays'), update: (b) => this._u('/workingdays', b) };

  // ============== PRODUCTS ==============
loanProducts = {
    list:     ()       => this._g('/loanproducts'),
    get:      (id)     => this._g(`/loanproducts/${id}`),
    template: (params) => this._g('/loanproducts/template', params),
    create:   (b)      => this._p('/loanproducts', b),
    update:   (id, b)  => this._u(`/loanproducts/${id}`, b),
    delete:   (id)     => this._d(`/loanproducts/${id}`)
  };
savingsProducts = {
    list:     ()       => this._g('/savingsproducts'),
    get:      (id)     => this._g(`/savingsproducts/${id}`),
    template: (params) => this._g('/savingsproducts/template', params),
    create:   (b)      => this._p('/savingsproducts', b),
    update:   (id, b)  => this._u(`/savingsproducts/${id}`, b),
    delete:   (id)     => this._d(`/savingsproducts/${id}`)
  };

  shareProducts = {
    list:     ()       => this._g('/products/share'),
    get:      (id)     => this._g(`/products/share/${id}`),
    template: (params) => this._g('/products/share/template', params),
    create:   (b)      => this._p('/products/share', b),
    update:   (id, b)  => this._u(`/products/share/${id}`, b),
    delete:   (id)     => this._d(`/products/share/${id}`)
  };

  fdProducts = {
    list:     ()       => this._g('/fixeddepositproducts'),
    get:      (id)     => this._g(`/fixeddepositproducts/${id}`),
    template: (params) => this._g('/fixeddepositproducts/template', params),
    create:   (b)      => this._p('/fixeddepositproducts', b),
    update:   (id, b)  => this._u(`/fixeddepositproducts/${id}`, b),
    delete:   (id)     => this._d(`/fixeddepositproducts/${id}`)
  };

  rdProducts = {
    list:     ()       => this._g('/recurringdepositproducts'),
    get:      (id)     => this._g(`/recurringdepositproducts/${id}`),
    template: (params) => this._g('/recurringdepositproducts/template', params),
    create:   (b)      => this._p('/recurringdepositproducts', b),
    update:   (id, b)  => this._u(`/recurringdepositproducts/${id}`, b),
    delete:   (id)     => this._d(`/recurringdepositproducts/${id}`)
  };
productMix = {
    list:     ()       => this._g('/loanproducts'),  // products with productMixes association
    get:      (id)     => this._g(`/loanproducts/${id}/productmix`),
    template: (id)     => this._g(`/loanproducts/${id}/productmix/template`),
    create:   (id, b)  => this._p(`/loanproducts/${id}/productmix`, b),
    update:   (id, b)  => this._u(`/loanproducts/${id}/productmix`, b),
    delete:   (id)     => this._d(`/loanproducts/${id}/productmix`)
  };
floatingRates = {
    list:   ()        => this._g('/floatingrates'),
    get:    (id)      => this._g(`/floatingrates/${id}`),
    create: (b)       => this._p('/floatingrates', b),
    update: (id, b)   => this._u(`/floatingrates/${id}`, b),
    delete: (id)      => this._d(`/floatingrates/${id}`)
  };
 delinquencyBuckets = {
    list:        ()       => this._g('/delinquency/buckets'),
    get:         (id)     => this._g(`/delinquency/buckets/${id}`),
    create:      (b)      => this._p('/delinquency/buckets', b),
    update:      (id, b)  => this._u(`/delinquency/buckets/${id}`, b),
    delete:      (id)     => this._d(`/delinquency/buckets/${id}`),
    ranges:      ()       => this._g('/delinquency/ranges'),
    range:       (id)     => this._g(`/delinquency/ranges/${id}`),
    createRange: (b)      => this._p('/delinquency/ranges', b),
    updateRange: (id, b)  => this._u(`/delinquency/ranges/${id}`, b),
    deleteRange: (id)     => this._d(`/delinquency/ranges/${id}`),
    loanTagHistory: (loanId) => this._g(`/loans/${loanId}/delinquency-tags`)
  };
collateralManagement = {
    list:     (params)   => this._g('/collateral-management', params),
    get:      (id)       => this._g(`/collateral-management/${id}`),
    template: ()         => this._g('/collateral-management/template'),
    create:   (body)     => this._p('/collateral-management', body),
    update:   (id, body) => this._u(`/collateral-management/${id}`, body),
    delete:   (id)       => this._d(`/collateral-management/${id}`)
  };

  // ============== ACCOUNTING ==============
  journalEntries = {
    list:    (params)  => this._g('/journalentries', params),
    create:  (body)    => this._p('/journalentries', body),
    reverse: (txId, b) => this._p(`/journalentries/${txId}?command=reverse`, b || {})
  };
  glAccounts = {
    list:   (params) => this._g('/glaccounts', params),
    get:    (id)     => this._g(`/glaccounts/${id}`),
    template:()      => this._g('/glaccounts/template'),
    create: (body)   => this._p('/glaccounts', body),
    update: (id, b)  => this._u(`/glaccounts/${id}`, b),
    delete: (id)     => this._d(`/glaccounts/${id}`)
  };
  glClosures = {
    list: () => this._g('/glclosures'),
    get:  (id) => this._g(`/glclosures/${id}`),
    create: (b) => this._p('/glclosures', b),
    update: (id, b) => this._u(`/glclosures/${id}`, b),
    delete: (id) => this._d(`/glclosures/${id}`)
  };
  accountingRules = {
    list: () => this._g('/accountingrules'),
    get: (id) => this._g(`/accountingrules/${id}`),
    create: (b) => this._p('/accountingrules', b),
    update: (id, b) => this._u(`/accountingrules/${id}`, b),
    delete: (id) => this._d(`/accountingrules/${id}`)
  };
  provisioning = {
    entries:        ()     => this._g('/provisioningentries'),
    criteria:       ()     => this._g('/provisioningcriteria'),
    createCriteria: (b)    => this._p('/provisioningcriteria', b),
    updateCriteria: (id,b) => this._u(`/provisioningcriteria/${id}`, b),
    deleteCriteria: (id)   => this._d(`/provisioningcriteria/${id}`),
    createEntry:    (b)    => this._p('/provisioningentries', b),
    createJournal:  (id)   => this._p(`/provisioningentries/${id}?command=createjournalentry`, {})
  };
  runAccruals = {
    run: (tillDate, b={}) => this._p(`/runaccruals?tillDate=${tillDate}`, b)
  };
  openingBalances = {
    define: (officeId, body) => this._p(`/journalentries?command=defineOpeningBalance`, { ...body, officeId })
  };
  financialActivityAccounts = {
    list:   ()     => this._g('/financialactivityaccounts'),
    get:    (id)   => this._g(`/financialactivityaccounts/${id}`),
    create: (body) => this._p('/financialactivityaccounts', body),
    update: (id, b) => this._u(`/financialactivityaccounts/${id}`, b),
    delete: (id)   => this._d(`/financialactivityaccounts/${id}`)
  };

  // ============== REPORTS ==============
  reports = {
    list:   ()  => this._g('/reports'),
    get:    (id) => this._g(`/reports/${id}`),
    create: (b) => this._p('/reports', b),
    update: (id, b) => this._u(`/reports/${id}`, b),
    delete: (id) => this._d(`/reports/${id}`)
  };
  runReports = {
    // NOTE: passing parameterType=true returns the report's *parameter definitions*
    // (dropdown options etc), not actual report data — must be omitted to get real rows.
    run: (name, params, opts) => this._g(`/runreports/${encodeURIComponent(name)}`,
                                   { 'output-type': 'JSON', ...params }, opts)
  };
  collectionSheet = {
    /** GET /collectionsheet — returns center→group→client→loan tree */
    get: (params) => this._g('/collectionsheet', params),
    /** POST /collectionsheet?command=save — bulk post repayments */
    save: (body)  => this._p('/collectionsheet?command=save', body)
  };
  adhocQueries = {
    list:    () => this._g('/adhocquery'),
    get:     (id) => this._g(`/adhocquery/${id}`),
    create:  (b) => this._p('/adhocquery', b),
    update:  (id, b) => this._u(`/adhocquery/${id}`, b),
    delete:  (id) => this._d(`/adhocquery/${id}`),
    runAll:  () => this._p('/adhocquery?command=execute', {})
  };

  // ============== ENTITY DATATABLE CHECKS ==============
  entityDatatableChecks = {
    list:     (params) => this._g('/entityDatatableChecks', params),
    template: ()       => this._g('/entityDatatableChecks/template'),
    create:   (body)   => this._p('/entityDatatableChecks', body),
    delete:   (id)     => this._d(`/entityDatatableChecks/${id}`)
  };

  // ============== FUNDS ==============
  funds = {
    list:    ()       => this._g('/funds'),
    get:     (id)     => this._g(`/funds/${id}`),
    create:  (body)   => this._p('/funds', body),
    update:  (id, b)  => this._u(`/funds/${id}`, b)
  };

  // ============== USERS, ROLES, PERMISSIONS ==============
  users = {
    list:   ()       => this._g('/users'),
    get:    (id)     => this._g(`/users/${id}`),
    template:()      => this._g('/users/template'),
    create: (body)   => this._p('/users', body),
    update: (id, b)  => this._u(`/users/${id}`, b),
    delete: (id)     => this._d(`/users/${id}`)
  };
  roles = {
    list:       ()         => this._g('/roles'),
    get:        (id)       => this._g(`/roles/${id}`),
    create:     (body)     => this._p('/roles', body),
    update:     (id, b)    => this._u(`/roles/${id}`, b),
    delete:     (id)       => this._d(`/roles/${id}`),
    enable:     (id)       => this._p(`/roles/${id}?command=enable`, {}),
    disable:    (id)       => this._p(`/roles/${id}?command=disable`, {}),
    permissions:(id)       => this._g(`/roles/${id}/permissions`),
    updatePermissions:(id, b) => this._u(`/roles/${id}/permissions`, b)
  };
  permissions = {
    list: () => this._g('/permissions'),
    update: (b) => this._u('/permissions', b)
  };

  // ============== JOBS, AUDITS, MAKERCHECKER ==============
  jobs = {
    list:    ()        => this._g('/jobs'),
    get:     (id)      => this._g(`/jobs/${id}`),
    update:  (id, b)   => this._u(`/jobs/${id}`, b),
    runJob:  (id)      => this._p(`/jobs/${id}?command=executeJob`, {}),
    history: (id, params) => this._g(`/jobs/${id}/runhistory`, params),
    schedule:(id, b)   => this._u(`/jobs/${id}/schedulername`, b)
  };
  audits = {
    list:           (params) => this._g('/audits', params),
    get:            (id)     => this._g(`/audits/${id}`),
    searchTemplate: ()       => this._g('/audits/searchtemplate')
  };
  makerchecker = {
    list:    (params) => this._g('/makercheckers', params),
    template:()       => this._g('/makercheckers/searchtemplate'),
    approve: (id)     => this._p(`/makercheckers/${id}?command=approve`, {}),
    reject:  (id)     => this._p(`/makercheckers/${id}?command=reject`, {}),
    delete:  (id)     => this._d(`/makercheckers/${id}`)
  };

  // ============== CONFIGURATION ==============
  configurations = {
    list:   ()             => this._g('/configurations'),
    get:    (name)         => this._g(`/configurations/name/${encodeURIComponent(name)}`),
    update: (id, body)     => this._u(`/configurations/${id}`, body),
    cache:  () => this._g('/configurations/cache'),
    updateCache: (b) => this._u('/configurations/cache', b),
    globalConfig: {
      list:   ()           => this._g('/configurations'),
      update: (id, body)   => this._u(`/configurations/${id}`, body)
    }
  };

// ============== SURVEYS (full CRUD) ==============
  surveysAdmin = {
    list:       () => this._g('/surveys'),
    get:        (id) => this._g(`/surveys/${id}`),
    template:   () => this._g('/surveys/template'),
    create:     (body) => this._p('/surveys', body),
    update:     (id, b) => this._u(`/surveys/${id}`, b),
    delete:     (id) => this._d(`/surveys/${id}`),
    activate:   (id) => this._p(`/surveys/${id}?command=activate`, {}),
    deactivate: (id) => this._p(`/surveys/${id}?command=deactivate`, {})
  };


// ============== MAKER-CHECKER TASK CONFIGURATION ==============
  makerCheckerTasks = {
    list:   () => this._g('/makercheckerpermissions'),
    update: (body) => this._u('/makercheckerpermissions', body)
  };

  // ============== ENTITY-TO-ENTITY MAPPING ==============
  entityToEntityMappings = {
    list:     ()                  => this._g('/entitytoentitymapping'),
    get:      (mappingTypeId)     => this._g(`/entitytoentitymapping/${mappingTypeId}`),
    update:   (mappingTypeId, b)  => this._u(`/entitytoentitymapping/${mappingTypeId}`, b)
  };

  // ============== ACCOUNT NUMBER PREFERENCES ==============
  accountNumberPreferences = {
    list:     ()         => this._g('/accountnumberformats'),
    get:      (id)       => this._g(`/accountnumberformats/${id}`),
    template: ()         => this._g('/accountnumberformats/template'),
    create:   (body)     => this._p('/accountnumberformats', body),
    update:   (id, body) => this._u(`/accountnumberformats/${id}`, body),
    delete:   (id)       => this._d(`/accountnumberformats/${id}`)
  };

  // ============== NOTIFICATIONS, HOOKS, EXTERNAL SVC ==============
  notifications = {
    list:     (params) => this._g('/notifications', params),
    get:      (id)     => this._g(`/notifications/${id}`),
    markRead: (id)     => this._u(`/notifications/${id}`, { isRead: true })
  };
  hooks = {
    list:    ()        => this._g('/hooks'),
    get:     (id)      => this._g(`/hooks/${id}`),
    template:()        => this._g('/hooks/template'),
    create:  (b)       => this._p('/hooks', b),
    update:  (id, b)   => this._u(`/hooks/${id}`, b),
    delete:  (id)      => this._d(`/hooks/${id}`)
  };
  externalServices = {
    sms:         { list: () => this._g('/externalservice/SMS'),         update: (b) => this._u('/externalservice/SMS', b) },
    email:       { list: () => this._g('/externalservice/SMTP'),        update: (b) => this._u('/externalservice/SMTP', b) },
    smtpEmail:   { list: () => this._g('/externalservice/SMTP'),        update: (b) => this._u('/externalservice/SMTP', b) },
    s3:          { list: () => this._g('/externalservice/S3'),          update: (b) => this._u('/externalservice/S3', b) },
    notification:{ list: () => this._g('/externalservice/NOTIFICATION'),update: (b) => this._u('/externalservice/NOTIFICATION', b) }
  };
 externalEvents = {
    list:           (params) => this._g('/externalevents', params),
    get:            (id)     => this._g(`/externalevents/${id}`),
    configurations: ()       => this._g('/externalevents/configuration'),
    updateConfig:   (b)      => this._u('/externalevents/configuration', b)
  };
  smsCampaigns = {
    list: () => this._g('/smscampaigns'),
    get: (id) => this._g(`/smscampaigns/${id}`),
    template: () => this._g('/smscampaigns/template'),
    create: (b) => this._p('/smscampaigns', b),
    update: (id, b) => this._u(`/smscampaigns/${id}`, b),
    delete: (id) => this._d(`/smscampaigns/${id}`),
    activate: (id) => this._p(`/smscampaigns/${id}?command=activate`, {}),
    close: (id) => this._p(`/smscampaigns/${id}?command=close`, {}),
    reactivate: (id) => this._p(`/smscampaigns/${id}?command=reactivate`, {})
  };

  currencies = {
    list:     () => this._g('/currencies'),
    all:      () => this._g('/currencies?fields=selectedCurrencyOptions,currencyOptions'),
    template: () => this._g('/currencies?fields=currencyOptions'),
    update:   (body) => this._u('/currencies', body)
  };


  // ============== TEMPLATES (User-Generated Document templates) ==============
  templates = {
    list:           ()       => this._g('/templates'),
    get:            (id)     => this._g(`/templates/${id}`),
    template:       ()       => this._g('/templates/template'),
    templateForEdit:(id)     => this._g(`/templates/${id}/template`),
    create:         (body)   => this._p('/templates', body),
    update:         (id, b)  => this._u(`/templates/${id}`, b),
    delete:         (id)     => this._d(`/templates/${id}`),
    // Preview/merge: POST /templates/{id} (no command needed in newer versions)
    preview:        (id, body) => this._p(`/templates/${id}`, body || {})
  };


  


  // ============== DATA TABLES, SURVEYS, SELF-SERVICE ==============
dataTables = {
    list:       ()                  => this._g('/datatables'),
    get:        (name)              => this._g(`/datatables/${name}`),
    register:   (name, app, body)   => this._p(`/datatables/register/${name}/${app}`, body),
    deregister: (name)              => this._p(`/datatables/deregister/${name}`, {}),
    query:      (name, entityId)    => this._g(`/datatables/${name}/${entityId}`),
    create:     (body)              => this._p('/datatables', body),
    updateSchema:(name, body)       => this._u(`/datatables/${name}`, body),   // ← NEW: add/change/drop columns
    update:     (name, eid, body)   => this._u(`/datatables/${name}/${eid}`, body),
    delete:     (name, eid)         => this._d(`/datatables/${name}/${eid}`),
    deleteTable:(name)              => this._d(`/datatables/${name}`)
  };
  selfService = {
    users:        ()      => this._g('/self/userdetails'),
    register:     (body)  => this._p('/self/registration', body),
    activate:     (body)  => this._p('/self/registration/user', body),
    resetPassword:(body)  => this._p('/self/registration/resetpassword', body),
    beneficiaries:()      => this._g('/self/beneficiaries/tpt'),
    addBeneficiary:(body) => this._p('/self/beneficiaries/tpt', body),
    updateBeneficiary:(id, b) => this._u(`/self/beneficiaries/tpt/${id}`, b),
    deleteBeneficiary:(id) => this._d(`/self/beneficiaries/tpt/${id}`)
  };

  // ============== SEARCH ==============
  search = {
    search: (query, resource = 'clients,loans,groups') =>
      this._g('/search', { query, resource }),
    advanced: (body) => this._p('/search/advance', body)
  };

  // ============== BATCH API ==============
  // Fineract's /batches endpoint bundles multiple requests into one HTTP call.
  // enclosingTransaction=true makes the whole batch atomic — if any single request
  // fails, every request in the batch is rolled back. Leave it false (default) when
  // you want independent, best-effort requests (e.g. posting 10 separate loan
  // repayments where one bad row shouldn't block the other nine).
  //
  // Each request needs a unique requestId (just an integer you assign) and a
  // relativeUrl *without* a leading slash (e.g. "loans/4/transactions?command=repayment"),
  // matching Fineract's documented batch format. Unlike every other method on this
  // client, each item's `body` must be pre-serialized to a JSON string — that's the
  // batch wire format, not a quirk of this wrapper — so submit() handles that for you.
  batch = {
    submit: (requests, enclosingTransaction = false) => {
      const payload = requests.map(r => ({
        requestId: r.requestId,
        relativeUrl: r.relativeUrl,
        method: r.method,
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {})
      }));
      return this._req('POST', '/batches', {
        params: enclosingTransaction ? { enclosingTransaction: 'true' } : undefined,
        body: payload
      }).then(results => (Array.isArray(results) ? results : []).map(r => ({
        ...r,
        ok: r.statusCode >= 200 && r.statusCode < 300,
        body: (() => { try { return JSON.parse(r.body); } catch { return r.body; } })()
      })));
    }
  };

  // ============== DOCUMENTS & IMAGES (KYC) ==============
  // Generic file-attachment API confirmed against Fineract's documentmanagement module.
  // entityType is one of: clients, loans, savingsaccounts, groups, centers, staff.
  // FormData bodies are auto-detected by _req (skips JSON.stringify + lets the browser
  // set its own multipart boundary) — see the FormData branch in _req above.
  documents = {
    list:     (entityType, entityId)             => this._g(`/${entityType}/${entityId}/documents`),
    get:      (entityType, entityId, docId)       => this._g(`/${entityType}/${entityId}/documents/${docId}`),
    download: (entityType, entityId, docId)       => this._req('GET', `/${entityType}/${entityId}/documents/${docId}/attachment`, { raw: true }),
    upload:   (entityType, entityId, formData)    => this._req('POST', `/${entityType}/${entityId}/documents`, { body: formData }),
    update:   (entityType, entityId, docId, formData) => this._req('PUT', `/${entityType}/${entityId}/documents/${docId}`, { body: formData }),
    delete:   (entityType, entityId, docId)       => this._d(`/${entityType}/${entityId}/documents/${docId}`)
  };

  // Profile/ID photo — a separate, simpler endpoint from generic Documents above.
  // Confirmed against Fineract's own API docs: multipart field name must be "file",
  // or alternatively a raw base64 data-URI string with Content-Type: text/plain.
  images = {
    get:    (entityType, entityId) => this._req('GET', `/${entityType}/${entityId}/images`, { raw: true }),
    upload: (entityType, entityId, formData) => this._req('POST', `/${entityType}/${entityId}/images`, { body: formData }),
    delete: (entityType, entityId) => this._d(`/${entityType}/${entityId}/images`)
  };

  // ============== NOTES ==============
  // Generic notes API — entityType: clients, loans, savingsaccounts, groups, centers
  notes = {
    list:   (entityType, entityId)         => this._g(`/${entityType}/${entityId}/notes`),
    get:    (entityType, entityId, noteId) => this._g(`/${entityType}/${entityId}/notes/${noteId}`),
    create: (entityType, entityId, body)   => this._p(`/${entityType}/${entityId}/notes`, body),
    update: (entityType, entityId, noteId, body) => this._u(`/${entityType}/${entityId}/notes/${noteId}`, body),
    delete: (entityType, entityId, noteId) => this._d(`/${entityType}/${entityId}/notes/${noteId}`)
  };

  // ============== TRANSFERS, STANDING INSTRUCTIONS ==============
  transfers = {
    list:    (params) => this._g('/accounttransfers', params),
    create:  (body)   => this._p('/accounttransfers', body),
    refund:  (body)   => this._p('/accounttransfers/refundByTransfer', body),
    template:(params) => this._g('/accounttransfers/template', params),
    get:     (id)     => this._g(`/accounttransfers/${id}`)
  };
  standingInstructions = {
    list:    (params)  => this._g('/standinginstructions', params),
    get:     (id)      => this._g(`/standinginstructions/${id}`),
    template:(params)  => this._g('/standinginstructions/template', params),
    create:  (body)    => this._p('/standinginstructions', body),
    update:  (id, b)   => this._u(`/standinginstructions/${id}`, b),
    delete:  (id)      => this._d(`/standinginstructions/${id}`),
    history: (params)  => this._g('/standinginstructionrunhistory', params)
  };

  // ============== COB (Close of Business) ==============
  cob = {
    configurations: () => this._g('/cob-configurations'),
    updateConfig:   (id, body) => this._u(`/cob-configurations/${id}`, body),
    businessDate: {
      get: () => this._g('/businessdate'),
      set: (body) => this._u('/businessdate', body)
    },
    catchUp: () => this._p('/loans/catch-up-processing', {})
  };

  // ============== BULK IMPORTS ==============
  // Confirmed against a real production error path (openMF/community-app#3311):
  // /{entity}/uploadtemplate and /{entity}/downloadtemplate are the real endpoints.
bulkImports = {
    template: (entity)        => this._g(`/${entity}/downloadtemplate`),
    upload:   (entity, formData) => this._req('POST', `/${entity}/uploadtemplate`, { body: formData, headers: {} }),
    // ---- Generic /imports endpoints ----
    list:     (params)        => this._g('/imports', params),
    get:      (importId)      => this._g(`/imports/${importId}`),
    delete:   (importId)      => this._d(`/imports/${importId}`),
    download: (importId)      => this._req('GET', `/imports/${importId}/downloadOutputTemplate`, { raw: true }),
    types:    ()              => this._g('/imports/getEntityTypes')
  };

  // ============== CATCH-ALL ==============
  any(method, path, params, body) { return this._req(method, path, { params, body }); }
}

export const api = new FineractAPI();
export function configureAPI(c) { api.configure(c); }