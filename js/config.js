/* FinCraft · config.js
   Points to the Apache Fineract community demo server.
   CORS note: the demo server at demo.mifos.io has open CORS headers.
   tenant: default  user: mifos  pass: password */
export const FINERACT_DEMO = {
  serverUrl:  'https://132.226.213.96:8443',
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
