/* FinCraft · ui/section-hub.js — card-grid navigation for pages with too many
   sections to fit in a tab bar (System, Organization, Products, Accounting).
   Replaces the old horizontally-overflowing .tabs pattern for these "settings hub"
   style pages. Entity detail pages (Client, Loan, Savings, etc.) still use tabs —
   there, you flip between a handful of views on ONE record; here, each section is
   closer to its own independent screen, and a labelled/iconed grid is far more
   discoverable than a 9-to-15-wide scrolling tab strip. */
import { navigate } from '../router.js';

/**
 * @param {HTMLElement} c - the page's root container
 * @param {Object} opts
 * @param {string} opts.pageKey - router page key (e.g. 'system'), used to build back-links
 * @param {string} opts.title - page title
 * @param {string} opts.subtitle - page subtitle
 * @param {Array}  opts.sections - [{ key, label, icon, desc, panelId, load(root) }]
 *   panelId: the DOM id this section's existing loader function expects to find via
 *   c.querySelector('#'+panelId) — inherited from the old tab-panel markup so loaders
 *   didn't need to change. load(root) is called with the page root, matching how these
 *   loaders were always called (not just the inner content container).
 * @param {Object} opts.params - the params this render() call received (reads params.section)
 * @param {string} [opts.headerExtra] - optional extra HTML for the page-header's action area
 */
export function renderSectionHub(c, { pageKey, title, subtitle, sections, params, headerExtra }) {
  const activeKey = params?.section;
  const active = activeKey ? sections.find(s => s.key === activeKey) : null;

  if (!active) {
    c.innerHTML = `
      <div class="page-header mb-3">
        <div>
          <h1>${title}</h1>
          <div class="text-muted">${subtitle}</div>
        </div>
        ${headerExtra ? `<div class="page-actions">${headerExtra}</div>` : ''}
      </div>
      <div class="hub-grid">
        ${sections.map(s => `
          <button class="hub-card" data-hub-section="${s.key}">
            <div class="hub-card-icon"><i class="fa-solid ${s.icon}"></i></div>
            <div class="hub-card-label">${s.label}</div>
            ${s.desc ? `<div class="hub-card-desc">${s.desc}</div>` : ''}
          </button>`).join('')}
      </div>`;
    c.querySelectorAll('[data-hub-section]').forEach(btn =>
      btn.addEventListener('click', () => navigate(pageKey, { section: btn.dataset.hubSection })));
    return;
  }

  c.innerHTML = `
    <button class="hub-back" data-hub-back><i class="fa-solid fa-arrow-left"></i> ${title}</button>
    <div class="page-header mb-3">
      <div>
        <h1>${active.label}</h1>
        ${active.desc ? `<div class="text-muted">${active.desc}</div>` : ''}
      </div>
    </div>
    <div class="card">
      <div id="${active.panelId}" class="empty-state-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>
    </div>`;
  c.querySelector('[data-hub-back]').addEventListener('click', () => navigate(pageKey));

  active.load(c);
}
