/* FinCraft · ui/handlers/index.js — merges every domain handler registry and dispatches
   by data-action name. Replaces the original ui.js handleAction() switch statement. */
import { ClientsHandlers } from './clients.js';
import { LoansHandlers } from './loans.js';
import { SavingsHandlers } from './savings.js';
import { FixedDepositHandlers } from './fixed-deposit.js';
import { RecurringDepositHandlers } from './recurring-deposit.js';
import { ShareAccountHandlers } from './share-account.js';
import { GroupHandlers } from './group.js';
import { CenterHandlers } from './center.js';
import { OfficeHandlers } from './office.js';
import { StaffHandlers } from './staff.js';
import { TellerHandlers } from './teller.js';
import { HolidayHandlers } from './holiday.js';
import { PaymentTypeHandlers } from './payment-type.js';
import { ChargeHandlers } from './charge.js';
import { GlAccountHandlers } from './gl-account.js';
import { JournalEntryHandlers } from './journal-entry.js';
import { RepaymentHandlers } from './repayment.js';
import { SavingsDepositWithdrawalHandlers } from './savings-deposit-withdrawal.js';
import { AccountTransferHandlers } from './account-transfer.js';
import { UserHandlers } from './user.js';
import { AccountingRuleHandlers } from './accounting-rule.js';
import { ProvisioningCriteriaHandlers } from './provisioning-criteria.js';
import { FinancialActivityMappingHandlers } from './financial-activity-mapping.js';
import { StandingInstructionHandlers } from './standing-instruction.js';
import { LoanProductHandlers } from './loan-product.js';
import { SavingsProductHandlers } from './savings-product.js';
import { LoanWriteOffHandlers } from './loan-write-off.js';
import { LoanRescheduleHandlers } from './loan-reschedule.js';
import { BulkImportHandlers } from './bulk-import.js';
import { SelfServiceUserHandlers } from './self-service-user.js';
import { ConfigWizardHandlers } from './config-wizard.js';
import { RunReportHandlers } from './run-report.js';
import { AdHocQueryHandlers } from './ad-hoc-query.js';
import { RemittanceStepperHandlers } from './remittance-stepper.js';
import { toast } from '../core.js';

const registry = Object.assign({}, ClientsHandlers, LoansHandlers, SavingsHandlers, FixedDepositHandlers, RecurringDepositHandlers, ShareAccountHandlers, GroupHandlers, CenterHandlers, OfficeHandlers, StaffHandlers, TellerHandlers, HolidayHandlers, PaymentTypeHandlers, ChargeHandlers, GlAccountHandlers, JournalEntryHandlers, RepaymentHandlers, SavingsDepositWithdrawalHandlers, AccountTransferHandlers, UserHandlers, AccountingRuleHandlers, ProvisioningCriteriaHandlers, FinancialActivityMappingHandlers, StandingInstructionHandlers, LoanProductHandlers, SavingsProductHandlers, LoanWriteOffHandlers, LoanRescheduleHandlers, BulkImportHandlers, SelfServiceUserHandlers, ConfigWizardHandlers, RunReportHandlers, AdHocQueryHandlers, RemittanceStepperHandlers);

export async function handleAction(action, btn) {
  const fn = registry[action];
  if (!fn) { console.warn('[handleAction] unknown action:', action); toast('warn', 'Unknown action', action); return; }
  return fn(btn);
}
