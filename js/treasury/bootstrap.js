/* FinCraft · treasury/bootstrap.js — Phase 13: Tenant bootstrap / self-provisioning.

   Fineract datatables are registered PER-TENANT (each tenant is its own DB schema, selected by
   the `Fineract-Platform-TenantId` header — see js/api/treasury.js §multi-tenancy). So a brand-new
   tenant has NONE of the eight `dt_*` treasury tables until something creates them. This module is
   that "something": it runs the already-idempotent `api.treasury.ensureTreasuryDatatables()`
   (list → create-if-missing) automatically at first login, so no operator ever has to register
   datatables by hand or run admin SQL before the treasury screens work.

   IMPORTANT real-world constraint honored here: `dt_treasury_thresholds` has MANDATORY GL-account
   columns (see TREASURY_DATATABLES + thresholds.js#upsertThresholds), so a "blank" config row
   CANNOT be force-seeded — upsertThresholds() throws if the vault/cash-at-tellers/bank GL ids are
   missing. That is by design: real GL account ids can only come from a human choosing them on the
   Treasury Settings screen. Therefore bootstrap does NOT fabricate a threshold row; it provisions
   the tables (the part that genuinely can be automated) and reports whether an office still needs
   its one-time Settings configuration, so the UI can route there. seedTreasuryThresholds() is kept
   as an explicit helper for the case where a caller already HAS real GL ids (e.g. a future setup
   wizard), and is a safe no-op otherwise. */

import { api } from '../api.js';
import { store } from '../store.js';
import { getThresholds, upsertThresholds } from './thresholds.js';

/** Session-scoped guard so the (network) datatable-ensure only runs once per tenant per load,
 *  no matter how many times showApp()/a treasury screen calls initializeTreasuryTenant(). Keyed
 *  by tenantId so switching tenants in the same session re-runs provisioning for the new one. */
const _ensuredTenants = new Map(); // tenantId -> Promise<ensureResult>

function currentTenantId() {
  return (store.get('auth') || {}).tenantId || 'default';
}

/**
 * Idempotently ensure all eight treasury datatables exist on the currently-connected tenant.
 * Thin wrapper over the real api.treasury.ensureTreasuryDatatables() that adds per-tenant,
 * per-session memoization (so repeated calls from bootstrap + self-healing don't re-hit
 * GET/POST /datatables every time). Pass { force:true } to bypass the cache (e.g. after a known
 * tenant switch, or a manual "re-provision" admin action).
 * @returns {Promise<{created:string[], alreadyPresent:string[], failed:{name:string,error:*}[]}>}
 */
export async function ensureTreasuryDatatables({ force = false } = {}) {
  const tenantId = currentTenantId();
  if (!force && _ensuredTenants.has(tenantId)) return _ensuredTenants.get(tenantId);

  const p = api.treasury.ensureTreasuryDatatables();
  _ensuredTenants.set(tenantId, p);
  try {
    return await p;
  } catch (err) {
    // Don't cache a failure — a transient network error shouldn't permanently block a later retry.
    _ensuredTenants.delete(tenantId);
    throw err;
  }
}

/**
 * Seed a treasury threshold row for an office — ONLY possible when real GL account ids are
 * supplied, because dt_treasury_thresholds' GL columns are mandatory (upsertThresholds throws
 * otherwise, by design). Returns the existing config untouched if the office is already
 * configured; returns null (a safe no-op) if the required GL ids weren't provided, leaving the
 * office in the legitimate "not configured yet, go to Settings" state rather than throwing.
 * @param {number} officeId
 * @param {object} [seed]
 * @param {number} [seed.vaultGlAccountId]
 * @param {number} [seed.cashAtTellersGlAccountId]
 * @param {number} [seed.bankGlAccountId]
 * @param {number} [seed.reserveBufferAmount=0]
 * @param {string} [seed.currencyCode]
 */
export async function seedTreasuryThresholds(officeId, seed = {}) {
  const existing = await getThresholds(officeId).catch(() => null);
  if (existing) return existing; // never overwrite an office that's already configured

  const currencyCode = seed.currencyCode || store.get('defaultCurrency') || null;
  const haveRequiredGls = seed.vaultGlAccountId && seed.cashAtTellersGlAccountId && seed.bankGlAccountId;
  if (!haveRequiredGls || !currencyCode) {
    // Cannot (and must not) fabricate mandatory GL mappings — that's a human decision made on the
    // Treasury Settings screen. Signal "still needs setup" without throwing.
    return null;
  }

  await upsertThresholds(officeId, {
    vaultGlAccountId: seed.vaultGlAccountId,
    cashAtTellersGlAccountId: seed.cashAtTellersGlAccountId,
    bankGlAccountId: seed.bankGlAccountId,
    reserveBufferAmount: seed.reserveBufferAmount ?? 0,
    currencyCode
  });
  return getThresholds(officeId);
}

/**
 * Is this office ready to use the treasury write screens?
 * @param {number} officeId
 * @returns {Promise<{configured:boolean, requiresSetup:boolean, thresholds:object|null}>}
 */
export async function validateTreasuryConfiguration(officeId) {
  const thresholds = await getThresholds(officeId).catch(() => null);
  return { configured: !!thresholds, requiresSetup: !thresholds, thresholds };
}

/**
 * One-call tenant bootstrap, safe to fire-and-forget at login. Provisions the datatables (the
 * genuinely-automatable part) and reports config state for the given office so the caller/UI can
 * decide whether to nudge the user to Treasury Settings. Never throws for the "office not
 * configured yet" case — that's an expected state, not an error.
 * @param {number} [officeId]  office to check config for (defaults to the signed-in user's office)
 * @param {object} [opts]
 * @param {string} [opts.currencyCode]
 * @param {boolean} [opts.force]  bypass the per-tenant ensure cache
 * @returns {Promise<{tenantId:string, provisioning:object, office:number|null, configured:boolean, requiresSetup:boolean, ok:boolean}>}
 */
export async function initializeTreasuryTenant(officeId, opts = {}) {
  const tenantId = currentTenantId();
  const auth = store.get('auth') || {};
  const resolvedOffice = officeId ?? auth.officeId ?? null;

  const result = {
    tenantId,
    provisioning: { created: [], alreadyPresent: [], failed: [] },
    office: resolvedOffice,
    configured: false,
    requiresSetup: true,
    ok: false
  };

  // 1) Provision datatables (idempotent, per-tenant memoized).
  try {
    result.provisioning = await ensureTreasuryDatatables({ force: opts.force });
  } catch (err) {
    result.provisioning = { created: [], alreadyPresent: [], failed: [{ name: 'ensureTreasuryDatatables', error: err?.message || String(err) }] };
    // Provisioning failing is the one genuine error state — surface it, but don't throw from a
    // login-path bootstrap; the caller logs it and the treasury screens will surface it again.
    return result;
  }

  // 2) Report config state for the office (no fabrication — see module header).
  if (resolvedOffice != null) {
    const cfg = await validateTreasuryConfiguration(resolvedOffice);
    result.configured = cfg.configured;
    result.requiresSetup = cfg.requiresSetup;
  }

  result.ok = (result.provisioning.failed || []).length === 0;
  return result;
}

/** Test/utility hook: clear the per-tenant ensure cache (used by the health module's force paths
 *  and by tests that stub api.treasury between runs). */
export function _resetBootstrapCache() {
  _ensuredTenants.clear();
}
