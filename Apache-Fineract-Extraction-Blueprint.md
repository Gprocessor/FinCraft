# Apache Fineract Extraction Blueprint for FinCraft

> Note: The local workspace does not include the upstream Apache Fineract source tree, so this blueprint is grounded in the current FinCraft implementation in this repository plus the canonical Apache Fineract architecture, module layout, permissions, and workflow patterns used by the platform.

## 1. Executive Summary

Apache Fineract is a modular, tenant-aware, permission-driven core banking platform. Its architecture is built around:

- a REST API layer for business operations
- a service/command pattern for write operations
- domain entities persisted in relational tables
- a strong authorization model based on permissions and roles
- maker-checker workflows for sensitive actions
- accounting and loan/savings lifecycle engines tied to product configuration

For FinCraft, the practical goal is not to recreate the whole backend, but to mirror the functional contract of Fineract at the UI and API integration layer. The current FinCraft codebase already covers major parts of this surface through modules such as [js/api/core.js](js/api/core.js), [js/api/index.js](js/api/index.js), [js/api/loans.js](js/api/loans.js), [js/api/savings-deposits.js](js/api/savings-deposits.js), [js/api/accounting.js](js/api/accounting.js), [js/api/admin.js](js/api/admin.js), and [js/router.js](js/router.js).

## 2. Fineract Architecture Overview

### Core architectural layers
- API layer: REST resources and controllers
- Command layer: request handling, validation, and command execution
- Service layer: business logic and transaction orchestration
- Domain layer: entities, value objects, status enums, and rules
- Persistence layer: repositories and relational tables
- Security layer: authentication, authorization, tenant resolution, and audit
- Accounting layer: GL accounts, journal entries, product mappings, posting rules
- Workflow layer: approvals, checks, scheduled jobs, notifications

### Fineract runtime concerns
- tenant-aware multi-tenancy
- role and permission-based access
- maker-checker for sensitive workflows
- product-driven loan/savings configuration
- accounting integration for every transaction
- configurable office/branch/staff hierarchy

### FinCraft mapping
FinCraft is already acting as a Fineract-facing front-end and should continue to evolve as a capability-aware UI integration layer rather than a server replacement.

## 3. Module Inventory

| Module | Business Purpose | Main Fineract Concept | FinCraft Equivalent | Priority |
|---|---|---|---|---|
| Clients | Customer onboarding, lifecycle, identifiers, notes | Client domain | Present in [js/api/clients.js](js/api/clients.js) and [js/pages/clients.js](js/pages/clients.js) | Critical |
| Groups | Group-based borrower structures | Group, group membership | Present in [js/api/groups-centers.js](js/api/groups-centers.js) and [js/pages/groups.js](js/pages/groups.js) | High |
| Centers | Branch/center organizational units | Center | Present in [js/api/groups-centers.js](js/api/groups-centers.js) and [js/pages/centers.js](js/pages/centers.js) | High |
| Loans | Loan application, approval, disbursal, repayment, reschedule, close | Loan account lifecycle | Present in [js/api/loans.js](js/api/loans.js) and [js/pages/loans.js](js/pages/loans.js) | Critical |
| Savings | Savings products and accounts | Savings account lifecycle | Present in [js/api/savings-deposits.js](js/api/savings-deposits.js) and [js/pages/savings.js](js/pages/savings.js) | Critical |
| Fixed Deposits | Term deposit products | Deposit products/accounts | Present in [js/api/savings-deposits.js](js/api/savings-deposits.js) and [js/pages/deposits.js](js/pages/deposits.js) | High |
| Recurring Deposits | Recurring deposit accounts | Deposit products/accounts | Present in [js/api/savings-deposits.js](js/api/savings-deposits.js) and [js/pages/deposits.js](js/pages/deposits.js) | High |
| Shares | Share accounts and products | Share products/accounts | Present in [js/api/shares.js](js/api/shares.js) and [js/pages/shares.js](js/pages/shares.js) | High |
| Accounting | Journal entries, GL accounts, closures, rules | GL and accounting engine | Present in [js/api/accounting.js](js/api/accounting.js) and [js/pages/accounting.js](js/pages/accounting.js) | Critical |
| Products | Loan/savings/share product configuration | Product domain | Present in [js/api/products.js](js/api/products.js) and [js/pages/products.js](js/pages/products.js) | High |
| Charges | Charges and fees | Charges domain | Present in [js/api/misc.js](js/api/misc.js) and [js/pages/charges.js](js/pages/charges.js) | High |
| Offices / Staff | Organization hierarchy | Office, staff | Present in [js/api/organization.js](js/api/organization.js) and [js/pages/organization.js](js/pages/organization.js) | High |
| Users / Roles / Permissions | Identity and authorization | User/role/permission | Present in [js/api/admin.js](js/api/admin.js) and [js/pages/users.js](js/pages/users.js) | Critical |
| Reports | Reporting and parameterized execution | Report domain | Present in [js/api/reports.js](js/api/reports.js) and [js/pages/reports.js](js/pages/reports.js) | High |
| Jobs / Scheduler | Background processing | Jobs, scheduled tasks, COB | Partial in [js/api/admin.js](js/api/admin.js) | High |
| Maker Checker | Approval workflow | Command source, approval state | Partial | Critical |
| Notifications / Hooks | Event-driven integrations | Hooks, notifications, external services | Present in [js/api/integrations.js](js/api/integrations.js) | Medium |
| Self Service | Customer-facing portal access | Self-service users | Partial in [js/api/misc.js](js/api/misc.js) and [js/pages/self-service.js](js/pages/self-service.js) | Medium |

## 4. API Catalog

### Core API families

#### Clients
- GET /clients
- GET /clients/{clientId}
- POST /clients
- PUT /clients/{clientId}
- POST /clients/{clientId}?command=activate
- POST /clients/{clientId}?command=close
- POST /clients/{clientId}?command=identify
- POST /clients/{clientId}?command=assignStaff

FinCraft equivalent: present in [js/api/clients.js](js/api/clients.js) and [js/pages/clients.js](js/pages/clients.js).

#### Loans
- GET /loans
- GET /loans/{loanId}
- POST /loans
- POST /loans/{loanId}?command=approve
- POST /loans/{loanId}?command=disburse
- POST /loans/{loanId}?command=repayment
- POST /loans/{loanId}?command=writeoff
- POST /loans/{loanId}?command=close
- POST /loans/{loanId}?command=reschedule
- POST /loans/{loanId}?command=undoapproval

FinCraft equivalent: present in [js/api/loans.js](js/api/loans.js) and [js/pages/loans.js](js/pages/loans.js).

#### Savings
- GET /savingsaccounts
- GET /savingsaccounts/{accountId}
- POST /savingsaccounts
- POST /savingsaccounts/{accountId}?command=activate
- POST /savingsaccounts/{accountId}?command=deposit
- POST /savingsaccounts/{accountId}?command=withdrawal
- POST /savingsaccounts/{accountId}?command=close
- POST /savingsaccounts/{accountId}?command=approve

FinCraft equivalent: present in [js/api/savings-deposits.js](js/api/savings-deposits.js) and [js/pages/savings.js](js/pages/savings.js).

#### Accounting
- GET /glaccounts
- POST /glaccounts
- GET /journalentries
- POST /journalentries
- GET /glclosures
- POST /glclosures
- GET /accountingrules
- POST /accountingrules

FinCraft equivalent: present in [js/api/accounting.js](js/api/accounting.js) and [js/pages/accounting.js](js/pages/accounting.js).

#### Products
- GET /loanproducts
- POST /loanproducts
- GET /savingsproducts
- POST /savingsproducts
- GET /shareproducts
- POST /shareproducts
- GET /fixeddepositproducts
- POST /fixeddepositproducts
- GET /recurringdepositproducts
- POST /recurringdepositproducts

FinCraft equivalent: present in [js/api/products.js](js/api/products.js) and [js/pages/products.js](js/pages/products.js).

#### Organization / Admin
- GET /offices
- GET /staff
- GET /tellers
- GET /holidays
- GET /codes
- GET /currencies
- GET /paymenttypes
- GET /users
- GET /roles
- GET /permissions
- GET /jobs
- GET /audits

FinCraft equivalent: present in [js/api/organization.js](js/api/organization.js), [js/api/admin.js](js/api/admin.js), and [js/pages/organization.js](js/pages/organization.js).

#### Reports and Data Tables
- GET /reports
- POST /runreports
- GET /datatables
- POST /datatables
- GET /adhocquery

FinCraft equivalent: present in [js/api/reports.js](js/api/reports.js) and [js/pages/reports.js](js/pages/reports.js).

#### Integrations / Notifications
- GET /hooks
- POST /hooks
- GET /externalservice
- GET /notifications
- GET /smscampaigns
- GET /emailcampaigns

FinCraft equivalent: present in [js/api/integrations.js](js/api/integrations.js).

## 5. Permission Matrix

Fineract permissions are typically expressed as codes such as READ_CLIENT, CREATE_CLIENT, UPDATE_CLIENT, DELETE_CLIENT, APPROVE_LOAN, DISBURSE_LOAN, ACTIVATE_SAVINGSACCOUNT, and so on.

| Module | Permission Pattern | Purpose | FinCraft Status |
|---|---|---|---|
| Clients | READ_CLIENT / CREATE_CLIENT / UPDATE_CLIENT | Read and mutate clients | Present in [js/router.js](js/router.js) |
| Loans | READ_LOAN / APPROVE_LOAN / DISBURSE_LOAN / REPAYMENT_LOAN | Loan lifecycle control | Present in [js/router.js](js/router.js) and [js/api/loans.js](js/api/loans.js) |
| Savings | READ_SAVINGSACCOUNT / ACTIVATE_SAVINGSACCOUNT / DEPOSIT_SAVINGSACCOUNT / WITHDRAWAL_SAVINGSACCOUNT | Savings account actions | Present in [js/router.js](js/router.js) |
| Accounting | READ_JOURNALENTRY / CREATE_JOURNALENTRY / CREATE_GLACCOUNT | Accounting workflows | Present in [js/api/accounting.js](js/api/accounting.js) |
| Admin | READ_USER / CREATE_USER / READ_ROLE / CREATE_ROLE | Identity and authorization | Present in [js/api/admin.js](js/api/admin.js) |
| Reports | READ_REPORT / RUN_REPORT | Reports and analytics | Present in [js/api/reports.js](js/api/reports.js) |
| Maker Checker | CHECKER_APPROVE / CHECKER_REJECT / CHECKER_DELETE | Approval workflow | Partial |

### Important implementation note
The current route guard in [js/router.js](js/router.js) should continue to treat permissions as dynamic capability checks rather than hard-coded UI access control only.

## 6. Namespace / Package Map

| Layer | Typical Fineract Package Pattern | FinCraft Mapping |
|---|---|---|
| API layer | org.apache.fineract.*.api | [js/api](js/api) |
| Service layer | org.apache.fineract.*.service | [js/api](js/api) and page modules |
| Domain layer | org.apache.fineract.*.domain | page/data model concepts |
| Repository layer | org.apache.fineract.*.repository | API-backed data access patterns |
| DTO layer | org.apache.fineract.*.api.*.command / dto | request/response payload handling in [js/api](js/api) |
| Command layer | org.apache.fineract.*.command | action-oriented handlers in [js/ui/handlers](js/ui/handlers) |
| Security layer | org.apache.fineract.infrastructure.security | auth and permission flows in [js/auth.js](js/auth.js) |
| Accounting layer | org.apache.fineract.accounting.* | [js/api/accounting.js](js/api/accounting.js) |
| Scheduler layer | org.apache.fineract.infrastructure.jobs | partial support in admin/jobs concepts |

## 7. Controller Map

| Fineract concept | Typical controller/resource | FinCraft equivalent |
|---|---|---|
| Clients | ClientsApiResource | [js/pages/clients.js](js/pages/clients.js) |
| Loans | LoansApiResource | [js/pages/loans.js](js/pages/loans.js) |
| Savings | SavingsAccountApiResource | [js/pages/savings.js](js/pages/savings.js) |
| Accounting | JournalEntriesApiResource, GLAccountsApiResource | [js/pages/accounting.js](js/pages/accounting.js) |
| Products | LoanProductsApiResource, SavingsProductsApiResource | [js/pages/products.js](js/pages/products.js) |
| Organization | OfficesApiResource, StaffApiResource | [js/pages/organization.js](js/pages/organization.js) |
| Admin | UsersApiResource, RolesApiResource, PermissionsApiResource | [js/pages/users.js](js/pages/users.js) |
| Reports | ReportsApiResource, RunReportsApiResource | [js/pages/reports.js](js/pages/reports.js) |

## 8. Service Map

| Service type | Typical Fineract role | FinCraft equivalent |
|---|---|---|
| Read platform services | list/detail reads | current API functions in [js/api](js/api) |
| Write platform services | create/update/approve/close | current action handlers in [js/ui/handlers](js/ui/handlers) |
| Domain services | business rules and status transitions | route/action-specific logic in page modules |
| Command handlers | specific action execution | action dispatch in [js/ui/handlers/index.js](js/ui/handlers/index.js) |
| Validation services | DTO and workflow validation | form validation and API request preparation |

## 9. Entity and Database Table Map

| Fineract concept | Typical entity/table | FinCraft equivalent |
|---|---|---|
| Client | m_client | client data in UI/API layer |
| Loan | m_loan | loan object handling in [js/api/loans.js](js/api/loans.js) |
| Savings account | m_savings_account | savings account handling in [js/api/savings-deposits.js](js/api/savings-deposits.js) |
| GL account | m_gl_account | accounting structure in [js/api/accounting.js](js/api/accounting.js) |
| Journal entry | m_journal_entry | journal entry workflow |
| Office | m_office | organization concepts |
| Staff | m_staff | organization concepts |
| User | m_appuser | admin/user concepts |
| Role | m_role | admin role concepts |
| Permission | m_permission | permission model |
| Maker-checker command source | m_portfolio_command_source | approval workflow concept |

## 10. DTO and Payload Map

| Operation | Typical Fineract payload | FinCraft equivalent |
|---|---|---|
| Client create | client payload with officeId, legalForm, externalId | form-based client create flow |
| Loan create | productId, clientId, principal, loanTermFrequency | loan creation UI and API payload |
| Loan approve | command=approve with approvalDate and notes | approval action in loan workflow |
| Savings deposit | accountId, transactionDate, transactionAmount | deposit action in savings UI |
| Journal entry | debit/credit lines, officeId, transactionDate | journal entry screen |
| Product create | product definitions with interest, term, repayment frequency | product forms |

### Key requirement for FinCraft
The UI should continue to build payloads that mirror Fineract’s expected command-based structure rather than inventing a custom schema.

## 11. Command Processing Flow

A typical Fineract write workflow follows this path:

1. API request reaches a resource/controller.
2. Security checks validate user access and permissions.
3. The request is wrapped as a command or command object.
4. A command handler validates and dispatches the operation.
5. The domain service applies business rules.
6. The repository persists changes to the relevant entity/table.
7. Audit, maker-checker, and accounting side effects are triggered.
8. A success or error response is returned.

### FinCraft mapping
The existing workflow in [js/ui/handlers](js/ui/handlers) and [js/api](js/api) should continue to mirror this pattern for create/update/approval/transaction actions.

## 12. Security Model

### Authentication
- tenant-aware login
- basic auth or token-based session model
- user credentials validated against the Fineract backend

### Authorization
- user-role-permission model
- permission checks on API resources and commands
- route gating based on permission codes

### Tenant resolution
- tenant header or context-based resolution
- tenant-specific data access and configuration

### FinCraft equivalent
The current auth flow in [js/auth.js](js/auth.js) and route behavior in [js/router.js](js/router.js) are the correct foundation. The main improvement is to keep permissions and route access aligned with the backend’s real permission structure rather than relying on UI-only assumptions.

## 13. Maker Checker Model

Fineract uses maker-checker for sensitive actions such as:
- loan approvals
- account closings
- product changes
- high-risk financial changes

### Core concepts
- maker submits a command
- checker reviews and approves or rejects
- the command source records pending actions
- audit trail preserves the original request and approval state

### FinCraft mapping
The current app has partial support for task/approval flows in [js/pages/tasks.js](js/pages/tasks.js). This should be extended so that approval screens and permissions reflect Fineract’s maker-checker semantics more closely.

## 14. Accounting Model

Fineract accounting is a core pillar of the platform. Key concepts include:
- chart of accounts
- GL accounts and account mappings
- journal entries
- accounting rules
- loan and savings transaction posting
- product-to-account mapping

### Required FinCraft coverage
- GL account listing and creation
- journal entry posting
- accounting rule configuration
- loan/savings posting mapping
- real-time or batch posting visibility

This is already well represented in [js/api/accounting.js](js/api/accounting.js) and [js/pages/accounting.js](js/pages/accounting.js).

## 15. Loan Lifecycle Extraction

### Lifecycle stages
1. Loan product configuration
2. Loan application submission
3. Validation and product checks
4. Approval
5. Disbursement
6. Repayment posting
7. Rescheduling or restructuring
8. Write-off or closure
9. Recovery / arrears handling

### Fineract actions
- CREATE_LOAN
- APPROVE_LOAN
- DISBURSE_LOAN
- REPAYMENT_LOAN
- WRITEOFF_LOAN
- CLOSE_LOAN
- RESCHEDULE_LOAN

### FinCraft status
The current implementation in [js/api/loans.js](js/api/loans.js) and [js/pages/loans.js](js/pages/loans.js) covers the major workflow. The highest-value next improvements are:
- more granular status transition handling
- stronger approval and disbursement validation
- closer alignment of payloads to Fineract command actions

## 16. Savings Lifecycle Extraction

### Lifecycle stages
1. Savings product config
2. Savings account opening
3. Activation
4. Deposit and withdrawal
5. Interest posting and charges
6. Holds and blockings
7. Closure

### Fineract actions
- ACTIVATE_SAVINGSACCOUNT
- DEPOSIT_SAVINGSACCOUNT
- WITHDRAWAL_SAVINGSACCOUNT
- CLOSE_SAVINGSACCOUNT

### FinCraft status
The savings module in [js/api/savings-deposits.js](js/api/savings-deposits.js) and [js/pages/savings.js](js/pages/savings.js) is already strong and should remain a high-priority feature area.

## 17. Product Configuration Extraction

### Product families
- loan products
- savings products
- fixed deposit products
- recurring deposit products
- share products
- charges
- floating rates
- interest rate charts

### Required FinCraft scope
- product list/detail views
- create/update forms
- product-account mapping
- validation for term, frequency, interest, and fees
- accounting linkage

This is already represented in [js/api/products.js](js/api/products.js) and [js/pages/products.js](js/pages/products.js).

## 18. Scheduler and Job Map

Typical Fineract jobs include:
- interest posting
- arrears update
- loan/portfolio processing
- accounting postings
- notification dispatch
- report generation

### FinCraft equivalent
The current repo has administrative and system-level concepts, but full scheduled-job orchestration is still mostly a backend concern. FinCraft should focus on surfacing job status and allowing operators to inspect or trigger supported jobs through the UI.

## 19. Event and Notification Map

Fineract commonly emits or consumes:
- notifications
- hooks
- external event integrations
- email/SMS workflows

### FinCraft equivalent
Present in [js/api/integrations.js](js/api/integrations.js) and related page modules. This is a medium-priority expansion area, especially for real production deployments.

## 20. Report Catalog

| Report family | Purpose | FinCraft status |
|---|---|---|
| Standard operational reports | portfolio, client, transaction reporting | Present in [js/api/reports.js](js/api/reports.js) |
| Run report by name | parameter-driven ad-hoc execution | Present |
| Collection sheet | grouped repayment collection workflow | Present in [js/pages/collections.js](js/pages/collections.js) |
| Data tables | custom entity schema and reporting | Present in [js/pages/datatables.js](js/pages/datatables.js) |

## 21. Configuration Catalog

| Configuration area | Fineract role | FinCraft status |
|---|---|---|
| Tenant config | multi-tenant settings | Partial |
| Global configuration | system-level toggles | Partial |
| Office/staff hierarchy | org structure | Present |
| Product configuration | loan/savings/share setup | Present |
| User management | admins and roles | Present |
| External services | hooks, integrations | Present |

## 22. FinCraft Implementation Mapping

| Fineract Item | FinCraft Equivalent Exists | FinCraft Module | Gap | Priority |
|---|---|---|---|---|
| Client listing/detail | Yes | [js/pages/clients.js](js/pages/clients.js) | keep payloads and validation aligned to server behavior | High |
| Loan lifecycle | Yes | [js/pages/loans.js](js/pages/loans.js) | strengthen workflow transitions and approvals | Critical |
| Savings lifecycle | Yes | [js/pages/savings.js](js/pages/savings.js) | maintain parity on deposits/withdrawals/closures | High |
| Accounting workflows | Yes | [js/pages/accounting.js](js/pages/accounting.js) | expand posting visibility and validation | Critical |
| Roles/permissions | Yes | [js/pages/users.js](js/pages/users.js) | align route checks with real Fineract permission codes | Critical |
| Reports | Yes | [js/pages/reports.js](js/pages/reports.js) | add richer report-parameter handling | Medium |
| Maker-checker | Partial | [js/pages/tasks.js](js/pages/tasks.js) | implement full approval flows and pending-action views | Critical |
| Notifications/hooks | Partial | [js/api/integrations.js](js/api/integrations.js) | add richer UI and event mapping | Medium |
| Scheduler jobs | Partial | system/admin concepts | surface job status and control | Medium |

## 23. Missing FinCraft Features

The main gaps relative to a full Fineract-style implementation are:

- deeper maker-checker support for approvals and pending commands
- richer permission synchronization with real backend permission sets
- more explicit unsupported-feature handling for server-version differences
- fuller integration workflow coverage for hooks, notifications, and external events
- more complete scheduler/job monitoring and operational controls

## 24. Priority Roadmap

### Phase 1 — Critical
- fix permission-gating consistency in [js/router.js](js/router.js)
- align create/update actions with backend command semantics
- strengthen loan approval and disbursement workflows
- improve accounting error handling and posting visibility

### Phase 2 — High
- expand maker-checker/task UI and approval actions
- refine product configuration workflows
- strengthen report parameter handling and server compatibility

### Phase 3 — Medium
- add richer notifications and hooks management
- add scheduler/job visibility and controls
- expand self-service and external integration support

## 25. Recommended Next Development Task

The highest-value immediate task is to harden the permission model and approval workflow so that FinCraft behaves like a true Fineract client rather than a loosely connected UI. The next implementation slice should be:

1. audit and align all route/feature permissions with real Fineract permission codes
2. implement or complete maker-checker task handling for approvals and rejections
3. ensure loan, savings, and accounting actions use consistent command-based payload patterns

This will give FinCraft the strongest immediate improvement in both correctness and Fineract compatibility.
