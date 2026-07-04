/* FinCraft · pages/system/loaders/info.js — system info tab loader.
   Auto-split (2nd pass) from pages/system/loaders.js for maintainability. */

import { api } from '../../../api.js';
import { escapeHtml, fmtDate, num, sb } from '../../../utils.js';
import { extractMCEntityGroup } from '../actions.js';
import { store } from '../../../store.js';

export async function loadSystemInfo(c) {
  const el = c.querySelector('#sy-14');
  el.innerHTML = '<div class="empty-state-row">Loading system information…</div>';

  const auth = store.get('auth') || {};

  // Try to fetch real version/tenant info from Fineract endpoints
  let serverVersion = '—';
  let buildInfo = '—';
  let cacheInfo = '—';

  try {
    // Some Fineract versions expose /configurations or /info — try gracefully
    const cfg = await api.configurations.list().catch(() => null);
    if (cfg) {
      const versionCfg = (cfg.globalConfiguration || []).find(c =>
        /version|build/i.test(c.name)
      );
      if (versionCfg) serverVersion = versionCfg.value || versionCfg.stringValue || '—';
    }
  } catch {}

  try {
    const cacheRes = await api.configurations.cacheTypes?.();
    if (cacheRes) {
      const cacheArr = Array.isArray(cacheRes) ? cacheRes : (cacheRes?.cacheTypes || []);
      if (cacheArr.length) {
        cacheInfo = cacheArr.map(c => escapeHtml(c.value || c.name || c)).join(', ');
      }
    }
  } catch {}

  el.innerHTML = `
    <div class="section-header mb-2">
      <h3>System Information</h3>
    </div>
    <div class="text-muted small mb-3">
      <i class="fa-solid fa-circle-info"></i>
      Connection details, version metadata, and infrastructure information.
    </div>

    <div class="grid-2">
      <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4><i class="fa-solid fa-plug"></i> Connection</h4>
        <dl class="dl-grid">
          <dt>Server URL</dt><dd><code>${escapeHtml(auth.serverUrl || '—')}</code></dd>
          <dt>Tenant</dt><dd><b>${escapeHtml(auth.tenantId || 'default')}</b></dd>
          <dt>User</dt><dd>${escapeHtml(auth.username || '—')}</dd>
          <dt>Session Status</dt><dd>${auth.authToken ? sb('Connected') : sb('Offline')}</dd>
          <dt>API Base</dt><dd><code>/fineract-provider/api/v1</code></dd>
        </dl>
      </div>

      <div class="card-inset" style="padding:16px; border:1px solid var(--border); border-radius:4px">
        <h4><i class="fa-solid fa-code-branch"></i> Build &amp; Version</h4>
        <dl class="dl-grid">
          <dt>UI Application</dt><dd><b>FinCraft</b></dd>
          <dt>UI Version</dt><dd>1.0.0</dd>
          <dt>Fineract Server</dt><dd>${escapeHtml(serverVersion)}</dd>
          <dt>Cache Strategy</dt><dd>${cacheInfo}</dd>
          <dt>Build Date</dt><dd>${fmtDate(new Date().toISOString()) || '—'}</dd>
        </dl>
      </div>
    </div>

    <h3 class="mt-3">Available Module Permissions</h3>
    <div id="sys-perms"><div class="empty-state-row">Loading permission summary…</div></div>

    <h3 class="mt-3">Quick Diagnostics</h3>
    <div class="kpi-grid">
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-heart-pulse"></i> API Health</div>
        <div class="kpi-value" id="sys-health" style="font-size:14px">Testing…</div>
      </div>
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-gauge"></i> Last Response Time</div>
        <div class="kpi-value" id="sys-rt" style="font-size:14px">—</div>
      </div>
      <div class="kpi-card" style="text-align:left">
        <div class="kpi-label"><i class="fa-solid fa-clock"></i> Server Date</div>
        <div class="kpi-value" id="sys-time" style="font-size:14px">—</div>
      </div>
    </div>`;

  // Permission summary
  const permEl = el.querySelector('#sys-perms');
  try {
    const perms = store.get('perms') || [];
    const total = perms.length;
    const byEntity = {};
    perms.forEach(p => {
      const entity = extractMCEntityGroup(p);
      byEntity[entity] = (byEntity[entity] || 0) + 1;
    });
    const topEntities = Object.entries(byEntity).sort((a, b) => b[1] - a[1]).slice(0, 8);

    permEl.innerHTML = `
      <div class="text-muted small mb-2">${num(total)} permissions granted to the current user across ${num(Object.keys(byEntity).length)} entity groups.</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px">
        ${topEntities.map(([entity, count]) => `
          <span class="badge">${escapeHtml(entity)} (${count})</span>
        `).join('')}
        ${Object.keys(byEntity).length > 8 ? `<span class="text-muted small">… and ${Object.keys(byEntity).length - 8} more</span>` : ''}
      </div>`;
  } catch {
    permEl.innerHTML = '<div class="empty-state-row text-muted">Permission summary unavailable</div>';
  }

  // API health check
  const healthEl = el.querySelector('#sys-health');
  const rtEl = el.querySelector('#sys-rt');
  const timeEl = el.querySelector('#sys-time');

  const t0 = performance.now();
  api.offices.list().then(() => {
    const elapsed = Math.round(performance.now() - t0);
    healthEl.innerHTML = '<span class="text-success">●</span> Healthy';
    rtEl.textContent = elapsed + ' ms';
    timeEl.textContent = new Date().toISOString().substring(0, 19).replace('T', ' ');
  }).catch(e => {
    healthEl.innerHTML = '<span class="text-error">●</span> ' + escapeHtml(e.message || 'Unknown error');
    rtEl.textContent = '—';
    timeEl.textContent = '—';
  });
}
