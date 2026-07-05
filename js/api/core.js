/* FinCraft · api.js — Apache Fineract REST API client.
   All endpoints follow the canonical Fineract paths under /fineract-provider/api/v1
   See: https://demo.mifos.io/api-docs/apiLive.htm */
import { getRuntimeConfig, LOCALE, DATE_FORMAT } from '../config.js';

const CFG = getRuntimeConfig();


export class FineractAPI {
  constructor() { this.serverUrl = ''; this.tenantId = 'default'; this.authToken = ''; this.tfaToken = ''; this._onUnauthorized = null; }

  configure({ serverUrl, tenantId, authToken, tfaToken }) {
    if (serverUrl != null) this.serverUrl = serverUrl.replace(/\/$/, '');
    if (tenantId  != null) this.tenantId  = tenantId;
    if (authToken != null) this.authToken = authToken;
    if (tfaToken  != null) this.tfaToken  = tfaToken;
  }
  reset() { this.serverUrl = ''; this.authToken = ''; this.tfaToken = ''; }

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
    if (this.tfaToken) h['Fineract-Platform-TFA-Token'] = this.tfaToken;
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
  return r || {};   // Return the FULL response — token + permissions + roles
}

  // ============== CATCH-ALL ==============
  any(method, path, params, body) { return this._req(method, path, { params, body }); }
}
