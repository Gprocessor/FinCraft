/* FinCraft · config.js
   Points to the Apache Fineract community demo server.
   CORS note: the demo server at demo.mifos.io has open CORS headers.
   tenant: default  user: mifos  pass: password */

export const LOCALE      = 'en';
export const DATE_FORMAT = 'yyyy-MM-dd';

/** Returns today's date as yyyy-MM-dd, consistent with DATE_FORMAT. */
export function today() {
  return new Date().toISOString().split('T')[0];
}

export const FINERACT_DEMO = {
  serverUrl:  'https://demo.mifos.io',
  tenantId:   'default',
  apiBase:    '/fineract-provider/api/v1',
  requestTimeoutMs:     45000,   // 45s for long reports / heavy queries
  autoConnectTimeoutMs: 15000    // 15s for initial connect / auth
};

/** Runtime config — kept as a function so future tenant-override UI can hook in. */
export function getRuntimeConfig() {
  return {
    apiBase:              FINERACT_DEMO.apiBase,
    requestTimeoutMs:     FINERACT_DEMO.requestTimeoutMs,
    autoConnectTimeoutMs: FINERACT_DEMO.autoConnectTimeoutMs
  };
}