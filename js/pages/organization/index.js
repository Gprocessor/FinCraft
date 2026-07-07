/* FinCraft · pages/organization/index.js — render() entry point.
   Converted from a 15-tab bar (which overflowed on any reasonable screen width,
   and previously eagerly loaded 8 sections' data on every page visit) to a
   card-grid hub — see js/ui/section-hub.js for the rationale.
   panelId values (og-0..og-14) match the IDs each loader function already expects
   via c.querySelector('#og-N') — kept as-is so none of the loaders needed changes. */

import { api } from '../../api.js';
import { loadAdhocQueries, loadBulkImports, loadCurrencies, loadEmailCampaigns, loadEntityDatatableChecks, loadExternalAssetOwners, loadFunds, loadGroupHierarchy, loadHolidays, loadLoanOriginators, loadOffices, loadPaymentTypes, loadSmsCampaigns, loadStaff, loadStandingInstructions, loadTellers, loadWorkingDays } from './loaders.js';
import { renderSectionHub } from '../../ui/section-hub.js';

// Offices and Holidays both need the office list (previously fetched once up-front and
// shared). Now that sections load on demand, each fetches it independently on first visit.
async function loadOfficesSection(c) {
  const offices = await api.offices.list().catch(() => []);
  loadOffices(c, Array.isArray(offices) ? offices : []);
}
async function loadHolidaysSection(c) {
  const offices = await api.offices.list().catch(() => []);
  loadHolidays(c, Array.isArray(offices) ? offices : []);
}

const SECTIONS = [
  { key: 'offices',    panelId: 'og-0',  label: 'Offices',                  icon: 'fa-building',          desc: 'Branch/office hierarchy',            load: loadOfficesSection },
  { key: 'staff',      panelId: 'og-1',  label: 'Staff',                    icon: 'fa-id-card',            desc: 'Employee records',                   load: loadStaff },
  { key: 'tellers',    panelId: 'og-2',  label: 'Tellers & Cashiers',       icon: 'fa-cash-register',      desc: 'Teller windows & cash management',   load: loadTellers },
  { key: 'holidays',   panelId: 'og-3',  label: 'Holidays',                 icon: 'fa-calendar-day',       desc: 'Non-working days by office',         load: loadHolidaysSection },
  { key: 'workdays',   panelId: 'og-4',  label: 'Working Days',             icon: 'fa-calendar-check',     desc: 'Which weekdays branches operate',    load: loadWorkingDays },
  { key: 'currencies', panelId: 'og-5',  label: 'Currencies',               icon: 'fa-coins',              desc: 'Enabled currencies for this tenant', load: loadCurrencies },
  { key: 'paytypes',   panelId: 'og-6',  label: 'Payment Types',            icon: 'fa-money-bill-wave',    desc: 'Deposit/withdrawal payment methods', load: loadPaymentTypes },
  { key: 'si',         panelId: 'og-7',  label: 'Standing Instructions',    icon: 'fa-right-left',         desc: 'Recurring account transfers',        load: loadStandingInstructions },
  { key: 'funds',      panelId: 'og-8',  label: 'Funds',                    icon: 'fa-sack-dollar',        desc: 'Funding source definitions',         load: loadFunds },
  { key: 'adhoc',      panelId: 'og-9',  label: 'Adhoc Queries',            icon: 'fa-magnifying-glass',   desc: 'Custom SQL query definitions',       load: loadAdhocQueries },
  { key: 'originators', panelId: 'og-10', label: 'Loan Originators',        icon: 'fa-handshake',          desc: 'Third-party loan origination',       load: loadLoanOriginators },
  { key: 'eao',        panelId: 'og-11', label: 'External Asset Owners',    icon: 'fa-building-columns',   desc: 'Loan sale/participation owners',     load: loadExternalAssetOwners },
  { key: 'dt-checks',  panelId: 'og-12', label: 'Entity Datatable Checks',  icon: 'fa-table-list',         desc: 'Required datatable validations',     load: loadEntityDatatableChecks },
  { key: 'bulk',       panelId: 'og-13', label: 'Bulk Imports',             icon: 'fa-file-arrow-up',      desc: 'Spreadsheet bulk data import',       load: loadBulkImports },
  { key: 'sms',        panelId: 'og-14', label: 'SMS Campaigns',            icon: 'fa-comment-sms',        desc: 'Outbound SMS campaign management',   load: loadSmsCampaigns },
  { key: 'grouplevels', panelId: 'og-15', label: 'Group Hierarchy Levels',  icon: 'fa-sitemap',            desc: 'How Groups & Centers nest (read-only)', load: loadGroupHierarchy },
  { key: 'email',      panelId: 'og-16', label: 'Email Campaigns',          icon: 'fa-envelope',           desc: 'Outbound email campaigns & SMTP config', load: loadEmailCampaigns }
];

export async function render(c, params = {}) {
  renderSectionHub(c, {
    pageKey: 'organization',
    title: 'Organization',
    subtitle: 'Offices, staff, holidays, operational config & SMS campaigns',
    sections: SECTIONS,
    params
  });
}
