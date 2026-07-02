/* FinCraft · api/index.js — assembles the FineractAPI client from its domain modules.
   Each domain module (clients.js, loans.js, ...) exports factory functions that take the
   shared `self` (this FineractAPI instance) and return the namespaced method object, e.g.
   self.clients.list(). This keeps js/api.js's public surface — `import { api } from './api.js'`
   — completely unchanged for the rest of the app. */
import { FineractAPI } from './core.js';
import { makePasswordAPI, makeTenantOidcAPI, makeTwoFactorAPI, makeUserDetailsAPI } from './auth-account.js';
import { makeClientsAPI } from './clients.js';
import { makeCollateralManagementAPI, makeDelinquencyBucketsAPI, makeExternalAssetOwnersAPI, makeLoanOriginatorsAPI, makeLoansAPI } from './loans.js';
import { makeFixedDepositsAPI, makeRecurringDepositsAPI, makeSavingsAPI } from './savings-deposits.js';
import { makeSharesAPI } from './shares.js';
import { makeCalendarsAPI, makeCentersAPI, makeGroupLevelsAPI, makeGroupsAPI, makeMeetingsAPI } from './groups-centers.js';
import { makeCodesAPI, makeCurrenciesAPI, makeFundsAPI, makeHolidaysAPI, makeOfficesAPI, makePaymentTypesAPI, makeStaffAPI, makeTellersAPI, makeWorkingDaysAPI } from './organization.js';
import { makeFdProductsAPI, makeFloatingRatesAPI, makeLoanProductsAPI, makeProductMixAPI, makeRdProductsAPI, makeSavingsProductsAPI, makeShareProductsAPI } from './products.js';
import { makeAccountingRulesAPI, makeFinancialActivityAccountsAPI, makeGlAccountsAPI, makeGlClosuresAPI, makeJournalEntriesAPI, makeOpeningBalancesAPI, makeProvisioningAPI, makeRunAccrualsAPI, makeTaxComponentsAPI, makeTaxGroupsAPI } from './accounting.js';
import { makeAdhocQueriesAPI, makeCollectionSheetAPI, makeDataTablesAPI, makeEntityDatatableChecksAPI, makeReportsAPI, makeRunReportsAPI } from './reports.js';
import { makeAccountNumberPreferencesAPI, makeAuditsAPI, makeConfigurationsAPI, makeEntityToEntityMappingsAPI, makeJobsAPI, makeMakerCheckerTasksAPI, makeMakercheckerAPI, makePermissionsAPI, makeRolesAPI, makeSurveysAdminAPI, makeUsersAPI } from './admin.js';
import { makeExternalEventsAPI, makeExternalServicesAPI, makeHooksAPI, makeNotificationsAPI, makeSmsCampaignsAPI } from './integrations.js';
import { makeBatchAPI, makeBulkImportsAPI, makeChargesAPI, makeCobAPI, makeDocumentsAPI, makeImagesAPI, makeNotesAPI, makeSearchAPI, makeSelfServiceAPI, makeStandingInstructionsAPI, makeTemplatesAPI, makeTransfersAPI } from './misc.js';

export class FineractAPIFull extends FineractAPI {
  constructor() {
    super();
    this.userDetails = makeUserDetailsAPI(this);
    this.password = makePasswordAPI(this);
    this.twoFactor = makeTwoFactorAPI(this);
    this.tenantOidc = makeTenantOidcAPI(this);
    this.clients = makeClientsAPI(this);
    this.loans = makeLoansAPI(this);
    this.loanOriginators = makeLoanOriginatorsAPI(this);
    this.externalAssetOwners = makeExternalAssetOwnersAPI(this);
    this.savings = makeSavingsAPI(this);
    this.fixedDeposits = makeFixedDepositsAPI(this);
    this.recurringDeposits = makeRecurringDepositsAPI(this);
    this.shares = makeSharesAPI(this);
    this.groups = makeGroupsAPI(this);
    this.centers = makeCentersAPI(this);
    this.calendars = makeCalendarsAPI(this);
    this.meetings = makeMeetingsAPI(this);
    this.groupLevels = makeGroupLevelsAPI(this);
    this.offices = makeOfficesAPI(this);
    this.staff = makeStaffAPI(this);
    this.tellers = makeTellersAPI(this);
    this.charges = makeChargesAPI(this);
    this.taxComponents = makeTaxComponentsAPI(this);
    this.taxGroups = makeTaxGroupsAPI(this);
    this.codes = makeCodesAPI(this);
    this.paymentTypes = makePaymentTypesAPI(this);
    this.holidays = makeHolidaysAPI(this);
    this.workingDays = makeWorkingDaysAPI(this);
    this.loanProducts = makeLoanProductsAPI(this);
    this.savingsProducts = makeSavingsProductsAPI(this);
    this.shareProducts = makeShareProductsAPI(this);
    this.fdProducts = makeFdProductsAPI(this);
    this.rdProducts = makeRdProductsAPI(this);
    this.productMix = makeProductMixAPI(this);
    this.floatingRates = makeFloatingRatesAPI(this);
    this.delinquencyBuckets = makeDelinquencyBucketsAPI(this);
    this.collateralManagement = makeCollateralManagementAPI(this);
    this.journalEntries = makeJournalEntriesAPI(this);
    this.glAccounts = makeGlAccountsAPI(this);
    this.glClosures = makeGlClosuresAPI(this);
    this.accountingRules = makeAccountingRulesAPI(this);
    this.provisioning = makeProvisioningAPI(this);
    this.runAccruals = makeRunAccrualsAPI(this);
    this.openingBalances = makeOpeningBalancesAPI(this);
    this.financialActivityAccounts = makeFinancialActivityAccountsAPI(this);
    this.reports = makeReportsAPI(this);
    this.runReports = makeRunReportsAPI(this);
    this.collectionSheet = makeCollectionSheetAPI(this);
    this.adhocQueries = makeAdhocQueriesAPI(this);
    this.entityDatatableChecks = makeEntityDatatableChecksAPI(this);
    this.funds = makeFundsAPI(this);
    this.users = makeUsersAPI(this);
    this.roles = makeRolesAPI(this);
    this.permissions = makePermissionsAPI(this);
    this.jobs = makeJobsAPI(this);
    this.audits = makeAuditsAPI(this);
    this.makerchecker = makeMakercheckerAPI(this);
    this.configurations = makeConfigurationsAPI(this);
    this.surveysAdmin = makeSurveysAdminAPI(this);
    this.makerCheckerTasks = makeMakerCheckerTasksAPI(this);
    this.entityToEntityMappings = makeEntityToEntityMappingsAPI(this);
    this.accountNumberPreferences = makeAccountNumberPreferencesAPI(this);
    this.notifications = makeNotificationsAPI(this);
    this.hooks = makeHooksAPI(this);
    this.externalServices = makeExternalServicesAPI(this);
    this.externalEvents = makeExternalEventsAPI(this);
    this.smsCampaigns = makeSmsCampaignsAPI(this);
    this.currencies = makeCurrenciesAPI(this);
    this.templates = makeTemplatesAPI(this);
    this.dataTables = makeDataTablesAPI(this);
    this.selfService = makeSelfServiceAPI(this);
    this.search = makeSearchAPI(this);
    this.batch = makeBatchAPI(this);
    this.documents = makeDocumentsAPI(this);
    this.images = makeImagesAPI(this);
    this.notes = makeNotesAPI(this);
    this.transfers = makeTransfersAPI(this);
    this.standingInstructions = makeStandingInstructionsAPI(this);
    this.cob = makeCobAPI(this);
    this.bulkImports = makeBulkImportsAPI(this);
  }
}

export const api = new FineractAPIFull();
export function configureAPI(c) { api.configure(c); }
