/* FinCraft · config.js
   Points to the Apache Fineract community demo server.
   CORS note: the demo server at demo.mifos.io has open CORS headers.
   tenant: default  user: mifos  pass: password */
// ---- Shared locale & date constants ----
// Import these everywhere instead of repeating hardcoded strings.
export const LOCALE      = 'en';
export const DATE_FORMAT = 'yyyy-MM-dd';

/** Returns today's date as a yyyy-MM-dd string, consistent with DATE_FORMAT. */
export function today() {
  return new Date().toISOString().split('T')[0];
}

export const FINERACT_DEMO = {
  serverUrl:  'https://demo.mifos.io',
  tenantId:   'default',
  apiBase:    '/fineract-provider/api/v1',
  requestTimeoutMs:     30000000,
  autoConnectTimeoutMs: 10000000
};

export function getRuntimeConfig() {
  return {
    apiBase:              FINERACT_DEMO.apiBase,
    requestTimeoutMs:     FINERACT_DEMO.requestTimeoutMs,
    autoConnectTimeoutMs: FINERACT_DEMO.autoConnectTimeoutMs
  };
}
