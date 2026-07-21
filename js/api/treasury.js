/* FinCraft · api/treasury.js — Treasury control-layer persistence bootstrap.
   FinCraft has no backend/DB of its own (see FINCRAFT_Fineract_Treasury_Integration_Log.md §2-3),
   so every FinCraft-owned record (teller operational events, expenses, borrowings, thresholds,
   reconciliation) is persisted as a Fineract Datatable via the existing `api.dataTables` client
   (js/api/reports.js#makeDataTablesAPI). All eight tables are attached to `m_office`.

   MULTI-TENANCY: Fineract tenants are separate DB schemas selected by the
   `Fineract-Platform-TenantId` header (see js/api/core.js). A datatable registered on one tenant
   does NOT exist on another, so this module's `ensureTreasuryDatatables()` is a per-tenant,
   idempotent-by-check bootstrap (list → create-if-missing), not a one-time global migration.
   Call it once after `configureAPI(...)`/sign-in, before any other treasury.* call, for every
   tenant this app connects to. No `tenantId` column is needed on any table — Fineract's own
   schema-per-tenant isolation already prevents cross-tenant reads/writes. */

// Fineract datatable column `type` values accepted by POST /datatables — kept as a small local
// enum purely for readability in the specs below (Fineract itself takes the string).
const T = { STRING: 'String', TEXT: 'Text', NUMBER: 'Number', DECIMAL: 'Decimal', DATE: 'Date', BOOLEAN: 'Boolean' };

/** One entry per table required by Phase 2 of the treasury integration plan. */
export const TREASURY_DATATABLES = [
  {
    datatableName: 'dt_teller_operational_events',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'teller_id',                 type: T.NUMBER,  mandatory: true },
      { name: 'cashier_id',                type: T.NUMBER,  mandatory: true },
      { name: 'staff_id',                  type: T.NUMBER,  mandatory: false },
      { name: 'transaction_type',          type: T.STRING,  length: 40, mandatory: true },
      { name: 'direction',                 type: T.STRING,  length: 10, mandatory: true }, // CASH_IN | CASH_OUT
      { name: 'amount',                    type: T.DECIMAL, mandatory: true },
      { name: 'currency_code',             type: T.STRING,  length: 3,  mandatory: true },
      { name: 'transaction_date',          type: T.DATE,    mandatory: true },
      { name: 'fineract_entity_type',      type: T.STRING,  length: 40,  mandatory: false },
      { name: 'fineract_entity_id',        type: T.NUMBER,  mandatory: false },
      { name: 'fineract_transaction_id',   type: T.STRING,  length: 40,  mandatory: false },
      { name: 'narration',                 type: T.TEXT,    mandatory: false },
      { name: 'status',                    type: T.STRING,  length: 20, mandatory: true },
      { name: 'created_by',                type: T.STRING,  length: 100, mandatory: false },
      { name: 'reversed',                  type: T.BOOLEAN, mandatory: false },
      { name: 'reversal_reference',        type: T.STRING,  length: 40, mandatory: false }
    ]
  },
  {
    datatableName: 'dt_expense_requests',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'expense_category',          type: T.STRING,  length: 60, mandatory: true },
      { name: 'expense_gl_account_id',     type: T.NUMBER,  mandatory: true },
      { name: 'amount',                    type: T.DECIMAL, mandatory: true },
      { name: 'currency_code',             type: T.STRING,  length: 3, mandatory: true },
      { name: 'narration',                 type: T.TEXT,    mandatory: false },
      { name: 'requested_by',              type: T.STRING,  length: 100, mandatory: true },
      { name: 'receipt_url',               type: T.STRING,  length: 255, mandatory: false },
      { name: 'status',                    type: T.STRING,  length: 20, mandatory: true }, // PENDING|APPROVED|REJECTED|PAID|REVERSED
      { name: 'payment_source',            type: T.STRING,  length: 20, mandatory: false }, // TELLER_CASH|BANK
      { name: 'teller_id',                 type: T.NUMBER,  mandatory: false },
      { name: 'cashier_id',                type: T.NUMBER,  mandatory: false },
      { name: 'bank_gl_account_id',        type: T.NUMBER,  mandatory: false },
      { name: 'fineract_je_transaction_id',type: T.STRING,  length: 40, mandatory: false },
      { name: 'paid_date',                 type: T.DATE,    mandatory: false }
    ]
  },
  {
    datatableName: 'dt_expense_approvals',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'expense_row_id',            type: T.NUMBER,  mandatory: true }, // dt_expense_requests row id
      { name: 'action',                    type: T.STRING,  length: 20, mandatory: true }, // APPROVE|REJECT
      { name: 'approver',                  type: T.STRING,  length: 100, mandatory: true },
      { name: 'reason',                    type: T.TEXT,    mandatory: false },
      { name: 'action_date',               type: T.DATE,    mandatory: true }
    ]
  },
  {
    datatableName: 'dt_office_borrowings',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'lender_name',               type: T.STRING,  length: 100, mandatory: true },
      { name: 'lender_type',               type: T.STRING,  length: 40, mandatory: false },
      { name: 'principal_amount',          type: T.DECIMAL, mandatory: true },
      { name: 'outstanding_principal',     type: T.DECIMAL, mandatory: true },
      { name: 'interest_rate',             type: T.DECIMAL, mandatory: true },
      { name: 'interest_method',           type: T.STRING,  length: 20, mandatory: true }, // FLAT|REDUCING_BALANCE
      { name: 'start_date',                type: T.DATE,    mandatory: true },
      { name: 'tenor_months',              type: T.NUMBER,  mandatory: true },
      { name: 'repayment_frequency',       type: T.STRING,  length: 20, mandatory: true },
      { name: 'borrowings_liability_gl_account_id', type: T.NUMBER, mandatory: false },
      { name: 'status',                    type: T.STRING,  length: 20, mandatory: true },
      { name: 'fineract_je_transaction_id',type: T.STRING,  length: 40, mandatory: false }
    ]
  },
  {
    datatableName: 'dt_office_borrowing_schedule',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'borrowing_row_id',          type: T.NUMBER,  mandatory: true },
      { name: 'installment_no',            type: T.NUMBER,  mandatory: true },
      { name: 'due_date',                  type: T.DATE,    mandatory: true },
      { name: 'principal_due',             type: T.DECIMAL, mandatory: true },
      { name: 'interest_due',              type: T.DECIMAL, mandatory: true },
      { name: 'principal_paid',            type: T.DECIMAL, mandatory: false },
      { name: 'interest_paid',             type: T.DECIMAL, mandatory: false },
      { name: 'status',                    type: T.STRING,  length: 20, mandatory: true }
    ]
  },
  {
    datatableName: 'dt_office_borrowing_txns',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'borrowing_row_id',          type: T.NUMBER,  mandatory: true },
      { name: 'schedule_row_id',           type: T.NUMBER,  mandatory: false },
      { name: 'txn_type',                  type: T.STRING,  length: 20, mandatory: true }, // DRAWDOWN|INTEREST_ACCRUAL|INTEREST_PAYMENT|PRINCIPAL_REPAYMENT
      { name: 'amount',                    type: T.DECIMAL, mandatory: true },
      { name: 'txn_date',                  type: T.DATE,    mandatory: true },
      { name: 'fineract_je_transaction_id',type: T.STRING,  length: 40, mandatory: false }
    ]
  },
  {
    // Config, one row per office — deliberately NOT multiRow (single active config per office).
    datatableName: 'dt_treasury_thresholds',
    apptableName: 'm_office',
    multiRow: false,
    columns: [
      { name: 'vault_gl_account_id',                type: T.NUMBER,  mandatory: true },
      { name: 'cash_at_tellers_gl_account_id',      type: T.NUMBER,  mandatory: true },
      { name: 'bank_gl_account_id',                 type: T.NUMBER,  mandatory: true },
      { name: 'borrowings_liability_gl_account_id', type: T.NUMBER,  mandatory: false },
      { name: 'interest_payable_gl_account_id',     type: T.NUMBER,  mandatory: false },
      { name: 'interest_expense_gl_account_id',     type: T.NUMBER,  mandatory: false },
      { name: 'reserve_buffer_amount',              type: T.DECIMAL, mandatory: true },
      { name: 'currency_code',                      type: T.STRING,  length: 3, mandatory: true },
      // Added for Phase 10 (Daily Reconciliation) — a cash shortage found at physical count is
      // booked as a loss/expense; an overage as miscellaneous income. Both optional: a
      // reconciliation with zero variance never needs either, and offices that haven't decided
      // where these should post yet can configure everything else first.
      { name: 'shortage_gl_account_id',             type: T.NUMBER,  mandatory: false },
      { name: 'overage_gl_account_id',               type: T.NUMBER,  mandatory: false }
    ]
  },
  {
    datatableName: 'dt_daily_cash_reconciliation',
    apptableName: 'm_office',
    multiRow: true,
    columns: [
      { name: 'teller_id',                 type: T.NUMBER,  mandatory: true },
      { name: 'cashier_id',                type: T.NUMBER,  mandatory: true },
      { name: 'reconciliation_date',       type: T.DATE,    mandatory: true },
      { name: 'expected_cash',             type: T.DECIMAL, mandatory: true },
      { name: 'physical_cash',             type: T.DECIMAL, mandatory: false },
      { name: 'variance',                  type: T.DECIMAL, mandatory: false },
      { name: 'status',                    type: T.STRING,  length: 20, mandatory: true }, // OPEN|SUBMITTED|APPROVED
      { name: 'approved_by',               type: T.STRING,  length: 100, mandatory: false },
      { name: 'fineract_je_transaction_id',type: T.STRING,  length: 40, mandatory: false }
    ]
  }
];

export function makeTreasuryAPI(self) {
  const specByName = new Map(TREASURY_DATATABLES.map(s => [s.datatableName, s]));
  function isMultiRow(name) {
    const spec = specByName.get(name);
    if (!spec) throw new Error(`Unknown treasury datatable "${name}"`);
    return !!spec.multiRow;
  }

  return {
    tableSpecs: TREASURY_DATATABLES,

    /** Registers whichever of the eight treasury datatables don't already exist on the
     *  currently-connected tenant. Safe to call repeatedly / on every sign-in — a table found
     *  already registered (by name, via GET /datatables) is skipped; a create-race with another
     *  concurrent user (Fineract rejects the duplicate) is treated as success, not an error.
     *  Returns { created: string[], alreadyPresent: string[], failed: {name, error}[] }. */
    async ensureTreasuryDatatables() {
      const existing = await self.dataTables.list();
      const existingNames = new Set((existing || []).map(t => t.registeredTableName));
      const created = [], alreadyPresent = [], failed = [];
      for (const spec of TREASURY_DATATABLES) {
        if (existingNames.has(spec.datatableName)) { alreadyPresent.push(spec.datatableName); continue; }
        try {
          await self.dataTables.create(spec);
          created.push(spec.datatableName);
        } catch (e) {
          // "already exists" races (another tab/user registering concurrently) are not failures.
          const msg = String(e?.detail?.defaultUserMessage || e?.message || '');
          if (/already exist|duplicate/i.test(msg)) alreadyPresent.push(spec.datatableName);
          else failed.push({ name: spec.datatableName, error: msg || e });
        }
      }
      return { created, alreadyPresent, failed };
    },

    // ---- Row CRUD, correctly split by Fineract's actual datatable addressing shape ----
    // One-to-many tables (7 of 8 — everything except dt_treasury_thresholds) address a specific
    // row via a *second* id (`datatableId`, i.e. the row's own id), distinct from the entity id
    // (officeId). One-to-one tables (dt_treasury_thresholds: one config row per office) are
    // addressed by entity id alone. Conflating these two shapes was a bug in the first draft of
    // this file — fixed here so callers never have to know which shape a given table uses.

    /** All rows for an office (multiRow: array; single-row config table: the one object, or
     *  Fineract's "no row yet" 404 — callers should treat that as "not configured yet"). */
    queryRows: (datatableName, officeId) => self.dataTables.query(datatableName, officeId),

    /** Create a new row (multiRow tables) — same call also serves as "seed the one config row"
     *  for dt_treasury_thresholds the first time an office is configured. */
    createRow: (datatableName, officeId, body) => self.dataTables.createEntry(datatableName, officeId, body),

    /** Fetch one specific row — multiRow tables only (needs the row's own id). */
    getRow: (datatableName, officeId, datatableId) => {
      if (!isMultiRow(datatableName)) throw new Error(`${datatableName} is a single-row config table — use queryRows(), not getRow()`);
      return self.dataTables.getEntry(datatableName, officeId, datatableId);
    },

    /** Update one specific row — multiRow tables only. */
    updateRow: (datatableName, officeId, datatableId, body) => {
      if (!isMultiRow(datatableName)) throw new Error(`${datatableName} is a single-row config table — use updateConfig(), not updateRow()`);
      return self.dataTables.updateEntryOneToMany(datatableName, officeId, datatableId, body);
    },

    /** Delete one specific row — multiRow tables only. */
    deleteRow: (datatableName, officeId, datatableId) => {
      if (!isMultiRow(datatableName)) throw new Error(`${datatableName} is a single-row config table — use deleteConfig(), not deleteRow()`);
      return self.dataTables.deleteEntry(datatableName, officeId, datatableId);
    },

    /** Update the single config row for a one-to-one table (dt_treasury_thresholds). */
    updateConfig: (datatableName, officeId, body) => {
      if (isMultiRow(datatableName)) throw new Error(`${datatableName} is one-to-many — use updateRow(), not updateConfig()`);
      return self.dataTables.update(datatableName, officeId, body);
    },

    /** Delete the single config row for a one-to-one table (dt_treasury_thresholds). */
    deleteConfig: (datatableName, officeId) => {
      if (isMultiRow(datatableName)) throw new Error(`${datatableName} is one-to-many — use deleteRow(), not deleteConfig()`);
      return self.dataTables.delete(datatableName, officeId);
    }
  };
}
