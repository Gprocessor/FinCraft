/* FinCraft · pages/system/index.js — render() entry point.
   Converted from a 15-tab bar (which overflowed on any reasonable screen width)
   to a card-grid hub — see js/ui/section-hub.js for the rationale.
   panelId values (sy-0..sy-14) match the IDs each loader function already expects
   via c.querySelector('#sy-N') — kept as-is so none of the loaders needed changes. */

import { loadAccountNumberPrefs, loadAuditTrails, loadCOB, loadCodes, loadConfigurations, loadEntityMappings, loadExternalEvents, loadExternalServices, loadHooks, loadJobs, loadMakerCheckerConfig, loadMigrationLinks, loadRoles, loadSurveys, loadSystemInfo, loadTenantOidc } from './loaders.js';
import { renderSectionHub } from '../../ui/section-hub.js';

const SECTIONS = [
  { key: 'configurations', panelId: 'sy-0',  label: 'Configurations',       icon: 'fa-sliders',            desc: 'Global settings & feature toggles', load: loadConfigurations },
  { key: 'audit',          panelId: 'sy-1',  label: 'Audit Trails',         icon: 'fa-clipboard-list',     desc: 'Who changed what, and when',        load: loadAuditTrails },
  { key: 'codes',          panelId: 'sy-2',  label: 'Codes & Values',       icon: 'fa-list',               desc: 'Lookup lists used across the app',  load: loadCodes },
  { key: 'roles',          panelId: 'sy-3',  label: 'Roles & Permissions',  icon: 'fa-user-shield',        desc: 'Access control definitions',        load: loadRoles },
  { key: 'jobs',           panelId: 'sy-4',  label: 'Manage Jobs',          icon: 'fa-gears',              desc: 'Scheduled background jobs',         load: loadJobs },
  { key: 'external-svc',   panelId: 'sy-5',  label: 'External Services',    icon: 'fa-plug',               desc: 'Third-party service configuration', load: loadExternalServices },
  { key: 'cob',            panelId: 'sy-6',  label: 'COB',                  icon: 'fa-clock-rotate-left',  desc: 'Close-of-business run status',      load: loadCOB },
  { key: 'hooks',          panelId: 'sy-7',  label: 'Hooks',                 icon: 'fa-link',               desc: 'Webhooks & event subscriptions',    load: loadHooks },
  { key: 'acct-num',       panelId: 'sy-8',  label: 'Account Number Prefs', icon: 'fa-hashtag',            desc: 'Account numbering format rules',    load: loadAccountNumberPrefs },
  { key: 'entity-map',     panelId: 'sy-9',  label: 'Entity Mappings',       icon: 'fa-diagram-project',    desc: 'Entity-to-entity data mappings',    load: loadEntityMappings },
  { key: 'ext-events',     panelId: 'sy-10', label: 'External Events',      icon: 'fa-bolt',               desc: 'Outbound event configuration',      load: loadExternalEvents },
  { key: 'maker-checker',  panelId: 'sy-11', label: 'Maker-Checker Config', icon: 'fa-user-check',         desc: 'Which actions require approval',    load: loadMakerCheckerConfig },
  { key: 'surveys',        panelId: 'sy-12', label: 'Surveys',               icon: 'fa-clipboard-question', desc: 'Survey definitions',                load: loadSurveys },
  { key: 'migration',      panelId: 'sy-13', label: 'Migration Links',       icon: 'fa-right-left',         desc: 'Data migration references',         load: loadMigrationLinks },
  { key: 'info',           panelId: 'sy-14', label: 'System Info',           icon: 'fa-circle-info',        desc: 'Version & environment details',     load: loadSystemInfo },
  { key: 'oidc',           panelId: 'sy-15', label: 'SSO / OIDC Config',     icon: 'fa-key',                desc: "Tenant's OIDC identity-provider settings", load: loadTenantOidc }
];

export async function render(c, params = {}) {
  renderSectionHub(c, {
    pageKey: 'system',
    title: 'System',
    subtitle: 'Platform configuration & maintenance',
    sections: SECTIONS,
    params
  });
}
