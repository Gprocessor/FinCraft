/* FinCraft · api.js — Apache Fineract REST API client.
   All endpoints follow the canonical Fineract paths under /fineract-provider/api/v1
   See: https://demo.mifos.io/api-docs/apiLive.htm */
import { getRuntimeConfig } from './config.js';
const CFG = getRuntimeConfig();

class FineractAPI {
  constructor() { this.serverUrl = ''; this.tenantId = 'default'; this.authToken = ''; }
  configure({ serverUrl, tenantId, authToken }) {
    if (serverUrl != null) this.serverUrl = serverUrl.replace(/\/$/, '');
    if (tenantId  != null) this.tenantId  = tenantId;
    if (authToken != null) this.authToken = authToken;
  }
  reset() { this.serverUrl = ''; this.authToken = ''; }

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

  /** POST /authentication?username=&password= -> { base64EncodedAuthenticationKey } */
  async auth(username, password, opts = {}) {
    const r = await this._req('POST', '/authentication',
      { params: { username, password }, body: '', timeoutMs: opts.timeoutMs ?? CFG.autoConnectTimeoutMs });
    return r?.base64EncodedAuthenticationKey || '';
  }

  // ============== CLIENTS ==============
  clients = {
    list:     (params)        => this._g('/clients', params),
    get:      (id, params)    => this._g(`/clients/${id}`, params),
    template: ()              => this._g('/clients/template'),
    create:   (body)          => this._p('/clients', body),
    update:   (id, body)      => this._u(`/clients/${id}`, body),
    activate: (id, date)      => this._p(`/clients/${id}?command=activate`, { activationDate: date, dateFormat: 'yyyy-MM-dd', locale: 'en' }),
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
    identifiers: (id)         => this._g(`/clients/${id}/identifiers`),
    addresses:(id)            => this._g(`/clients/${id}/addresses`),
    familyMembers: (id)       => this._g(`/clients/${id}/familymembers`),
    obligeeDetails: (id)      => this._g(`/clients/${id}/obligeedetails`)
  };

  // ============== LOANS ==============
  loans = {
    list:           (params)             => this._g('/loans', params),
    get:            (id, assoc = 'all')  => this._g(`/loans/${id}`, { associations: assoc }),
    template:       (params)             => this._g('/loans/template', params),
    create:         (body)               => this._p('/loans', body),
    update:         (id, body)           => this._u(`/loans/${id}`, body),
    approve:        (id, body)           => this._p(`/loans/${id}?command=approve`, body),
    undoApproval:   (id)                 => this._p(`/loans/${id}?command=undoApproval`, {}),
    disburse:       (id, body)           => this._p(`/loans/${id}?command=disburse`, body),
    disburseToSavings: (id, body)        => this._p(`/loans/${id}?command=disburseToSavings`, body),
    undoDisbursal:  (id)                 => this._p(`/loans/${id}?command=undoDisbursal`, {}),
    repay:          (id, body)           => this._p(`/loans/${id}/transactions?command=repayment`, body),
    merchantIssued: (id, body)           => this._p(`/loans/${id}/transactions?command=merchantIssuedRefund`, body),
    payoutRefund:   (id, body)           => this._p(`/loans/${id}/transactions?command=payoutRefund`, body),
    chargebackTx:   (id, txId, body)     => this._p(`/loans/${id}/transactions/${txId}?command=chargeback`, body),
    waiveInterest:  (id, body)           => this._p(`/loans/${id}/transactions?command=waiveinterest`, body),
    writeOff:       (id, body)           => this._p(`/loans/${id}/transactions?command=writeoff`, body),
    chargeOff:      (id, body)           => this._p(`/loans/${id}?command=charge-off`, body),
    undoChargeOff:  (id, body)           => this._p(`/loans/${id}?command=undo-charge-off`, body),
    close:          (id, body)           => this._p(`/loans/${id}/transactions?command=close`, body),
    closeAsRescheduled: (id, body)       => this._p(`/loans/${id}/transactions?command=close-rescheduled`, body),
    reschedule:     (body)               => this._p('/rescheduleloans', body),
    approveReschedule: (id, body)        => this._p(`/rescheduleloans/${id}?command=approve`, body),
    rejectReschedule:  (id, body)        => this._p(`/rescheduleloans/${id}?command=reject`, body),
    foreclose:      (id, body)           => this._p(`/loans/${id}?command=foreclosure`, body),
    reage:          (id, body)           => this._p(`/loans/${id}?command=re-age`, body),
    reamortize:     (id, body)           => this._p(`/loans/${id}?command=re-amortize`, body),
    assignOfficer:  (id, body)           => this._p(`/loans/${id}?command=assignLoanOfficer`, body),
    removeOfficer:  (id, body)           => this._p(`/loans/${id}?command=removeLoanOfficer`, body),
    addCharge:      (id, body)           => this._p(`/loans/${id}/charges`, body),
    waiveCharge:    (id, cid)            => this._p(`/loans/${id}/charges/${cid}?command=waive`, {}),
    payCharge:      (id, cid, body)      => this._p(`/loans/${id}/charges/${cid}?command=pay`, body),
    addCollateral:  (id, body)           => this._p(`/loans/${id}/collaterals`, body),
    guarantors:     (id)                 => this._g(`/loans/${id}/guarantors`),
    addGuarantor:   (id, body)           => this._p(`/loans/${id}/guarantors`, body),
    schedule:       (id)                 => this._g(`/loans/${id}`, { associations: 'repaymentSchedule' }),
    transactions:   (id)                 => this._g(`/loans/${id}/transactions`),
    transaction:    (id, txId)           => this._g(`/loans/${id}/transactions/${txId}`),
    delinquency:    (id)                 => this._g(`/loans/${id}/delinquency-actions`),
    addDelinquencyAction: (id, body)     => this._p(`/loans/${id}/delinquency-actions`, body),
    standingInstructions: (id)           => this._g(`/loans/${id}?associations=standingInstructions`),
    interestPauses: (id)                 => this._g(`/loans/${id}/interest-pauses`),
    interestPause:  (id, body)           => this._p(`/loans/${id}/interest-pauses`, body),
    glimAccounts:   (id)                 => this._g(`/loans/glimAccount/${id}`),
    delete:         (id)                 => this._d(`/loans/${id}`)
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
    withdrawApplication: (id, body) => this._p(`/savingsaccounts/${id}?command=withdrawnByApplicant`, body), // cancels a pending application — NOT a cash withdrawal
    withdrawal:  (id, body)    => this._p(`/savingsaccounts/${id}/transactions?command=withdrawal`, body),    // actual cash withdrawal transaction
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
    blockDeposit:(id)          => this._p(`/savingsaccounts/${id}?command=blockDeposit`, {}),
    unblockDeposit:(id)        => this._p(`/savingsaccounts/${id}?command=unblockDeposit`, {}),
    blockWithdrawal:(id)       => this._p(`/savingsaccounts/${id}?command=blockWithdrawal`, {}),
    unblockWithdrawal:(id)     => this._p(`/savingsaccounts/${id}?command=unblockWithdrawal`, {}),
    update:      (id, body)    => this._u(`/savingsaccounts/${id}`, body),
    delete:      (id)          => this._d(`/savingsaccounts/${id}`),
    charges:     (id)          => this._g(`/savingsaccounts/${id}/charges`),
    addCharge:   (id, body)    => this._p(`/savingsaccounts/${id}/charges`, body),
    transactions:(id)          => this._g(`/savingsaccounts/${id}/transactions`)
  };

  // ============== FIXED & RECURRING DEPOSITS ==============
  fixedDeposits = {
    list:     (params)   => this._g('/fixeddepositaccounts', params),
    get:      (id, params)       => this._g(`/fixeddepositaccounts/${id}`, params),
    template: (params)   => this._g('/fixeddepositaccounts/template', params),
    create:   (body)     => this._p('/fixeddepositaccounts', body),
    approve:  (id, body) => this._p(`/fixeddepositaccounts/${id}?command=approve`, body),
    undoApproval:(id)    => this._p(`/fixeddepositaccounts/${id}?command=undoapproval`, {}),
    reject:   (id, body) => this._p(`/fixeddepositaccounts/${id}?command=reject`, body),
    activate: (id, body) => this._p(`/fixeddepositaccounts/${id}?command=activate`, body),
    premature:(id, body) => this._p(`/fixeddepositaccounts/${id}?command=prematureClose`, body),
    close:    (id, body) => this._p(`/fixeddepositaccounts/${id}?command=close`, body),
    calculateInterest: (id) => this._p(`/fixeddepositaccounts/${id}?command=calculateInterest`, {}),
    postInterest: (id)   => this._p(`/fixeddepositaccounts/${id}?command=postInterest`, {})
  };
  recurringDeposits = {
    list:     (params)   => this._g('/recurringdepositaccounts', params),
    get:      (id, params)   => this._g(`/recurringdepositaccounts/${id}`, params),
    template: (params)   => this._g('/recurringdepositaccounts/template', params),
    create:   (body)     => this._p('/recurringdepositaccounts', body),
    approve:  (id, body) => this._p(`/recurringdepositaccounts/${id}?command=approve`, body),
    activate: (id, body) => this._p(`/recurringdepositaccounts/${id}?command=activate`, body),
    deposit:  (id, body) => this._p(`/recurringdepositaccounts/${id}/transactions?command=deposit`, body),
    premature:(id, body) => this._p(`/recurringdepositaccounts/${id}?command=prematureClose`, body)
  };

  // ============== SHARES ==============
  shares = {
    list:           (params)   => this._g('/accounts/share', params),
    get:            (id, params) => this._g(`/accounts/share/${id}`, params),
    template:       ()         => this._g('/accounts/share/template'),
    create:         (body)     => this._p('/accounts/share', body),
    approve:        (id, body) => this._p(`/accounts/share/${id}?command=approve`, body),
    reject:         (id, body) => this._p(`/accounts/share/${id}?command=reject`, body),
    activate:       (id, body) => this._p(`/accounts/share/${id}?command=activate`, body),
    applyAdditional:(id, body) => this._p(`/accounts/share/${id}?command=applyadditionalshares`, body),
    redeem:         (id, body) => this._p(`/accounts/share/${id}?command=redeemshares`, body),
    close:          (id, body) => this._p(`/accounts/share/${id}?command=close`, body),
    approveShareReq:(id, body) => this._p(`/accounts/share/${id}?command=approveshare`, body),
    rejectShareReq: (id, body) => this._p(`/accounts/share/${id}?command=rejectshare`, body),
    dividends:      (id)       => this._g(`/shareproduct/${id}/dividend`),
    postDividend:   (id, body) => this._p(`/shareproduct/${id}/dividend`, body)
  };

  // ============== GROUPS & CENTERS ==============
  groups = {
    list:           (params)   => this._g('/groups', params),
    get:            (id, p)    => this._g(`/groups/${id}`, p),
    template:       ()         => this._g('/groups/template'),
    create:         (body)     => this._p('/groups', body),
    update:         (id, body) => this._u(`/groups/${id}`, body),
    activate:       (id, body) => this._p(`/groups/${id}?command=activate`, body),
    close:          (id, body) => this._p(`/groups/${id}?command=close`, body),
    assignStaff:    (id, body) => this._p(`/groups/${id}?command=assignStaff`, body),
    unassignStaff:  (id, body) => this._p(`/groups/${id}?command=unassignStaff`, body),
    assignRole:     (id, body) => this._p(`/groups/${id}?command=assignRole`, body),
    unassignRole:   (id, rid)  => this._p(`/groups/${id}?command=unassignRole&roleId=${rid}`, {}),
    associateClients:   (id, body) => this._p(`/groups/${id}?command=associateClients`, body),
    disassociateClients:(id, body) => this._p(`/groups/${id}?command=disassociateClients`, body),
    transferClients:(id, body) => this._p(`/groups/${id}?command=transferClients`, body),
    accounts:       (id)       => this._g(`/groups/${id}/accounts`),
    delete:         (id)       => this._d(`/groups/${id}`)
  };
  centers = {
    list:     (params)   => this._g('/centers', params),
    get:      (id, params) => this._g(`/centers/${id}`, params),
    template: ()         => this._g('/centers/template'),
    create:   (body)     => this._p('/centers', body),
    update:   (id, body) => this._u(`/centers/${id}`, body),
    activate: (id, body) => this._p(`/centers/${id}?command=activate`, body),
    close:    (id, body) => this._p(`/centers/${id}?command=close`, body),
    associateGroups:    (id, body) => this._p(`/centers/${id}?command=associateGroups`, body),
    disassociateGroups: (id, body) => this._p(`/centers/${id}?command=disassociateGroups`, body)
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
    list:   () => this._g('/taxes/component'),
    get:    (id) => this._g(`/taxes/component/${id}`),
    create: (b) => this._p('/taxes/component', b),
    update: (id, b) => this._u(`/taxes/component/${id}`, b)
  };
  taxGroups = {
    list:   () => this._g('/taxes/group'),
    get:    (id) => this._g(`/taxes/group/${id}`),
    create: (b) => this._p('/taxes/group', b),
    update: (id, b) => this._u(`/taxes/group/${id}`, b)
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
    template: ()       => this._g('/loanproducts/template'),
    create:   (b)      => this._p('/loanproducts', b),
    update:   (id, b)  => this._u(`/loanproducts/${id}`, b)
  };
  savingsProducts = {
    list:     ()       => this._g('/savingsproducts'),
    get:      (id)     => this._g(`/savingsproducts/${id}`),
    template: ()       => this._g('/savingsproducts/template'),
    create:   (b)      => this._p('/savingsproducts', b),
    update:   (id, b)  => this._u(`/savingsproducts/${id}`, b)
  };
  shareProducts = {
    list:     ()       => this._g('/products/share'),
    get:      (id)     => this._g(`/products/share/${id}`),
    template: ()       => this._g('/products/share/template'),
    create:   (b)      => this._p('/products/share', b),
    update:   (id, b)  => this._u(`/products/share/${id}`, b)
  };
  fdProducts = {
    list:     ()       => this._g('/fixeddepositproducts'),
    get:      (id)     => this._g(`/fixeddepositproducts/${id}`),
    template: ()       => this._g('/fixeddepositproducts/template'),
    create:   (b)      => this._p('/fixeddepositproducts', b),
    update:   (id, b)  => this._u(`/fixeddepositproducts/${id}`, b)
  };
  rdProducts = {
    list:     ()       => this._g('/recurringdepositproducts'),
    get:      (id)     => this._g(`/recurringdepositproducts/${id}`),
    template: ()       => this._g('/recurringdepositproducts/template'),
    create:   (b)      => this._p('/recurringdepositproducts', b),
    update:   (id, b)  => this._u(`/recurringdepositproducts/${id}`, b)
  };
  productMix = {
    list:     (id)     => this._g(`/loanproducts/${id}/productmix`),
    create:   (id, b)  => this._p(`/loanproducts/${id}/productmix`, b),
    update:   (id, b)  => this._u(`/loanproducts/${id}/productmix`, b),
    delete:   (id)     => this._d(`/loanproducts/${id}/productmix`)
  };
  floatingRates = {
    list:   ()        => this._g('/floatingrates'),
    get:    (id)      => this._g(`/floatingrates/${id}`),
    create: (b)       => this._p('/floatingrates', b),
    update: (id, b)   => this._u(`/floatingrates/${id}`, b)
  };
  delinquencyBuckets = {
    list:    () => this._g('/delinquency/buckets'),
    create:  (b) => this._p('/delinquency/buckets', b),
    ranges:  () => this._g('/delinquency/ranges'),
    createRange: (b) => this._p('/delinquency/ranges', b)
  };
  collateralManagement = {
    list:   () => this._g('/collateral-management'),
    create: (b) => this._p('/collateral-management', b),
    update: (id, b) => this._u(`/collateral-management/${id}`, b)
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
  financialActivityAccounts = {
    list:   ()     => this._g('/financialactivityaccounts'),
    get:    (id)   => this._g(`/financialactivityaccounts/${id}`),
    create: (body) => this._p('/financialactivityaccounts', body),
    update: (id, b) => this._u(`/financialactivityaccounts/${id}`, b),
    delete: (id)   => this._d(`/financialactivityaccounts/${id}`)
  };
  // NOTE: GL period closures are handled by glClosures above (requires officeId, confirmed
  // against Fineract's GlClosuresApiResource). Removed a duplicate, unused, less-correct
  // accountingClosure group that hit the same /glclosures endpoint without that requirement.

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
  adhocQueries = {
    list:    () => this._g('/adhocquery'),
    get:     (id) => this._g(`/adhocquery/${id}`),
    create:  (b) => this._p('/adhocquery', b),
    update:  (id, b) => this._u(`/adhocquery/${id}`, b),
    delete:  (id) => this._d(`/adhocquery/${id}`),
    runAll:  () => this._p('/adhocquery?command=execute', {})
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
    sms:        { list: () => this._g('/externalservice/SMS'),        update: (b) => this._u('/externalservice/SMS', b) },
    email:      { list: () => this._g('/externalservice/SMTP'),       update: (b) => this._u('/externalservice/SMTP', b) },
    smtpEmail:  { list: () => this._g('/externalservice/SMTP'),       update: (b) => this._u('/externalservice/SMTP', b) },
    s3:         { list: () => this._g('/externalservice/S3'),         update: (b) => this._u('/externalservice/S3', b) },
    notification:{list: () => this._g('/externalservice/NOTIFICATION'),update: (b) => this._u('/externalservice/NOTIFICATION', b) }
  };
  externalEvents = {
    list: (params) => this._g('/externalevents', params),
    configurations: () => this._g('/externalevents/configuration'),
    updateConfig: (b) => this._u('/externalevents/configuration', b)
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

  // ============== DATA TABLES, SURVEYS, SELF-SERVICE ==============
  dataTables = {
    list:       ()                 => this._g('/datatables'),
    get:        (name)             => this._g(`/datatables/${name}`),
    register:   (name, app, body)  => this._p(`/datatables/register/${name}/${app}`, body),
    deregister: (name)             => this._p(`/datatables/deregister/${name}`, {}),
    query:      (name, entityId)   => this._g(`/datatables/${name}/${entityId}`),
    create:     (body)             => this._p('/datatables', body),
    update:     (name, eid, body)  => this._u(`/datatables/${name}/${eid}`, body),
    delete:     (name, eid)        => this._d(`/datatables/${name}/${eid}`),
    deleteTable:(name)             => this._d(`/datatables/${name}`)
  };
  surveys = {
    list: () => this._g('/surveys'),
    get:  (id) => this._g(`/surveys/${id}`),
    fullDetail: (id) => this._g(`/surveys/${id}/scorecards`)
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

  search = {
    search: (query, resource = 'clients,loans,groups') =>
      this._g('/search', { query, resource }),
    advanced: (body) => this._p('/search/advance', body)
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
    upload:   (entity, formData) => this._req('POST', `/${entity}/uploadtemplate`, { body: formData, headers: {} })
  };

  // ============== CATCH-ALL ==============
  any(method, path, params, body) { return this._req(method, path, { params, body }); }
}

export const api = new FineractAPI();
export function configureAPI(c) { api.configure(c); }
