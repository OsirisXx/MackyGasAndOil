# Requirements Document

## Introduction

This feature expands the gas station management system in three areas: (1) the POS vault system is expanded from 2 tabs (Deposit/Withdraw) to 4 options (Vault Deposit, Withdrawals/Cash Out, GCash, Cash Register) by adding a `deposit_type` column to `cash_deposits`, (2) the admin vault management page gains undo/restore for deleted deposits (soft delete) and the ability to create deposits on behalf of cashiers, and (3) the PO/Charge Invoice form and reports are expanded with additional fields (C.I. Number, P.O. Slip Number, Description, Unit Type) and support for recording lubes/products as POs instead of only fuel.

All schema changes must be backward compatible — new columns are nullable so existing records remain valid. The system serves multiple branches (Manolo, Sankanan, Patulangan, Balingasag).

## Glossary

- **POS**: Point of Sale — the cashier-facing terminal used during shifts to record sales, deposits, withdrawals, and purchase orders.
- **Vault_Modal**: The modal dialog in the POS interface where cashiers record vault deposits and withdrawals.
- **Admin_CashDeposits_Page**: The admin-facing page (`CashDeposits.jsx`) for managing all cash deposits and withdrawals across branches.
- **Accountability_Report**: The daily accountability report (`AccountabilityReport.jsx`) that summarizes fuel sales, deposits, withdrawals, charge invoices, and calculates net accountability.
- **Cashier_Accountability**: The in-shift accountability summary modal (`CashierAccountability.jsx`) shown to cashiers from the POS.
- **PO_Form**: The Purchase Order / Charge Invoice creation form in the POS used by cashiers to record credit transactions.
- **Charge_Invoice_Summary**: The section of the Accountability_Report that lists all charge invoices (purchase orders) for a shift.
- **Admin_PurchaseOrders_Page**: The admin-facing page (`PurchaseOrders.jsx`) for viewing and managing all purchase orders.
- **Deposit_Type**: A classification for cash deposits — one of `vault_deposit`, `gcash`, or `cash_register`.
- **Net_Vault**: The formula `Vault Deposits + Withdrawals + GCash + Cash Register` used in the Accountability_Report vault section.
- **Soft_Delete**: A deletion strategy where records are marked with a `deleted_at` timestamp instead of being permanently removed from the database.
- **CI_Number**: Charge Invoice Number — a reference number typed by the cashier when creating a PO.
- **PO_Slip_Number**: The physical PO slip reference number.
- **Unit_Type**: The unit of measurement for a PO item — either `liters` or `pcs` (pieces).

## Requirements

### Requirement 1: Deposit Type Classification

**User Story:** As a cashier, I want to classify my vault deposits by type (Vault Deposit, GCash, Cash Register), so that the accountability report accurately breaks down where cash came from.

#### Acceptance Criteria

1. THE Database SHALL have a nullable `deposit_type` column on the `cash_deposits` table with allowed values `vault_deposit`, `gcash`, and `cash_register`.
2. WHEN a new deposit is created from the POS, THE POS SHALL store the selected deposit type in the `deposit_type` column of the `cash_deposits` record.
3. WHEN an existing deposit record has no `deposit_type` value, THE System SHALL treat the record as a `vault_deposit` for display purposes.
4. THE `deposit_type` column SHALL be nullable so that existing records without a type remain valid.

### Requirement 2: Expanded Vault Modal in POS

**User Story:** As a cashier, I want the vault modal to have 4 options (Vault Deposit, Withdrawals/Cash Out, GCash, Cash Register), so that I can record different types of vault transactions from a single interface.

#### Acceptance Criteria

1. WHEN the cashier opens the Vault_Modal, THE Vault_Modal SHALL display four selectable tabs or options: "Vault Deposit", "Withdrawals/Cash Out", "GCash", and "Cash Register".
2. WHEN the cashier selects "Vault Deposit", THE Vault_Modal SHALL present a deposit form that saves the record with `deposit_type` set to `vault_deposit`.
3. WHEN the cashier selects "GCash", THE Vault_Modal SHALL present a deposit form that saves the record with `deposit_type` set to `gcash`.
4. WHEN the cashier selects "Cash Register", THE Vault_Modal SHALL present a deposit form that saves the record with `deposit_type` set to `cash_register`.
5. WHEN the cashier selects "Withdrawals/Cash Out", THE Vault_Modal SHALL present the existing withdrawal form that saves to the `cash_withdrawals` table.
6. THE Vault_Modal SHALL retain all existing deposit form fields (amount, notes) for each deposit type tab.
7. WHEN a withdrawal is recorded, THE withdrawal SHALL appear in the "C. EXPENSES" section of the Accountability_Report (since withdrawals serve as the expenses in the actual accountability process).

### Requirement 3: Accountability Report Vault Section Expansion

**User Story:** As an admin, I want the accountability report vault section to show all 4 vault transaction types separately, so that I can see a detailed breakdown of vault activity.

#### Acceptance Criteria

1. THE Accountability_Report vault section SHALL display four separate sub-sections: Vault Deposits, Withdrawals/Cash Out, GCash, and Cash Register.
2. THE Accountability_Report SHALL calculate Net Vault using the formula: `Net Vault = Vault Deposits + Withdrawals + GCash + Cash Register`.
3. WHEN deposits have no `deposit_type` value, THE Accountability_Report SHALL classify those deposits under "Vault Deposits" in the vault section.
4. THE Cashier_Accountability modal SHALL also display the vault breakdown by deposit type, consistent with the Accountability_Report.
5. THE "C. EXPENSES" section of the Accountability_Report SHALL be populated from vault withdrawals (cash_withdrawals table) instead of the separate expenses table, since withdrawals serve as expenses in the actual accountability process.
6. THE Accountability_Report SHALL display each withdrawal in the "C. EXPENSES" section with columns: NATURE (withdrawal reason) and AMOUNT.

### Requirement 4: Admin CashDeposits Page — Deposit Type Display

**User Story:** As an admin, I want to see the deposit type for each deposit on the admin vault management page, so that I can distinguish between vault deposits, GCash, and cash register entries.

#### Acceptance Criteria

1. THE Admin_CashDeposits_Page SHALL display a "Type" column in the deposits table showing the `deposit_type` of each deposit.
2. WHEN a deposit has no `deposit_type` value, THE Admin_CashDeposits_Page SHALL display "Vault Deposit" as the default type label.
3. THE Admin_CashDeposits_Page SHALL allow filtering deposits by `deposit_type`.

### Requirement 5: Soft Delete for Cash Deposits

**User Story:** As an admin, I want deleted deposits to be recoverable, so that accidental deletions can be undone without data loss.

#### Acceptance Criteria

1. THE Database SHALL have a nullable `deleted_at` column of type `TIMESTAMPTZ` on the `cash_deposits` table.
2. WHEN an admin deletes a deposit, THE Admin_CashDeposits_Page SHALL set the `deleted_at` column to the current timestamp instead of permanently removing the record.
3. THE Admin_CashDeposits_Page SHALL exclude soft-deleted deposits (records where `deleted_at` is not null) from the default deposits list.
4. THE Admin_CashDeposits_Page SHALL provide a toggle or filter to view soft-deleted deposits.
5. THE Accountability_Report SHALL exclude soft-deleted deposits from all calculations.
6. THE Cashier_Accountability modal SHALL exclude soft-deleted deposits from all calculations.

### Requirement 6: Restore Deleted Deposits

**User Story:** As an admin, I want to restore previously deleted deposits, so that I can undo accidental deletions.

#### Acceptance Criteria

1. WHEN viewing soft-deleted deposits, THE Admin_CashDeposits_Page SHALL display a "Restore" button for each soft-deleted deposit.
2. WHEN the admin clicks "Restore" on a soft-deleted deposit, THE Admin_CashDeposits_Page SHALL set the `deleted_at` column to null, making the deposit active again.
3. WHEN a deposit is restored, THE Admin_CashDeposits_Page SHALL log the restore action in the audit log.

### Requirement 7: Admin Create Deposit

**User Story:** As an admin, I want to create deposits on behalf of cashiers, so that I can correct missing entries without requiring the cashier to be logged in at the POS.

#### Acceptance Criteria

1. THE Admin_CashDeposits_Page SHALL provide a "Create Deposit" button that opens a deposit creation form.
2. THE admin deposit creation form SHALL require the following fields: cashier (selected from a list), branch, amount, deposit type, and date/time.
3. THE admin deposit creation form SHALL allow an optional notes field.
4. WHEN the admin submits the deposit form, THE Admin_CashDeposits_Page SHALL insert a new record into the `cash_deposits` table with the provided values.
5. WHEN a deposit is created by an admin, THE Admin_CashDeposits_Page SHALL log the creation in the audit log including the admin's identity.

### Requirement 8: PO Form — New Fields

**User Story:** As a cashier, I want the PO form to include C.I. Number, P.O. Slip Number, Description, and Unit Type fields, so that charge invoices have complete reference information.

#### Acceptance Criteria

1. THE Database SHALL have nullable columns `ci_number` (TEXT), `po_slip_number` (TEXT), `description` (TEXT), and `unit_type` (TEXT with allowed values `liters` and `pcs`) on the `purchase_orders` table.
2. WHEN the cashier creates a PO, THE PO_Form SHALL display input fields for C.I. Number, P.O. Slip Number, Description, and Unit Type in addition to existing fields.
3. WHEN the cashier submits the PO form, THE PO_Form SHALL save the values of `ci_number`, `po_slip_number`, `description`, and `unit_type` to the `purchase_orders` record.
4. THE PO_Form SHALL allow the C.I. Number, P.O. Slip Number, Description, and Unit Type fields to be left empty (nullable).

### Requirement 9: PO Form — Product/Lubes Support

**User Story:** As a cashier, I want to record lubes and other products as POs (charge invoices), so that non-fuel credit transactions are also tracked in the charge invoice system.

#### Acceptance Criteria

1. THE PO_Form SHALL provide a selection mode that allows the cashier to choose between "Fuel (Pump)" and "Product/Lubes" as the PO item type.
2. WHEN the cashier selects "Fuel (Pump)" mode, THE PO_Form SHALL display the existing pump selection dropdown and calculate amount/liters based on pump price.
3. WHEN the cashier selects "Product/Lubes" mode, THE PO_Form SHALL display a product selection dropdown populated from the products table.
4. WHEN the cashier selects a product in "Product/Lubes" mode, THE PO_Form SHALL auto-fill the Description field with the product name and set Unit Type to `pcs`.
5. WHEN a PO is created in "Product/Lubes" mode, THE PO_Form SHALL save the record with `pump_id` set to null and `fuel_type_id` set to null.
6. WHEN a PO is created in "Product/Lubes" mode, THE PO_Form SHALL require the cashier to enter the amount manually.

### Requirement 10: Charge Invoice Summary Expansion

**User Story:** As an admin, I want the accountability report charge invoice summary to show all 7 columns (C.I. No., P.O. Slip No., Customer, Plate Number, Description, Unit, Amount), so that the printed report contains complete charge invoice details.

#### Acceptance Criteria

1. THE Charge_Invoice_Summary in the Accountability_Report SHALL display seven columns: C.I. No., P.O. Slip No., Customer, Plate Number, Description (product), Unit (liters or pcs), and Amount.
2. WHEN a charge invoice record has no value for `ci_number`, `po_slip_number`, `description`, or `unit_type`, THE Charge_Invoice_Summary SHALL display a dash ("—") in the corresponding column.
3. THE Charge_Invoice_Summary SHALL display `unit_type` as "Liters" or "Pcs" based on the stored value.
4. THE printed version of the Accountability_Report SHALL include all seven columns in the charge invoice table.

### Requirement 11: Admin PurchaseOrders Page — New Columns

**User Story:** As an admin, I want the purchase orders admin page to display the new PO fields, so that I can review complete charge invoice information.

#### Acceptance Criteria

1. THE Admin_PurchaseOrders_Page SHALL display columns for C.I. Number, P.O. Slip Number, Description, and Unit Type in the orders table.
2. THE Admin_PurchaseOrders_Page search filter SHALL include `ci_number` and `po_slip_number` in the searchable fields.
3. THE printed customer statement from the Admin_PurchaseOrders_Page SHALL include the new fields (C.I. Number, P.O. Slip Number, Description, Unit Type) in the statement table.

### Requirement 12: Backward Compatibility

**User Story:** As a system operator, I want all schema changes to be backward compatible, so that existing data and functionality remain intact after the update.

#### Acceptance Criteria

1. THE Database migration SHALL add all new columns as nullable so that existing records remain valid without modification.
2. WHEN existing records lack values for new columns (`deposit_type`, `deleted_at`, `ci_number`, `po_slip_number`, `description`, `unit_type`), THE System SHALL handle null values gracefully with sensible defaults in the UI.
3. IF a database migration fails, THEN THE System SHALL not corrupt or modify existing data in the `cash_deposits` or `purchase_orders` tables.
4. THE System SHALL continue to function correctly for all branches (Manolo, Sankanan, Patulangan, Balingasag) after the migration.
